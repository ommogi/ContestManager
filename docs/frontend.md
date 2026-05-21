# Frontend Architecture — ContestSaaS

Stack: Nuxt 4.4.2 · Vue 3 (Composition API + `<script setup>`) · TypeScript · Tailwind v4 · shadcn-vue · Pinia · Supabase Realtime

---

## Stack Técnico

| Tecnología | Uso |
|---|---|
| **Nuxt 4** | Framework SSR/SPA. Rutas file-based, server routes via Nitro |
| **Vue 3** | UI. `<script setup lang="ts">` + Composition API siempre |
| **Pinia** | Estado global. Setup stores (`defineStore('name', () => {...})`) |
| **shadcn-vue** | Componentes UI (reka-ui basado en Radix) |
| **Tailwind v4** | Estilos. Utility-first, tokens via CSS vars |
| **Supabase JS** | Auth, Realtime, Storage desde el cliente |
| **Stripe.js** | Redirect a Checkout (no integración directa, solo URL) |
| **nuxt-charts** | Gráficas (Chart.js) |
| **OGL** | WebGL para el fondo animado Grainient |
| **TipTap** | Editor rich text para descripción/reglas de concurso |
| **@tanstack/vue-table** | Tablas de datos con sorting/filtering |
| **vue-sonner** | Toast notifications |
| **embla-carousel-vue** | Carruseles |

---

## Árbol de Rutas

### Rutas Públicas (sin auth, layout `auth` o ninguno)

| URL | Layout | Descripción |
|---|---|---|
| `/` | — | Landing page con marketing, grainient backdrop |
| `/auth/login` | auth | Login/Registro con email o OAuth |
| `/auth/callback` | — | Callback OAuth (Supabase redirect) |
| `/auth/reset-password` | auth | Cambio de contraseña |
| `/privacy` | — | Política de privacidad |
| `/terms` | — | Términos de servicio |
| `/join/[token]` | — | Formulario de inscripción pública por token |
| `/join/[token]/confirm` | — | Confirmación tras pago/inscripción |
| `/c/[slug]` | — | Vista pública del concurso por slug |

### Rutas Autenticadas (layout `default` con sidebar)

| URL | Rol | Descripción |
|---|---|---|
| `/dashboard` | todos | Dashboard. Org owners: resumen de concursos. Usuarios: participaciones. |
| `/onboarding` | todos | Flujo de onboarding inicial |
| `/settings` | todos | Configuración de perfil y organización |
| `/users/[id]` | todos | Perfil de usuario |
| `/contests` | org_owner | Lista de todos los concursos de la org |
| `/contests/new` | org_owner | Crear nuevo concurso |
| `/contests/[slug]` | org_owner | Gestión del concurso (info, categorías, miembros) |
| `/contests/[slug]/inscriptions` | org_owner | Gestión de inscripciones y participantes |
| `/contests/[slug]/categories/[id]` | org_owner | Detalle de categoría (participantes, jueces, rondas) |
| `/contests/[slug]/categories/[id]/rounds/[roundId]` | org_owner | Scoring y gestión de ronda |
| `/calendar` | org_owner | Vista calendario de ensayos y actuaciones |
| `/billing` | org_owner | Gestión de tickets, activaciones, Stripe Connect |
| `/judge-pool` | org_owner | Pool de jueces de la organización |
| `/stats` | org_owner | Estadísticas globales de la organización |
| `/my-contests` | user | Concursos en los que participa el usuario |
| `/my-contests/[slug]` | user | Detalle de un concurso propio |
| `/my-contests/[slug]/categories/[id]` | user | Categoría desde perspectiva del participante |
| `/my-contests/[slug]/categories/[id]/rounds/[roundId]` | user | Ronda desde perspectiva del participante |

---

## Layouts

### `default.vue` — Layout principal

Para todas las rutas autenticadas. Compuesto por:

- **Sidebar colapsable:** navegación principal. Items distintos para `org_owner` vs `user`.
- **Header:**
  - Breadcrumbs dinámicos (via `useBreadcrumbs`)
  - Buscador global / Command Palette (`Ctrl+K` / `Cmd+K`)
  - Balance de tickets (solo org owners)
  - Toggle de tema claro/oscuro
  - Notificaciones (`NotificationsPopover`)
  - Avatar de usuario

**Navegación para `org_owner`:**
1. Resumen (`/dashboard`)
2. Mis Concursos (`/contests`)
3. Jurados (`/judge-pool`)
4. Calendario (`/calendar`)
5. Billing (`/billing`)
6. Estadísticas (`/stats`)
7. Configuración (`/settings`)

**Navegación para `user`:**
1. Resumen (`/dashboard`)
2. Mis Concursos (`/my-contests`)
3. Configuración (`/settings`)

### `auth.vue` — Layout de autenticación

Para login, registro, reset. Fondo con `<Grainient>` (WebGL animado). Sin sidebar ni header. Contenido centrado.

---

## Pinia Stores

Todos los stores usan el patrón setup: `defineStore('name', () => { ... })`.

---

### `auth` (`app/stores/auth.ts`)

Estado central de autenticación y organización.

**Estado:**
```typescript
user: User | null
session: Session | null
profile: Profile | null     // datos extendidos (nombre, dni, etc.)
organization: Organization | null  // organización del org_owner
loading: boolean
```

**Computed:**
```typescript
isAuthenticated: boolean
isOrgOwner: boolean         // profile.account_type === 'org_owner'
needsOnboarding: boolean    // usuario sin perfil completo
needsOrgSetup: boolean      // org_owner sin organización
displayName: string         // full_name o email
initials: string            // para avatar
```

**Acciones:**
- `init()` — carga sesión y perfil al arrancar la app
- `signIn(email, password)` — login con email/pass
- `signUp(email, password)` — registro
- `signInWithOAuth(provider)` — Google, GitHub, Apple, Facebook
- `signOut()`
- `updateProfile(data)` — actualiza perfil del usuario
- `createOrganization(name, slug)` — crea org y cambia `account_type` a `org_owner`

**APIs:** Supabase Auth directo (no via `/api/`)

---

### `contests` (`app/stores/contests.ts`)

Lista de concursos de la organización.

**Estado:**
```typescript
items: Contest[]
currentId: string | null
fetched: Set<string>        // IDs ya cargados para evitar refetch
```

**Computed:** `current` — concurso activo por `currentId`

**Acciones:**
- `fetchAll()` → `GET /api/contests`
- `fetchOne(id)` → `GET /api/contests/:id`
- `create(data)` → `POST /api/contests`
- `update(id, data)` → `PATCH /api/contests/:id`
- `remove(id)` → `DELETE /api/contests/:id`

---

### `contest` (`app/stores/contest.ts`)

Facade que agrega todas las stores relacionadas con un concurso abierto. Es el store de estado para las páginas de gestión.

**Agrega:** `contestsStore`, `categoriesStore`, `roundsStore`, `participantsStore`, `roundParticipantsStore`, `contestMembersStore`, `scoresStore`, `prizesStore`

**Estado propio:**
```typescript
judgePool: Judge[]
rehearsals: Rehearsal[]
```

**Acciones principales:**
- `fetchContest(slug)` — carga el concurso y todos sus datos
- `createContest(data)` → `POST /api/contests`
- `updateContest(id, data)` → `PATCH /api/contests/:id`
- `deleteContest(id)` → `DELETE /api/contests/:id`
- `createCategory(contestId, data)` → `POST /api/contests/:id/categories`
- `addParticipant(contestId, data)` → `POST /api/contests/:id/participants`
- `fetchRoundParticipants(roundId)` → `GET /api/rounds/:id/participants`
- `startRound(roundId)` → `PATCH /api/rounds/:id` con `status: 'active'`
- `promoteParticipants(roundId, ids)` → `POST /api/rounds/:id/promote`
- `addPrize(categoryId, data)` → `POST /api/prizes`
- `fetchJudgePool()` → `GET /api/organizations/:orgId/judge-pool`

---

### `categories` (`app/stores/categories.ts`)

Categorías de concursos.

**Estado:**
```typescript
items: Category[]
fetched: Set<string>
```

**Computed:** `byContest(contestId)` — filtra por concurso

**Acciones:**
- `fetch(contestId)` → `GET /api/contests/:id/categories`
- `create(contestId, data)` → `POST /api/contests/:id/categories`
- `update(id, data)` → `PATCH /api/categories/:id`
- `remove(id)` → `DELETE /api/categories/:id`

---

### `rounds` (`app/stores/rounds.ts`)

Rondas de concursos.

**Estado:**
```typescript
items: Round[]
fetched: Set<string>
contestRoundIds: Map<string, string[]>
```

**Computed:**
- `byContest(contestId)` — rondas del concurso
- `byCategory(categoryId)` — rondas de la categoría

**Acciones:**
- `fetch(contestId)` → `GET /api/contests/:id/rounds`
- `update(id, data)` → `PATCH /api/rounds/:id`
- `startRound(roundId)` → `PATCH /api/rounds/:id` con `status: 'active'`
- `createForCategory(contestId, categoryId, data)` → `POST /api/categories/:id/rounds`
- `remove(id)` → `DELETE /api/rounds/:id`

---

### `participants` (`app/stores/participants.ts`)

Participantes de concursos.

**Estado:**
```typescript
items: Participant[]
fetched: Set<string>
```

**Computed:**
- `byContest(contestId)`
- `byCategory(categoryId)`

**Acciones:**
- `fetch(contestId)` → `GET /api/contests/:id/participants`
- `create(contestId, data)` → `POST /api/contests/:id/participants`
- `update(id, data)` → `PATCH /api/participants/:id`
- `remove(id)` → `DELETE /api/participants/:id`

---

### `round-participants` (`app/stores/round-participants.ts`)

Datos de round_participants (programación, tiempos).

**Estado:**
```typescript
byRound: Map<string, RoundParticipant[]>
fetched: Set<string>
```

**Acciones:**
- `fetch(roundId)` → `GET /api/rounds/:id/participants`
- `update(id, data)` → `PATCH /api/round-participants/:id`

---

### `contest-members` (`app/stores/contest-members.ts`)

Miembros del equipo del concurso (jueces, viewers).

**Estado:**
```typescript
items: ContestMember[]
fetched: Set<string>
```

**Computed:** `byContest(contestId)`

**Acciones:**
- `fetch(contestId)` → `GET /api/contests/:id/members`
- `create(contestId, data)` → `POST /api/contests/:id/members`
- `remove(contestId, memberId)` → `DELETE /api/contests/:id/members/:memberId`

---

### `scores` (`app/stores/scores.ts`)

Puntuaciones y resúmenes de rondas.

**Estado:**
```typescript
summaries: Map<string, ScoreSummary[]>   // roundId → resumen
fetchedRounds: Set<string>
```

**Acciones:**
- `fetchSummary(roundId)` → `GET /api/rounds/:id/scores/summary`
- `upsertScore(data)` → `POST /api/scores`

---

### `judge-pool` (`app/stores/judge-pool.ts`)

Pool de jueces de la organización.

**Estado:**
```typescript
items: Judge[]
orgId: string | null
isFetching: boolean
fetched: boolean
```

**Computed:** `total` — número de jueces

**Acciones:**
- `fetchPool(orgId)` → `GET /api/organizations/:orgId/judge-pool`
- `addJudge(orgId, data)` → `POST /api/organizations/:orgId/judge-pool`
- `removeJudge(orgId, judgeId)` → `DELETE /api/organizations/:orgId/judge-pool/:judgeId`

---

### `notifications` (`app/stores/notifications.ts`)

Notificaciones in-app del usuario.

**Estado:**
```typescript
items: Notification[]
loaded: boolean
```

**Acciones:**
- `fetch()` — carga via Supabase Realtime subscription
- `markRead(id)` → `PATCH /api/notifications/:id`
- `markAllRead()` — marca todas como leídas
- `push(notification)` — añade notificación localmente (para pushes en tiempo real)

---

### `prizes` (`app/stores/prizes.ts`)

Premios por categoría.

**Estado:** `items: Prize[]`

**Computed:** `byCategory(categoryId)`

**Acciones:**
- `create(categoryId, data)` → `POST /api/prizes`
- `remove(id)` → `DELETE /api/prizes/:id`

---

## Composables

### `useAuth` (`app/composables/useAuth.ts`)

Acceso conveniente al store de auth. Expone `user`, `profile`, `organization`, `isOrgOwner`, `signOut`.

### `useBreadcrumbs` (`app/composables/useBreadcrumbs.ts`)

Gestión de breadcrumbs dinámicos. Las páginas llaman a `setBreadcrumbs([{ label, href }])` al montarse.

### `useBreadcrumbMeta` (`app/composables/useBreadcrumbMeta.ts`)

Metadatos SEO para breadcrumbs (structured data JSON-LD).

### `useContest` (`app/composables/useContest.ts`)

Wrapper sobre `contestStore` para usar en páginas. Proporciona el concurso activo y sus datos.

### `useInscriptionForm` (`app/composables/useInscriptionForm.ts`)

Lógica del formulario de inscripción pública: carga del formulario, validación de campos custom, envío.

### `useNotifications` (`app/composables/useNotifications.ts`)

Gestión de notificaciones con Supabase Realtime. Configura la suscripción a la tabla `notifications` y actualiza el store.

### `useRoundScoresRealtime` (`app/composables/useRoundScoresRealtime.ts`)

Suscripción a cambios en tiempo real en la tabla `scores` para una ronda específica. Usa Supabase Realtime (requiere REPLICA IDENTITY FULL en la tabla `scores`).

---

## Componentes Clave

### Domain: Concursos

| Componente | Propósito |
|---|---|
| `ContestCard.vue` | Card resumen de un concurso con estado y acciones rápidas |
| `CreateCategoryDialog.vue` | Modal para crear categoría nueva |
| `EditContestDrawer.vue` | Drawer lateral para editar datos del concurso |
| `RoundManager.vue` | Gestión de rondas (crear, cambiar estado, ver participantes) |

### Domain: Inscripciones

| Componente | Propósito |
|---|---|
| `ImportCsvDialog.vue` | Import masivo de participantes desde CSV con preview |
| `DynamicFormRenderer.vue` | Renderiza formularios custom basados en JSON schema |
| `FormBuilder.vue` | Editor visual de campos de formulario de inscripción |

### Domain: Scoring

| Componente | Propósito |
|---|---|
| `ScoreForm.vue` | Formulario de puntuación para jueces |
| `PromotionTable.vue` | Tabla de participantes con botones de promoción/eliminación |

### Domain: Tablas

| Componente | Propósito |
|---|---|
| `ParticipantsTable.vue` | DataTable de participantes con sorting, filtering, bulk actions |
| `JudgePoolTable.vue` | Gestión del pool de jueces |
| `JudgesTable.vue` | Jueces asignados a un concurso específico |

### UI / Shell

| Componente | Propósito |
|---|---|
| `CommandPalette.vue` | Búsqueda global + acciones rápidas (`Ctrl+K`) |
| `Grainient.vue` | Fondo WebGL animado (OGL). Usado en layout auth y landing |
| `NotificationsPopover.vue` | Dropdown de notificaciones con tabs y read/unread |
| `AvatarCell.vue` | Celda de tabla con avatar + lightbox al hacer clic |

---

## Flujos de Usuario Clave

### Flujo de Inscripción Pública

```
Usuario recibe link /join/[token]
  ↓
GET /api/public/inscriptions/:token
  → Muestra: nombre del concurso, categorías disponibles, form schema, entry_fee
  ↓
Usuario rellena formulario
  ↓
  Si entry_fee_cents === 0:
    POST /api/public/inscriptions/:token/enroll
    → Redirige a /join/[token]/confirm
  Si entry_fee_cents > 0:
    POST /api/public/inscriptions/:token/checkout
    → Redirige a Stripe Checkout
    → Tras pago: Stripe webhook → enroll_participant_paid
    → Usuario llega a /join/[token]/confirm?session_id=...
```

### Flujo de Gestión de Concurso (Org Owner)

```
/contests/new → POST /api/contests → /contests/[slug]
  ↓
Configurar:
  - Editar datos (EditContestDrawer) → PATCH /api/contests/:id
  - Crear categorías → POST /api/contests/:id/categories
  - Configurar formulario de inscripción → POST /api/contests/:id/form-schema
  - Añadir jueces → POST /api/contests/:id/members
  ↓
Activar: PATCH /api/contests/:id { status: 'active' }
  → consume_activation (descuenta 1 activación del balance)
  → emails a participantes inscritos
  ↓
/contests/[slug]/categories/[id]
  - Ver participantes inscritos
  - Crear rondas
  ↓
/contests/[slug]/categories/[id]/rounds/[roundId]
  - Scoring en tiempo real (useRoundScoresRealtime)
  - Promover/eliminar participantes
  - Ver ranking
```

### Flujo de Billing

```
/billing
  ↓
Ver balance (GET /api/billing/balance)
  ↓
Comprar plan → POST /api/billing/checkout → Stripe
  → webhook → credit_bundle → balance actualizado
  ↓
Top-up tickets → POST /api/billing/checkout-tickets → Stripe
Top-up activaciones → POST /api/billing/checkout-activations → Stripe
  ↓
Conectar Stripe (para cobrar a participantes):
  POST /api/billing/connect/onboard → Stripe Connect onboarding URL
```

---

## Autenticación

- **Provider:** Supabase Auth
- **Métodos:** email/password, OAuth (Google, GitHub, Apple, Facebook)
- **Token:** JWT almacenado en cookies/localStorage por Supabase. Se incluye en requests a `/api/` via header `Authorization: Bearer`.
- **Roles:** `profiles.account_type`
  - `user` — participante/juez. Ve "Mis Concursos".
  - `org_owner` — organizador. Ve panel completo de gestión.
- **Realtime:** El token JWT se pasa a `supabase.realtime.setAuth(token)` para filtrar suscripciones con RLS.
- **Middleware Nuxt:** Las rutas autenticadas verifican `isAuthenticated` y redirigen a `/auth/login` si no hay sesión.

---

## Convenciones de Código Frontend

- `<script setup lang="ts">` — siempre
- Sin `any` salvo interfaces con librerías no tipadas
- Tailwind utility-first; sin `<style scoped>` salvo animaciones
- Strings UI en español, código/comentarios en inglés
- Toast via `vue-sonner` (`useToast()` / `toast.success(...)`); prohibido `alert()`/`confirm()`
- Validación de DNI/NIE: `validateDni(value, kind)` de `app/utils/dni.ts`
- Teléfono: componente `<PhoneInput>`, almacena E.164
- País: `<CountrySelect>`, almacena ISO alpha-2 (legacy rows pueden tener nombre en español)
- Date pickers: `<DatePicker>` de `app/components/ui/date-picker`, bridge via `parseDate`/`getLocalTimeZone`
