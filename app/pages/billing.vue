<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Ticket, Zap, ShoppingCart, Check, Loader2, History, ArrowUpRight, ArrowDownRight, Link2, ExternalLink, CircleCheck, AlertCircle, Minus, Plus } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'vue-sonner'

const authStore = useAuthStore()
const route = useRoute()
const router = useRouter()

interface Plan {
  plan: 'starter' | 'pro' | 'enterprise'
  tickets: number
  activations: number
  price_cents: number
}
interface Tx {
  id: string
  entity: 'ticket' | 'activation'
  delta: number
  reason: string
  plan: string | null
  amount_cents: number | null
  balance_after: number
  created_at: string
  contest_id: string | null
  participant_id: string | null
}
interface BalanceResp {
  organization: { id: string; name: string; ticket_balance: number; activation_balance: number }
  transactions: Tx[]
}

interface ConnectStatus {
  connected: boolean
  onboarding_done: boolean
  charges_enabled: boolean
  payouts_enabled: boolean
  account_id?: string
}

const plans = ref<Plan[]>([])
const balance = ref<BalanceResp | null>(null)
const connect = ref<ConnectStatus | null>(null)
const loading = ref(true)
const buying = ref<string | null>(null)
const connecting = ref(false)

// Individual purchase state
const ticketQty = ref(10)
const activationQty = ref(1)
const buyingTickets = ref(false)
const buyingActivations = ref(false)

const ACTIVATION_UNIT_EUR = 50
const TICKET_UNIT_EUR = 1

const token = computed(() => authStore.session?.access_token ?? '')

async function fetchAll() {
  loading.value = true
  try {
    const [p, b, c] = await Promise.all([
      $fetch<Plan[]>('/api/billing/plans', {
        headers: { Authorization: `Bearer ${token.value}` },
      }),
      $fetch<BalanceResp>('/api/billing/balance', {
        headers: { Authorization: `Bearer ${token.value}` },
      }),
      $fetch<ConnectStatus>('/api/billing/connect/status', {
        headers: { Authorization: `Bearer ${token.value}` },
      }).catch(() => null),
    ])
    plans.value = (p || []).sort((a, b) => a.price_cents - b.price_cents)
    balance.value = b
    connect.value = c
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Error al cargar billing')
  } finally {
    loading.value = false
  }
}

async function startConnect() {
  connecting.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/billing/connect/onboard', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
    })
    if (res?.url) window.location.href = res.url
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Error al iniciar onboarding')
  } finally {
    connecting.value = false
  }
}

async function buy(plan: string) {
  buying.value = plan
  try {
    const res = await $fetch<{ url: string }>('/api/billing/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { plan },
    })
    if (res?.url) window.location.href = res.url
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Error al iniciar compra')
  } finally {
    buying.value = null
  }
}

async function buyTicketsTopup(qty: number) {
  buyingTickets.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/billing/checkout-tickets', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { quantity: qty },
    })
    if (res?.url) window.location.href = res.url
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Error al iniciar compra')
  } finally {
    buyingTickets.value = false
  }
}

async function buyActivationsTopup(qty: number) {
  buyingActivations.value = true
  try {
    const res = await $fetch<{ url: string }>('/api/billing/checkout-activations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { quantity: qty },
    })
    if (res?.url) window.location.href = res.url
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Error al iniciar compra')
  } finally {
    buyingActivations.value = false
  }
}

async function pollBalanceUntilChange(prevTicket: number, prevActiv: number, maxMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      const b = await $fetch<BalanceResp>('/api/billing/balance', {
        headers: { Authorization: `Bearer ${token.value}` },
      })
      balance.value = b
      if (
        b.organization.ticket_balance !== prevTicket ||
        b.organization.activation_balance !== prevActiv
      ) {
        toast.success('Saldo actualizado')
        return
      }
    } catch (e) { console.error('[billing] poll balance failed:', e) }
  }
}

const euro = (cents: number) => `${(cents / 100).toFixed(0)}€`

const planBreakdown = (p: Plan) => {
  const totalEur = p.price_cents / 100
  const unitValue = p.tickets * TICKET_UNIT_EUR + p.activations * ACTIVATION_UNIT_EUR
  const ratio = totalEur / unitValue
  const perTicket = (TICKET_UNIT_EUR * ratio).toFixed(2)
  const perActivation = (ACTIVATION_UNIT_EUR * ratio).toFixed(0)
  const savings = unitValue - totalEur
  return { totalEur, perTicket, perActivation, unitValue, savings }
}

const PLAN_META: Record<string, { label: string; accent: string; highlight?: boolean }> = {
  starter: { label: 'Starter', accent: 'sky' },
  pro: { label: 'Pro', accent: 'violet', highlight: true },
  enterprise: { label: 'Enterprise', accent: 'amber' },
}

const REASON_LABEL: Record<string, string> = {
  purchase_bundle: 'Compra de paquete',
  purchase_tickets: 'Compra de tickets',
  purchase_activations: 'Compra de activaciones',
  signup_bonus: 'Regalo de bienvenida',
  enrollment: 'Inscripción',
  csv_import: 'Importación CSV',
  manual_add: 'Añadido manual',
  contest_activation: 'Activación de concurso',
  admin_adjust: 'Ajuste administrativo',
}

function formatDate(d: string) {
  return new Date(d).toLocaleString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

onMounted(async () => {
  const isSuccess = route.query.purchase === 'success'
  const isCancel  = route.query.purchase === 'cancel'
  const isTopupSuccess = route.query.topup === 'success'
  const isTopupCancel  = route.query.topup === 'cancel'
  const connectReturn = route.query.connect === 'return' || route.query.connect === 'refresh'

  if (connectReturn) router.replace({ path: route.path, query: {} })

  // Strip query so refresh doesn't re-trigger poll
  if (isSuccess || isCancel || isTopupSuccess || isTopupCancel) {
    router.replace({ path: route.path, query: {} })
  }
  if (isCancel) toast.info('Compra cancelada')
  if (isTopupCancel) toast.info('Compra cancelada')

  await fetchAll()

  const showSuccess = isSuccess || isTopupSuccess
  if (showSuccess && balance.value) {
    // Check if purchase already processed
    const lastPurchase = balance.value.transactions.find((x) =>
      x.reason === 'purchase_bundle' || x.reason === 'purchase_tickets' || x.reason === 'purchase_activations'
    )
    const alreadyProcessed = lastPurchase
      && (Date.now() - new Date(lastPurchase.created_at).getTime()) < 60_000
    if (alreadyProcessed) {
      toast.success('Pago confirmado')
    } else {
      const t = balance.value.organization.ticket_balance
      const a = balance.value.organization.activation_balance
      toast.loading('Procesando pago...', { id: 'pay-poll', duration: 20000 })
      await pollBalanceUntilChange(t, a)
      toast.dismiss('pay-poll')
    }
  }
})
</script>

<template>
  <div class="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">

    <!-- Header -->
    <div>
      <h2 class="text-2xl font-bold tracking-tight">Billing</h2>
      <p class="text-sm text-muted-foreground mt-1">Compra tickets y activaciones para tus concursos</p>
    </div>

    <div v-if="loading" class="flex justify-center py-16 text-muted-foreground">
      <Loader2 class="w-5 h-5 animate-spin" />
    </div>

    <template v-else-if="balance">

      <!-- Balance cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card class="border-border shadow-sm">
          <CardContent class="pt-6">
            <div class="flex items-center gap-4">
              <div class="p-3 rounded-xl bg-sky-100 dark:bg-sky-950/40">
                <Ticket class="w-6 h-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tickets</p>
                <p class="text-3xl font-bold">{{ balance.organization.ticket_balance }}</p>
                <p class="text-[11px] text-muted-foreground">1 ticket = 1 inscripción gratuita o CSV</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card class="border-border shadow-sm">
          <CardContent class="pt-6">
            <div class="flex items-center gap-4">
              <div class="p-3 rounded-xl bg-violet-100 dark:bg-violet-950/40">
                <Zap class="w-6 h-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <p class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Activaciones</p>
                <p class="text-3xl font-bold">{{ balance.organization.activation_balance }}</p>
                <p class="text-[11px] text-muted-foreground">1 activación = 1 concurso</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Stripe Connect -->
      <Card class="border-border shadow-sm">
        <CardHeader class="pb-4">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
              <Link2 class="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div class="flex-1">
              <CardTitle class="text-base">Cobros a participantes</CardTitle>
              <CardDescription class="text-xs">Conecta Stripe para cobrar las cuotas de inscripción</CardDescription>
            </div>
            <Badge
              v-if="connect?.charges_enabled"
              class="bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700 text-[10px] font-bold uppercase tracking-widest"
              variant="outline"
            >
              <CircleCheck class="w-3 h-3 mr-1" /> Activo
            </Badge>
            <Badge
              v-else-if="connect?.connected"
              class="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700 text-[10px] font-bold uppercase tracking-widest"
              variant="outline"
            >
              <AlertCircle class="w-3 h-3 mr-1" /> Pendiente
            </Badge>
            <Badge
              v-else
              variant="outline"
              class="text-[10px] font-bold uppercase tracking-widest"
            >
              Sin conectar
            </Badge>
          </div>
        </CardHeader>
        <Separator />
        <CardContent class="pt-6">
          <div v-if="!connect?.connected" class="space-y-3">
            <p class="text-sm text-muted-foreground">
              Para cobrar cuotas de inscripción a participantes necesitas vincular tu cuenta de Stripe. Stripe te guiará en el proceso de verificación (5-10 min).
            </p>
            <p class="text-[11px] text-muted-foreground">
              En concursos con cuota de inscripción <strong>no se consumen tickets</strong>: la plataforma retiene una pequeña comisión del importe cobrado (5%).
            </p>
            <Button
              class="h-9 px-5 font-bold text-[10px] uppercase tracking-widest gap-2"
              :disabled="connecting"
              @click="startConnect"
            >
              <Loader2 v-if="connecting" class="w-3.5 h-3.5 animate-spin" />
              <Link2 v-else class="w-3.5 h-3.5" />
              {{ connecting ? 'Redirigiendo...' : 'Conectar Stripe' }}
            </Button>
          </div>
          <div v-else-if="!connect.charges_enabled" class="space-y-3">
            <p class="text-sm text-muted-foreground">
              Stripe aún no ha habilitado los cobros. Completa el onboarding para activarlo.
            </p>
            <Button
              variant="outline"
              class="h-9 px-5 font-bold text-[10px] uppercase tracking-widest gap-2"
              :disabled="connecting"
              @click="startConnect"
            >
              <ExternalLink class="w-3.5 h-3.5" />
              Completar onboarding
            </Button>
          </div>
          <div v-else class="space-y-1">
            <div class="flex items-center gap-2 text-sm">
              <CircleCheck class="w-4 h-4 text-emerald-500" />
              <span>Cuenta Stripe vinculada · cobros habilitados</span>
            </div>
            <p v-if="!connect.payouts_enabled" class="text-[11px] text-amber-600 dark:text-amber-400 pl-6">
              Payouts pendientes. Algunos datos siguen sin verificar en Stripe.
            </p>
            <p class="text-[11px] text-muted-foreground pl-6">
              ID: <span class="font-mono">{{ connect.account_id }}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Plans -->
      <div>
        <h3 class="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Paquetes</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            v-for="p in plans"
            :key="p.plan"
            :class="[
              'border-border shadow-sm relative overflow-hidden',
              PLAN_META[p.plan]?.highlight ? 'border-violet-300 dark:border-violet-800 ring-1 ring-violet-200 dark:ring-violet-900/50' : ''
            ]"
          >
            <div
              v-if="PLAN_META[p.plan]?.highlight"
              class="absolute top-3 right-3"
            >
              <Badge class="bg-violet-600 text-white text-[9px] font-bold uppercase tracking-widest">Recomendado</Badge>
            </div>
            <CardHeader class="pb-3">
              <CardTitle class="text-lg capitalize">{{ PLAN_META[p.plan]?.label || p.plan }}</CardTitle>
              <CardDescription class="text-xs">
                {{ p.tickets }} tickets + {{ p.activations }} activaciones
              </CardDescription>
            </CardHeader>
            <Separator />
            <CardContent class="pt-5 space-y-4">
              <div>
                <p class="text-3xl font-bold">{{ euro(p.price_cents) }}</p>
                <p class="text-[11px] text-muted-foreground">Pago único</p>
              </div>

              <!-- Price breakdown -->
              <div class="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
                <p class="font-semibold text-[10px] uppercase tracking-widest text-muted-foreground">Desglose</p>
                <div class="flex justify-between">
                  <span>{{ p.tickets }} tickets</span>
                  <span class="tabular-nums">{{ planBreakdown(p).perTicket }} €/ticket</span>
                </div>
                <div class="flex justify-between">
                  <span>{{ p.activations }} activaciones</span>
                  <span class="tabular-nums">{{ planBreakdown(p).perActivation }} €/ud</span>
                </div>
                <Separator class="my-1" />
                <div class="flex justify-between font-semibold text-emerald-600 dark:text-emerald-400">
                  <span>Ahorras</span>
                  <span class="tabular-nums">{{ planBreakdown(p).savings.toFixed(0) }} €</span>
                </div>
              </div>

              <ul class="space-y-2 text-sm">
                <li class="flex items-center gap-2">
                  <Check class="w-4 h-4 text-emerald-500 shrink-0" />
                  <span><strong>{{ p.tickets }}</strong> tickets</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-4 h-4 text-emerald-500 shrink-0" />
                  <span><strong>{{ p.activations }}</strong> activaciones</span>
                </li>
                <li class="flex items-center gap-2">
                  <Check class="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Sin caducidad</span>
                </li>
              </ul>
              <Button
                class="w-full h-9 font-bold text-[10px] uppercase tracking-widest gap-2"
                :disabled="!!buying"
                @click="buy(p.plan)"
              >
                <Loader2 v-if="buying === p.plan" class="w-3.5 h-3.5 animate-spin" />
                <ShoppingCart v-else class="w-3.5 h-3.5" />
                {{ buying === p.plan ? 'Redirigiendo...' : 'Comprar' }}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- Individual purchases -->
      <div>
        <h3 class="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-3">Compra individual</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Tickets -->
          <Card class="border-border shadow-sm">
            <CardHeader class="pb-3">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-sky-100 dark:bg-sky-950/40">
                  <Ticket class="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle class="text-base">Tickets</CardTitle>
                  <CardDescription class="text-xs">1 € por ticket · Máx. 500</CardDescription>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent class="pt-5 space-y-4">
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-9 w-9 shrink-0"
                  :disabled="ticketQty <= 1"
                  @click="ticketQty--"
                >
                  <Minus class="w-4 h-4" />
                </Button>
                <input
                  v-model.number="ticketQty"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-center text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  variant="outline"
                  size="icon"
                  class="h-9 w-9 shrink-0"
                  :disabled="ticketQty >= 500"
                  @click="ticketQty++"
                >
                  <Plus class="w-4 h-4" />
                </Button>
              </div>
              <div class="flex items-center justify-between">
                <p class="text-sm text-muted-foreground">Total:</p>
                <p class="text-2xl font-bold tabular-nums">{{ ticketQty }} €</p>
              </div>
              <Button
                class="w-full h-9 font-bold text-[10px] uppercase tracking-widest gap-2"
                :disabled="buyingTickets"
                @click="buyTicketsTopup(ticketQty)"
              >
                <Loader2 v-if="buyingTickets" class="w-3.5 h-3.5 animate-spin" />
                <ShoppingCart v-else class="w-3.5 h-3.5" />
                {{ buyingTickets ? 'Redirigiendo...' : 'Comprar tickets' }}
              </Button>
            </CardContent>
          </Card>

          <!-- Activations -->
          <Card class="border-border shadow-sm">
            <CardHeader class="pb-3">
              <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-violet-100 dark:bg-violet-950/40">
                  <Zap class="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <CardTitle class="text-base">Activaciones</CardTitle>
                  <CardDescription class="text-xs">50 € por activación · Máx. 50</CardDescription>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent class="pt-5 space-y-4">
              <div class="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  class="h-9 w-9 shrink-0"
                  :disabled="activationQty <= 1"
                  @click="activationQty--"
                >
                  <Minus class="w-4 h-4" />
                </Button>
                <input
                  v-model.number="activationQty"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-center text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <Button
                  variant="outline"
                  size="icon"
                  class="h-9 w-9 shrink-0"
                  :disabled="activationQty >= 50"
                  @click="activationQty++"
                >
                  <Plus class="w-4 h-4" />
                </Button>
              </div>
              <div class="flex items-center justify-between">
                <p class="text-sm text-muted-foreground">Total:</p>
                <p class="text-2xl font-bold tabular-nums">{{ activationQty * ACTIVATION_UNIT_EUR }} €</p>
              </div>
              <Button
                class="w-full h-9 font-bold text-[10px] uppercase tracking-widest gap-2"
                :disabled="buyingActivations"
                @click="buyActivationsTopup(activationQty)"
              >
                <Loader2 v-if="buyingActivations" class="w-3.5 h-3.5 animate-spin" />
                <ShoppingCart v-else class="w-3.5 h-3.5" />
                {{ buyingActivations ? 'Redirigiendo...' : 'Comprar activaciones' }}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- History -->
      <Card class="border-border shadow-sm">
        <CardHeader class="pb-4">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
              <History class="w-4 h-4 text-zinc-600 dark:text-zinc-400" />
            </div>
            <div>
              <CardTitle class="text-base">Historial</CardTitle>
              <CardDescription class="text-xs">Últimos movimientos</CardDescription>
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent class="pt-0">
          <div v-if="!balance.transactions.length" class="py-10 text-center text-sm text-muted-foreground">
            Sin movimientos
          </div>
          <div v-else class="divide-y divide-border max-h-[320px] overflow-y-auto">
            <div
              v-for="tx in balance.transactions"
              :key="tx.id"
              class="flex items-center gap-4 py-3"
            >
              <div
                :class="[
                  'p-2 rounded-lg shrink-0',
                  tx.delta > 0
                    ? 'bg-emerald-100 dark:bg-emerald-950/40'
                    : 'bg-red-100 dark:bg-red-950/40'
                ]"
              >
                <ArrowUpRight v-if="tx.delta > 0" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <ArrowDownRight v-else class="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <p class="text-sm font-semibold truncate">
                    {{ REASON_LABEL[tx.reason] ?? tx.reason }}
                  </p>
                  <Badge
                    variant="outline"
                    class="text-[9px] font-bold uppercase tracking-widest"
                    :class="tx.entity === 'ticket'
                      ? 'border-sky-300 text-sky-700 dark:border-sky-800 dark:text-sky-300'
                      : 'border-violet-300 text-violet-700 dark:border-violet-800 dark:text-violet-300'"
                  >
                    {{ tx.entity === 'ticket' ? 'Ticket' : 'Activación' }}
                  </Badge>
                </div>
                <p class="text-[11px] text-muted-foreground">{{ formatDate(tx.created_at) }}</p>
              </div>
              <div class="text-right shrink-0">
                <p
                  :class="[
                    'text-sm font-bold tabular-nums',
                    tx.delta > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                  ]"
                >
                  {{ tx.delta > 0 ? '+' : '' }}{{ tx.delta }}
                </p>
                <p class="text-[10px] text-muted-foreground">Saldo: {{ tx.balance_after }}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </template>
  </div>
</template>
