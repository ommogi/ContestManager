// UI-only additions on top of the shared inscription-form contract.
//
// Was a symlink to types/inscription-form.ts, which is why the two copies
// looked byte-identical: they were the same inode. Now a real file that
// re-exports the contract, so `~/types/inscription-form` importers are
// unaffected while the contract itself lives in shared/ and is reachable
// from server/ too.

export * from '../../shared/inscription-form'

import type { ContestStatus, FormField } from '../../shared/inscription-form'

export interface FormBuilderDragItem {
  type: 'FIELD'
  field: FormField
  index: number
}

export interface FormBuilderState {
  fields: FormField[]
  selectedFieldId: string | null
  isDirty: boolean
  isPreviewMode: boolean
  activeLanguage: string
}

export interface InscriptionStatusConfig {
  status: ContestStatus
  registrationOpen: boolean
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline'
  badgeIcon: string
  showForm: boolean
  message: { title: string, description: string }
  allowPreview: boolean
}

export const INSCRIPTION_STATUS_CONFIG: Record<ContestStatus, InscriptionStatusConfig> = {
  draft: {
    status: 'draft',
    registrationOpen: true,
    badgeVariant: 'default',
    badgeIcon: 'CheckCircle2',
    showForm: true,
    message: {
      title: 'Inscripciones abiertas',
      description: 'Completa el formulario para participar en este concurso.',
    },
    allowPreview: true,
  },
  active: {
    status: 'active',
    registrationOpen: false,
    badgeVariant: 'secondary',
    badgeIcon: 'Trophy',
    showForm: false,
    message: {
      title: 'Concurso en progreso',
      description: 'Las inscripciones han cerrado. El concurso está actualmente en progreso.',
    },
    allowPreview: true,
  },
  finished: {
    status: 'finished',
    registrationOpen: false,
    badgeVariant: 'outline',
    badgeIcon: 'Award',
    showForm: false,
    message: {
      title: 'Concurso finalizado',
      description: 'Este concurso ha terminado. Consulta los resultados.',
    },
    allowPreview: true,
  },
  cancelled: {
    status: 'cancelled',
    registrationOpen: false,
    badgeVariant: 'destructive',
    badgeIcon: 'CircleX',
    showForm: false,
    message: {
      title: 'Concurso cancelado',
      description: 'Este concurso ha sido cancelado por el organizador.',
    },
    allowPreview: true,
  },
}
