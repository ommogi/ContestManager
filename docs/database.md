# Database Reference — ContestSaaS

Stack: Supabase · PostgreSQL 15 · Row Level Security · Realtime

---

## Arquitectura

```
organizations (propietario: auth.users)
├── contests
│   ├── contest_members          (jueces / viewers)
│   ├── inscription_form_schemas
│   │   └── participant_form_responses
│   └── categories
│       ├── rounds
│       │   ├── round_participants  (→ participants)
│       │   ├── score_criteria
│       │   ├── scores              (→ participants, jueces)
│       │   └── score_audit_logs
│       └── participants
│           └── participant_form_responses
├── judge_pool_members           (→ judges)
├── billing_transactions
├── email_logs
└── notifications                (→ auth.users)
```

**Cascada de borrado:** Eliminar una organización elimina en cascada todos sus concursos, categorías, rondas, participantes y transacciones.

---

## Enums

| Enum | Valores |
|---|---|
| `contest_type` | `music`, `dance`, `general`, `libre` |
| `contest_status` | `draft`, `active`, `finished`, `cancelled` |
| `contest_role` | `organizer`, `judge`, `viewer` |
| `category_status` | `pending`, `active`, `closed` |
| `round_status` | `pending`, `active`, `closed` |
| `scoring_type` | `numeric`, `rank`, `vote` |
| `participant_status` | `active`, `eliminated` |
| `account_type` | `org_owner`, `user` |
| `payment_status` | `free`, `pending`, `paid`, `refunded`, `partial_refund` |

---

## Tablas

---

### `organizations`

Entidad raíz. Una organización pertenece a un usuario (owner).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `owner_id` | UUID FK `auth.users` | |
| `name` | TEXT | |
| `slug` | TEXT UNIQUE | |
| `logo_url` | TEXT | bucket `org_logos` |
| `contact_phone` | TEXT | |
| `contact_country` | TEXT | |
| `ticket_balance` | INT default 0 | Créditos de inscripción |
| `activation_balance` | INT default 0 | Créditos de activación de concurso |
| `stripe_account_id` | TEXT UNIQUE | Cuenta Stripe Connect |
| `stripe_onboarding_done` | BOOL default false | |
| `stripe_charges_enabled` | BOOL default false | |
| `stripe_payouts_enabled` | BOOL default false | |
| `settings` | JSONB | Config adicional |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Indexes:** `owner_id_idx`, `stripe_account_uidx`

**RLS:**
- Owner puede leer y escribir su propia organización
- Miembros de concursos pueden leer (datos básicos)

**Triggers:** `grant_signup_bonus` — al crear org, otorga 1 activación gratuita

---

### `contests`

Concurso dentro de una organización.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK `organizations` CASCADE | |
| `name` | TEXT | |
| `slug` | TEXT UNIQUE | Generado desde name |
| `description` | TEXT | |
| `cover_image_url` | TEXT | |
| `type` | `contest_type` default `music` | |
| `status` | `contest_status` default `draft` | Solo avanza, no retrocede de `active` a `draft` |
| `is_rounds_dynamic` | BOOL default false | |
| `starts_at`, `ends_at` | TIMESTAMPTZ | |
| `registration_token` | TEXT NOT NULL UNIQUE | Token para link de inscripción pública |
| `registration_open` | BOOL default true | |
| `entry_fee_cents` | INT default 0 | 0 = gratuito |
| `rules` | TEXT | |
| `rehearsal_default_minutes` | INT | |
| `performance_default_minutes` | INT | |
| `settings` | JSONB | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Indexes:** `registration_token_idx`

**RLS:**
- Lectura pública si no es `draft`
- Miembros del concurso pueden leer
- Solo org owner puede escribir

**Triggers:**
- `block_round_start_if_contest_not_active` — impide activar rondas si el concurso no está `active`
- `handle_contests_updated_at`

---

### `contest_members`

Miembros del equipo de un concurso (jueces, viewers, organizadores adicionales).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `contest_id` | UUID FK `contests` CASCADE | |
| `user_id` | UUID FK `auth.users` CASCADE, nullable | NULL si el usuario aún no tiene cuenta |
| `full_name` | TEXT | |
| `email` | TEXT | |
| `role` | `contest_role` default `viewer` | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`contest_id`, `user_id`)

**Indexes:** `contest_user_idx`

**RLS:**
- Miembros del concurso pueden leer
- Org owner puede escribir

**Triggers:**
- `link_member_user_id` — al insertar, busca `auth.users` por email y enlaza `user_id`
- `backfill_contest_members_for_new_user` — cuando un usuario se registra, enlaza sus registros pendientes
- `notify_judge_assigned` — notifica al juez

---

### `profiles`

Extensión de `auth.users` con datos del perfil.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK FK `auth.users` CASCADE | |
| `full_name` | TEXT | |
| `avatar_url` | TEXT | |
| `account_type` | `account_type` default `user` | `org_owner` tiene acceso a gestión de concursos |
| `first_name`, `last_name` | TEXT | |
| `dni` | TEXT | |
| `country` | TEXT | |
| `phone` | TEXT | |
| `birthdate` | DATE | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**RLS:** Cada usuario solo lee/escribe su propio perfil

**Triggers:**
- `on_auth_user_created` → `handle_new_user()` — crea perfil automáticamente al registrarse
- `handle_profiles_updated_at`

---

### `judges`

Pool global de jueces (independiente de organización).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `full_name` | TEXT | |
| `email` | TEXT UNIQUE | |
| `specialty` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

---

### `judge_pool_members`

Vincula jueces del pool global con organizaciones específicas.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK `organizations` CASCADE | |
| `judge_id` | UUID FK `judges` CASCADE | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`organization_id`, `judge_id`)

**RLS:**
- Org owner y miembros del concurso pueden leer su pool
- Solo org owner puede escribir

---

### `categories`

Categorías dentro de un concurso (ej. "Junior", "Adulto", "Clásico").

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `contest_id` | UUID FK `contests` CASCADE | |
| `name` | TEXT | |
| `description` | TEXT | |
| `order` | INT default 0 | |
| `status` | `category_status` default `pending` | |
| `min_age`, `max_age` | INT | Límites de edad |
| `max_participants` | INT | NULL = sin límite |
| `artistic_type`, `speciality` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Indexes:** `contest_id_idx`

**RLS:**
- Miembros pueden leer
- Org owner puede escribir

---

### `rounds`

Ronda de competición dentro de una categoría.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `category_id` | UUID FK `categories` CASCADE | |
| `name` | TEXT | |
| `order` | INT default 0 | |
| `status` | `round_status` default `pending` | |
| `scoring_type` | `scoring_type` default `numeric` | |
| `max_score` | NUMERIC | |
| `next_round_id` | UUID FK `rounds` ON DELETE SET NULL | Para cadena de rondas |
| `is_final` | BOOL default false | UNIQUE por categoría |
| `is_ranking` | BOOL default false | UNIQUE por categoría |
| `is_published` | BOOL default false | Publicar ranking a participantes |
| `started_at`, `closed_at` | TIMESTAMPTZ | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Constraints:**
- UNIQUE(`category_id`) WHERE `is_final = true`
- UNIQUE(`category_id`) WHERE `is_ranking = true`

**Indexes:** `category_id_idx`

**RLS:**
- Miembros pueden leer
- Org owner puede escribir (sin referencias a sí misma en políticas para evitar recursión)

**Triggers:**
- `block_round_start_if_contest_not_active` — lanza error si se intenta activar y el concurso no está `active`

---

### `participants`

Participante inscrito en una categoría de un concurso.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `contest_id` | UUID FK `contests` CASCADE | |
| `category_id` | UUID FK `categories` CASCADE | |
| `user_id` | UUID FK `auth.users` ON DELETE SET NULL, nullable | NULL si inscrito por organizador |
| `name` | TEXT | Generado: `first_name || ' ' || last_name` |
| `first_name`, `last_name` | TEXT | |
| `dni` | TEXT | |
| `birthdate` | DATE | |
| `country` | TEXT | ISO alpha-2 o nombre en español (legacy) |
| `email` | TEXT | |
| `phone` | TEXT | E.164: `+34600...` |
| `status` | `participant_status` default `active` | |
| `payment_status` | `payment_status` default `free` | |
| `amount_paid_cents` | INT | |
| `amount_refunded_cents` | INT default 0 | |
| `stripe_payment_intent_id` | TEXT | |
| `stripe_checkout_session_id` | TEXT UNIQUE nullable | |
| `stripe_refund_id` | TEXT | |
| `refunded_at` | TIMESTAMPTZ | |
| `metadata` | JSONB | Respuestas a formulario custom |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Constraints de unicidad (deduplicación):**
- UNIQUE(`category_id`, `user_id`) WHERE `user_id IS NOT NULL AND status <> 'eliminated'`
- UNIQUE(`category_id`, `lower(dni)`) WHERE `dni IS NOT NULL AND status <> 'eliminated'`
- UNIQUE(`category_id`, `lower(email)`) WHERE `email IS NOT NULL AND status <> 'eliminated'`
- UNIQUE(`stripe_checkout_session_id`) WHERE NOT NULL

**Indexes:** `payment_intent_idx`, `contest_status_idx`, `category_status_idx`

**RLS:**
- Org owner y miembros del concurso pueden leer
- El propio participante (por `user_id`) puede leer su registro
- Org owner puede escribir

**Triggers:**
- `_participants_backfill_name` — genera `name` automáticamente al insertar/actualizar si `first_name` o `last_name` cambian
- `notify_participant_added` / `notify_org_participant_added` / `notify_org_participant_removed`

---

### `round_participants`

Vinculación de un participante con una ronda, incluyendo datos de programación.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `round_id` | UUID FK `rounds` CASCADE | |
| `participant_id` | UUID FK `participants` CASCADE | |
| `order` | INT | Orden de actuación |
| `is_qualified` | BOOL | |
| `scheduled_at` | TIMESTAMPTZ | |
| `location` | TEXT | |
| `rehearsal_room` | TEXT | |
| `rehearsal_time` | TEXT | datetime-local string |
| `rehearsal_accompanist` | TEXT | |
| `rehearsal_end_time` | TEXT | datetime-local string |
| `performance_time` | TEXT | datetime-local string |
| `performance_end_time` | TEXT | datetime-local string |
| `final_score_override` | NUMERIC | |
| `final_score_override_by` | UUID FK `auth.users` | |
| `final_score_override_at` | TIMESTAMPTZ | |
| `final_score_override_notes` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`round_id`, `participant_id`)

**Indexes:** `round_id_idx`, `participant_id_idx`

**Nota:** Los campos `*_time` son TEXT (no TIMESTAMP) para preservar el valor datetime-local del formulario sin conversión de zona horaria.

---

### `score_criteria`

Criterios de evaluación ponderados para una ronda.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `round_id` | UUID FK `rounds` CASCADE | |
| `name` | TEXT | Ej: "Técnica", "Expresión" |
| `weight` | NUMERIC default 1.0 | |
| `max_value` | NUMERIC default 10.0 | |
| `order` | INT default 0 | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

---

### `scores`

Puntuación de un juez a un participante en una ronda. Único por `(round, participant, judge)`.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `round_id` | UUID FK `rounds` CASCADE | |
| `participant_id` | UUID FK `participants` CASCADE | |
| `judge_id` | UUID FK `auth.users` CASCADE | |
| `value` | NUMERIC | Puntuación total |
| `promote` | BOOL default false | Marca de promoción del juez |
| `criteria_scores` | JSONB | Detalle por criterio |
| `notes` | TEXT | |
| `submitted_at` | TIMESTAMPTZ | |
| `set_by_admin` | BOOL default false | |
| `admin_user_id` | UUID FK `auth.users` | Quién hizo el override |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`round_id`, `participant_id`, `judge_id`)

**RLS:**
- Juez puede leer/escribir sus propias puntuaciones
- Org owner puede leer todas (sin política recursiva)

**Replica Identity:** FULL — requerido para actualizaciones en tiempo real via Supabase Realtime.

---

### `prizes`

Premios de una categoría, opcionalmente asignados a un participante ganador.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `category_id` | UUID FK `categories` CASCADE | |
| `description` | TEXT | |
| `winner_id` | UUID FK `participants` ON DELETE SET NULL | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

---

### `rehearsals`

Ensayos programados (separados de `round_participants` para mayor flexibilidad).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `round_id` | UUID FK `rounds` CASCADE | |
| `participant_id` | UUID FK `participants` CASCADE | |
| `accompanist_id` | UUID FK `auth.users` ON DELETE SET NULL, nullable | |
| `scheduled_at` | TIMESTAMPTZ | |
| `location` | TEXT | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

---

### `score_audit_logs`

Historial inmutable de cambios en puntuaciones.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `round_id` | UUID FK `rounds` CASCADE | |
| `participant_id` | UUID FK `participants` CASCADE | |
| `judge_id` | UUID FK `auth.users`, nullable | |
| `changed_by` | UUID FK `auth.users` | |
| `changed_by_name` | TEXT | Email del actor |
| `action` | TEXT | `score_set` \| `score_updated` |
| `old_value` | NUMERIC | |
| `new_value` | NUMERIC | |
| `notes` | TEXT | |
| `is_admin_action` | BOOL default false | |
| `created_at` | TIMESTAMPTZ | |

**Indexes:** `round_idx`, `participant_idx`

**RLS:** Solo org owner puede leer. Solo service_role puede insertar.

---

### `billing_transactions`

Ledger de todas las operaciones de tickets y activaciones.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK `organizations` CASCADE | |
| `entity` | TEXT CHECK(`ticket` \| `activation`) | |
| `delta` | INT | Positivo (crédito) o negativo (débito) |
| `reason` | TEXT | Ver valores abajo |
| `plan` | TEXT CHECK(`starter` \| `pro` \| `enterprise`), nullable | |
| `amount_cents` | INT | 0 para débitos |
| `stripe_session_id` | TEXT | |
| `stripe_event_id` | TEXT UNIQUE nullable | Para idempotencia |
| `participant_id` | UUID FK `participants` ON DELETE SET NULL | |
| `contest_id` | UUID FK `contests` ON DELETE SET NULL | |
| `balance_after` | INT | Balance tras la operación |
| `created_at` | TIMESTAMPTZ | |

**Valores de `reason`:** `purchase_bundle`, `purchase_tickets`, `purchase_activations`, `signup_bonus`, `enrollment`, `csv_import`, `manual_add`, `contest_activation`, `admin_adjust`, `refund_ticket`

**Indexes:** `org_idx` (`organization_id, created_at DESC`), `contest_idx`

**RLS:** Org owner puede leer sus propias transacciones.

---

### `notifications`

Notificaciones in-app por usuario.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK `auth.users` CASCADE | |
| `type` | TEXT | Ver tipos abajo |
| `title` | TEXT | |
| `body` | TEXT | |
| `payload` | JSONB default `{}` | Datos extra (contest_slug, etc.) |
| `read` | BOOL default false | |
| `created_at` | TIMESTAMPTZ | |

**Tipos de notificación:** `contest_joined`, `judge_assigned`, `org_participant_enrolled`, `org_participant_unenrolled`, `schedule_assigned`, `promoted`, `not_promoted`, `contest_started`, `score_published`, `ranking_published`

**Indexes:** `user_id_idx`, `read_idx` (`user_id, read`)

**RLS:** Cada usuario solo lee sus propias notificaciones. Solo service_role puede insertar.

---

### `inscription_form_schemas`

Esquemas de formulario personalizado para inscripción en un concurso.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `contest_id` | UUID FK `contests` CASCADE | |
| `version` | INT default 1 | |
| `is_published` | BOOL default false | |
| `schema_json` | JSONB default `[]` | Array de field definitions |
| `published_at` | TIMESTAMPTZ | |
| `created_at`, `updated_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`contest_id`, `version`)

**RLS:**
- Formularios publicados son legibles por todos
- Org owner gestiona todos los formularios del concurso

---

### `participant_form_responses`

Respuestas al formulario personalizado de inscripción.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `participant_id` | UUID FK `participants` CASCADE | |
| `form_schema_id` | UUID FK `inscription_form_schemas` ON DELETE RESTRICT | |
| `responses_json` | JSONB default `{}` | |
| `created_at` | TIMESTAMPTZ | |

**Constraints:** UNIQUE(`participant_id`, `form_schema_id`)

**RLS:**
- Participante puede leer sus propias respuestas
- Org owner puede leer respuestas de participantes de sus concursos

---

### `processed_stripe_events`

Tabla de idempotencia para webhooks de Stripe.

| Columna | Tipo | Notas |
|---|---|---|
| `stripe_event_id` | TEXT PK | `evt_...` |
| `event_type` | TEXT | `checkout.session.completed`, etc. |
| `processed_at` | TIMESTAMPTZ | |

**RLS:** Solo service_role puede leer/escribir.

**Uso:** Antes de procesar un webhook, se intenta insertar con `ON CONFLICT DO NOTHING`. Si 0 filas insertadas → evento ya procesado → skip.

---

### `email_logs`

Registro de todos los emails transaccionales enviados.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | UUID PK | |
| `to_address` | TEXT | |
| `template` | TEXT | Nombre del template |
| `subject` | TEXT | |
| `payload` | JSONB default `{}` | Variables usadas |
| `status` | TEXT default `pending` | `pending`, `sent`, `failed` |
| `provider_message_id` | TEXT | ID de Resend |
| `error` | TEXT | |
| `sent_at` | TIMESTAMPTZ | |
| `created_at` | TIMESTAMPTZ | |

**Indexes:** `to_address_idx`, `template_idx`, `status_idx`, `created_at_idx`

**RLS:** Solo service_role puede leer/escribir.

---

## Funciones y RPCs

### Inscripción

#### `enroll_participant(p_token, p_category_id, p_first_name, p_last_name, p_birthdate, p_dni, p_country, p_email, p_phone) → UUID`

Inscripción gratuita. SECURITY DEFINER.

Validaciones internas:
1. Verifica `auth.uid()` (requiere autenticación)
2. Busca concurso por token → `registration_open` y `status = draft|active`
3. Valida edad (`min_age`, `max_age`)
4. Verifica `max_participants` no excedido
5. Verifica que el usuario no sea juez en el concurso
6. Llama a `consume_ticket(org_id, participant_id, contest_id, 'enrollment')`
7. Retorna `participant.id`

Errores por mensaje: `auth_required`, `contest_not_found`, `registration_closed`, `category_not_found`, `age_below_min`, `age_above_max`, `category_full`, `insufficient_tickets`, `already_enrolled_in_category`, `user_is_judge_in_contest`, `contest_active`

---

#### `enroll_participant_paid(p_user_id, p_token, p_category_id, ...) → UUID`

Inscripción de pago. Llamada desde el webhook de Stripe tras `checkout.session.completed`. SECURITY DEFINER.

Mismas validaciones que `enroll_participant` pero sin consumir ticket (el pago es la cobertura).

---

#### `bulk_enroll_csv(p_contest_id UUID, p_rows JSONB) → JSONB`

Importación masiva. SECURITY DEFINER.

Retorna `{ imported: N, skipped: N, errors: [...] }`. Consume 1 ticket por fila importada exitosamente.

---

### Billing

#### `consume_ticket(p_org_id, p_participant_id, p_contest_id, p_reason) → INT`

Debita 1 ticket del balance de la organización. Atómico. Lanza error si balance < 1.

Retorna el nuevo balance.

---

#### `consume_activation(p_org_id, p_contest_id) → INT`

Debita 1 activación al cambiar un concurso a `active`. Atómico.

---

#### `credit_bundle(p_org_id, p_plan, p_stripe_session_id, p_stripe_event_id) → VOID`

Acredita tickets + activaciones según el plan comprado. Idempotente via `stripe_event_id`.

| Plan | Tickets | Activaciones |
|---|---|---|
| starter | 50 | 1 |
| pro | 200 | 3 |
| enterprise | 1000 | 10 |

---

#### `credit_tickets(p_org_id, p_quantity, p_price_cents, p_stripe_session_id, p_stripe_event_id) → INT`

Acredita tickets individuales. Idempotente.

---

#### `credit_activations(p_org_id, p_quantity, p_price_cents, p_stripe_session_id, p_stripe_event_id) → INT`

Acredita activaciones individuales. Idempotente.

---

#### `refund_ticket(p_org_id, p_participant_id, p_contest_id) → INT`

Devuelve 1 ticket al cancelar una inscripción gratuita.

---

#### `get_plan_bundles() → TABLE(plan, tickets, activations, price_cents)`

Precios actuales:

| plan | tickets | activations | price_cents |
|---|---|---|---|
| starter | 50 | 1 | 9000 (€90) |
| pro | 200 | 3 | 28000 (€280) |
| enterprise | 1000 | 10 | 105000 (€1050) |

---

### Funciones Públicas (sin autenticación)

#### `get_contest_by_token(p_token TEXT)`

Retorna contest + entry_fee + estado de cobros de la org. Usado en `/join/[token]`.

#### `get_categories_for_token(p_token TEXT)`

Retorna categorías con `current_count` de inscritos activos.

#### `get_public_contest_by_slug(p_slug TEXT)`

Retorna concursos `active` o `finished` con datos de la org. Usado en `/c/[slug]`.

#### `get_public_categories_by_slug(p_slug TEXT)`

Retorna categorías para concursos públicos.

---

### Formularios

#### `get_inscription_form_schema(p_contest_id UUID) → JSONB`

Retorna el `schema_json` del formulario publicado del concurso.

#### `validate_form_response(p_schema_json JSONB, p_responses_json JSONB) → TABLE(field_name, is_valid, error)`

Valida respuestas campo a campo contra el schema.

---

### Helpers de Autorización

#### `is_contest_organizer(p_contest_id UUID) → BOOL`

Verdadero si `auth.uid()` es org owner O tiene rol `organizer` en el concurso. SECURITY DEFINER.

#### `is_contest_member(p_contest_id UUID) → BOOL`

Verdadero si `auth.uid()` es org owner O miembro del concurso (cualquier rol). SECURITY DEFINER.

---

## Flujos de Enrollment

### Inscripción gratuita

```
Usuario → POST /public/inscriptions/:token/enroll
  → requireAuth
  → validación Zod (EnrollBodySchema)
  → enroll_participant(token, ...) [RPC SECURITY DEFINER]
    → verifica auth, concurso, edad, cupo, jurado
    → INSERT participants
    → consume_ticket (INSERT billing_transactions, UPDATE organizations.ticket_balance)
  ← { participant_id }
  → sendEnrollmentEmail (fire-and-forget)
```

### Inscripción de pago

```
Usuario → POST /public/inscriptions/:token/checkout
  → requireAuth
  → validación Zod
  → stripe.checkout.sessions.create (destination charge)
  ← { url, id }

  [Usuario paga en Stripe]

Stripe → POST /api/stripe/webhook
  → verifica firma
  → INSERT processed_stripe_events ON CONFLICT DO NOTHING (idempotencia)
  → enroll_participant_paid(user_id, token, ...)
  → sendEnrollmentEmail
```

### Importación CSV

```
Org owner → POST /api/contests/:id/participants/import
  → requireOrgOwnerOrMember
  → validación de filas
  → bulk_enroll_csv(contest_id, rows)
    → por cada fila: INSERT participant + consume_ticket
  ← { imported, skipped, errors }
```

---

## Sistema de Billing

### Modelo de créditos

| Crédito | Cuándo se consume | Cuándo se acredita |
|---|---|---|
| **Ticket** | 1 por participante inscrito (gratis o CSV) | Al comprar plan/top-up |
| **Activación** | 1 al activar un concurso (`status → active`) | Al comprar plan/top-up |

### Bundles via Stripe

Flujo: usuario → `/api/billing/checkout` → Stripe Checkout → webhook → `credit_bundle`.

### Top-ups individuales

- Tickets: €1/ud, máx 500 por compra
- Activaciones: €50/ud, máx 50 por compra

### Cobros a participantes (Stripe Connect)

Destination charges: el pago va al `stripe_account_id` de la organización menos la comisión de la plataforma (`PLATFORM_FEE_BPS`, default 500 = 5%).

---

## Storage

| Bucket | Acceso | Uso |
|---|---|---|
| `org_logos` | Público lectura, autenticado upload | Logos de organización |
