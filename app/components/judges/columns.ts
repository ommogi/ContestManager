import { h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import type { ContestMember } from '~~/types'
import { Checkbox } from '@/components/ui/checkbox'
import AvatarCell from '@/components/ui/avatar/AvatarCell.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2, Mail } from 'lucide-vue-next'

type InvitationStatus = 'pending' | 'accepted' | 'rejected' | null | undefined

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
}

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/60',
  accepted: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900/60',
  rejected: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:border-zinc-800',
}

export const createColumns = (
  onDelete: (id: string) => void,
  onResend?: (id: string) => void,
): ColumnDef<ContestMember>[] => [
  {
    id: 'select',
    header: ({ table }) => h(Checkbox, {
      'modelValue': table.getIsAllRowsSelected() || (table.getIsSomeRowsSelected() && 'indeterminate'),
      'onUpdate:modelValue': (value: any) => table.toggleAllRowsSelected(!!value),
      'ariaLabel': 'Select all',
      'onClick': (e: MouseEvent) => e.stopPropagation(),
    }),
    cell: ({ row }) => h(Checkbox, {
      'modelValue': row.getIsSelected(),
      'onUpdate:modelValue': (value: any) => row.toggleSelected(!!value),
      'ariaLabel': 'Select row',
      'onClick': (e: MouseEvent) => e.stopPropagation(),
    }),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: 'full_name',
    header: ({ column }) => {
      const sorted = column.getIsSorted()
      return h(Button, {
        variant: 'ghost',
        class: 'px-0 font-bold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-transparent gap-1.5',
        onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
      }, () => [
        'Jurado',
        sorted === 'asc'
          ? h(ArrowUp, { class: 'w-3 h-3' })
          : sorted === 'desc'
            ? h(ArrowDown, { class: 'w-3 h-3' })
            : h(ArrowUpDown, { class: 'w-3 h-3 opacity-40' }),
      ])
    },
    cell: ({ row }) => {
      const name = (row.getValue('full_name') as string | null) || (row.original.email ?? '')
      return h(AvatarCell, {
        name,
        email: row.original.email,
        avatarUrl: (row.original as any).avatar_url ?? null,
      })
    },
    enableSorting: true,
  },
  {
    id: 'invitation_status',
    accessorKey: 'invitation_status',
    header: () => h('span', { class: 'font-bold text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400' }, 'Estado'),
    cell: ({ row }) => {
      const status = (row.original as any).invitation_status as InvitationStatus
      if (!status) return h('span', { class: 'text-xs text-muted-foreground' }, '—')
      const label = STATUS_LABEL[status] || status
      const cls = STATUS_CLASS[status] || ''
      return h(Badge, { variant: 'outline', class: `text-[10px] font-bold uppercase tracking-wider ${cls}` }, () => label)
    },
    enableSorting: true,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const status = (row.original as any).invitation_status as InvitationStatus
      const isPending = status === 'pending'
      const children: any[] = []
      if (isPending && onResend) {
        children.push(h(Button, {
          variant: 'ghost',
          size: 'icon',
          class: 'h-7 w-7 text-zinc-400 hover:text-indigo-600 transition-colors',
          title: 'Reenviar invitación',
          onClick: (e: MouseEvent) => { e.stopPropagation(); onResend(row.original.id) },
        }, () => h(Mail, { class: 'w-3.5 h-3.5' })))
      }
      children.push(h(Button, {
        variant: 'ghost',
        size: 'icon',
        class: 'h-7 w-7 text-zinc-300 dark:text-zinc-600 hover:text-red-500 transition-colors',
        title: isPending ? 'Cancelar invitación' : 'Eliminar jurado',
        onClick: (e: MouseEvent) => { e.stopPropagation(); onDelete(row.original.id) },
      }, () => h(Trash2, { class: 'w-3.5 h-3.5' })))
      return h('div', { class: 'flex justify-end gap-1' }, children)
    },
    enableSorting: false,
  },
]
