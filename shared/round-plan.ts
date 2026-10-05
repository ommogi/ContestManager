// shared/round-plan.ts
// The rounds a category is born with (KAN-26).
//
// An organisation that already knows its contest has a heat, a semifinal and a
// final says so when it creates the category, and the rounds are created there
// and then — in draft, named, and renameable. Saying "I don't know yet" keeps
// the old behaviour: no rounds, added one at a time.

/** More than this is not a competition, it is a typo. */
export const MAX_PLANNED_ROUNDS = 10

/**
 * Names counted back from the end, the way a competition is talked about: the
 * last round is the Final, the one before it the Semifinal, and whatever comes
 * earlier is a heat — numbered only when there is more than one, so three
 * rounds read "Eliminatoria · Semifinal · Final" and not "Eliminatoria 1".
 *
 * A count outside 1..MAX_PLANNED_ROUNDS returns nothing: an impossible number
 * must not invent rounds.
 */
export function plannedRoundNames(count: unknown): string[] {
  if (typeof count !== 'number' || !Number.isInteger(count)) return []
  if (count < 1 || count > MAX_PLANNED_ROUNDS) return []

  const names: string[] = []
  const heats = Math.max(0, count - 2)
  for (let i = 1; i <= heats; i++) {
    names.push(heats === 1 ? 'Eliminatoria' : `Eliminatoria ${i}`)
  }
  if (count >= 2) names.push('Semifinal')
  names.push('Final')
  return names
}
