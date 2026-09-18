-- 0064_rls_initplan.sql
-- Evitar que 29 políticas RLS reevalúen `auth.uid()` una vez por fila.
--
-- ── Qué pasa hoy ────────────────────────────────────────────────────────────
-- `auth.uid()` sin envolver es, para el planificador, una función que depende
-- de la fila: la llama una vez por cada fila EXAMINADA (no por cada fila
-- devuelta). Envuelta en `(select auth.uid())` se convierte en un InitPlan que
-- se calcula UNA vez por consulta y se compara contra una constante.
--
-- Mismo valor, mismo resultado, distinto plan. `auth.uid()` es STABLE y lee el
-- JWT de la sesión, así que no puede cambiar dentro de una misma consulta: la
-- envoltura no altera la semántica de autorización, solo el número de llamadas.
--
-- Con 28 participantes no se nota. Con 10.000 es la diferencia entre una
-- llamada por fila y una en total, y el coste de hacerlo ahora o dentro de un
-- año es el mismo.
--
-- ── Por qué ALTER y no DROP + CREATE ────────────────────────────────────────
-- Misma decisión que en 0061: `ALTER POLICY … USING (…)` modifica en sitio, sin
-- ningún instante en el que la política no exista. Un DROP+CREATE abre una
-- ventana —por breve que sea— en la que la tabla queda sin esa protección, y
-- aquí se tocan 29 a la vez.
--
-- ── De dónde salen estas sentencias ─────────────────────────────────────────
-- No están escritas a mano: se generaron desde `pg_policies` (lección de 0032,
-- que en 0063 ya evitó dos errores), aplicando UNA sustitución sobre el texto
-- decompilado: `auth.uid()` → `( SELECT auth.uid() AS uid)`. Nada más. Por eso
-- los predicados conservan el formato que produce `pg_get_expr`, incluidos sus
-- paréntesis redundantes y sus saltos de línea: el parecido literal con lo
-- desplegado es lo que permite comprobar que no cambió nada más.
--
-- Ninguna política usa `auth.jwt()` ni `auth.role()`; solo `auth.uid()`.
--
-- ── Alcance ─────────────────────────────────────────────────────────────────
-- El linter de Supabase reporta 24 (las de `public`). Se incluyen además las 5
-- de `storage.objects` —avatars y org_logos— que el linter no cuenta y que
-- tienen exactamente el mismo problema. Quedan fuera las dos que ya venían
-- envueltas de 0054: `inscription_uploads: owner reads own` y
-- `inscription-uploads: participant reads own`.
--
-- Una política `ALL` o `UPDATE` cuyo `with_check` es nulo hereda el `USING`;
-- por eso a esas solo se les pasa `USING`, y siguen heredando el nuevo.

-- ── public ──────────────────────────────────────────────────────────────────

ALTER POLICY org_owner_read_ledger ON public.billing_transactions
  USING ((organization_id IN ( SELECT organizations.id
   FROM organizations
  WHERE (organizations.owner_id = ( SELECT auth.uid() AS uid)))));

ALTER POLICY "Allow delete for owners" ON public.judge_pool
  USING ((EXISTS ( SELECT 1
   FROM organizations
  WHERE ((organizations.id = judge_pool.organization_id) AND (organizations.owner_id = ( SELECT auth.uid() AS uid))))));

ALTER POLICY "Allow insert for owners" ON public.judge_pool
  WITH CHECK ((EXISTS ( SELECT 1
   FROM organizations
  WHERE ((organizations.id = judge_pool.organization_id) AND (organizations.owner_id = ( SELECT auth.uid() AS uid))))));

ALTER POLICY "Allow select for owners and members" ON public.judge_pool
  USING ((EXISTS ( SELECT 1
   FROM organizations
  WHERE ((organizations.id = judge_pool.organization_id) AND (organizations.owner_id = ( SELECT auth.uid() AS uid))))));

ALTER POLICY "Allow update for owners" ON public.judge_pool
  USING ((EXISTS ( SELECT 1
   FROM organizations
  WHERE ((organizations.id = judge_pool.organization_id) AND (organizations.owner_id = ( SELECT auth.uid() AS uid))))));

ALTER POLICY judge_pool_invitations_select_own ON public.judge_pool_invitations
  USING ((organization_id IN ( SELECT organizations.id
   FROM organizations
  WHERE (organizations.owner_id = ( SELECT auth.uid() AS uid)))));

ALTER POLICY "Judge memberships are editable by organization owner" ON public.judge_pool_members
  USING ((organization_id IN ( SELECT organizations.id
   FROM organizations
  WHERE (organizations.owner_id = ( SELECT auth.uid() AS uid)))));

ALTER POLICY "Judge memberships viewable by owner and members" ON public.judge_pool_members
  USING (((organization_id IN ( SELECT organizations.id
   FROM organizations
  WHERE (organizations.owner_id = ( SELECT auth.uid() AS uid)))) OR (organization_id IN ( SELECT contests.organization_id
   FROM contests
  WHERE is_contest_member(contests.id)))));

ALTER POLICY "Judges are editable by organization owner" ON public.judges
  USING ((id IN ( SELECT jpm.judge_id
   FROM (judge_pool_members jpm
     JOIN organizations o ON ((o.id = jpm.organization_id)))
  WHERE (o.owner_id = ( SELECT auth.uid() AS uid)))));

ALTER POLICY "Judges are viewable by organization members" ON public.judges
  USING ((id IN ( SELECT jpm.judge_id
   FROM (judge_pool_members jpm
     JOIN organizations o ON ((o.id = jpm.organization_id)))
  WHERE ((o.owner_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
           FROM contests c
          WHERE ((c.organization_id = o.id) AND is_contest_member(c.id))))))));

ALTER POLICY "Users can update own notifications" ON public.notifications
  USING ((( SELECT auth.uid() AS uid) = user_id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));

ALTER POLICY "Users can view own notifications" ON public.notifications
  USING ((( SELECT auth.uid() AS uid) = user_id));

ALTER POLICY "Organizations are editable by owner" ON public.organizations
  USING ((owner_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_id = ( SELECT auth.uid() AS uid)));

ALTER POLICY "Organizations are viewable by owner and contest members" ON public.organizations
  USING (((owner_id = ( SELECT auth.uid() AS uid)) OR (id IN ( SELECT contests.organization_id
   FROM contests
  WHERE is_contest_member(contests.id)))));

ALTER POLICY "Users can read own form responses" ON public.participant_form_responses
  USING ((EXISTS ( SELECT 1
   FROM participants p
  WHERE ((p.id = participant_form_responses.participant_id) AND (p.user_id = ( SELECT auth.uid() AS uid))))));

ALTER POLICY "Participants viewable by members or themselves" ON public.participants
  USING ((is_contest_member(contest_id) OR (user_id = ( SELECT auth.uid() AS uid))));

ALTER POLICY "profiles: insert own" ON public.profiles
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

ALTER POLICY "profiles: select own" ON public.profiles
  USING ((( SELECT auth.uid() AS uid) = id));

ALTER POLICY "profiles: update own" ON public.profiles
  USING ((( SELECT auth.uid() AS uid) = id));

ALTER POLICY "Audit logs viewable by organizer" ON public.score_audit_logs
  USING ((round_id IN ( SELECT r.id
   FROM (rounds r
     JOIN categories c ON ((c.id = r.category_id)))
  WHERE (EXISTS ( SELECT 1
           FROM contest_members cm
          WHERE ((cm.contest_id = c.contest_id) AND (cm.user_id = ( SELECT auth.uid() AS uid)) AND (cm.role = 'organizer'::contest_role)))))));

ALTER POLICY "Scores deletable by judge" ON public.scores
  USING ((judge_id = ( SELECT auth.uid() AS uid)));

ALTER POLICY "Scores insertable by judge" ON public.scores
  WITH CHECK ((judge_id = ( SELECT auth.uid() AS uid)));

ALTER POLICY "Scores updatable by judge" ON public.scores
  USING ((judge_id = ( SELECT auth.uid() AS uid)))
  WITH CHECK ((judge_id = ( SELECT auth.uid() AS uid)));

ALTER POLICY "Scores viewable by judge or organizer" ON public.scores
  USING (((judge_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM (rounds r
     JOIN categories c ON ((c.id = r.category_id)))
  WHERE ((r.id = scores.round_id) AND is_contest_organizer(c.contest_id))))));

-- ── storage.objects ─────────────────────────────────────────────────────────
-- Las de 0059 (org_logos) y las de avatars, que el linter no mira.

ALTER POLICY "Users delete own avatar" ON storage.objects
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

ALTER POLICY "Users update own avatar" ON storage.objects
  USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

ALTER POLICY "Users upload own avatar" ON storage.objects
  WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

ALTER POLICY "org_logos: authenticated upload" ON storage.objects
  WITH CHECK (((bucket_id = 'org_logos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));

ALTER POLICY "org_logos: uploader update/delete" ON storage.objects
  USING (((bucket_id = 'org_logos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))
  WITH CHECK (((bucket_id = 'org_logos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
