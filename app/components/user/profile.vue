<script setup lang="ts">
import {
  UserCircle,
  LayoutGrid,
  History,
  Settings,
  LogOut,
  Sparkles,
  ChevronUp
} from 'lucide-vue-next'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const authStore = useAuthStore()
const router = useRouter()
const colorMode = useColorMode()

const { displayName, initials, profile, isOrgOwner } = storeToRefs(authStore)

const handleSignOut = async () => {
  await authStore.signOut()
  // Small delay to ensure auth state is fully cleared before navigation
  await new Promise(resolve => setTimeout(resolve, 50))
  await router.push('/auth/login')
}

const goToSettings = () => {
  router.push('/settings')
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <SidebarMenuButton
        size="lg"
        class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground shadow-sm border border-border/50 bg-card transition-all group-data-[collapsible=icon]:justify-center"
      >
        <Avatar class="h-8 w-8 rounded-lg">
          <AvatarImage :src="profile?.avatar_url || ''" :alt="displayName" />
          <AvatarFallback class="rounded-lg">{{ initials }}</AvatarFallback>
        </Avatar>
        <div class="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden overflow-hidden">
          <span class="truncate font-semibold">{{ displayName }}</span>
            <p class="text-xs text-muted-foreground truncate leading-tight">
                {{ isOrgOwner ? 'Organización' : 'Usuario' }}
            </p>
        </div>
        <ChevronUp class="ml-auto size-4 group-data-[collapsible=icon]:hidden opacity-50" />
      </SidebarMenuButton>
    </DropdownMenuTrigger>

    <DropdownMenuContent
      class="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl p-2 shadow-xl border-muted"
      side="top"
      align="start"
      :side-offset="12"
    >
      <DropdownMenuGroup class="space-y-0.5">
        <DropdownMenuItem @click="goToSettings" class="cursor-pointer py-2 px-3 rounded-lg focus:bg-accent group">
          <UserCircle class="mr-3 size-5 text-muted-foreground group-focus:text-accent-foreground" />
          <span class="font-medium">Account Settings</span>
        </DropdownMenuItem>
        
        <DropdownMenuItem class="cursor-pointer py-2 px-3 rounded-lg focus:bg-accent group">
          <LayoutGrid class="mr-3 size-5 text-muted-foreground group-focus:text-accent-foreground" />
          <span class="font-medium text-sm">Integrations</span>
        </DropdownMenuItem>

        <DropdownMenuItem class="cursor-pointer py-2 px-3 rounded-lg focus:bg-accent group">
          <History class="mr-3 size-5 text-muted-foreground group-focus:text-accent-foreground" />
          <span class="font-medium text-sm">Audit Logs</span>
        </DropdownMenuItem>

        <DropdownMenuItem class="cursor-pointer py-2 px-3 rounded-lg focus:bg-accent group">
          <Settings class="mr-3 size-5 text-muted-foreground group-focus:text-accent-foreground" />
          <span class="font-medium text-sm">Settings</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>

      <DropdownMenuSeparator class="my-2 bg-border/50" />

      <div class="px-1 py-1">
        <div class="grid grid-cols-3 gap-1 bg-muted/50 p-1 rounded-xl border border-border/20">
          <button 
            @click="colorMode.preference = 'dark'"
            :class="colorMode.preference === 'dark' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
            class="text-[10px] font-bold py-1.5 rounded-lg transition-all uppercase tracking-wider"
          >
            Dark
          </button>
          <button 
            @click="colorMode.preference = 'light'"
            :class="colorMode.preference === 'light' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
            class="text-[10px] font-bold py-1.5 rounded-lg transition-all uppercase tracking-wider"
          >
            Light
          </button>
          <button 
            @click="colorMode.preference = 'system'"
            :class="colorMode.preference === 'system' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'"
            class="text-[10px] font-bold py-1.5 rounded-lg transition-all uppercase tracking-wider"
          >
            System
          </button>
        </div>
      </div>

      <DropdownMenuSeparator class="my-2 bg-border/50" />

      <div class="px-3 py-3 flex items-start gap-4 mx-1">
        <div class="p-2 bg-orange-50 dark:bg-orange-950/30 rounded-lg shrink-0">
          <Sparkles class="size-5 text-orange-500 fill-orange-500" />
        </div>
        <div class="flex flex-col">
          <p class="text-sm font-bold text-foreground">Premium Plan</p>
          <p class="text-[11px] text-muted-foreground">Valid until Jan 1, 2027</p>
        </div>
      </div>

      <DropdownMenuSeparator class="my-2 bg-border/50" />

      <div class="px-1">
        <DropdownMenuItem 
          @click="handleSignOut" 
          class="cursor-pointer py-2.5 px-3 rounded-xl text-red-600 bg-red-50/50 dark:bg-red-950/20 focus:bg-red-100 dark:focus:bg-red-900/40 focus:text-red-700 mt-1"
        >
          <LogOut class="mr-3 size-5 shrink-0" />
          <span class="font-bold">Sign Out</span>
        </DropdownMenuItem>
      </div>
    </DropdownMenuContent>
  </DropdownMenu>
</template>