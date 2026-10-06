// Builds the `rounds` row a POST /api/categories/:id/rounds inserts.
//
// Only a few fields come from the client. The ranking pseudo-round is the
// exception that sets more: it is born closed and unpublished, whatever the
// client sends — it only shows the results, nobody scores in it, and it is
// published on its own step.
const ALLOWED = ['name', 'order', 'scoring_type', 'is_final'] as const

export function buildRoundInsert(
  categoryId: string,
  body: Record<string, any>,
  now: Date = new Date(),
): Record<string, any> {
  const row: Record<string, any> = { category_id: categoryId }
  for (const key of ALLOWED) {
    if (key in body) row[key] = body[key]
  }
  if (body.is_ranking === true) {
    row.is_ranking = true
    row.status = 'closed'
    row.closed_at = now.toISOString()
    row.is_published = false
  }
  return row
}
