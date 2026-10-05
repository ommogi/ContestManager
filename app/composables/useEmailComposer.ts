// app/composables/useEmailComposer.ts
// Opens the email composer from anywhere — the contest page button or an
// assistant proposal — with an optional pre-filled draft (feat/ai).

export type ComposerAudience =
  | { type: 'all_participants' }
  | { type: 'category', categoryId: string }
  | { type: 'round', roundId: string }
  | { type: 'judges' }

export interface ComposerPrefill {
  audience?: ComposerAudience
  subject?: string
  body?: string
  /** An intent to hand to the AI drafter as soon as the dialog opens. */
  intent?: string
}

interface ComposerState {
  open: boolean
  contestId: string | null
  contestName: string | null
  prefill: ComposerPrefill | null
}

export function useEmailComposer() {
  const state = useState<ComposerState>('email-composer', () => ({
    open: false,
    contestId: null,
    contestName: null,
    prefill: null,
  }))

  function openComposer(contestId: string, opts: { contestName?: string | null, prefill?: ComposerPrefill } = {}) {
    state.value = { open: true, contestId, contestName: opts.contestName ?? null, prefill: opts.prefill ?? null }
  }

  function closeComposer() {
    state.value = { ...state.value, open: false }
  }

  return { state, openComposer, closeComposer }
}
