// shared/voting.ts
// How the jury scores a contest (KAN-23): with a mark, or just pass / no pass.
//
// The choice is made when the contest is created and decides which interface
// the jury sees (KAN-24). Stored on `contests.voting_system`; a round of a
// binary contest is created with `scoring_type = 'vote'`, the value that has
// been in the enum since 0001.

export const VOTING_SYSTEMS = [
  {
    id: 'numeric',
    label: 'Numérico',
    description: 'El jurado pone una nota a cada actuación.',
  },
  {
    id: 'binary',
    label: 'Binario',
    description: 'El jurado solo dice si pasa o no pasa, sin puntos intermedios.',
  },
] as const

export type VotingSystem = (typeof VOTING_SYSTEMS)[number]['id']

export const VOTING_SYSTEM_IDS = VOTING_SYSTEMS.map(v => v.id) as readonly VotingSystem[]

/** Anything unknown — an old row, a hand-made request — reads as numeric. */
export function resolveVotingSystem(value: unknown): VotingSystem {
  return (VOTING_SYSTEM_IDS as readonly unknown[]).includes(value) ? (value as VotingSystem) : 'numeric'
}

export function votingSystemLabel(value: unknown): string {
  const id = resolveVotingSystem(value)
  return VOTING_SYSTEMS.find(v => v.id === id)!.label
}

/** What a new round of such a contest scores with. */
export function scoringTypeFor(value: unknown): 'numeric' | 'vote' {
  return resolveVotingSystem(value) === 'binary' ? 'vote' : 'numeric'
}

// ─── Binary voting (KAN-24) ──────────────────────────────────────────────────
//
// A binary round stores its votes in `scores.value` like any other round: 1 is
// "pasa", 0 is "no pasa". No new column, so everything that already reads
// scores — the averages, the ranking, the realtime channel, the audit log —
// keeps working, and a round's meaning is read from its `scoring_type`.

export const BINARY_PASS = 1
export const BINARY_FAIL = 0

/** The round's own `scoring_type` decides the interface, not the contest: a
 *  contest switched to binary keeps the rounds it already had. */
export function isBinaryScoring(scoringType: unknown): boolean {
  return scoringType === 'vote'
}

/** What a stored value means on screen. Anything but 1 is "no pasa". */
export function binaryVoteLabel(value: unknown): 'Pasa' | 'No pasa' {
  return Number(value) === BINARY_PASS ? 'Pasa' : 'No pasa'
}

export function isBinaryVoteValue(value: unknown): boolean {
  return value === BINARY_PASS || value === BINARY_FAIL
}

export interface ScoreSubmission {
  scoringType: unknown
  /** `rounds.status`: pending | active | closed. */
  roundStatus: unknown
  value: number
  /** An organiser writing on a judge's behalf, already authorised upstream. */
  isAdminAction: boolean
}

export type ScoreSubmissionCheck =
  | { ok: true }
  | { ok: false; status: number; code: string }

/**
 * The rules a vote and a mark share (KAN-24): a judge only scores a round that
 * is open, and a binary round only accepts the two values it offers.
 *
 * Organisers are exempt from the round's state — correcting a score after the
 * round closed is the whole point of the admin override — but not from the
 * value rule: a 0.5 in a binary round would mean nothing to anyone reading it.
 */
export function checkScoreSubmission(input: ScoreSubmission): ScoreSubmissionCheck {
  if (!input.isAdminAction) {
    if (input.roundStatus === 'closed') return { ok: false, status: 409, code: 'round_closed' }
    if (input.roundStatus !== 'active') return { ok: false, status: 409, code: 'round_not_active' }
  }

  if (isBinaryScoring(input.scoringType)) {
    return isBinaryVoteValue(input.value)
      ? { ok: true }
      : { ok: false, status: 400, code: 'invalid_binary_vote' }
  }

  return Number.isFinite(input.value)
    ? { ok: true }
    : { ok: false, status: 400, code: 'invalid_score' }
}
