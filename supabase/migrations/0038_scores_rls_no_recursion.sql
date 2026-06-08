-- 0034_scores_rls_no_recursion.sql
-- Original "Scores viewable by judge or organizer" policy referenced the
-- scores table from inside its own subquery → infinite recursion when the
-- judge_id branch did not match (org owners). Rewrite as EXISTS join over
-- rounds/categories, no self-reference.
DROP POLICY IF EXISTS "Scores viewable by judge or organizer" ON public.scores;

CREATE POLICY "Scores viewable by judge or organizer"
  ON public.scores
  FOR SELECT
  USING (
    judge_id = auth.uid()
    OR EXISTS (
      SELECT 1
        FROM public.rounds r
        JOIN public.categories c ON c.id = r.category_id
       WHERE r.id = scores.round_id
         AND public.is_contest_organizer(c.contest_id)
    )
  );
