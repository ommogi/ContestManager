<script setup lang="ts">
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import CommandPalette from '@/components/ui/CommandPalette.vue'
import { Search } from 'lucide-vue-next'
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset
} from '@/components/ui/sidebar'
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, Trophy, Settings, LogOut, Sun, Moon, Users, Wallet, Ticket, Calendar as CalendarIcon } from 'lucide-vue-next'
import Profile from '@/components/user/profile.vue'
import NotificationsPopover from '@/components/ui/notifications/NotificationsPopover.vue'
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator
} from '@/components/ui/breadcrumb'
import { useBreadcrumbs } from '@/composables/useBreadcrumbs'

const route = useRoute()
const router = useRouter()
const colorMode = useColorMode()
const authStore = useAuthStore()
const { breadcrumbs } = useBreadcrumbs()

const { displayName, initials, organization, isOrgOwner, profile } = storeToRefs(authStore)

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

async function handleSignOut() {
  await authStore.signOut()
  // Small delay to ensure auth state is fully cleared before navigation
  await new Promise(resolve => setTimeout(resolve, 50))
  await router.push('/auth/login')
}

// ── Ticket balance (org owners) ─────────────────────────────────────
const ticketBalance = ref<number | null>(null)
async function refreshBalance() {
  if (!isOrgOwner.value || !authStore.session?.access_token) return
  try {
    const r = await $fetch<any>('/api/billing/balance', {
      headers: { Authorization: `Bearer ${authStore.session.access_token}` },
    })
    ticketBalance.value = r?.organization?.ticket_balance ?? 0
  } catch {
    ticketBalance.value = null
  }
}
watchEffect(() => { if (isOrgOwner.value && authStore.session) refreshBalance() })

// Command palette
const commandPaletteRef = ref<{ open: () => void } | null>(null)
const isMac = computed(() => typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform))
</script>

<template>
  <SidebarProvider>
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div class="py-4 flex items-center gap-3">
          <img class="w-12 h-12 " src="https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public/contest-assets/logo.png" alt="logo">
          <div class="group-data-[collapsible=icon]:hidden min-w-0">
            <h1 class="text-lg font-extrabold tracking-tight leading-tight truncate">
              Contest<span class="text-zinc-500">Manager</span>
            </h1>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton as-child :isActive="route.path === '/dashboard'" tooltip="Resumen">
                <NuxtLink to="/dashboard">
                  <LayoutDashboard />
                  <span>Resumen</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <!-- Org-only navigation -->
            <template v-if="isOrgOwner">
              <SidebarMenuItem>
                <SidebarMenuButton as-child :isActive="route.path.startsWith('/contests')" tooltip="Mis Concursos">
                  <NuxtLink to="/contests">
                    <Trophy />
                    <span>Mis Concursos</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton as-child :isActive="route.path === '/judge-pool'" tooltip="Jurados">
                  <NuxtLink to="/judge-pool">
                    <Users />
                    <span>Jurados</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton as-child :isActive="route.path.startsWith('/calendar')" tooltip="Calendario">
                  <NuxtLink to="/calendar">
                    <CalendarIcon />
                    <span>Calendario</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton as-child :isActive="route.path === '/billing'" tooltip="Billing">
                  <NuxtLink to="/billing">
                    <Wallet />
                    <span>Billing</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </template>

            <!-- Regular user navigation -->
            <template v-else-if="profile">
              <SidebarMenuItem>
                <SidebarMenuButton as-child :isActive="route.path === '/my-contests'" tooltip="Mis Concursos">
                  <NuxtLink to="/my-contests">
                    <Trophy />
                    <span>Mis Concursos</span>
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </template>

            <SidebarMenuItem>
              <SidebarMenuButton as-child :isActive="route.path === '/settings'" tooltip="Configuración">
                <NuxtLink to="/settings">
                  <Settings />
                  <span>Configuración</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <!-- Profile -->
          <SidebarMenuItem>
            <Profile/>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>

    <SidebarInset class="bg-background text-foreground font-sans transition-colors">
      <header class="flex h-16 shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 transition-[width,height,background-color] ease-linear w-full">
        <div class="flex items-center gap-2">
          <SidebarTrigger class="-ml-1" />
          <div v-if="breadcrumbs.length" class="hidden sm:flex items-center">
            <div class="w-px h-4 bg-border mx-2" />
            <Breadcrumb>
              <BreadcrumbList>
                <template v-for="(crumb, i) in breadcrumbs" :key="i">
                  <BreadcrumbItem>
                    <BreadcrumbLink v-if="crumb.href" :href="crumb.href">{{ crumb.label }}</BreadcrumbLink>
                    <BreadcrumbPage v-else>{{ crumb.label }}</BreadcrumbPage>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator v-if="i < breadcrumbs.length - 1" />
                </template>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>

        <div class="flex items-center justify-end gap-4 flex-1">
          <div class="w-full max-w-sm hidden md:flex">
            <button
              type="button"
              @click="commandPaletteRef?.open()"
              class="w-full flex items-center gap-2 h-9 px-3 rounded-md bg-muted/50 border border-border hover:bg-muted text-sm text-muted-foreground transition-colors"
            >
              <Search class="w-4 h-4" />
              <span class="flex-1 text-left">Buscar concursos, participantes...</span>
              <kbd class="hidden lg:inline-flex items-center gap-0.5 text-[10px] font-bold uppercase bg-background border border-border px-1.5 py-0.5 rounded">
                <span>{{ isMac ? '⌘' : 'Ctrl' }}</span><span>K</span>
              </kbd>
            </button>
          </div>
          <CommandPalette ref="commandPaletteRef" />

          <ClientOnly>
            <NuxtLink
              v-if="isOrgOwner && ticketBalance !== null"
              to="/billing"
              class="hidden sm:flex items-center gap-1.5 px-3 h-9 rounded-full border border-border bg-muted/50 hover:bg-muted text-xs font-semibold transition-colors"
              title="Saldo de tickets"
            >
              <Ticket class="w-3.5 h-3.5" />
              <span>{{ ticketBalance }}</span>
              <span class="text-muted-foreground font-normal">tickets</span>
            </NuxtLink>
            <NotificationsPopover />
            <Button variant="ghost" size="icon" @click="toggleColorMode" class="rounded-full w-9 h-9">
              <Sun v-if="colorMode.value === 'dark'" class="w-5 h-5" />
              <Moon v-else class="w-5 h-5" />
              <span class="sr-only">Toggle theme</span>
            </Button>
            <template #fallback>
              <div class="w-9 h-9" />
            </template>
          </ClientOnly>
        </div>
      </header>

      <div class="flex-1 overflow-auto p-8 relative">
        <slot />
      </div>
    </SidebarInset>

    <Toaster position="top-center" theme="system" />
  </SidebarProvider>
</template>
