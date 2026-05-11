<script setup lang="ts">
import { Loader2, Calendar, Users, Trophy, ArrowRight, Lock, FileText } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { marked } from 'marked'

definePageMeta({
  layout: 'auth',
})

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const { data, pending, error } = await useFetch<{
  contest: {
    id: string; slug: string; name: string; description: string | null
    cover_image_url: string | null; type: string; status: string
    starts_at: string | null; ends_at: string | null
    registration_open: boolean; registration_token: string
    entry_fee_cents: number; org_name: string; org_slug: string
    org_charges_enabled: boolean; settings: Record<string, unknown> | null
  }
  categories: Array<{
    id: string; name: string; description: string | null; status: string
    min_age: number | null; max_age: number | null
    max_participants: number | null; current_count: number
  }>
}>(() => `/api/public/contests/${slug.value}`, { server: true })

const contest = computed(() => data.value?.contest)
const categories = computed(() => data.value?.categories ?? [])
const hasRules = computed(() => !!(contest.value?.settings as any)?.rules)

const parsedDescription = computed(() => marked.parse(contest.value?.description || '') as string)
const parsedRules = computed(() => marked.parse((contest.value?.settings as any)?.rules || '') as string)

const joinHref = computed(() =>
  contest.value ? `/join/${contest.value.registration_token}` : '#'
)

const registrationOpen = computed(() => contest.value?.registration_open && contest.value?.status === 'active')
const isPaid = computed(() => (contest.value?.entry_fee_cents ?? 0) > 0)
const totalParticipants = computed(() =>
  categories.value.reduce((acc, c) => acc + (c.current_count || 0), 0)
)

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}
</script>

<template>
  <div class="w-full max-w-2xl mx-auto">
    <div v-if="pending" class="flex items-center justify-center py-16 text-muted-foreground">
      <Loader2 class="w-8 h-8 animate-spin" />
    </div>

    <Card v-else-if="error || !contest" class="shadow-lg">
      <CardContent class="py-12 text-center space-y-2">
        <p class="text-lg font-semibold">Concurso no disponible</p>
        <p class="text-sm text-muted-foreground">
          No existe o aún no está publicado.
        </p>
      </CardContent>
    </Card>

    <div v-else class="space-y-4">
      <!-- Hero -->
      <Card class="shadow-lg overflow-hidden">
        <div
          v-if="contest.cover_image_url"
          class="h-40 bg-cover bg-center"
          :style="{ backgroundImage: `url(${contest.cover_image_url})` }"
        />
        <CardHeader>
          <div class="flex items-start justify-between gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
                {{ contest.org_name }}
              </p>
              <CardTitle class="text-2xl">{{ contest.name }}</CardTitle>
            </div>
            <Badge v-if="contest.status === 'finished'" variant="secondary" class="shrink-0">
              Finalizado
            </Badge>
            <Badge v-else-if="registrationOpen" class="shrink-0 bg-emerald-600">
              Abierto
            </Badge>
            <Badge v-else variant="outline" class="shrink-0">Cerrado</Badge>
          </div>

          <div class="flex flex-wrap gap-3 text-xs text-muted-foreground mt-3">
            <div v-if="contest.starts_at" class="flex items-center gap-1.5">
              <Calendar class="w-3.5 h-3.5" />
              {{ fmtDate(contest.starts_at) }}
              <template v-if="contest.ends_at">– {{ fmtDate(contest.ends_at) }}</template>
            </div>
            <div class="flex items-center gap-1.5">
              <Users class="w-3.5 h-3.5" />
              {{ totalParticipants }} inscritos
            </div>
            <div v-if="isPaid" class="flex items-center gap-1.5 font-semibold text-foreground">
              <Trophy class="w-3.5 h-3.5" />
              €{{ (contest.entry_fee_cents / 100).toFixed(2) }}
            </div>
          </div>
        </CardHeader>
      </Card>

      <!-- Description + Rules tabs -->
      <Card class="shadow-lg">
        <CardHeader>
          <CardTitle class="text-base">Detalles</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs default-value="description">
            <TabsList class="w-full">
              <TabsTrigger value="description" class="flex-1">Descripción</TabsTrigger>
              <TabsTrigger value="reglamento" class="flex-1">Reglamento</TabsTrigger>
            </TabsList>

            <TabsContent value="description" class="mt-4">
              <div
                v-if="contest.description"
                class="rich-content text-sm prose prose-sm max-w-none"
                v-html="parsedDescription"
              />
              <p v-else class="text-sm text-muted-foreground py-4 text-center">
                El organizador no ha añadido una descripción.
              </p>
            </TabsContent>

            <TabsContent value="reglamento" class="mt-4">
              <div
                v-if="(contest.settings as any)?.rules"
                class="rich-content text-sm prose prose-sm max-w-none"
                v-html="parsedRules"
              />
              <div v-else class="flex flex-col items-center gap-2 py-6 text-center">
                <FileText class="w-8 h-8 text-muted-foreground/40" />
                <p class="text-sm text-muted-foreground">
                  El organizador no ha publicado el reglamento.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <!-- CTA -->
      <Card v-if="registrationOpen" class="border-primary/30 shadow-lg">
        <CardContent class="py-5 flex items-center justify-between gap-3">
          <div>
            <p class="font-semibold">Inscripciones abiertas</p>
            <p class="text-xs text-muted-foreground">
              {{ isPaid
                ? `Cuota: €${(contest.entry_fee_cents / 100).toFixed(2)} · Pago seguro vía Stripe`
                : 'Inscripción gratuita' }}
            </p>
          </div>
          <Button as-child>
            <NuxtLink :to="joinHref">
              Inscribirse <ArrowRight class="w-4 h-4 ml-2" />
            </NuxtLink>
          </Button>
        </CardContent>
      </Card>

      <Card v-else class="border-muted">
        <CardContent class="py-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Lock class="w-4 h-4" />
          <span v-if="contest.status === 'finished'">Concurso finalizado.</span>
          <span v-else>Inscripciones cerradas.</span>
        </CardContent>
      </Card>

      <!-- Categories -->
      <Card v-if="categories.length" class="shadow-lg">
        <CardHeader>
          <CardTitle class="text-base">Categorías</CardTitle>
          <CardDescription>{{ categories.length }} disponibles</CardDescription>
        </CardHeader>
        <CardContent class="space-y-2">
          <div
            v-for="c in categories"
            :key="c.id"
            class="rounded-lg border border-border p-3"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-sm">{{ c.name }}</p>
                <p v-if="c.description" class="text-xs text-muted-foreground mt-0.5">
                  {{ c.description }}
                </p>
                <div class="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                  <span v-if="c.min_age != null || c.max_age != null">
                    Edad: {{ c.min_age ?? '–' }}–{{ c.max_age ?? '–' }}
                  </span>
                  <span v-if="c.max_participants != null">
                    {{ c.current_count }}/{{ c.max_participants }} plazas
                  </span>
                  <span v-else>{{ c.current_count }} inscritos</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
