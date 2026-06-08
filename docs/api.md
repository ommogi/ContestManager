# API Reference — ContestSaaS

Stack: Nuxt 4 / Nitro · Supabase Auth · Zod validation · h3

---

## Autenticación

Todos los endpoints protegidos requieren un JWT de Supabase en el header:

```
Authorization: Bearer <supabase_jwt>
```

El token se obtiene en el cliente con `supabase.auth.getSession()`.

### Helpers de servidor (`server/utils/supabase.ts`)

| Helper | Descripción |
|---|---|
| `requireAuth(event)` | Lanza 401 si no hay token válido. Devuelve `{ id, email }`. |
| `requireOrgOwner(event)` | Requiere ser owner de una organización. Devuelve `{ user, org }`. |
| `requireOrgOwnerOrMember(event, contestId)` | Requiere ser owner de la org **o** miembro del concurso. Devuelve `{ user, org?, member? }`. |
| `serverSupabaseAdmin()` | Cliente Supabase con service role (bypass RLS). Solo para operaciones internas con ownership verificado. |
| `serverSupabaseUser(event)` | Cliente Supabase con JWT del usuario (respeta RLS). |

---

## Rate Limiting

Middleware en `server/middleware/rate-limit.ts`. Ventana deslizante de 1 minuto.

| Ruta | Límite | Key |
|---|---|---|
| `/api/stripe/webhook` | 60 req/min | IP |
| `/api/auth/*` | 20 req/min | user_id o IP |
| `/api/public/*` | 30 req/min | user_id o IP |
| `/api/billing/*` | 10 req/min | user_id o IP |
| `*/refund` o `*/cancel` | 10 req/min | user_id o IP |
| Resto de `/api/*` | 120 req/min | user_id o IP |

En caso de exceder el límite: `429 Too Many Requests`.

---

## Validación

Los endpoints usan `zod` + `readBody` + `safeParse`. Schemas compartidos en `server/utils/schemas.ts`.

Error de validación:
```json
{ "statusCode": 400, "statusMessage": "Invalid request", "data": [{ "code": "...", "path": [...], "message": "..." }] }
```

---

## Códigos de Error Estándar

| Código | Significado |
|---|---|
| 400 | Validación fallida o regla de negocio inválida |
| 401 | No autenticado (falta o token inválido) |
| 402 | Balance insuficiente (tickets/activaciones) |
| 403 | Sin permisos (no es owner/miembro) |
| 404 | Recurso no encontrado |
| 409 | Conflicto (ya inscrito, slug duplicado, etc.) |
| 429 | Rate limit excedido |
| 500 | Error interno de DB o servicio externo |

---

## Endpoints

---

### Account

#### `DELETE /api/account`

Elimina la cuenta del usuario autenticado y todos sus datos.

**Auth:** `requireAuth`

**Response `200`:**
```json
{ "success": true }
```

**Errores:** `401`

---

### Auth

#### `POST /api/auth/welcome`

Envía el email de bienvenida al usuario autenticado.

**Auth:** `requireAuth`

**Body:**
```json
{
  "email": "string (email, requerido)",
  "first_name": "string | null (opcional)",
  "marketing_consent": "boolean (opcional, default false)"
}
```

**Restricción:** Solo se puede enviar al propio email del usuario autenticado.

**Response `200`:**
```json
{ "success": true, "message": "Welcome email queued", "result": { "sent": true, "id": "..." } }
```

**Errores:** `400` (validación), `401`, `403` (email no coincide con el propio)

---

### Billing

#### `GET /api/billing/balance`

Devuelve el balance de tickets y activaciones de la organización.

**Auth:** `requireOrgOwner`

**Response `200`:**
```json
{
  "ticket_balance": 45,
  "activation_balance": 2
}
```

**Errores:** `401`, `403`

---

#### `GET /api/billing/plans`

Lista los planes disponibles con precios actuales. Endpoint público.

**Auth:** ninguna

**Response `200`:**
```json
[
  { "plan": "starter", "tickets": 50, "activations": 1, "price_cents": 9000 },
  { "plan": "pro", "tickets": 200, "activations": 3, "price_cents": 28000 },
  { "plan": "enterprise", "tickets": 1000, "activations": 10, "price_cents": 105000 }
]
```

---

#### `POST /api/billing/checkout`

Crea una sesión de Stripe Checkout para comprar un bundle de plan.

**Auth:** `requireOrgOwner`

**Body:**
```json
{ "plan": "starter | pro | enterprise" }
```

**Response `200`:**
```json
{ "url": "https://checkout.stripe.com/...", "id": "cs_..." }
```

**Errores:** `400` (plan inválido), `401`, `403`, `500`

---

#### `POST /api/billing/checkout-tickets`

Crea sesión de Stripe para comprar tickets adicionales (€1/ticket, máx 500).

**Auth:** `requireOrgOwner`

**Body:**
```json
{
  "quantity": "number (entero, 1-500, requerido)",
  "return_path": "string (path interno, opcional, default '/billing')"
}
```

**Response `200`:**
```json
{ "url": "https://checkout.stripe.com/...", "id": "cs_...", "quantity": 10, "unit_cents": 100 }
```

**Errores:** `400` (cantidad inválida), `401`, `403`

---

#### `POST /api/billing/checkout-activations`

Crea sesión de Stripe para comprar activaciones adicionales (€50/activación, máx 50).

**Auth:** `requireOrgOwner`

**Body:**
```json
{
  "quantity": "number (entero, 1-50, requerido)",
  "return_path": "string (path interno, opcional, default '/billing')"
}
```

**Response `200`:**
```json
{ "url": "https://checkout.stripe.com/...", "id": "cs_...", "quantity": 2, "unit_cents": 5000 }
```

**Errores:** `400`, `401`, `403`

---

#### `POST /api/billing/connect/onboard`

Inicia el flujo de onboarding de Stripe Connect para la organización.

**Auth:** `requireOrgOwner`

**Response `200`:**
```json
{ "url": "https://connect.stripe.com/..." }
```

**Errores:** `401`, `403`, `500`

---

#### `GET /api/billing/connect/status`

Verifica el estado del onboarding de Stripe Connect.

**Auth:** `requireOrgOwner`

**Response `200`:**
```json
{
  "connected": true,
  "charges_enabled": true,
  "payouts_enabled": false,
  "onboarding_done": true
}
```

**Errores:** `401`, `403`

---

### Calendar

#### `GET /api/calendar`

Devuelve eventos del calendario (ensayos, actuaciones) del usuario autenticado para el período solicitado.

**Auth:** `requireAuth`

**Query params:** `from` (ISO date), `to` (ISO date)

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "type": "rehearsal | performance",
    "participant_id": "uuid",
    "participant_name": "string",
    "contest_name": "string",
    "category_name": "string",
    "round_name": "string",
    "scheduled_at": "datetime-local string",
    "location": "string | null"
  }
]
```

**Errores:** `401`

---

### Categories

#### `GET /api/categories/:id/ranking`

Devuelve el ranking de participantes en una categoría.

**Auth:** `requireOrgOwnerOrMember(contestId)`

**Response `200`:**
```json
[
  {
    "participant_id": "uuid",
    "name": "string",
    "total_score": 8.5,
    "scores_count": 3,
    "rank": 1
  }
]
```

**Errores:** `401`, `403`, `404`

---

#### `GET /api/categories/:id/rounds`

Lista todas las rondas de una categoría.

**Auth:** `requireOrgOwnerOrMember(contestId)`

**Response `200`:** Array de objetos `Round` con `id, name, status, order, scoring_type, is_final`.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/categories/:id/rounds`

Crea una nueva ronda en la categoría.

**Auth:** `requireOrgOwnerOrMember(contestId)`

**Body:**
```json
{
  "name": "string (requerido)",
  "status": "pending | active | closed (requerido)",
  "scoring_type": "numeric | rank | vote (opcional)",
  "max_score": "number (opcional)",
  "is_final": "boolean (opcional)",
  "is_ranking": "boolean (opcional)"
}
```

**Restricción:** No se puede activar una ronda si el concurso no está `active`.

**Response `201`:** Objeto `Round` creado.

**Errores:** `400` (concurso no activo), `401`, `403`, `404`

---

#### `GET /api/categories/:id/participants/:pid/history`

Historial de puntuaciones de un participante en todos los rounds de la categoría.

**Auth:** `requireOrgOwnerOrMember(contestId)`

**Response `200`:**
```json
[
  { "round_id": "uuid", "round_name": "string", "value": 8.5, "submitted_at": "ISO string" }
]
```

**Errores:** `401`, `403`, `404`

---

#### `PATCH /api/categories/:id`

Actualiza una categoría.

**Auth:** `requireOrgOwnerOrMember(contestId)`

**Body (campos permitidos):**
```json
{
  "name": "string",
  "description": "string | null",
  "order": "number",
  "status": "pending | active | closed",
  "min_age": "number | null",
  "max_age": "number | null",
  "max_participants": "number | null",
  "artistic_type": "string | null",
  "speciality": "string | null"
}
```

**Response `200`:** Categoría actualizada.

**Errores:** `400`, `401`, `403`, `404`

---

#### `DELETE /api/categories/:id`

Elimina una categoría (cascade: rounds, participants, scores).

**Auth:** `requireOrgOwnerOrMember(contestId)`

**Response `200`:** `{ "success": true }`

**Errores:** `401`, `403`, `404`

---

### Contests

#### `GET /api/contests`

Lista todos los concursos de la organización del usuario.

**Auth:** `requireOrgOwner`

**Response `200`:**
```json
[
  {
    "id": "uuid", "name": "string", "slug": "string",
    "status": "draft | active | finished | cancelled",
    "type": "music | dance | general | libre",
    "starts_at": "ISO string | null", "ends_at": "ISO string | null",
    "registration_open": true, "entry_fee_cents": 0,
    "created_at": "ISO string"
  }
]
```

**Errores:** `401`, `403`

---

#### `POST /api/contests`

Crea un nuevo concurso.

**Auth:** `requireOrgOwner`

**Body:**
```json
{
  "name": "string (requerido, min 1)",
  "short_description": "string | null",
  "prizes": "string | null",
  "rules": "string | null",
  "starts_at": "ISO date string | null",
  "ends_at": "ISO date string | null",
  "is_rounds_dynamic": "boolean (default false)",
  "mode": "standard | tournament (default standard)"
}
```

**Notas:** Genera automáticamente `registration_token` y `slug` a partir del nombre.

**Response `201`:** Objeto del concurso creado incluyendo `registration_token`.

**Errores:** `400` (nombre duplicado → slug collision), `401`, `403`

---

#### `GET /api/contests/:id`

Devuelve un concurso por ID o slug.

**Auth:** `requireOrgOwner`

**Response `200`:** Objeto completo del concurso.

**Errores:** `401`, `403`, `404`

---

#### `PATCH /api/contests/:id`

Actualiza un concurso. Cuando `status` cambia a `active`, envía emails a todos los participantes inscritos.

**Auth:** `requireOrgOwner`

**Body (campos permitidos):**
```json
{
  "name": "string",
  "slug": "string",
  "description": "string | null",
  "type": "music | dance | general | libre",
  "status": "draft | active | finished | cancelled",
  "is_rounds_dynamic": "boolean",
  "starts_at": "ISO string | null",
  "ends_at": "ISO string | null",
  "settings": "object | null",
  "cover_image_url": "string | null",
  "rules": "string | null",
  "entry_fee_cents": "number (> 0)",
  "registration_open": "boolean"
}
```

**Restricciones:** No se puede volver de `active` a `draft`. Concursos cerrados no admiten edición de participantes.

**Response `200`:** Concurso actualizado.

**Errores:** `400` (transición inválida), `401`, `403`, `404`

---

#### `DELETE /api/contests/:id`

Elimina un concurso (cascade completo).

**Auth:** `requireOrgOwner`

**Response `200`:** `{ "success": true }`

**Errores:** `401`, `403`, `404`

---

#### `GET /api/contests/:id/stats`

Estadísticas del concurso (participantes, inscripciones, puntuaciones).

**Auth:** `requireOrgOwner`

**Response `200`:**
```json
{
  "total_participants": 42,
  "total_categories": 5,
  "total_rounds": 8,
  "paid_participants": 12,
  "revenue_cents": 60000
}
```

**Errores:** `401`, `403`, `404`

---

#### `GET /api/contests/:id/categories`

Lista categorías del concurso.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** Array de categorías con `id, name, status, min_age, max_age, max_participants, order`.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/contests/:id/categories`

Crea una categoría en el concurso.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "name": "string (requerido)",
  "description": "string | null",
  "order": "number",
  "min_age": "number | null",
  "max_age": "number | null",
  "max_participants": "number | null",
  "artistic_type": "string | null",
  "speciality": "string | null"
}
```

**Response `201`:** Categoría creada.

**Errores:** `401`, `403`, `404`

---

#### `GET /api/contests/:id/rounds`

Lista todas las rondas del concurso (todas las categorías).

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** Array de rondas con `id, name, status, category_id, category_name`.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/contests/:id/rounds`

Crea una ronda asociada a una categoría del concurso.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "category_id": "uuid (requerido)",
  "name": "string",
  "status": "pending | active | closed",
  "scoring_type": "numeric | rank | vote"
}
```

**Response `201`:** Ronda creada.

**Errores:** `400`, `401`, `403`, `404`

---

#### `GET /api/contests/:id/participants`

Lista participantes del concurso.

**Auth:** `requireOrgOwnerOrMember`

**Query params:** `category_id` (uuid, opcional para filtrar)

**Response `200`:** Array de participantes con `id, name, first_name, last_name, email, status, payment_status, category_id`.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/contests/:id/participants`

Añade un participante manualmente al concurso.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "category_id": "uuid (requerido)",
  "first_name": "string (requerido)",
  "last_name": "string (requerido)",
  "email": "string | null",
  "dni": "string | null",
  "birthdate": "YYYY-MM-DD | null",
  "country": "string | null",
  "phone": "string | null"
}
```

**Notas:** Consume 1 ticket del balance de la organización.

**Response `201`:** Participante creado.

**Errores:** `402` (sin tickets), `401`, `403`, `404`

---

#### `POST /api/contests/:id/participants/import`

Importación masiva de participantes desde CSV.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "rows": [
    {
      "category_id": "uuid",
      "first_name": "string",
      "last_name": "string",
      "birthdate": "YYYY-MM-DD",
      "dni": "string | null",
      "country": "string | null",
      "email": "string | null",
      "phone": "string | null"
    }
  ]
}
```

**Notas:** Consume 1 ticket por fila válida. Deduplica por user_id/DNI/email dentro de la categoría.

**Response `200`:**
```json
{ "imported": 10, "skipped": 2, "errors": [] }
```

**Errores:** `402` (tickets insuficientes), `401`, `403`

---

#### `GET /api/contests/:id/members`

Lista miembros (jueces/organizadores) del concurso.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** Array con `id, full_name, email, role, user_id`.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/contests/:id/members`

Añade un miembro al concurso (juez o viewer).

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "email": "string (requerido si no hay user_id)",
  "user_id": "uuid (requerido si no hay email)",
  "role": "judge | viewer | organizer (default viewer)",
  "full_name": "string"
}
```

**Restricciones:** Un participante no puede ser también jurado en el mismo concurso.

**Response `201`:** Miembro creado.

**Errores:** `400`, `401`, `403`, `409` (ya es participante)

---

#### `DELETE /api/contests/:id/members/:memberId`

Elimina un miembro del concurso.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** `{ "success": true }`

**Errores:** `401`, `403`, `404`

---

#### `GET /api/contests/:id/form-schema`

Obtiene el esquema del formulario de inscripción personalizado.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:**
```json
{
  "id": "uuid",
  "version": 1,
  "is_published": true,
  "schema_json": [{ "type": "text", "name": "campo", "label": "Label", "required": true }]
}
```

**Errores:** `401`, `403`, `404`

---

#### `POST /api/contests/:id/form-schema`

Crea o actualiza el esquema del formulario de inscripción.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "fields": [{ "type": "text|select|date", "name": "string", "label": "string", "required": boolean }],
  "isPublished": "boolean (opcional)"
}
```

**Response `200`:** Schema guardado.

**Errores:** `400` (campos inválidos), `401`, `403`

---

#### `POST /api/contests/:id/form-schema.publish`

Publica el formulario de inscripción (lo hace visible en el formulario público).

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** `{ "success": true, "published_at": "ISO string" }`

**Errores:** `401`, `403`, `404`

---

### Health

#### `GET /api/health`

Health check del servidor. No requiere auth.

**Response `200`:**
```json
{ "status": "ok", "timestamp": "ISO string" }
```

---

### Organizations

#### `GET /api/organizations`

Lista las organizaciones del usuario autenticado (solo las propias).

**Auth:** `requireAuth`

**Response `200`:** Array de organizaciones con `id, name, slug, logo_url, ticket_balance, activation_balance`.

**Errores:** `401`

---

#### `GET /api/organizations/:orgId`

Detalles de una organización específica.

**Auth:** `requireOrgOwner`

**Response `200`:** Organización completa incluyendo configuración de Stripe.

**Errores:** `401`, `403`, `404`

---

#### `GET /api/organizations/:orgId/judge-pool`

Lista el pool de jueces de la organización.

**Auth:** `requireOrgOwner`

**Response `200`:** Array con `id, full_name, email, specialty`.

**Errores:** `401`, `403`

---

#### `POST /api/organizations/:orgId/judge-pool`

Añade un juez al pool de la organización.

**Auth:** `requireOrgOwner`

**Body:**
```json
{
  "full_name": "string (requerido, max 200)",
  "email": "string (email válido, requerido)",
  "specialty": "string | null"
}
```

**Response `201`:** Juez creado/vinculado.

**Errores:** `400`, `401`, `403`, `409` (email ya existe en el pool)

---

#### `DELETE /api/organizations/:orgId/judge-pool/:judgeId`

Elimina un juez del pool.

**Auth:** `requireOrgOwner`

**Response `200`:** `{ "success": true }`

**Errores:** `401`, `403`, `404`

---

### Participants

#### `PATCH /api/participants/:id`

Actualiza datos de un participante.

**Auth:** `requireOrgOwnerOrMember`

**Body (campos permitidos):**
```json
{
  "name": "string",
  "first_name": "string",
  "last_name": "string",
  "birthdate": "YYYY-MM-DD",
  "dni": "string | null",
  "country": "string | null",
  "email": "string | null",
  "phone": "string | null",
  "metadata": "object | null",
  "status": "active | eliminated"
}
```

**Response `200`:** Participante actualizado.

**Errores:** `400`, `401`, `403`, `404`

---

#### `DELETE /api/participants/:id`

Elimina un participante.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** `{ "success": true }`

**Errores:** `401`, `403`, `404`

---

#### `POST /api/participants/:id/cancel`

Cancela la inscripción de un participante (cambia status a `eliminated`).

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** `{ "success": true, "ticket_refunded": true }`

**Errores:** `401`, `403`, `404`

---

#### `POST /api/participants/:id/refund`

Emite un reembolso de Stripe para un participante de pago.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "amount_cents": "number (entero positivo, opcional — default reembolso total)",
  "reverse_transfer": "boolean (default true)"
}
```

**Response `200`:**
```json
{ "refund_id": "re_...", "amount_cents": 1500, "status": "succeeded" }
```

**Errores:** `400` (no tiene pago asociado), `401`, `403`, `404`, `500` (error Stripe)

---

#### `GET /api/participants/:id/receipt`

Obtiene el recibo de pago de un participante.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:**
```json
{
  "participant_id": "uuid",
  "amount_paid_cents": 1500,
  "payment_status": "paid",
  "stripe_payment_intent_id": "pi_...",
  "paid_at": "ISO string"
}
```

**Errores:** `401`, `403`, `404`

---

### Profiles

#### `GET /api/profiles/:id`

Devuelve el perfil público de un usuario.

**Auth:** `requireAuth`

**Response `200`:**
```json
{
  "id": "uuid",
  "full_name": "string",
  "avatar_url": "string | null",
  "account_type": "org_owner | user"
}
```

**Errores:** `401`, `404`

---

### Public (sin autenticación)

#### `GET /api/public/contests/:slug`

Vista pública de un concurso activo por slug.

**Auth:** ninguna

**Response `200`:**
```json
{
  "id": "uuid", "name": "string", "slug": "string",
  "description": "string | null", "cover_image_url": "string | null",
  "rules": "string | null", "type": "string",
  "entry_fee_cents": 0, "starts_at": "ISO string",
  "organization": { "name": "string", "logo_url": "string | null" }
}
```

**Errores:** `404` (no existe o es `draft`)

---

#### `GET /api/public/inscriptions/:token`

Información del formulario de inscripción por token.

**Auth:** ninguna

**Response `200`:**
```json
{
  "contest": {
    "id": "uuid", "name": "string", "slug": "string",
    "registration_open": true, "entry_fee_cents": 0,
    "rules": "string | null",
    "org_charges_enabled": true
  },
  "categories": [
    { "id": "uuid", "name": "string", "current_count": 5, "max_participants": 20 }
  ],
  "form_schema": [{ "type": "text", "name": "campo", "label": "Label", "required": true }]
}
```

**Errores:** `404`

---

#### `GET /api/public/inscriptions/:token/confirm`

Confirma una inscripción de pago tras el checkout de Stripe.

**Auth:** ninguna

**Query params:** `session_id` (Stripe checkout session ID)

**Response `200`:**
```json
{
  "participant_id": "uuid",
  "name": "string",
  "contest_name": "string",
  "category_name": "string",
  "amount_paid_cents": 1500
}
```

**Errores:** `404`, `409`

---

#### `POST /api/public/inscriptions/:token/enroll`

Inscripción gratuita en una categoría. El usuario debe estar autenticado.

**Auth:** `requireAuth`

**Body:**
```json
{
  "category_id": "uuid (requerido)",
  "first_name": "string (requerido, max 100)",
  "last_name": "string (requerido, max 100)",
  "birthdate": "YYYY-MM-DD (requerido)",
  "dni": "string | null (8-20 chars)",
  "country": "string | null",
  "email": "string | null (email válido)",
  "phone": "string | null (E.164: +34600...)"
}
```

**Errores:**
- `400` validación / inscripciones cerradas / edad no cumplida / categoría llena
- `401` no autenticado
- `402` organización sin tickets
- `409` ya inscrito en la categoría / es jurado en el concurso
- `500` error interno

**Response `200`:**
```json
{ "participant_id": "uuid" }
```

---

#### `POST /api/public/inscriptions/:token/checkout`

Crea sesión de Stripe para inscripción de pago (destination charge a la organización).

**Auth:** `requireAuth`

**Body:** (igual que `/enroll`)

**Response `200`:**
```json
{ "url": "https://checkout.stripe.com/...", "id": "cs_..." }
```

**Errores:** `400`, `401`, `404`, `409`

---

### Round Participants

#### `PATCH /api/round-participants/:id`

Actualiza los datos de programación de un participante en una ronda.

**Auth:** `requireOrgOwnerOrMember`

**Body (campos permitidos):**
```json
{
  "rehearsal_room": "string | null",
  "rehearsal_time": "string | null (datetime-local)",
  "rehearsal_accompanist": "string | null",
  "performance_time": "string | null (datetime-local)"
}
```

**Response `200`:** Round participant actualizado.

**Errores:** `401`, `403`, `404`

---

#### `PATCH /api/round-participants/:id/override`

Override administrativo de la puntuación final de un participante en una ronda.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "final_score_override": "number | null",
  "final_score_override_notes": "string | null"
}
```

**Response `200`:** Round participant con override aplicado.

**Errores:** `401`, `403`, `404`

---

### Rounds

#### `GET /api/rounds/:id/participants`

Lista los participantes de una ronda con sus tiempos y estado.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** Array de round_participants con datos del participante enlazados.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/rounds/:id/participants/bulk`

Asigna múltiples participantes a una ronda de una vez.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{ "participantIds": ["uuid", "uuid", ...] }
```

**Response `200`:**
```json
{ "inserted": 5 }
```

**Errores:** `400`, `401`, `403`, `404`

---

#### `GET /api/rounds/:id/audit-logs`

Historial de cambios de puntuaciones en la ronda.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** Array de `score_audit_logs` ordenados por fecha.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/rounds/:id/promote`

Promueve participantes a la siguiente ronda o cierra la ronda como final.

**Auth:** `requireOrgOwnerOrMember`

**Body:**
```json
{
  "participantIds": ["uuid", ...],
  "nextRoundName": "string (opcional)",
  "isFinal": "boolean (default false)"
}
```

**Response `200`:**
```json
{ "promoted": 5, "next_round_id": "uuid | null" }
```

**Errores:** `400` (ronda ya cerrada), `401`, `403`, `404`

---

#### `GET /api/rounds/:id/scores/summary`

Resumen agregado de puntuaciones de la ronda (media, min, max por participante).

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** Array con puntuación media y conteo por participante, ordenado por score.

**Errores:** `401`, `403`, `404`

---

#### `PATCH /api/rounds/:id`

Actualiza una ronda (nombre, estado, configuración de scoring).

**Auth:** `requireOrgOwnerOrMember`

**Body (campos permitidos):**
```json
{
  "name": "string",
  "status": "pending | active | closed",
  "scoring_type": "numeric | rank | vote",
  "max_score": "number | null",
  "is_published": "boolean",
  "is_final": "boolean"
}
```

**Restricciones:** No se puede activar si el concurso no está `active`. Rondas cerradas solo se pueden reabrir con permisos explícitos.

**Response `200`:** Ronda actualizada.

**Errores:** `400`, `401`, `403`, `404`

---

#### `DELETE /api/rounds/:id`

Elimina una ronda.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** `{ "success": true }`

**Errores:** `401`, `403`, `404`

---

### Scores

#### `GET /api/scores/:roundId`

Devuelve todas las puntuaciones de una ronda.

**Auth:** `requireOrgOwnerOrMember`

**Response `200`:** Array de scores con `judge_id, participant_id, value, promote, notes, submitted_at, set_by_admin`.

**Errores:** `401`, `403`, `404`

---

#### `POST /api/scores`

Crea o actualiza la puntuación de un participante por un juez. Registra audit log.

**Auth:** `requireAuth`

**Body:**
```json
{
  "round_id": "uuid (requerido)",
  "participant_id": "uuid (requerido)",
  "judge_id": "uuid (requerido)",
  "value": "number (requerido)",
  "notes": "string | null (max 1000)",
  "promote": "boolean (default false)"
}
```

**Autorización avanzada:** Si `judge_id !== user.id`, requiere ser org owner del concurso (admin override). En ese caso, `set_by_admin = true`.

**Response `200`:** Score guardado con todos los campos.

**Errores:** `400` (validación), `401`, `403` (no es el juez ni el org owner), `404`

---

### Statistics

#### `GET /api/stats/organization`

Estadísticas globales de la organización (participantes, concursos, ingresos).

**Auth:** `requireOrgOwner`

**Response `200`:**
```json
{
  "total_contests": 12,
  "active_contests": 2,
  "total_participants": 340,
  "revenue_by_month": [{ "month": "2025-01", "amount_cents": 45000 }],
  "top_categories": [{ "name": "string", "count": 42 }]
}
```

**Errores:** `401`, `403`

---

### Stripe Webhook

#### `POST /api/stripe/webhook`

Recibe eventos de Stripe. Verifica firma con `STRIPE_WEBHOOK_SECRET`. Idempotente via `processed_stripe_events`.

**Auth:** ninguna (verificación por firma Stripe)

**Headers requeridos:** `stripe-signature`

**Eventos procesados:**

| Evento | Acción |
|---|---|
| `checkout.session.completed` (plan) | `credit_bundle` → acredita tickets + activaciones |
| `checkout.session.completed` (tickets) | `credit_tickets` → acredita tickets |
| `checkout.session.completed` (activations) | `credit_activations` → acredita activaciones |
| `checkout.session.completed` (enrollment) | `enroll_participant_paid` → inscribe participante |

**Response `200`:** Siempre devuelve 200 para errores de negocio no reintentables.

**Errores:** `400` (firma inválida)

---

### My Content

#### `GET /api/my/contests`

Lista los concursos en los que el usuario autenticado participa (como participante, juez u organizador).

**Auth:** `requireAuth`

**Response `200`:** Array de concursos con rol del usuario en cada uno.

**Errores:** `401`

---

#### `GET /api/my/contests/:slug`

Detalles de un concurso específico del usuario.

**Auth:** `requireAuth`

**Response `200`:** Concurso con categorías y estado de inscripción del usuario.

**Errores:** `401`, `404`

---

#### `GET /api/my/rounds/:id`

Datos de una ronda para el usuario autenticado (su horario, puntuaciones propias).

**Auth:** `requireAuth`

**Response `200`:** Datos de la ronda filtrados al usuario.

**Errores:** `401`, `404`

---

## Utilidades del Servidor

### `server/utils/supabase.ts`

```typescript
serverSupabaseAdmin(): SupabaseClient          // service_role, bypass RLS
serverSupabaseUser(event): SupabaseClient       // JWT del usuario, respeta RLS
requireAuth(event): SupabaseUser                // lanza 401 si no autenticado
requireOrgOwner(event): Promise<{ user, org }>  // lanza 403 si no es owner
requireOrgOwnerOrMember(event, contestId): Promise<{ user, org?, member? }>
```

### `server/utils/email.ts`

```typescript
sendWelcomeEmail(payload)            // Email de bienvenida tras registro
sendEnrollmentEmail(payload)         // Confirmación de inscripción
sendScheduleEmail(payload)           // Notificación de horario asignado
sendPromotionEmail(payload)          // Resultado de promoción/eliminación
sendContestStartedEmail(payload)     // Notificación de inicio de concurso
sendRankingPublishedEmail(payload)   // Publicación de ranking
```

Todas retornan `{ sent: boolean, id: string | null, error?: string }`. Fallos son best-effort (no lanzan error).

### `server/utils/notifications.ts`

```typescript
insertNotifications(admin, rows: NotificationInput[]): Promise<void>
// NotificationInput: { user_id, type, title, body?, payload? }
// Tipos: 'schedule_assigned' | 'promoted' | 'not_promoted' | 'contest_started' | 'score_published' | 'ranking_published'
```

### `server/utils/schemas.ts`

Schemas Zod exportados para validación en endpoints:

| Schema | Uso |
|---|---|
| `EnrollBodySchema` | `POST /public/.../enroll` |
| `CheckoutEnrollmentSchema` | `POST /public/.../checkout` |
| `ScoreBodySchema` | `POST /api/scores` |
| `CheckoutPlanSchema` | `POST /api/billing/checkout` |
| `CheckoutTicketsSchema` | `POST /api/billing/checkout-tickets` |
| `CheckoutActivationsSchema` | `POST /api/billing/checkout-activations` |
| `ContestCreateSchema` | `POST /api/contests` |
| `RefundBodySchema` | `POST /api/participants/:id/refund` |
| `BulkRoundParticipantsSchema` | `POST /api/rounds/:id/participants/bulk` |
| `JudgePoolSchema` | `POST /api/organizations/:orgId/judge-pool` |
| `PromoteBodySchema` | `POST /api/rounds/:id/promote` |
