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
