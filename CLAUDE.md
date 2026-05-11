# ContestManager — Project rules for Claude

## Stack

Nuxt 3 + Vue 3 (Composition API + `<script setup>` + TypeScript) · Supabase
(Postgres + Auth + Storage + RLS) · Stripe Connect (destination charges) ·
shadcn-vue + Tailwind v4 · Pinia · nuxt-charts · OGL (Grainient backdrop).

## Skill router — proactive load

**Before** touching code in these areas, read the matching `SKILL.md` and apply
its rules. Don't summarize — actually use the patterns documented there.

| Area / trigger                                              | Skill file |
|--|--|
| Any `.vue` file, SFC, `<script setup>`, defineProps/Emits   | `.agents/skills/vue/SKILL.md` |
| Vue feature work, refactors, code review                    | `.agents/skills/vue-best-practices/SKILL.md` |
| Vue runtime errors, SSR/hydration, warnings                 | `.agents/skills/vue-debug-guides/SKILL.md` |
| Pinia stores (`app/stores/*`)                               | `.agents/skills/vue-pinia-best-practices/SKILL.md` |
| Nuxt config, server routes (`server/api/**`), useFetch, middleware | `.agents/skills/nuxt/SKILL.md` |
| shadcn-vue components, `components/ui/**`, registries       | `.agents/skills/shadcn/SKILL.md` (+ `cli.md`, `mcp.md`, `customization.md`) |
| Tailwind v4, theme tokens, dark mode, CSS vars              | `.agents/skills/tailwind-v4-shadcn/SKILL.md` |
| Tailwind utility classes, responsive layout                 | `.agents/skills/tailwind-css-patterns/SKILL.md` |
| Stripe Checkout, Connect, webhooks, refunds, application_fee | `.agents/skills/stripe-best-practices/SKILL.md` |
| Stripe SDK / API version bumps                              | `.agents/skills/upgrade-stripe/SKILL.md` |
| Postgres schema, migrations (`supabase/migrations/**`), RLS, indexes, RPCs | `.agents/skills/supabase-postgres-best-practices/SKILL.md` |
| Node/Nitro server handlers, REST patterns, error handling   | `.agents/skills/nodejs-backend-patterns/SKILL.md` |
| Backend architecture decisions (framework, async, security) | `.agents/skills/nodejs-best-practices/SKILL.md` |
| TS generics, conditional/mapped/template-literal types      | `.agents/skills/typescript-advanced-types/SKILL.md` |
| New page/component design, visual polish, layout            | `.agents/skills/frontend-design/SKILL.md` |
| WCAG, keyboard nav, ARIA, screen-reader audits              | `.agents/skills/accessibility/SKILL.md` |
| `<head>`, meta, OG, sitemap, structured data                | `.agents/skills/seo/SKILL.md` |

### Loading rule

For each user request:
1. Identify which areas the change will touch.
2. **Read** the matching `SKILL.md` files (use `Read` tool — don't guess).
3. Apply their patterns in the implementation.

If a skill conflicts with code already in the repo (existing patterns, helpers,
conventions in `server/utils`, `app/components/ui`, `app/stores`), the existing
repo pattern wins — flag the divergence to the user, don't silently rewrite.

## Project-specific conventions (override skills)

- **Server clients**: use helpers in `server/utils/supabase.ts`
  (`requireAuth`, `requireOrgOwner`, `requireOrgOwnerOrMember`,
  `serverSupabaseAdmin`). Don't roll new auth gates per endpoint.
- **Stripe destination charges**: `transfer_data.destination` + `application_fee_amount`.
  Platform fee in env `PLATFORM_FEE_BPS` (default 500 = 5%).
- **DB schema lock**: contests can't go `active → draft`. Closed rounds reject
  edits except reopen. Active contests reject participant edits.
- **Notifications**: best-effort via `server/utils/notifications.ts`
  `insertNotifications()`. Never abort parent request on notif failure.
- **Time fields**: `rehearsal_time/end_time/performance_time/end_time` are
  TEXT (datetime-local strings). Calendar API parses to ISO at read time.
- **DNI/NIE/Passport**: validate via `app/utils/dni.ts` `validateDni(value, kind)`.
- **Phone**: `<PhoneInput>` (E.164 stored as `+34600112233`).
- **Country**: `<CountrySelect>` stores ISO alpha-2 OR Spanish name (legacy rows).
- **Date pickers**: shadcn `<DatePicker>` from `app/components/ui/date-picker`,
  bridge ISO string ↔ `DateValue` via `parseDate`/`getLocalTimeZone`.

## House style

- Spanish UI strings, English code/comments.
- Composition API + `<script setup lang="ts">` always.
- No `any` unless interfacing with untyped libs.
- Tailwind utility-first; no scoped CSS unless animation-only.
- `Toaster` from sonner for feedback; no `alert()`/`confirm()`.
- Pinia store pattern: setup-style with `defineStore('name', () => { ... })`.

## Don'ts

- Don't add packages without confirming with the user.
- Don't bypass RLS by switching to admin client without ownership/membership gate.
- Don't break the cascade: `organizations → contests → categories → rounds → round_participants`.
- Don't write to `participants.payment_status` outside the allowed enum
  (`free|pending|paid|refunded|partial_refund`).
