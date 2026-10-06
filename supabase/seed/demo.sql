-- ============================================================================
--  Dades de demo — Concurs Internacional de Composició Coral (Conservatorio Demo)
-- ============================================================================
--  GENERAT per supabase/seed/generate_demo.py. No l'editis a mà.
--
--  NO és una migració: es llança a mà per deixar la demo en un estat conegut.
--  1. ESBORRA tots els concursos de l'organització "Conservatorio Demo"
--     (irreversible; còpia a supabase/seed/backup-conservatorio-demo-*.json)
--     i el seu catàleg d'obres. No toca cap altra organització.
--  2. Sembra 3 concursos: el principal en plena celebració, l'edició 2025
--     finalitzada amb rànquing publicat i el premi 2027 en esborrany.
--  3. Esborra les notificacions dins l'app de les comptes demo, perquè la
--     demo comenci neta.
--  Idempotent: UUID fixos.
-- ============================================================================

begin;

do $$
declare faltan text;
begin
  select string_agg(e, ', ') into faltan from (values
    ('org@contestsaas.demo'), ('participante@contestsaas.demo'), ('jurado@contestsaas.demo'),
    ('juez1@contestsaas.demo'), ('juez2@contestsaas.demo'), ('juez3@contestsaas.demo'), ('juez4@contestsaas.demo')
  ) v(e) where not exists (select 1 from auth.users u where u.email = v.e);
  if faltan is not null then raise exception 'Falten comptes demo: %', faltan; end if;
  if not exists (select 1 from organizations where id = 'bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'No existeix l''organització demo';
  end if;
end $$;

-- 1. Neteja
delete from contests where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from works where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';
delete from composers where organization_id = 'bbbbbbbb-0000-0000-0000-000000000001';

-- 2. Organització i perfils
update organizations set name = 'Fundació Coral Demo', locale = 'ca', notification_email = null
where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update profiles set full_name = 'Fundació Coral Demo' where id = 'aaaaaaaa-0000-0000-0000-000000000001';
update profiles set full_name = 'Laia Serra' where id = 'aaaaaaaa-0000-0000-0000-000000000002';
update profiles set full_name = 'Jordi Casals' where id = 'aaaaaaaa-0000-0000-0000-000000000003';
update profiles set full_name = 'Montserrat Vila' where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update profiles set full_name = 'Albert Soler' where id = 'bbbbbbbb-0000-0000-0000-000000000002';
update profiles set full_name = 'Núria Ferrer' where id = 'bbbbbbbb-0000-0000-0000-000000000003';
update profiles set full_name = 'Pau Rovira' where id = 'bbbbbbbb-0000-0000-0000-000000000004';

-- 3. Concursos
insert into contests (id, organization_id, name, slug, description, rules, type, status, is_rounds_dynamic, starts_at, ends_at, registration_open, registration_token, entry_fee_cents, performance_default_minutes, rehearsal_default_minutes, call_offset_minutes, voting_system, created_at) values
  ('b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'bbbbbbbb-0000-0000-0000-000000000001', 'Concurs Internacional de Composició Coral 2026', 'composicio-coral-2026', 'Concurs internacional per a obres corals inèdites en tres categories. La final és un concert públic on el cor de l''organització estrena les obres finalistes.', '## Bases del concurs

**1. Objecte.** El concurs vol estimular la creació de repertori coral nou. S''hi poden presentar obres inèdites, no estrenades ni premiades.

**2. Categories.** A · Cor mixt (SATB). B · Veus iguals. C · Cor infantil i juvenil.

**3. Inscripció.** Fins al 31 de juliol de 2026, amb el formulari en línia. Cal adjuntar la partitura en PDF (amb pseudònim, sense el nom de l''autor) i, opcionalment, un àudio de referència. Quota: 40 €.

**4. Fases.**
- *Selecció de partitures:* el jurat llegeix les obres i decideix quines passen (passa / no passa).
- *Semifinal:* lectura de les obres seleccionades amb el cor de l''organització, amb puntuació de 0 a 10.
- *Final:* concert públic al Palau, amb puntuació de 0 a 10.

**5. Premis.** 1.500 € per categoria i estrena a la temporada següent.

**6. Jurat.** Format per compositors i directors de cor de reconegut prestigi. Les seves decisions són inapel·lables.', 'music', 'active', false, '2026-09-15T09:00:00+02', '2026-11-14T21:00:00+01', false, '440b06362a5e591288e960561de7a9a4', 4000, 8, 20, 60, 'numeric', '2026-05-04T10:00:00+02'),
  ('621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'bbbbbbbb-0000-0000-0000-000000000001', 'Concurs de Composició Coral 2025', 'composicio-coral-2025', 'Edició anterior. Rànquing publicat.', '## Bases del concurs

**1. Objecte.** El concurs vol estimular la creació de repertori coral nou. S''hi poden presentar obres inèdites, no estrenades ni premiades.

**2. Categories.** A · Cor mixt (SATB). B · Veus iguals. C · Cor infantil i juvenil.

**3. Inscripció.** Fins al 31 de juliol de 2026, amb el formulari en línia. Cal adjuntar la partitura en PDF (amb pseudònim, sense el nom de l''autor) i, opcionalment, un àudio de referència. Quota: 40 €.

**4. Fases.**
- *Selecció de partitures:* el jurat llegeix les obres i decideix quines passen (passa / no passa).
- *Semifinal:* lectura de les obres seleccionades amb el cor de l''organització, amb puntuació de 0 a 10.
- *Final:* concert públic al Palau, amb puntuació de 0 a 10.

**5. Premis.** 1.500 € per categoria i estrena a la temporada següent.

**6. Jurat.** Format per compositors i directors de cor de reconegut prestigi. Les seves decisions són inapel·lables.', 'music', 'finished', false, '2025-10-01T09:00:00+02', '2025-11-15T21:00:00+01', false, '0cf1ee1b30425c43bbbe25a991c1103b', 3500, 8, 20, 60, 'numeric', '2025-04-10T10:00:00+02'),
  ('1885d4ea-0070-5f41-b360-0f1825c9e1d8', 'bbbbbbbb-0000-0000-0000-000000000001', 'Premi de Composició per a Cor Infantil 2027', 'premi-cor-infantil-2027', 'Nova convocatòria en preparació.', null, 'music', 'draft', false, '2027-03-01T09:00:00+01', '2027-05-30T21:00:00+02', false, 'ffe08141709d559ab8e3c9b02a5cb229', 2500, 6, 15, 45, 'binary', '2026-10-01T10:00:00+02');

-- 4. Jurat
insert into contest_members (id, contest_id, user_id, role, email, full_name) values
  ('1d783ad0-f5bf-5691-a17e-a86ef8bf9e83', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'aaaaaaaa-0000-0000-0000-000000000003', 'judge', 'jurado@contestsaas.demo', 'Jordi Casals'),
  ('bccc84b8-c3f3-5d08-80e1-0b73b513613a', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'bbbbbbbb-0000-0000-0000-000000000001', 'judge', 'juez1@contestsaas.demo', 'Montserrat Vila'),
  ('56aeff2b-6a5d-5e08-b028-ab1c9e1e2b00', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'bbbbbbbb-0000-0000-0000-000000000002', 'judge', 'juez2@contestsaas.demo', 'Albert Soler'),
  ('363309e9-8672-52c3-9872-b2fe157feeff', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'bbbbbbbb-0000-0000-0000-000000000003', 'judge', 'juez3@contestsaas.demo', 'Núria Ferrer'),
  ('e657182e-3ed5-53a6-8ad9-029998d97e1e', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'bbbbbbbb-0000-0000-0000-000000000004', 'judge', 'juez4@contestsaas.demo', 'Pau Rovira'),
  ('4fccbabb-3ad9-55fb-a783-e1e09d605d75', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'aaaaaaaa-0000-0000-0000-000000000003', 'judge', 'jurado@contestsaas.demo', 'Jordi Casals'),
  ('c5bb012f-1cb2-5382-b443-a61cbe787a95', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'bbbbbbbb-0000-0000-0000-000000000001', 'judge', 'juez1@contestsaas.demo', 'Montserrat Vila'),
  ('cd321bdf-ea4c-5c28-9dd3-cb64ee769607', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'bbbbbbbb-0000-0000-0000-000000000002', 'judge', 'juez2@contestsaas.demo', 'Albert Soler'),
  ('2b56c61d-3924-5727-a4c3-1b589a7fea71', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'bbbbbbbb-0000-0000-0000-000000000003', 'judge', 'juez3@contestsaas.demo', 'Núria Ferrer'),
  ('fd4eaa38-d7d4-5509-acb2-89972f107aa4', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'bbbbbbbb-0000-0000-0000-000000000004', 'judge', 'juez4@contestsaas.demo', 'Pau Rovira');

update contest_members set invitation_status = 'accepted', responded_at = '2026-09-01T12:00:00+02',
  invitation_token = null, invitation_expires_at = null
where contest_id in ('b037805b-4f1a-5ed1-8c87-4e0b370bb834', '621342f6-a6fb-566d-aea4-1e4ea565d4b7');

-- 5. Formulari d'inscripció
insert into inscription_form_schemas (id, contest_id, version, is_published, schema_json, published_at, created_at) values
  ('10ce5753-ce17-5a7c-95c5-210ba2bc60df', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 1, true, '[{"id": "core.first_name", "type": "text", "label": "Nom", "order": 0, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.last_name", "type": "text", "label": "Cognoms", "order": 1, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.birthdate", "type": "date", "label": "Data de naixement", "order": 2, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.dni", "type": "text", "label": "DNI / NIE / Passaport", "order": 3, "hidden": false, "isCore": true, "required": true, "validation": {"required": true, "customRule": "dni"}}, {"id": "core.country", "type": "text", "label": "País", "order": 4, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.phone", "type": "phone", "label": "Telèfon", "order": 5, "hidden": false, "isCore": true, "required": false, "validation": {"required": false}}, {"id": "core.email", "type": "email", "label": "Correu electrònic", "order": 6, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}, "description": "Hi enviarem la confirmació de la inscripció."}, {"id": "obra_titol", "type": "text", "label": "Títol de l''obra", "order": 7, "hidden": false, "required": true, "validation": {"required": true}}, {"id": "obra_pseudonim", "type": "text", "label": "Pseudònim", "order": 8, "hidden": false, "required": true, "validation": {"required": true}, "description": "La partitura s''avalua amb pseudònim: el jurat no veu el teu nom."}, {"id": "obra_text", "type": "text", "label": "Autor del text", "order": 9, "hidden": false, "required": true, "validation": {"required": true}, "placeholder": "Ex.: Joan Maragall, text litúrgic…"}, {"id": "obra_durada", "type": "number", "label": "Durada aproximada (minuts)", "order": 10, "hidden": false, "required": true, "validation": {"required": true, "minValue": 2, "maxValue": 12}}, {"id": "obra_acompanyament", "type": "radio", "label": "Acompanyament", "order": 11, "hidden": false, "required": true, "validation": {"required": true}, "options": [{"value": "a_cappella", "label": "A cappella"}, {"value": "piano", "label": "Amb piano"}, {"value": "altres", "label": "Altres instruments"}]}, {"id": "obra_partitura", "type": "file", "label": "Partitura (PDF, amb pseudònim)", "order": 12, "hidden": false, "required": true, "accept": ".pdf", "maxFiles": 1, "maxSizeMB": 20, "validation": {"required": true}}, {"id": "obra_audio", "type": "file", "label": "Àudio de referència (opcional)", "order": 13, "hidden": false, "required": false, "accept": "audio/*", "maxFiles": 1, "maxSizeMB": 20, "validation": {"required": false}}, {"id": "obra_inedita", "type": "checkbox", "label": "Obra inèdita", "order": 14, "hidden": false, "required": true, "validation": {"required": true}, "description": "Declaro que l''obra és inèdita i que no ha estat estrenada ni premiada."}, {"id": "accepto_bases", "type": "checkbox", "label": "Accepto les bases", "order": 15, "hidden": false, "required": true, "validation": {"required": true}}]'::jsonb, '2026-05-10T10:00:00+02', '2026-05-10T09:30:00+02'),
  ('45354329-2d32-57b3-a0de-6cb16924f0d1', '1885d4ea-0070-5f41-b360-0f1825c9e1d8', 1, false, '[{"id": "core.first_name", "type": "text", "label": "Nom", "order": 0, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.last_name", "type": "text", "label": "Cognoms", "order": 1, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.birthdate", "type": "date", "label": "Data de naixement", "order": 2, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.dni", "type": "text", "label": "DNI / NIE / Passaport", "order": 3, "hidden": false, "isCore": true, "required": true, "validation": {"required": true, "customRule": "dni"}}, {"id": "core.country", "type": "text", "label": "País", "order": 4, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}}, {"id": "core.phone", "type": "phone", "label": "Telèfon", "order": 5, "hidden": false, "isCore": true, "required": false, "validation": {"required": false}}, {"id": "core.email", "type": "email", "label": "Correu electrònic", "order": 6, "hidden": false, "isCore": true, "required": true, "validation": {"required": true}, "description": "Hi enviarem la confirmació de la inscripció."}, {"id": "obra_titol", "type": "text", "label": "Títol de l''obra", "order": 7, "hidden": false, "required": true, "validation": {"required": true}}, {"id": "obra_pseudonim", "type": "text", "label": "Pseudònim", "order": 8, "hidden": false, "required": true, "validation": {"required": true}, "description": "La partitura s''avalua amb pseudònim: el jurat no veu el teu nom."}, {"id": "obra_text", "type": "text", "label": "Autor del text", "order": 9, "hidden": false, "required": true, "validation": {"required": true}, "placeholder": "Ex.: Joan Maragall, text litúrgic…"}, {"id": "obra_durada", "type": "number", "label": "Durada aproximada (minuts)", "order": 10, "hidden": false, "required": true, "validation": {"required": true, "minValue": 2, "maxValue": 12}}]'::jsonb, null, '2026-10-01T10:30:00+02');

-- 6. Categories i rondes
insert into categories (id, contest_id, name, description, "order", status, max_participants) values
  ('1817a384-f0cf-5b96-9340-3f252d14318d', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'Cor mixt (SATB)', 'Obres per a cor mixt a quatre veus o més, a cappella o amb piano.', 1, 'active', 40),
  ('14072721-71c1-51a3-9a5e-28775e2f5a15', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'Veus iguals', 'Obres per a cor de veus blanques o de veus greus.', 2, 'active', 40),
  ('97297647-7bb5-56d2-a045-09a46ad085a1', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', 'Cor infantil i juvenil', 'Obres pensades per a cors d''infants i joves, de dificultat mitjana.', 3, 'active', 40),
  ('ed81482e-b624-56ff-823a-0348e83982fa', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'Categoria única', 'Obres per a cor mixt.', 1, 'closed', 40),
  ('fa8ce8be-46ad-59a4-a236-9d020850a976', '1885d4ea-0070-5f41-b360-0f1825c9e1d8', 'Cor infantil', 'Obres per a cor d''infants (6-12 anys).', 1, 'pending', 40);

insert into rounds (id, category_id, name, "order", status, scoring_type, max_score, is_final, is_ranking, is_published, next_round_id, started_at, closed_at, session_date, session_start, session_end) values
  ('c2dde48f-df4e-5c85-86d0-39e97145e66f', '1817a384-f0cf-5b96-9340-3f252d14318d', 'Final · Concert', 3, 'pending', 'numeric', 10, true, false, false, null, null, null, '2026-11-14', '18:00', '21:00'),
  ('b0e267e3-74ee-5988-94b3-fd0b21c70693', '14072721-71c1-51a3-9a5e-28775e2f5a15', 'Final · Concert', 3, 'pending', 'numeric', 10, true, false, false, null, null, null, '2026-11-14', '18:00', '21:00'),
  ('0ee4f2b3-d2f1-5ebb-9ba4-5e08b1a21a19', '97297647-7bb5-56d2-a045-09a46ad085a1', 'Final · Concert', 3, 'pending', 'numeric', 10, true, false, false, null, null, null, '2026-11-14', '18:00', '21:00'),
  ('293b8705-11b9-501c-9e2a-27ae53599a56', 'ed81482e-b624-56ff-823a-0348e83982fa', 'Final · Concert', 1, 'closed', 'numeric', 10, true, false, true, null, '2025-11-15T18:00:00+01', '2025-11-15T21:30:00+01', '2025-11-15', '18:00', '21:00'),
  ('044a22d5-bd8d-516b-8122-253613f0cfdc', 'fa8ce8be-46ad-59a4-a236-9d020850a976', 'Final', 2, 'pending', 'numeric', 10, true, false, false, null, null, null, null, null, null),
  ('8c2f9768-934c-5b19-be6d-987ac63117fb', '1817a384-f0cf-5b96-9340-3f252d14318d', 'Selecció de partitures', 1, 'closed', 'vote', 1, false, false, false, '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '2026-09-20T10:00:00+02', '2026-10-05T19:00:00+02', null, null, null),
  ('8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '1817a384-f0cf-5b96-9340-3f252d14318d', 'Semifinal · Lectura amb cor', 2, 'active', 'numeric', 10, false, false, false, 'c2dde48f-df4e-5c85-86d0-39e97145e66f', '2026-09-20T10:00:00+02', null, '2026-10-17', '10:00', '13:00'),
  ('24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '14072721-71c1-51a3-9a5e-28775e2f5a15', 'Selecció de partitures', 1, 'closed', 'vote', 1, false, false, false, '92f74c2b-1145-5163-bc2d-3f018912c421', '2026-09-20T10:00:00+02', '2026-10-05T19:00:00+02', null, null, null),
  ('92f74c2b-1145-5163-bc2d-3f018912c421', '14072721-71c1-51a3-9a5e-28775e2f5a15', 'Semifinal · Lectura amb cor', 2, 'pending', 'numeric', 10, false, false, false, 'b0e267e3-74ee-5988-94b3-fd0b21c70693', null, null, '2026-10-18', '10:00', '12:30'),
  ('4ccf3c25-6a44-5298-9a47-a3898481fc36', '97297647-7bb5-56d2-a045-09a46ad085a1', 'Selecció de partitures', 1, 'active', 'vote', 1, false, false, false, 'fcfd87bc-ed52-579e-881f-4fb2d94bea40', '2026-09-20T10:00:00+02', null, null, null, null),
  ('fcfd87bc-ed52-579e-881f-4fb2d94bea40', '97297647-7bb5-56d2-a045-09a46ad085a1', 'Semifinal · Lectura amb cor', 2, 'pending', 'numeric', 10, false, false, false, '0ee4f2b3-d2f1-5ebb-9ba4-5e08b1a21a19', null, null, '2026-10-24', '11:00', '13:00'),
  ('c3b9fc61-531d-5850-afdf-4434014be880', 'fa8ce8be-46ad-59a4-a236-9d020850a976', 'Selecció de partitures', 1, 'pending', 'vote', 1, false, false, false, '044a22d5-bd8d-516b-8122-253613f0cfdc', null, null, null, null, null);

-- 7. Participants, respostes del formulari
insert into participants (id, contest_id, category_id, user_id, name, first_name, last_name, dni, birthdate, country, email, phone, status, payment_status, amount_paid_cents, created_at) values
  ('3aa871a4-af74-5498-add9-7c50cb886336', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', 'aaaaaaaa-0000-0000-0000-000000000002', 'Laia Serra Puig', 'Laia', 'Serra Puig', '40007919V', '1977-09-24', 'ES', 'participante@contestsaas.demo', '+34 601234567', 'active', 'paid', 4000, '2026-05-13T23:00:00+02'),
  ('f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Marc Ribas Coll', 'Marc', 'Ribas Coll', '40015838R', '1980-06-17', 'ES', 'marc.ribas@example.com', '+34 602469134', 'active', 'paid', 4000, '2026-05-15T12:00:00+02'),
  ('39fe135a-054e-5549-b59e-5cacf415377d', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Clàudia Bosch Martí', 'Clàudia', 'Bosch Martí', '40023757P', '1983-03-11', 'ES', 'claudia.bosch@example.com', '+34 603703701', 'active', 'paid', 4000, '2026-05-17T01:00:00+02'),
  ('79130086-ec94-55f4-80bf-0c69ffd90263', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Oriol Pujol Sala', 'Oriol', 'Pujol Sala', '40031676S', '1985-12-02', 'ES', 'oriol.pujol@example.com', '+34 604938268', 'active', 'paid', 4000, '2026-05-18T14:00:00+02'),
  ('8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Élodie Marchand', 'Élodie', 'Marchand', null, '1988-08-25', 'FR', 'elodie.marchand@example.com', null, 'active', 'paid', 4000, '2026-05-20T03:00:00+02'),
  ('a816467b-97de-59a1-b897-8bfda89c3db6', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Giulia Bernardi', 'Giulia', 'Bernardi', null, '1991-05-19', 'IT', 'giulia.bernardi@example.com', null, 'active', 'paid', 4000, '2026-05-21T16:00:00+02'),
  ('881aa74e-d29e-5aef-9439-77aaa01e872f', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Arnau Vidal Roca', 'Arnau', 'Vidal Roca', '40055433J', '1994-02-09', 'ES', 'arnau.vidal@example.com', '+34 608641969', 'eliminated', 'paid', 4000, '2026-05-23T05:00:00+02'),
  ('4b78866b-f57e-53b4-ad67-456826f918f8', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Sofía Herrera Gil', 'Sofía', 'Herrera Gil', null, '1996-11-02', 'AR', 'sofia.herrera@example.com', null, 'eliminated', 'paid', 4000, '2026-05-24T18:00:00+02'),
  ('355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Joan Mas Ferrer', 'Joan', 'Mas Ferrer', '40071271G', '1999-07-27', 'ES', 'joan.mas@example.com', '+34 611111103', 'eliminated', 'paid', 4000, '2026-05-26T07:00:00+02'),
  ('6493bc90-6342-51ba-b8d0-c89aa6d0514a', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Lukas Weber', 'Lukas', 'Weber', null, '1977-08-28', 'DE', 'lukas.weber@example.com', null, 'eliminated', 'paid', 4000, '2026-05-27T20:00:00+02'),
  ('266e4610-81a9-5741-9fae-e8844dfda051', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '1817a384-f0cf-5b96-9340-3f252d14318d', null, 'Mireia Costa Blanch', 'Mireia', 'Costa Blanch', '40087109H', '1980-05-21', 'ES', 'mireia.costa@example.com', '+34 613580237', 'eliminated', 'paid', 4000, '2026-05-29T09:00:00+02'),
  ('5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Anna Font Camps', 'Anna', 'Font Camps', '40095028W', '1983-02-12', 'ES', 'anna.font@example.com', '+34 614814804', 'active', 'paid', 4000, '2026-05-30T22:00:00+02'),
  ('ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Pere Gras Valls', 'Pere', 'Gras Valls', '40102947D', '1985-11-05', 'ES', 'pere.gras@example.com', '+34 616049371', 'active', 'paid', 4000, '2026-06-01T11:00:00+02'),
  ('c1ffc7e6-b6df-5c49-9b03-d468644a36be', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Inés Navarro Ruiz', 'Inés', 'Navarro Ruiz', '40110866Q', '1988-07-29', 'ES', 'ines.navarro@example.com', '+34 617283938', 'active', 'paid', 4000, '2026-06-03T00:00:00+02'),
  ('5742db81-7542-595e-9a91-c5df18f0e798', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Tomàs Solé Prat', 'Tomàs', 'Solé Prat', '40118785T', '1991-04-22', 'ES', 'tomas.sole@example.com', '+34 618518505', 'active', 'paid', 4000, '2026-06-04T13:00:00+02'),
  ('53107462-ec5a-5b29-9d89-8f10fa7197f9', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Camille Lefèvre', 'Camille', 'Lefèvre', null, '1994-01-13', 'FR', 'camille.lefevre@example.com', null, 'active', 'paid', 4000, '2026-06-06T02:00:00+02'),
  ('fc3ba91d-a38d-5c9e-9b88-2287de914c1d', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Berta Riera Duran', 'Berta', 'Riera Duran', '40134623Z', '1996-10-06', 'ES', 'berta.riera@example.com', '+34 620987639', 'eliminated', 'paid', 4000, '2026-06-07T15:00:00+02'),
  ('bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Diego Salinas Mora', 'Diego', 'Salinas Mora', null, '1999-06-30', 'MX', 'diego.salinas@example.com', null, 'eliminated', 'paid', 4000, '2026-06-09T04:00:00+02'),
  ('c5da3ef1-3f62-538d-b9aa-6da2ec479370', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '14072721-71c1-51a3-9a5e-28775e2f5a15', null, 'Queralt Torrent Vives', 'Queralt', 'Torrent Vives', '40150461M', '1977-08-01', 'ES', 'queralt.torrent@example.com', '+34 623456773', 'eliminated', 'paid', 4000, '2026-06-10T17:00:00+02'),
  ('79170319-4d8f-5c11-b3ea-17ed195d3be4', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Martina Comas Rius', 'Martina', 'Comas Rius', '40158380N', '1980-04-24', 'ES', 'martina.comas@example.com', '+34 624691340', 'active', 'paid', 4000, '2026-06-12T06:00:00+02'),
  ('8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Xavier Planas Bou', 'Xavier', 'Planas Bou', '40166299L', '1983-01-16', 'ES', 'xavier.planas@example.com', '+34 625925907', 'active', 'paid', 4000, '2026-06-13T19:00:00+02'),
  ('c7aa4711-9a76-549c-aa43-335e1240801e', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Helena Rovira Soler', 'Helena', 'Rovira Soler', '40174218A', '1985-10-09', 'ES', 'helena.rovira@example.com', '+34 627160474', 'active', 'paid', 4000, '2026-06-15T08:00:00+02'),
  ('30874218-bc20-5b0d-801f-b9d607f00893', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Biel Ferrà Mir', 'Biel', 'Ferrà Mir', '40182137X', '1988-07-02', 'ES', 'biel.ferra@example.com', '+34 628395041', 'active', 'paid', 4000, '2026-06-16T21:00:00+02'),
  ('b34d7c74-a3d1-5df3-b4c7-226a340dedaf', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Lucía Ortega Paz', 'Lucía', 'Ortega Paz', '40190056V', '1991-03-26', 'ES', 'lucia.ortega@example.com', '+34 629629608', 'active', 'paid', 4000, '2026-06-18T10:00:00+02'),
  ('ec402e19-240e-52d9-81b6-73baddc56166', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Jana Escudé Bonet', 'Jana', 'Escudé Bonet', '40197975R', '1993-12-17', 'ES', 'jana.escude@example.com', '+34 630864175', 'active', 'paid', 4000, '2026-06-19T23:00:00+02'),
  ('e4df28cb-74f4-5c20-87df-42fe2815335d', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Nil Sabaté Grau', 'Nil', 'Sabaté Grau', '40205894P', '1996-09-09', 'ES', 'nil.sabate@example.com', '+34 632098742', 'active', 'pending', 0, '2026-06-21T12:00:00+02'),
  ('78a25dbe-3875-51f4-b6cb-8b7b35cbbe07', 'b037805b-4f1a-5ed1-8c87-4e0b370bb834', '97297647-7bb5-56d2-a045-09a46ad085a1', null, 'Paula Marín Soto', 'Paula', 'Marín Soto', '40213813S', '1999-06-03', 'ES', 'paula.marin@example.com', '+34 633333309', 'active', 'pending', 0, '2026-06-23T01:00:00+02'),
  ('02aa9e38-b267-505a-9dcb-71505ca1dfc2', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'ed81482e-b624-56ff-823a-0348e83982fa', null, 'Ferran Llobet Sans', 'Ferran', 'Llobet Sans', '40221732E', '1985-01-20', 'ES', 'composer2025.1@example.com', null, 'active', 'paid', 3500, '2025-06-01T10:00:00+02'),
  ('45de30b6-54dc-5c43-9bce-74d004028f35', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'ed81482e-b624-56ff-823a-0348e83982fa', null, 'Maria Codina Pou', 'Maria', 'Codina Pou', '40229651Y', '1987-04-11', 'ES', 'composer2025.2@example.com', null, 'active', 'paid', 3500, '2025-06-01T10:00:00+02'),
  ('e43d52ff-9002-5f0a-9819-9901ddb779ac', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'ed81482e-b624-56ff-823a-0348e83982fa', null, 'Àlex Garriga Fuster', 'Àlex', 'Garriga Fuster', '40237570J', '1989-06-30', 'ES', 'composer2025.3@example.com', null, 'active', 'paid', 3500, '2025-06-01T10:00:00+02'),
  ('b4c9a8f1-b0a4-576f-92d3-e265f396a97e', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'ed81482e-b624-56ff-823a-0348e83982fa', null, 'Neus Vallès Serra', 'Neus', 'Vallès Serra', '40245489C', '1991-09-19', 'ES', 'composer2025.4@example.com', null, 'active', 'paid', 3500, '2025-06-01T10:00:00+02'),
  ('98bc1521-c3fb-5f6a-aa4a-16ead86e9017', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'ed81482e-b624-56ff-823a-0348e83982fa', null, 'Hugo Martín Lara', 'Hugo', 'Martín Lara', '40253408G', '1993-12-08', 'ES', 'composer2025.5@example.com', null, 'active', 'paid', 3500, '2025-06-01T10:00:00+02'),
  ('03f1cc1b-bcfb-52b4-92d2-e8b524a0d3d4', '621342f6-a6fb-566d-aea4-1e4ea565d4b7', 'ed81482e-b624-56ff-823a-0348e83982fa', null, 'Emma Duran Coll', 'Emma', 'Duran Coll', '40261327B', '1996-02-27', 'ES', 'composer2025.6@example.com', null, 'active', 'paid', 3500, '2025-06-01T10:00:00+02');

insert into participant_form_responses (id, participant_id, form_schema_id, responses_json) values
  ('241d6a1c-72e8-50ba-8a32-5d3c3b1e3e1a', '3aa871a4-af74-5498-add9-7c50cb886336', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Cançó de bressol per a la nit llarga", "obra_pseudonim": "Tramuntana 1", "obra_text": "Salvador Espriu", "obra_durada": 5, "obra_acompanyament": "piano", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('6a9656b4-d3fc-5625-9565-a863a15a325f', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "El cant dels ocells (nova lectura)", "obra_pseudonim": "Garbí 2", "obra_text": "Maria-Mercè Marçal", "obra_durada": 6, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('9c50a02d-7c28-5a6a-9184-13b9c6160029', '39fe135a-054e-5549-b59e-5cacf415377d', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Mar endins", "obra_pseudonim": "Xaloc 3", "obra_text": "Miquel Martí i Pol", "obra_durada": 7, "obra_acompanyament": "altres", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('d979b831-4beb-5121-a59d-71c46cfa71f1', '79130086-ec94-55f4-80bf-0c69ffd90263', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Les veus de la pedra", "obra_pseudonim": "Llevant 4", "obra_text": "text litúrgic", "obra_durada": 8, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('1971f9b5-47af-568a-a4a8-2a237642e8ff', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Aube sur la Garonne", "obra_pseudonim": "Mestral 5", "obra_text": "Rosa Leveroni", "obra_durada": 5, "obra_acompanyament": "piano", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('728375f6-61c6-57ff-b68d-4250989d695c', 'a816467b-97de-59a1-b897-8bfda89c3db6', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Notturno di Montserrat", "obra_pseudonim": "Migjorn 6", "obra_text": "Vicent Andrés Estellés", "obra_durada": 6, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('74803cf4-4906-54bb-93e0-2a3116ceb391', '881aa74e-d29e-5aef-9439-77aaa01e872f', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Terra de ningú", "obra_pseudonim": "Ponent 7", "obra_text": "Gabriela Mistral", "obra_durada": 7, "obra_acompanyament": "altres", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('c690cf72-9868-5398-a0ba-ef431d4624eb', '4b78866b-f57e-53b4-ad67-456826f918f8', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Oración del viento", "obra_pseudonim": "Albada 8", "obra_text": "Josep Carner", "obra_durada": 8, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('b78f5ff2-4544-5a9d-85a0-6be732bdbf4c', '355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Cel de juny", "obra_pseudonim": "Tramuntana 9", "obra_text": "Montserrat Abelló", "obra_durada": 8, "obra_acompanyament": "piano", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('7239b427-0f1a-556a-b061-b16a8c0452e2', '6493bc90-6342-51ba-b8d0-c89aa6d0514a', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Stille Gärten", "obra_pseudonim": "Garbí 10", "obra_text": "Joan Maragall", "obra_durada": 5, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('7ae19832-f052-503e-840c-932831132530', '266e4610-81a9-5741-9fae-e8844dfda051', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Llum de gener", "obra_pseudonim": "Xaloc 11", "obra_text": "Salvador Espriu", "obra_durada": 6, "obra_acompanyament": "altres", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('900cb9e8-0c31-5a15-89ad-1b3d936cf12a', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Ave maris stella", "obra_pseudonim": "Llevant 12", "obra_text": "Maria-Mercè Marçal", "obra_durada": 7, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('1a097fb0-1345-51c9-b466-ad0db44d7d07', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Les hores blanques", "obra_pseudonim": "Mestral 13", "obra_text": "Miquel Martí i Pol", "obra_durada": 8, "obra_acompanyament": "piano", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('5daa97fc-dd34-55e4-89a1-1d362ce37a7f', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Agua de mayo", "obra_pseudonim": "Migjorn 14", "obra_text": "text litúrgic", "obra_durada": 5, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('8cdc594c-dc24-55f6-8b66-87d3e4f2c234', '5742db81-7542-595e-9a91-c5df18f0e798', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Pregària del vespre", "obra_pseudonim": "Ponent 15", "obra_text": "Rosa Leveroni", "obra_durada": 6, "obra_acompanyament": "altres", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('7c374ef3-3056-5ab7-8cc3-5ab62f8887d4', '53107462-ec5a-5b29-9d89-8f10fa7197f9', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Chant des marées", "obra_pseudonim": "Albada 16", "obra_text": "Vicent Andrés Estellés", "obra_durada": 7, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('9fd9b55e-15bf-5e1b-885e-4313abcf186c', 'fc3ba91d-a38d-5c9e-9b88-2287de914c1d', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Salve de l''Empordà", "obra_pseudonim": "Tramuntana 17", "obra_text": "Gabriela Mistral", "obra_durada": 8, "obra_acompanyament": "piano", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('79d2ca39-71ca-5e19-a2db-42d6beda8cac', 'bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Canto de las cigarras", "obra_pseudonim": "Garbí 18", "obra_text": "Josep Carner", "obra_durada": 8, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('2e9d18fd-b7ca-5aa2-8228-7b5e373c2684', 'c5da3ef1-3f62-538d-b9aa-6da2ec479370', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Rosa de vents", "obra_pseudonim": "Xaloc 19", "obra_text": "Montserrat Abelló", "obra_durada": 5, "obra_acompanyament": "altres", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('6e801172-b738-5969-9d60-e22038d55796', '79170319-4d8f-5c11-b3ea-17ed195d3be4', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "El drac de Sant Jordi", "obra_pseudonim": "Llevant 20", "obra_text": "Joan Maragall", "obra_durada": 6, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('d6295651-ee72-5d28-a1a2-afbe17133e48', '8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Cançó de la pluja", "obra_pseudonim": "Mestral 21", "obra_text": "Salvador Espriu", "obra_durada": 7, "obra_acompanyament": "piano", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('d507c820-ffaf-5bed-aa39-bafdab2e1df1', 'c7aa4711-9a76-549c-aa43-335e1240801e', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Els estels que ballen", "obra_pseudonim": "Migjorn 22", "obra_text": "Maria-Mercè Marçal", "obra_durada": 8, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('a02de616-e6df-5115-bc97-47887f4f10e4', '30874218-bc20-5b0d-801f-b9d607f00893', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "La lluna i el gat", "obra_pseudonim": "Ponent 23", "obra_text": "Miquel Martí i Pol", "obra_durada": 5, "obra_acompanyament": "altres", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('bd68ed59-9dfc-5a5b-939a-5348d225b07e', 'b34d7c74-a3d1-5df3-b4c7-226a340dedaf', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Jugant al pati", "obra_pseudonim": "Albada 24", "obra_text": "text litúrgic", "obra_durada": 6, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('ebc0701b-f760-5209-922d-f0f013eb8814', 'ec402e19-240e-52d9-81b6-73baddc56166', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Ninetes de paper", "obra_pseudonim": "Tramuntana 25", "obra_text": "Rosa Leveroni", "obra_durada": 7, "obra_acompanyament": "piano", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('67398f4a-1405-5ed1-af09-a502697eeba3', 'e4df28cb-74f4-5c20-87df-42fe2815335d', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Vent de tramuntana", "obra_pseudonim": "Garbí 26", "obra_text": "Vicent Andrés Estellés", "obra_durada": 7, "obra_acompanyament": "a_cappella", "obra_inedita": true, "accepto_bases": true}'::jsonb),
  ('fd8fa4bc-2ec9-594d-b791-b93d916038b0', '78a25dbe-3875-51f4-b6cb-8b7b35cbbe07', '10ce5753-ce17-5a7c-95c5-210ba2bc60df', '{"obra_titol": "Somnis de colors", "obra_pseudonim": "Xaloc 27", "obra_text": "Gabriela Mistral", "obra_durada": 8, "obra_acompanyament": "altres", "obra_inedita": true, "accepto_bases": true}'::jsonb);

-- 8. Catàleg d'obres
insert into composers (id, organization_id, name) values
  ('8934eb92-ba02-5673-8101-d346fa2f0609', 'bbbbbbbb-0000-0000-0000-000000000001', 'Laia Serra Puig'),
  ('04879c19-8b8d-5172-9cec-acab1bbecfcb', 'bbbbbbbb-0000-0000-0000-000000000001', 'Marc Ribas Coll'),
  ('50d2bba6-23a9-512b-969b-4a2bb7337a2c', 'bbbbbbbb-0000-0000-0000-000000000001', 'Clàudia Bosch Martí'),
  ('305bdb5d-de69-564a-b214-a6f90a7f6343', 'bbbbbbbb-0000-0000-0000-000000000001', 'Oriol Pujol Sala'),
  ('42f32648-2a87-57c2-beec-cae2e93980b5', 'bbbbbbbb-0000-0000-0000-000000000001', 'Élodie Marchand'),
  ('24cf4e2d-a4f9-5d41-9870-ea71ca5483d5', 'bbbbbbbb-0000-0000-0000-000000000001', 'Giulia Bernardi'),
  ('c2a1a6ea-d629-5c16-bc72-0aa631f021c1', 'bbbbbbbb-0000-0000-0000-000000000001', 'Arnau Vidal Roca'),
  ('78d73680-4f2d-5881-aa52-eabe82421e59', 'bbbbbbbb-0000-0000-0000-000000000001', 'Sofía Herrera Gil'),
  ('49894c21-95b2-5657-a057-95d9b14ab353', 'bbbbbbbb-0000-0000-0000-000000000001', 'Joan Mas Ferrer'),
  ('1a592788-0db6-56a6-adda-fac44de27cf6', 'bbbbbbbb-0000-0000-0000-000000000001', 'Lukas Weber'),
  ('914d9ca6-8541-5988-b209-539433a7ad57', 'bbbbbbbb-0000-0000-0000-000000000001', 'Mireia Costa Blanch'),
  ('aea3ebfa-ba70-5643-98b6-f56fb0bb03ee', 'bbbbbbbb-0000-0000-0000-000000000001', 'Anna Font Camps'),
  ('50880a10-cc2c-58bf-a5f2-0a2cc5068f92', 'bbbbbbbb-0000-0000-0000-000000000001', 'Pere Gras Valls'),
  ('d7bcec1f-04de-5c16-a995-d02be1094106', 'bbbbbbbb-0000-0000-0000-000000000001', 'Inés Navarro Ruiz'),
  ('f1b28091-a81b-5fad-a177-41f9eb9841c4', 'bbbbbbbb-0000-0000-0000-000000000001', 'Tomàs Solé Prat'),
  ('6954ac4e-d6dd-53c0-8ae3-1a154f441da6', 'bbbbbbbb-0000-0000-0000-000000000001', 'Camille Lefèvre'),
  ('41a10fa8-a7f4-5df3-a87c-29a7ccc1523f', 'bbbbbbbb-0000-0000-0000-000000000001', 'Berta Riera Duran'),
  ('329ec87f-761e-5b2c-8e69-3c14739d2e23', 'bbbbbbbb-0000-0000-0000-000000000001', 'Diego Salinas Mora'),
  ('291c3dba-79e8-52fc-b634-14b268574a79', 'bbbbbbbb-0000-0000-0000-000000000001', 'Queralt Torrent Vives'),
  ('efe2c174-dbb2-5069-8c52-16a49d74a7d2', 'bbbbbbbb-0000-0000-0000-000000000001', 'Martina Comas Rius'),
  ('81160bfc-25df-5edb-99fd-b5b12022d126', 'bbbbbbbb-0000-0000-0000-000000000001', 'Xavier Planas Bou'),
  ('fc9dd761-7fcc-57f7-b0f4-04be40f9b447', 'bbbbbbbb-0000-0000-0000-000000000001', 'Helena Rovira Soler'),
  ('3608373f-eb99-58e7-8fe4-b7e593ddf09e', 'bbbbbbbb-0000-0000-0000-000000000001', 'Biel Ferrà Mir'),
  ('aa1ecad7-ea3f-5f67-b1e0-b40a41df4db2', 'bbbbbbbb-0000-0000-0000-000000000001', 'Lucía Ortega Paz'),
  ('348ab8d0-acc6-5242-a7f1-164f8769e72b', 'bbbbbbbb-0000-0000-0000-000000000001', 'Jana Escudé Bonet'),
  ('2917ec65-c5df-556a-9581-eb7479bb037a', 'bbbbbbbb-0000-0000-0000-000000000001', 'Nil Sabaté Grau'),
  ('fddf2087-84fd-5865-bf21-70ec76c61024', 'bbbbbbbb-0000-0000-0000-000000000001', 'Paula Marín Soto');

insert into works (id, organization_id, composer_id, title, duration_seconds) values
  ('8ac25095-1e54-5e39-8d5b-3dfc971b45ae', 'bbbbbbbb-0000-0000-0000-000000000001', '8934eb92-ba02-5673-8101-d346fa2f0609', 'Cançó de bressol per a la nit llarga', 293),
  ('2fc4b7bb-794d-50d6-92d6-bad7231d3902', 'bbbbbbbb-0000-0000-0000-000000000001', '04879c19-8b8d-5172-9cec-acab1bbecfcb', 'El cant dels ocells (nova lectura)', 346),
  ('2a3cd015-5945-5756-ad24-4225948a17f7', 'bbbbbbbb-0000-0000-0000-000000000001', '50d2bba6-23a9-512b-969b-4a2bb7337a2c', 'Mar endins', 399),
  ('1593499a-cde6-5dcd-8ca6-1919a91dfb0f', 'bbbbbbbb-0000-0000-0000-000000000001', '305bdb5d-de69-564a-b214-a6f90a7f6343', 'Les veus de la pedra', 452),
  ('fd4306d3-5267-50d5-aafc-8b1d34e58804', 'bbbbbbbb-0000-0000-0000-000000000001', '42f32648-2a87-57c2-beec-cae2e93980b5', 'Aube sur la Garonne', 265),
  ('bdbcd947-8c04-5246-903e-c88c95cdce30', 'bbbbbbbb-0000-0000-0000-000000000001', '24cf4e2d-a4f9-5d41-9870-ea71ca5483d5', 'Notturno di Montserrat', 318),
  ('293e7ee3-554b-5f64-8642-f80333f902ad', 'bbbbbbbb-0000-0000-0000-000000000001', 'c2a1a6ea-d629-5c16-bc72-0aa631f021c1', 'Terra de ningú', 371),
  ('0fedea8b-de56-5309-8e36-2aece75a91af', 'bbbbbbbb-0000-0000-0000-000000000001', '78d73680-4f2d-5881-aa52-eabe82421e59', 'Oración del viento', 424),
  ('ba53850a-28e2-55c0-83e9-fb48ab3dfd4d', 'bbbbbbbb-0000-0000-0000-000000000001', '49894c21-95b2-5657-a057-95d9b14ab353', 'Cel de juny', 477),
  ('3e673719-dd53-522f-a0b3-104db8ed2f5d', 'bbbbbbbb-0000-0000-0000-000000000001', '1a592788-0db6-56a6-adda-fac44de27cf6', 'Stille Gärten', 290),
  ('c0b59b3d-7c30-53c7-a7d7-b0fadea03c8e', 'bbbbbbbb-0000-0000-0000-000000000001', '914d9ca6-8541-5988-b209-539433a7ad57', 'Llum de gener', 343),
  ('7908c2e0-1867-5fa9-afff-1b6e7ccb1b04', 'bbbbbbbb-0000-0000-0000-000000000001', 'aea3ebfa-ba70-5643-98b6-f56fb0bb03ee', 'Ave maris stella', 396),
  ('24686b13-2151-52a4-a32c-e2f3f40c5511', 'bbbbbbbb-0000-0000-0000-000000000001', '50880a10-cc2c-58bf-a5f2-0a2cc5068f92', 'Les hores blanques', 449),
  ('80d5bdd4-9834-5d69-938d-48223ae40ab8', 'bbbbbbbb-0000-0000-0000-000000000001', 'd7bcec1f-04de-5c16-a995-d02be1094106', 'Agua de mayo', 262),
  ('5e1d7ca8-1cee-557c-ad07-beddb6cef19b', 'bbbbbbbb-0000-0000-0000-000000000001', 'f1b28091-a81b-5fad-a177-41f9eb9841c4', 'Pregària del vespre', 315),
  ('fd74cea8-6398-5366-91ce-dc66bef5455a', 'bbbbbbbb-0000-0000-0000-000000000001', '6954ac4e-d6dd-53c0-8ae3-1a154f441da6', 'Chant des marées', 368),
  ('e9043dc9-2e5c-56b2-b0f6-ba79e1958f78', 'bbbbbbbb-0000-0000-0000-000000000001', '41a10fa8-a7f4-5df3-a87c-29a7ccc1523f', 'Salve de l''Empordà', 421),
  ('d4dce8df-0a7d-524c-8d02-558493bef751', 'bbbbbbbb-0000-0000-0000-000000000001', '329ec87f-761e-5b2c-8e69-3c14739d2e23', 'Canto de las cigarras', 474),
  ('2f163c93-082a-5458-95bf-85349072e0d3', 'bbbbbbbb-0000-0000-0000-000000000001', '291c3dba-79e8-52fc-b634-14b268574a79', 'Rosa de vents', 287),
  ('d44c3829-f146-5054-a3b2-33a406b0d8dd', 'bbbbbbbb-0000-0000-0000-000000000001', 'efe2c174-dbb2-5069-8c52-16a49d74a7d2', 'El drac de Sant Jordi', 340),
  ('b482820c-438c-5d59-9fb0-4a8a280fe28b', 'bbbbbbbb-0000-0000-0000-000000000001', '81160bfc-25df-5edb-99fd-b5b12022d126', 'Cançó de la pluja', 393),
  ('db80b9fa-dff1-5ccd-a168-13a259cd69b7', 'bbbbbbbb-0000-0000-0000-000000000001', 'fc9dd761-7fcc-57f7-b0f4-04be40f9b447', 'Els estels que ballen', 446),
  ('0d45719f-57c3-547d-99ee-3d12eee22e8f', 'bbbbbbbb-0000-0000-0000-000000000001', '3608373f-eb99-58e7-8fe4-b7e593ddf09e', 'La lluna i el gat', 259),
  ('95b59a29-ebff-5158-b724-3acf0fca564c', 'bbbbbbbb-0000-0000-0000-000000000001', 'aa1ecad7-ea3f-5f67-b1e0-b40a41df4db2', 'Jugant al pati', 312),
  ('3ca3cbae-6108-5801-8d03-2071b50b72bc', 'bbbbbbbb-0000-0000-0000-000000000001', '348ab8d0-acc6-5242-a7f1-164f8769e72b', 'Ninetes de paper', 365),
  ('732c62dc-69ec-536c-a5a1-0c0a6f962cc8', 'bbbbbbbb-0000-0000-0000-000000000001', '2917ec65-c5df-556a-9581-eb7479bb037a', 'Vent de tramuntana', 418),
  ('2fa7e31c-c091-5d72-8e8f-af6d6a19f5e9', 'bbbbbbbb-0000-0000-0000-000000000001', 'fddf2087-84fd-5865-bf21-70ec76c61024', 'Somnis de colors', 471);

-- 9. Participants per ronda, repertori, puntuacions
insert into round_participants (id, round_id, participant_id, "order", draw_number, is_qualified, performance_minutes, performance_time, performance_end_time, rehearsal_time, rehearsal_room, rehearsal_accompanist) values
  ('cb4af3b2-2f4b-55ec-bd08-ffc1e8052034', '8c2f9768-934c-5b19-be6d-987ac63117fb', '3aa871a4-af74-5498-add9-7c50cb886336', 1, 1, true, null, null, null, null, null, null),
  ('ebbb0647-3e7e-5996-81d1-150b1c3cdb6b', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 2, 2, true, null, null, null, null, null, null),
  ('3ac1d7c1-bd62-5531-9981-074dea4c6255', '8c2f9768-934c-5b19-be6d-987ac63117fb', '39fe135a-054e-5549-b59e-5cacf415377d', 3, 3, true, null, null, null, null, null, null),
  ('2175d569-9799-5fcd-8d3a-2a8871766b7b', '8c2f9768-934c-5b19-be6d-987ac63117fb', '79130086-ec94-55f4-80bf-0c69ffd90263', 4, 4, true, null, null, null, null, null, null),
  ('9637935e-7b5f-5a24-8519-a3d652e481cd', '8c2f9768-934c-5b19-be6d-987ac63117fb', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 5, 5, true, null, null, null, null, null, null),
  ('e712c1ba-76f2-59a6-ac4d-180513057dbd', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'a816467b-97de-59a1-b897-8bfda89c3db6', 6, 6, true, null, null, null, null, null, null),
  ('c5bbedc8-def6-577d-a3bd-dbec5fc5557d', '8c2f9768-934c-5b19-be6d-987ac63117fb', '881aa74e-d29e-5aef-9439-77aaa01e872f', 7, 7, false, null, null, null, null, null, null),
  ('30374c6f-ae11-505c-8a18-32752108973a', '8c2f9768-934c-5b19-be6d-987ac63117fb', '4b78866b-f57e-53b4-ad67-456826f918f8', 8, 8, false, null, null, null, null, null, null),
  ('2cfa8707-4c53-5d44-80c0-6df19f917115', '8c2f9768-934c-5b19-be6d-987ac63117fb', '355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', 9, 9, false, null, null, null, null, null, null),
  ('f8e7787c-22d6-5a92-a178-ef8e848168d8', '8c2f9768-934c-5b19-be6d-987ac63117fb', '6493bc90-6342-51ba-b8d0-c89aa6d0514a', 10, 10, false, null, null, null, null, null, null),
  ('9b432c3c-d6cd-53a0-8535-dc962c1889e9', '8c2f9768-934c-5b19-be6d-987ac63117fb', '266e4610-81a9-5741-9fae-e8844dfda051', 11, 11, false, null, null, null, null, null, null),
  ('c1ae3d2c-2abd-5ae4-99e6-949ad734c7fe', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '3aa871a4-af74-5498-add9-7c50cb886336', 1, 1, false, 7, '2026-10-17T10:00', '2026-10-17T10:07', '2026-10-17T08:30', 'Sala d''assaig 1', 'Cor de la Fundació · dir. Jordi Casals'),
  ('f64475dc-2dd0-5514-8fe3-ead102c31b33', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 2, 2, false, 8, '2026-10-17T10:07', '2026-10-17T10:15', '2026-10-17T08:45', 'Sala d''assaig 2', 'Cor de la Fundació · dir. Jordi Casals'),
  ('f1c72a8b-273d-5747-9961-ce0e37285607', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '39fe135a-054e-5549-b59e-5cacf415377d', 3, 3, false, 9, '2026-10-17T10:15', '2026-10-17T10:24', '2026-10-17T09:00', 'Sala d''assaig 1', 'Cor de la Fundació · dir. Jordi Casals'),
  ('7ce8cced-0073-5be0-83b9-48ad9af55866', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '79130086-ec94-55f4-80bf-0c69ffd90263', 4, 4, false, 10, '2026-10-17T10:24', '2026-10-17T10:34', '2026-10-17T09:15', 'Sala d''assaig 2', 'Cor de la Fundació · dir. Jordi Casals'),
  ('4133f9eb-d8d9-5193-bcc4-75607808cde5', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 5, 5, false, 7, '2026-10-17T10:34', '2026-10-17T10:41', '2026-10-17T09:30', 'Sala d''assaig 1', 'Cor de la Fundació · dir. Jordi Casals'),
  ('0b60e80f-504f-55e1-b9b1-b46ea1ae6ff6', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', 'a816467b-97de-59a1-b897-8bfda89c3db6', 6, 6, false, 8, '2026-10-17T10:41', '2026-10-17T10:49', '2026-10-17T09:45', 'Sala d''assaig 2', 'Cor de la Fundació · dir. Jordi Casals'),
  ('aaf96b31-f4dd-5c48-b08c-5224f9691a40', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 1, 1, true, null, null, null, null, null, null),
  ('f85024bb-c7ef-5e95-9857-f7da56d9be3a', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 2, 2, true, null, null, null, null, null, null),
  ('fd528604-63d8-5e3b-b989-d23dcd38c99a', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', 3, 3, true, null, null, null, null, null, null),
  ('accd236e-7489-58bd-bee1-22296f187bda', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5742db81-7542-595e-9a91-c5df18f0e798', 4, 4, true, null, null, null, null, null, null),
  ('61a21034-14e7-5c2c-8be8-4093a6a6ba15', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '53107462-ec5a-5b29-9d89-8f10fa7197f9', 5, 5, true, null, null, null, null, null, null),
  ('2c1e508b-5090-5335-91ca-3084d7506c1c', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'fc3ba91d-a38d-5c9e-9b88-2287de914c1d', 6, 6, false, null, null, null, null, null, null),
  ('37e74b9c-c8dc-5e13-87cd-1945832a2bb3', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', 7, 7, false, null, null, null, null, null, null),
  ('57e24a99-7946-50de-a67c-77ebe5f01646', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c5da3ef1-3f62-538d-b9aa-6da2ec479370', 8, 8, false, null, null, null, null, null, null),
  ('15e5b863-2553-55b1-b20e-3d739e68b973', '92f74c2b-1145-5163-bc2d-3f018912c421', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 1, 1, false, 9, '2026-10-18T10:00', '2026-10-18T10:09', '2026-10-18T08:30', 'Sala d''assaig 1', 'Cor de la Fundació · dir. Jordi Casals'),
  ('5f476522-99ee-520d-9945-74e2526495ad', '92f74c2b-1145-5163-bc2d-3f018912c421', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 2, 2, false, 10, '2026-10-18T10:09', '2026-10-18T10:19', '2026-10-18T08:45', 'Sala d''assaig 2', 'Cor de la Fundació · dir. Jordi Casals'),
  ('24e8e442-1d5e-5764-9300-61523b2d514a', '92f74c2b-1145-5163-bc2d-3f018912c421', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', 3, 3, false, 7, '2026-10-18T10:19', '2026-10-18T10:26', '2026-10-18T09:00', 'Sala d''assaig 1', 'Cor de la Fundació · dir. Jordi Casals'),
  ('3a6e49f1-1d36-5330-9681-5842d747d922', '92f74c2b-1145-5163-bc2d-3f018912c421', '5742db81-7542-595e-9a91-c5df18f0e798', 4, 4, false, 8, '2026-10-18T10:26', '2026-10-18T10:34', '2026-10-18T09:15', 'Sala d''assaig 2', 'Cor de la Fundació · dir. Jordi Casals'),
  ('27b987fc-12b5-59fc-8a5a-46ec0cb7c812', '92f74c2b-1145-5163-bc2d-3f018912c421', '53107462-ec5a-5b29-9d89-8f10fa7197f9', 5, 5, false, 9, '2026-10-18T10:34', '2026-10-18T10:43', '2026-10-18T09:30', 'Sala d''assaig 1', 'Cor de la Fundació · dir. Jordi Casals'),
  ('6e494bbb-1cb4-56fa-ba4d-d5d0b988ce4c', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '79170319-4d8f-5c11-b3ea-17ed195d3be4', 1, 1, false, null, null, null, null, null, null),
  ('bb182459-7014-5d81-921a-b1f1f2a29d7a', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', 2, 2, false, null, null, null, null, null, null),
  ('4e1b917f-0088-5e54-9e42-1a2be55c538b', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'c7aa4711-9a76-549c-aa43-335e1240801e', 3, 3, false, null, null, null, null, null, null),
  ('30f4bba7-7657-5f0a-b8ca-1313f2f1fbf2', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '30874218-bc20-5b0d-801f-b9d607f00893', 4, 4, false, null, null, null, null, null, null),
  ('d5a714ac-3766-5980-936e-991b4148f46d', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'b34d7c74-a3d1-5df3-b4c7-226a340dedaf', 5, 5, false, null, null, null, null, null, null),
  ('473a5951-e8b5-5ecb-9cad-64e2abf0fe9a', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'ec402e19-240e-52d9-81b6-73baddc56166', 6, 6, false, null, null, null, null, null, null),
  ('1332fdd1-98a9-56f3-b3c5-ee79d1a8d4aa', '293b8705-11b9-501c-9e2a-27ae53599a56', '02aa9e38-b267-505a-9dcb-71505ca1dfc2', 1, 1, false, 8, '2025-11-15T18:00', null, null, null, null),
  ('faffca02-3149-50d8-b0e1-10aaa3d067fc', '293b8705-11b9-501c-9e2a-27ae53599a56', '45de30b6-54dc-5c43-9bce-74d004028f35', 2, 2, false, 8, '2025-11-15T18:25', null, null, null, null),
  ('e9b2c993-fde2-5551-895a-5cd9182193f7', '293b8705-11b9-501c-9e2a-27ae53599a56', 'e43d52ff-9002-5f0a-9819-9901ddb779ac', 3, 3, false, 8, '2025-11-15T18:50', null, null, null, null),
  ('1e992c1f-47ec-5649-b1da-92484c7d046b', '293b8705-11b9-501c-9e2a-27ae53599a56', 'b4c9a8f1-b0a4-576f-92d3-e265f396a97e', 4, 4, false, 8, '2025-11-15T19:15', null, null, null, null),
  ('49561576-1c42-57b3-8aa0-95aa5905a240', '293b8705-11b9-501c-9e2a-27ae53599a56', '98bc1521-c3fb-5f6a-aa4a-16ead86e9017', 5, 5, false, 8, '2025-11-15T19:40', null, null, null, null),
  ('6618f324-1fd1-589d-b168-a3f66ca92aa7', '293b8705-11b9-501c-9e2a-27ae53599a56', '03f1cc1b-bcfb-52b4-92d2-e8b524a0d3d4', 6, 6, false, 8, '2025-11-15T20:05', null, null, null, null);

insert into round_participant_works (id, round_participant_id, work_id, position, duration_seconds) values
  ('a7f22f3a-9581-5bb3-abd4-b9316ce8272e', 'c1ae3d2c-2abd-5ae4-99e6-949ad734c7fe', '8ac25095-1e54-5e39-8d5b-3dfc971b45ae', 1, 293),
  ('cb34d320-c872-5eb1-9bc6-07021b98a624', 'f64475dc-2dd0-5514-8fe3-ead102c31b33', '2fc4b7bb-794d-50d6-92d6-bad7231d3902', 1, 346),
  ('78308325-c137-5ad7-9c3b-eedc046f138f', 'f1c72a8b-273d-5747-9961-ce0e37285607', '2a3cd015-5945-5756-ad24-4225948a17f7', 1, 399),
  ('89558af7-52cb-544f-9125-f3792c1f711f', '7ce8cced-0073-5be0-83b9-48ad9af55866', '1593499a-cde6-5dcd-8ca6-1919a91dfb0f', 1, 452),
  ('4a6248c9-d3c9-5026-aceb-34f5437cb3f4', '4133f9eb-d8d9-5193-bcc4-75607808cde5', 'fd4306d3-5267-50d5-aafc-8b1d34e58804', 1, 265),
  ('7bce682a-5309-5273-8545-64ff38b617f0', '0b60e80f-504f-55e1-b9b1-b46ea1ae6ff6', 'bdbcd947-8c04-5246-903e-c88c95cdce30', 1, 318),
  ('9e78708e-2f98-5589-9f86-4fe0c766e0c8', '15e5b863-2553-55b1-b20e-3d739e68b973', '7908c2e0-1867-5fa9-afff-1b6e7ccb1b04', 1, 396),
  ('a740932a-0e1b-5079-923e-06814a18fe75', '5f476522-99ee-520d-9945-74e2526495ad', '24686b13-2151-52a4-a32c-e2f3f40c5511', 1, 449),
  ('4b185df7-2749-55c4-bef3-e7005ef02150', '24e8e442-1d5e-5764-9300-61523b2d514a', '80d5bdd4-9834-5d69-938d-48223ae40ab8', 1, 262),
  ('5372dfeb-b017-5dfd-9804-91e71fe294f9', '3a6e49f1-1d36-5330-9681-5842d747d922', '5e1d7ca8-1cee-557c-ad07-beddb6cef19b', 1, 315),
  ('242c5581-55b9-5828-860b-d1d26e2ae3da', '27b987fc-12b5-59fc-8a5a-46ec0cb7c812', 'fd74cea8-6398-5366-91ce-dc66bef5455a', 1, 368);

insert into scores (id, round_id, participant_id, judge_id, value, notes, submitted_at) values
  ('7d0188f5-7e25-5d55-afca-2f6266fe444e', '8c2f9768-934c-5b19-be6d-987ac63117fb', '3aa871a4-af74-5498-add9-7c50cb886336', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('c0f517d6-bc15-5ea7-9caa-ce97cd078307', '8c2f9768-934c-5b19-be6d-987ac63117fb', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('081d5eb8-1e75-58e1-b671-edfc2df6ed7e', '8c2f9768-934c-5b19-be6d-987ac63117fb', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('fcbf94c9-c1a1-54dc-a374-9f73976bdd2c', '8c2f9768-934c-5b19-be6d-987ac63117fb', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('05e41894-5646-508c-8d44-a047d4bf38c9', '8c2f9768-934c-5b19-be6d-987ac63117fb', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('6b295e3f-b9b7-562e-b829-08cacb0005f0', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('77159421-8f11-5961-845f-37810f1674f2', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('d2ea3212-937a-5257-a74b-0cf1f31d7b1a', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('90c9a998-88bb-5218-b589-32c4481d5e81', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('828fcc3a-06c5-5e64-947b-892239b25fe0', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('ce30e6a0-5365-5f7c-86c2-32bfd08f6661', '8c2f9768-934c-5b19-be6d-987ac63117fb', '39fe135a-054e-5549-b59e-5cacf415377d', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('b34d784c-5cf4-5d8f-aebb-183e9961fe77', '8c2f9768-934c-5b19-be6d-987ac63117fb', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('8b144036-8993-5582-8844-f3c5601e9273', '8c2f9768-934c-5b19-be6d-987ac63117fb', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('da6409c0-908a-52b3-8c19-6dddfc5aed63', '8c2f9768-934c-5b19-be6d-987ac63117fb', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('85a6046a-5ed8-5453-a776-9d27d5818364', '8c2f9768-934c-5b19-be6d-987ac63117fb', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('8fd414b3-8d2c-5183-8daa-6cca59d4f80f', '8c2f9768-934c-5b19-be6d-987ac63117fb', '79130086-ec94-55f4-80bf-0c69ffd90263', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('78b548ce-b9b0-548c-9502-f30f38e3b316', '8c2f9768-934c-5b19-be6d-987ac63117fb', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('126489a6-cbdb-5838-a764-5348c1515777', '8c2f9768-934c-5b19-be6d-987ac63117fb', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('07a77e48-a85c-5d6f-8f39-03ff30e53390', '8c2f9768-934c-5b19-be6d-987ac63117fb', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('a43ff930-db05-5ff7-bf55-26a21efd21b2', '8c2f9768-934c-5b19-be6d-987ac63117fb', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('2e0f19c1-75e2-5725-8711-e95d288ab812', '8c2f9768-934c-5b19-be6d-987ac63117fb', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('308152bb-2766-5c83-b7ab-544c43b727c9', '8c2f9768-934c-5b19-be6d-987ac63117fb', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('9b3b125a-456d-5edd-b74e-a42d7766ea18', '8c2f9768-934c-5b19-be6d-987ac63117fb', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('d8088069-6a00-52bd-b4cb-f9c9f0bd8e94', '8c2f9768-934c-5b19-be6d-987ac63117fb', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('c9a2c018-1c39-5285-b19c-12548fb739b9', '8c2f9768-934c-5b19-be6d-987ac63117fb', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('ca13742f-2166-5902-b400-b79aab5ea42a', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'a816467b-97de-59a1-b897-8bfda89c3db6', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('f3b91f6d-6fa6-502b-a82e-7222b1c7f287', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'a816467b-97de-59a1-b897-8bfda89c3db6', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('192d8389-8c15-5d39-aac0-aafe226b5bb0', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'a816467b-97de-59a1-b897-8bfda89c3db6', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('fb4083fd-3834-5fa2-88f1-293e73c83a62', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'a816467b-97de-59a1-b897-8bfda89c3db6', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('f32d4d39-b0c1-5999-9bc4-a65bf1b1414c', '8c2f9768-934c-5b19-be6d-987ac63117fb', 'a816467b-97de-59a1-b897-8bfda89c3db6', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('7265a54c-1613-5023-b3d5-7878de6ec1af', '8c2f9768-934c-5b19-be6d-987ac63117fb', '881aa74e-d29e-5aef-9439-77aaa01e872f', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('ed2a0c86-4aa5-569f-b8ba-f59fedbd9867', '8c2f9768-934c-5b19-be6d-987ac63117fb', '881aa74e-d29e-5aef-9439-77aaa01e872f', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('cfb8e813-fd09-5666-8398-84359b09bce2', '8c2f9768-934c-5b19-be6d-987ac63117fb', '881aa74e-d29e-5aef-9439-77aaa01e872f', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('5ff9a351-f7a6-5522-bb49-c1aa11d803d9', '8c2f9768-934c-5b19-be6d-987ac63117fb', '881aa74e-d29e-5aef-9439-77aaa01e872f', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('b91dd9a8-113a-547c-b56d-718ccc11432a', '8c2f9768-934c-5b19-be6d-987ac63117fb', '881aa74e-d29e-5aef-9439-77aaa01e872f', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('a96e1ac8-29ca-5118-aea6-280ff94c6885', '8c2f9768-934c-5b19-be6d-987ac63117fb', '4b78866b-f57e-53b4-ad67-456826f918f8', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('829d3fb7-19f6-53d1-a121-999711a5521f', '8c2f9768-934c-5b19-be6d-987ac63117fb', '4b78866b-f57e-53b4-ad67-456826f918f8', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('b05b3c07-c413-5f70-b25c-634c975b69d6', '8c2f9768-934c-5b19-be6d-987ac63117fb', '4b78866b-f57e-53b4-ad67-456826f918f8', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('91c25e7c-5de3-51b9-b858-425ce86a5955', '8c2f9768-934c-5b19-be6d-987ac63117fb', '4b78866b-f57e-53b4-ad67-456826f918f8', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('14726fdb-009b-58da-8eac-0b4c21c57ef9', '8c2f9768-934c-5b19-be6d-987ac63117fb', '4b78866b-f57e-53b4-ad67-456826f918f8', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('a1227be7-a768-5ae6-981c-6addc7fa1fc9', '8c2f9768-934c-5b19-be6d-987ac63117fb', '355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('38fb337e-c8dc-5f5b-98cb-10aaa7873f0f', '8c2f9768-934c-5b19-be6d-987ac63117fb', '355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('6640e608-c767-5d4c-b550-126f8cfd8c67', '8c2f9768-934c-5b19-be6d-987ac63117fb', '355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('bb020d67-980f-5db4-b41c-e43835c31674', '8c2f9768-934c-5b19-be6d-987ac63117fb', '355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('21a0d3c4-c578-5e96-bac2-8d9093cd678d', '8c2f9768-934c-5b19-be6d-987ac63117fb', '355ea4d6-05fc-52bc-bb6d-37d71ed8cf27', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('ad9a08b4-75f9-5ac1-8a21-0ba61c9c471b', '8c2f9768-934c-5b19-be6d-987ac63117fb', '6493bc90-6342-51ba-b8d0-c89aa6d0514a', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('31e75649-81b9-5166-ac67-31f4fee717d6', '8c2f9768-934c-5b19-be6d-987ac63117fb', '6493bc90-6342-51ba-b8d0-c89aa6d0514a', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('66969306-eac6-5ee8-9f99-0db0a7a4c45f', '8c2f9768-934c-5b19-be6d-987ac63117fb', '6493bc90-6342-51ba-b8d0-c89aa6d0514a', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('86aecfe5-3e9a-508f-aad7-3aadab185599', '8c2f9768-934c-5b19-be6d-987ac63117fb', '6493bc90-6342-51ba-b8d0-c89aa6d0514a', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('cfe7201a-64ba-57d7-bcfa-092550f980fd', '8c2f9768-934c-5b19-be6d-987ac63117fb', '6493bc90-6342-51ba-b8d0-c89aa6d0514a', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('13b4cf3c-5da9-5f3a-824b-eac060082af7', '8c2f9768-934c-5b19-be6d-987ac63117fb', '266e4610-81a9-5741-9fae-e8844dfda051', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('c9ad4039-48eb-52d4-a2b6-6aa49c8d34aa', '8c2f9768-934c-5b19-be6d-987ac63117fb', '266e4610-81a9-5741-9fae-e8844dfda051', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('ba4debd7-ff1c-51c5-97fe-84341cff6ec6', '8c2f9768-934c-5b19-be6d-987ac63117fb', '266e4610-81a9-5741-9fae-e8844dfda051', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('c959748e-a913-55c4-81e3-37d29f0a6486', '8c2f9768-934c-5b19-be6d-987ac63117fb', '266e4610-81a9-5741-9fae-e8844dfda051', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('32844d7d-c3eb-503e-8b5a-45a461ee030d', '8c2f9768-934c-5b19-be6d-987ac63117fb', '266e4610-81a9-5741-9fae-e8844dfda051', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('f2c6b9c6-58e0-561c-b269-1a943a2e5745', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '3aa871a4-af74-5498-add9-7c50cb886336', 'aaaaaaaa-0000-0000-0000-000000000003', 8.0, 'Bona idea harmònica, però la part de contralt queda massa greu.', '2026-10-17T11:30:00+02'),
  ('a8d3214a-8aa2-5879-91c0-3119b8b3eba7', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000001', 7.5, 'Text ben prosodiat. Potser li sobra una repetició a la secció central.', '2026-10-17T11:30:00+02'),
  ('c0a0570d-21c6-53d8-a977-a7d896073d5b', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000002', 6.5, null, '2026-10-17T11:30:00+02'),
  ('519257fa-16e5-5691-8733-da83cb80d026', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000003', 9.0, null, '2026-10-17T11:30:00+02'),
  ('0bc2735e-2e39-5087-8f2b-cbca370394b7', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '3aa871a4-af74-5498-add9-7c50cb886336', 'bbbbbbbb-0000-0000-0000-000000000004', 8.5, null, '2026-10-17T11:30:00+02'),
  ('31f316e4-f2b9-581a-917a-2ef7dfbe3dba', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'aaaaaaaa-0000-0000-0000-000000000003', 7.0, 'Text ben prosodiat. Potser li sobra una repetició a la secció central.', '2026-10-17T11:30:00+02'),
  ('c8a2781d-181f-5748-a0f8-ae52754f1bf0', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000001', 9.5, 'Obra madura i personal. Molt bona resposta del cor.', '2026-10-17T11:30:00+02'),
  ('50582857-cf8b-54f9-a301-ae2f77a49ffd', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000002', 8.5, null, '2026-10-17T11:30:00+02'),
  ('c594953c-8748-5a0d-a977-e5a07823b684', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000003', 8.0, null, '2026-10-17T11:30:00+02'),
  ('3f78a732-87a2-55e4-b118-94a82a32d879', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', 'f7d16fc7-7304-516f-ae51-5a5ad9ce5ba1', 'bbbbbbbb-0000-0000-0000-000000000004', 7.0, null, '2026-10-17T11:30:00+02'),
  ('bee12a4d-43ad-5f1b-a5e3-0e7f9d886892', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '39fe135a-054e-5549-b59e-5cacf415377d', 'aaaaaaaa-0000-0000-0000-000000000003', 9.0, 'Obra madura i personal. Molt bona resposta del cor.', '2026-10-17T11:30:00+02'),
  ('8d0c7eeb-c048-53ec-8aa5-7265f2a577a8', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000001', 8.0, 'Escriptura molt idiomàtica per al cor. El clímax final convenç.', '2026-10-17T11:30:00+02'),
  ('1e5f223c-f22a-523a-b3e3-a67296bb42c3', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000002', 7.0, null, '2026-10-17T11:30:00+02'),
  ('559a722c-c62a-5cad-955d-fadd77137d42', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000003', 6.5, null, '2026-10-17T11:30:00+02'),
  ('e231ddd9-9441-5232-b824-a22d2652413d', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '39fe135a-054e-5549-b59e-5cacf415377d', 'bbbbbbbb-0000-0000-0000-000000000004', 9.0, null, '2026-10-17T11:30:00+02'),
  ('4eeae7e1-f873-5730-aee7-215798066e37', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '79130086-ec94-55f4-80bf-0c69ffd90263', 'aaaaaaaa-0000-0000-0000-000000000003', 7.5, 'Escriptura molt idiomàtica per al cor. El clímax final convenç.', '2026-10-17T11:30:00+02'),
  ('e3b25969-2b88-5c98-9228-6db248f9a6e4', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000001', 6.5, 'Bona idea harmònica, però la part de contralt queda massa greu.', '2026-10-17T11:30:00+02'),
  ('054531f8-6a8f-5b90-94cc-bc390b73be92', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000002', 9.5, null, '2026-10-17T11:30:00+02'),
  ('5d03693d-25bf-53c4-bc2e-42936e533d39', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000003', 8.5, null, '2026-10-17T11:30:00+02'),
  ('00bc9063-8556-5294-85f5-339e9d15e20f', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '79130086-ec94-55f4-80bf-0c69ffd90263', 'bbbbbbbb-0000-0000-0000-000000000004', 7.5, null, '2026-10-17T11:30:00+02'),
  ('adabccb6-7bec-579f-b371-55e1d04fa73b', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'aaaaaaaa-0000-0000-0000-000000000003', 6.0, 'Bona idea harmònica, però la part de contralt queda massa greu.', '2026-10-17T11:30:00+02'),
  ('c5f9f554-a476-58f7-bd4c-9d605cd2b9a8', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'bbbbbbbb-0000-0000-0000-000000000001', 9.0, 'Text ben prosodiat. Potser li sobra una repetició a la secció central.', '2026-10-17T11:30:00+02'),
  ('008dfa14-d3ed-5285-9bad-e518fac18f4b', '8cccd3f6-95d2-54bf-a313-d9ef0bf25288', '8fde23b9-2d7f-5cef-840d-878a8eeb7e68', 'bbbbbbbb-0000-0000-0000-000000000002', 8.0, null, '2026-10-17T11:30:00+02'),
  ('3249cf58-f520-5c52-af4a-821d6a431787', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('a21e9c08-90a7-5c08-9bbf-b117764bcd95', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('acc62129-ef0c-5e8c-aa61-c95a315f643c', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('0ffc912f-6be0-5946-a917-a925fc35cc9a', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('3dc7c498-da3b-5169-9415-69af1240edd4', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5fbb44a3-e3b0-5fb9-bbc1-2d8ae82b6eef', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('697190a6-2dfc-55fe-8656-5e1292fab358', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('a711c2ab-4679-51a9-84f6-e595a502679a', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('d9887e3a-6ff2-58ea-a46d-97fb8f315436', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('4fd66626-7c52-55e6-ba70-481b2ca73851', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('6ee30235-63b9-5635-b6eb-a6dbcc0556fb', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'ccb6a289-4f7d-5e0d-9ee0-1541967d123a', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('65f52526-cea1-5ee6-9dd4-58f023e8420a', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('38d76050-1e58-5b91-a609-e3d7b75efa3f', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('398a63d1-af44-58f0-b3e3-9103ba94b7e8', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('82ac8c5b-c438-5ad8-9deb-3eb5d6056a66', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('007f5ef4-8369-5ea8-bf15-f8461008f844', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c1ffc7e6-b6df-5c49-9b03-d468644a36be', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('86846bc6-7293-592c-9d69-1183e4b65687', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5742db81-7542-595e-9a91-c5df18f0e798', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('efc24b21-2124-5b23-b7af-4374fcc95407', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5742db81-7542-595e-9a91-c5df18f0e798', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('29f75274-b8bf-56a2-80dc-2721b0f9244b', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5742db81-7542-595e-9a91-c5df18f0e798', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('f57eb3fc-bd44-5f7e-9b6c-233dce615ede', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5742db81-7542-595e-9a91-c5df18f0e798', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('27fa7738-757a-5f66-9d18-8f7924aa99b0', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '5742db81-7542-595e-9a91-c5df18f0e798', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('b3e23e6b-2c70-5701-8126-1900e318e99b', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '53107462-ec5a-5b29-9d89-8f10fa7197f9', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('097b7e93-c97b-5259-853f-5241a6f7de0d', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '53107462-ec5a-5b29-9d89-8f10fa7197f9', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('54ba77c3-0872-5e52-9268-2b77430b8888', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '53107462-ec5a-5b29-9d89-8f10fa7197f9', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('9967ce01-c812-5816-813e-8fcd4929d5bb', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '53107462-ec5a-5b29-9d89-8f10fa7197f9', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('b76eb3b8-7e16-58ef-9655-59a6ae8c7ab7', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', '53107462-ec5a-5b29-9d89-8f10fa7197f9', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('52207d90-bd29-5a05-9e83-777eb5cddaa7', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'fc3ba91d-a38d-5c9e-9b88-2287de914c1d', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('db5885f5-e9e6-51c3-be0a-11e22517a2cb', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'fc3ba91d-a38d-5c9e-9b88-2287de914c1d', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('4c8a4a3e-52cd-507d-9f7d-4f4f5100b00e', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'fc3ba91d-a38d-5c9e-9b88-2287de914c1d', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('1518e4bb-015a-5bea-a001-8512f785e258', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'fc3ba91d-a38d-5c9e-9b88-2287de914c1d', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('63d366fc-26a4-5163-b1a6-8c8993881b0f', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'fc3ba91d-a38d-5c9e-9b88-2287de914c1d', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('9092d112-9d97-53c9-bf2c-567ea21b81e4', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('b0182ba7-4dc6-5051-850e-d5cf7718ea8f', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('3aff7602-72e8-517a-9eb5-a1146eeb9efc', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('4dcfc265-7c17-5c84-919c-3a46e5f68353', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('e3b14bc5-79c7-5642-8525-df11a7568ae6', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'bbb1c65f-f8f7-50c5-a70e-cce0b3a4a10b', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('b4fa3e64-49fd-59ef-84cf-6718acd51679', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c5da3ef1-3f62-538d-b9aa-6da2ec479370', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('cf8d74ca-0d72-5684-a10b-badad4ad96a6', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c5da3ef1-3f62-538d-b9aa-6da2ec479370', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('14f02380-0c3f-56d9-bd58-8483e656c29d', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c5da3ef1-3f62-538d-b9aa-6da2ec479370', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('8311a7e4-4eee-5eed-bb67-b5ee93eaace9', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c5da3ef1-3f62-538d-b9aa-6da2ec479370', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('8a1df1a0-6216-59fb-ad0f-cfd52f0fdb4f', '24adfc32-f760-57f7-ae8a-9a2dcf4040b7', 'c5da3ef1-3f62-538d-b9aa-6da2ec479370', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('c4e2f9d5-cb74-5229-8de1-843881de78b7', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '79170319-4d8f-5c11-b3ea-17ed195d3be4', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('1abfe025-bff6-5e2f-9e22-ce27b048bcfd', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '79170319-4d8f-5c11-b3ea-17ed195d3be4', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('33d05715-15cc-5e41-bba0-ed4b5537c106', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '79170319-4d8f-5c11-b3ea-17ed195d3be4', 'bbbbbbbb-0000-0000-0000-000000000002', 0, null, '2026-10-03T18:00:00+02'),
  ('7d5e6181-d25e-5381-98c3-3da4fba91b38', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '79170319-4d8f-5c11-b3ea-17ed195d3be4', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('d3cf967d-27a2-53af-b4d1-c08b0c2a27bb', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '79170319-4d8f-5c11-b3ea-17ed195d3be4', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('299c6ec3-c555-5e15-9934-81c69c07f008', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', 'aaaaaaaa-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('ca9d811d-63d8-5017-bcb4-61f3ffec202b', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', 'bbbbbbbb-0000-0000-0000-000000000001', 0, null, '2026-10-03T18:00:00+02'),
  ('673509ab-fd79-5a25-8fec-990229c9ba29', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('af6dfb57-2249-5c02-852e-0a0eb9b8679b', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', 'bbbbbbbb-0000-0000-0000-000000000003', 1, null, '2026-10-03T18:00:00+02'),
  ('31e5d5da-66a8-5fdc-91f5-cdcca1230435', '4ccf3c25-6a44-5298-9a47-a3898481fc36', '8a15c0ca-991d-5fd2-b82d-cd17c7af17c3', 'bbbbbbbb-0000-0000-0000-000000000004', 0, null, '2026-10-03T18:00:00+02'),
  ('1f87b6ac-5c8f-5234-a15c-a51524d3cf0a', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'c7aa4711-9a76-549c-aa43-335e1240801e', 'aaaaaaaa-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('add6bece-6232-5120-a76e-7acc31075c3c', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'c7aa4711-9a76-549c-aa43-335e1240801e', 'bbbbbbbb-0000-0000-0000-000000000001', 1, null, '2026-10-03T18:00:00+02'),
  ('7f187436-8180-5c2a-8e98-055617eab229', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'c7aa4711-9a76-549c-aa43-335e1240801e', 'bbbbbbbb-0000-0000-0000-000000000002', 1, null, '2026-10-03T18:00:00+02'),
  ('42db801f-b56b-5f69-bd36-1dd0406119b0', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'c7aa4711-9a76-549c-aa43-335e1240801e', 'bbbbbbbb-0000-0000-0000-000000000003', 0, null, '2026-10-03T18:00:00+02'),
  ('7e2322e3-3d22-51dd-b8e9-d758d140fcb3', '4ccf3c25-6a44-5298-9a47-a3898481fc36', 'c7aa4711-9a76-549c-aa43-335e1240801e', 'bbbbbbbb-0000-0000-0000-000000000004', 1, null, '2026-10-03T18:00:00+02'),
  ('479f561b-af1d-527d-9b22-725b14261636', '293b8705-11b9-501c-9e2a-27ae53599a56', '02aa9e38-b267-505a-9dcb-71505ca1dfc2', 'aaaaaaaa-0000-0000-0000-000000000003', 9.5, null, '2025-11-15T21:00:00+01'),
  ('c25d5e2a-9db4-5c70-b756-e35aaa3a76e7', '293b8705-11b9-501c-9e2a-27ae53599a56', '02aa9e38-b267-505a-9dcb-71505ca1dfc2', 'bbbbbbbb-0000-0000-0000-000000000001', 10.0, null, '2025-11-15T21:00:00+01'),
  ('f4e4722e-f81e-58f4-8b19-af93487554c6', '293b8705-11b9-501c-9e2a-27ae53599a56', '02aa9e38-b267-505a-9dcb-71505ca1dfc2', 'bbbbbbbb-0000-0000-0000-000000000002', 9.5, null, '2025-11-15T21:00:00+01'),
  ('68c33f0a-6ea4-59c0-ab0d-086026b7dba8', '293b8705-11b9-501c-9e2a-27ae53599a56', '02aa9e38-b267-505a-9dcb-71505ca1dfc2', 'bbbbbbbb-0000-0000-0000-000000000003', 9.5, null, '2025-11-15T21:00:00+01'),
  ('29e56e79-878f-5973-a9bb-61de9fb87505', '293b8705-11b9-501c-9e2a-27ae53599a56', '02aa9e38-b267-505a-9dcb-71505ca1dfc2', 'bbbbbbbb-0000-0000-0000-000000000004', 9.5, null, '2025-11-15T21:00:00+01'),
  ('1bdcad63-ba79-55bd-84e3-2a171d0ec16a', '293b8705-11b9-501c-9e2a-27ae53599a56', '45de30b6-54dc-5c43-9bce-74d004028f35', 'aaaaaaaa-0000-0000-0000-000000000003', 9.0, null, '2025-11-15T21:00:00+01'),
  ('3feda716-c34e-5313-915a-64bc48b10d6b', '293b8705-11b9-501c-9e2a-27ae53599a56', '45de30b6-54dc-5c43-9bce-74d004028f35', 'bbbbbbbb-0000-0000-0000-000000000001', 9.0, null, '2025-11-15T21:00:00+01'),
  ('efe596f6-be19-5194-b205-1a76a08bd602', '293b8705-11b9-501c-9e2a-27ae53599a56', '45de30b6-54dc-5c43-9bce-74d004028f35', 'bbbbbbbb-0000-0000-0000-000000000002', 9.5, null, '2025-11-15T21:00:00+01'),
  ('7b8aa86a-2c21-5e17-a088-9c618c954b34', '293b8705-11b9-501c-9e2a-27ae53599a56', '45de30b6-54dc-5c43-9bce-74d004028f35', 'bbbbbbbb-0000-0000-0000-000000000003', 9.5, null, '2025-11-15T21:00:00+01'),
  ('109be055-f222-5453-b5fa-b348266e4242', '293b8705-11b9-501c-9e2a-27ae53599a56', '45de30b6-54dc-5c43-9bce-74d004028f35', 'bbbbbbbb-0000-0000-0000-000000000004', 9.0, null, '2025-11-15T21:00:00+01'),
  ('9e5736ec-82d9-58cc-80f2-9087130e13a4', '293b8705-11b9-501c-9e2a-27ae53599a56', 'e43d52ff-9002-5f0a-9819-9901ddb779ac', 'aaaaaaaa-0000-0000-0000-000000000003', 9.0, null, '2025-11-15T21:00:00+01'),
  ('7552bb4d-6263-533b-b2a8-4d21bbf141a3', '293b8705-11b9-501c-9e2a-27ae53599a56', 'e43d52ff-9002-5f0a-9819-9901ddb779ac', 'bbbbbbbb-0000-0000-0000-000000000001', 8.5, null, '2025-11-15T21:00:00+01'),
  ('4be22299-9026-5aa9-8715-640904bef2cc', '293b8705-11b9-501c-9e2a-27ae53599a56', 'e43d52ff-9002-5f0a-9819-9901ddb779ac', 'bbbbbbbb-0000-0000-0000-000000000002', 8.5, null, '2025-11-15T21:00:00+01'),
  ('fcf179b5-1570-5a94-838e-fc82a65abff9', '293b8705-11b9-501c-9e2a-27ae53599a56', 'e43d52ff-9002-5f0a-9819-9901ddb779ac', 'bbbbbbbb-0000-0000-0000-000000000003', 8.5, null, '2025-11-15T21:00:00+01'),
  ('14ada535-7016-56b6-993f-d07ee61bb09c', '293b8705-11b9-501c-9e2a-27ae53599a56', 'e43d52ff-9002-5f0a-9819-9901ddb779ac', 'bbbbbbbb-0000-0000-0000-000000000004', 9.0, null, '2025-11-15T21:00:00+01'),
  ('55f3f106-2fac-5021-b66e-836d4b189100', '293b8705-11b9-501c-9e2a-27ae53599a56', 'b4c9a8f1-b0a4-576f-92d3-e265f396a97e', 'aaaaaaaa-0000-0000-0000-000000000003', 8.0, null, '2025-11-15T21:00:00+01'),
  ('dc890e80-d7d9-50c1-b035-93ded7620646', '293b8705-11b9-501c-9e2a-27ae53599a56', 'b4c9a8f1-b0a4-576f-92d3-e265f396a97e', 'bbbbbbbb-0000-0000-0000-000000000001', 8.5, null, '2025-11-15T21:00:00+01'),
  ('5341e8a4-e88e-59d9-817f-bec791a1b89c', '293b8705-11b9-501c-9e2a-27ae53599a56', 'b4c9a8f1-b0a4-576f-92d3-e265f396a97e', 'bbbbbbbb-0000-0000-0000-000000000002', 8.0, null, '2025-11-15T21:00:00+01'),
  ('880e7722-6536-520d-b2a1-ffd66104382b', '293b8705-11b9-501c-9e2a-27ae53599a56', 'b4c9a8f1-b0a4-576f-92d3-e265f396a97e', 'bbbbbbbb-0000-0000-0000-000000000003', 8.0, null, '2025-11-15T21:00:00+01'),
  ('da34999a-e2ac-5201-8606-1da161fe5bb3', '293b8705-11b9-501c-9e2a-27ae53599a56', 'b4c9a8f1-b0a4-576f-92d3-e265f396a97e', 'bbbbbbbb-0000-0000-0000-000000000004', 8.0, null, '2025-11-15T21:00:00+01'),
  ('4088cbad-6f6d-544e-99f6-a8153675ab9a', '293b8705-11b9-501c-9e2a-27ae53599a56', '98bc1521-c3fb-5f6a-aa4a-16ead86e9017', 'aaaaaaaa-0000-0000-0000-000000000003', 7.5, null, '2025-11-15T21:00:00+01'),
  ('a801addf-fbe1-5899-88a0-42f27387be7a', '293b8705-11b9-501c-9e2a-27ae53599a56', '98bc1521-c3fb-5f6a-aa4a-16ead86e9017', 'bbbbbbbb-0000-0000-0000-000000000001', 7.0, null, '2025-11-15T21:00:00+01'),
  ('8b4441f2-509b-5205-848b-d535c8d2d055', '293b8705-11b9-501c-9e2a-27ae53599a56', '98bc1521-c3fb-5f6a-aa4a-16ead86e9017', 'bbbbbbbb-0000-0000-0000-000000000002', 8.0, null, '2025-11-15T21:00:00+01'),
  ('cf1364ca-6657-5a82-a71e-66f7b75ecf4f', '293b8705-11b9-501c-9e2a-27ae53599a56', '98bc1521-c3fb-5f6a-aa4a-16ead86e9017', 'bbbbbbbb-0000-0000-0000-000000000003', 7.5, null, '2025-11-15T21:00:00+01'),
  ('ad740160-eb5f-57c2-8bd2-ac7de0b38c9d', '293b8705-11b9-501c-9e2a-27ae53599a56', '98bc1521-c3fb-5f6a-aa4a-16ead86e9017', 'bbbbbbbb-0000-0000-0000-000000000004', 7.5, null, '2025-11-15T21:00:00+01'),
  ('2c2fdc84-89dc-54e4-a5fc-1c053fd222d7', '293b8705-11b9-501c-9e2a-27ae53599a56', '03f1cc1b-bcfb-52b4-92d2-e8b524a0d3d4', 'aaaaaaaa-0000-0000-0000-000000000003', 7.0, null, '2025-11-15T21:00:00+01'),
  ('36b80088-e797-5460-b9bf-c0271c0a0c02', '293b8705-11b9-501c-9e2a-27ae53599a56', '03f1cc1b-bcfb-52b4-92d2-e8b524a0d3d4', 'bbbbbbbb-0000-0000-0000-000000000001', 7.0, null, '2025-11-15T21:00:00+01'),
  ('57fafcdb-8fd7-5b8b-a0ca-1f8b07c6e318', '293b8705-11b9-501c-9e2a-27ae53599a56', '03f1cc1b-bcfb-52b4-92d2-e8b524a0d3d4', 'bbbbbbbb-0000-0000-0000-000000000002', 6.5, null, '2025-11-15T21:00:00+01'),
  ('2d16dc2d-5175-5b4d-a12c-8a7147dee611', '293b8705-11b9-501c-9e2a-27ae53599a56', '03f1cc1b-bcfb-52b4-92d2-e8b524a0d3d4', 'bbbbbbbb-0000-0000-0000-000000000003', 6.5, null, '2025-11-15T21:00:00+01'),
  ('73466819-9677-5732-bc1c-0736592a9989', '293b8705-11b9-501c-9e2a-27ae53599a56', '03f1cc1b-bcfb-52b4-92d2-e8b524a0d3d4', 'bbbbbbbb-0000-0000-0000-000000000004', 7.0, null, '2025-11-15T21:00:00+01');

-- 10. Notificacions dins l'app de les comptes demo: la demo comença neta.
delete from notifications where user_id in (select id from auth.users where email like '%@contestsaas.demo');

commit;

-- Resum: 33 participants, 42 places a rondes, 163 puntuacions, 27 obres.

