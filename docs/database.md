# Base de datos: migraciones, estado real y procedimiento

Proyecto Supabase de producción: `thaftosvbwcoudzfwiou`.

Este documento existe porque el repositorio y la base de datos llevaban meses
describiendo cosas distintas sin que nada lo señalara (KAN-61). Lo que sigue es
el inventario verificado el **14 de septiembre de 2026**, la causa de la
divergencia y el procedimiento para que no vuelva a ocurrir.

---

## La causa: SQL inválido que aborta en silencio

No fue un fallo del proceso de despliegue. Fueron **migraciones con SQL que
Postgres rechaza**, cada una llevándose por delante su propia transacción sin
que nadie mirara el resultado.

El patrón concreto es `CREATE POLICY IF NOT EXISTS`, que **no existe en
Postgres** — a diferencia de `CREATE TABLE IF NOT EXISTS` o
`CREATE INDEX IF NOT EXISTS`, que sí. Aparecía en dos ficheros:

| Fichero | Ocurrencias | Consecuencia |
|---|---|---|
| `0037_onboarding_org_fields.sql` | 3 | Nunca se aplicó entero |
| `0047_email_logs.sql` | 1 | Nunca se aplicó |

La huella en producción es inconfundible: de las columnas que `0037` añade,
**solo `logo_url` existe**; `contact_phone` y `contact_country` no, y el bucket
`org_logos` que la misma migración crea tampoco. El fichero se paró a mitad.

Ambos están reparados (`DROP POLICY IF EXISTS` seguido de `CREATE POLICY`), que
es el patrón que usan las migraciones recientes del repo y el que hay que
seguir a partir de ahora.

---

## Inventario: qué falta en producción

Verificado por **existencia del objeto**, no por nombre de migración: la
numeración del repo y la de `supabase_migrations.schema_migrations` divergieron
hace tiempo y comparar nombres no prueba nada.

| Migración del repo | Objeto comprobado | ¿En producción? |
|---|---|---|
| `0028_notifications_advanced` | `notify_schedule_assigned()` | ❌ **No** |
| `0032_credit_activations` | `credit_activations()` | ❌ **No** |
| `0036_new_pricing` / `0044_updated_bundle_pricing` | `get_plan_bundles()` | ✅ Sí |
| `0037_onboarding_org_fields` | `organizations.logo_url` | ✅ Sí |
| `0037_onboarding_org_fields` | `contact_phone`, bucket `org_logos` | ❌ **No** |
| `0039_add_rules_column` | `contests.rules` | ✅ Sí |
| `0041_block_round_start_if_contest_not_active` | la función homónima | ❌ **No** |
| `0043_backfill_participant_names` | `_participants_backfill_name()` | ✅ Sí |
| `0046_add_missing_indexes` | `contests_registration_token_idx` y `participants_payment_intent_idx` | ❌ **No** |
| `0047_email_logs` | `public.email_logs` | ✅ Sí, pero **por otra vía** |
| — | `public.waitlist` | ✅ Sí, **sin migración en el repo** hasta 0055 |

Dos matices que la tabla no recoge:

`email_logs` existe, pero no la creó este fichero: llegó por una migración
registrada como `email_logs` (`20260514085642`) que nunca se commiteó. El
`0047` del repo seguía siendo inválido.

`waitlist` vivía en producción desde el 18 de mayo de 2026 sin fichero que la
describiera. La incorpora `0055_waitlist.sql`, reconstruida del esquema vivo.

### Consecuencia con impacto real: la compra de activaciones está muerta

`credit_activations()` **no existe en producción**, pero
`organizations.activation_balance` sí, y `handleActivationsTopup` en
`server/services/stripe-webhook.ts` llama a esa RPC cuando alguien compra un
pack de activaciones.

Hoy nadie lo ha sufrido: no hay ni una transacción `purchase_activations` en
`billing_transactions`, así que el camino no se ha ejercitado nunca. Pero el
primer cliente que compre activaciones **paga, no recibe nada, y Stripe
reintenta indefinidamente** contra una función que no está.

Es el ejemplo de por qué esta deriva importa: no es deuda de documentación, es
un camino de cobro roto que nadie vería hasta que un cliente lo pisara.

---

## Reconciliación

Las migraciones que faltan **ya son idempotentes** —`CREATE OR REPLACE`,
`IF NOT EXISTS`, y cada `CREATE TRIGGER` precedido de su `DROP TRIGGER IF
EXISTS`— una vez reparado el SQL inválido. Por eso no hay migración de
recuperación que duplique su contenido: duplicar definiciones es crear una
segunda fuente de verdad, que es el problema que estamos arreglando.

Lo único que hacía falta tocar, además de las políticas, era una línea de
`0032`: un `DROP CONSTRAINT` sin `IF EXISTS` que abortaba el fichero entero al
reintentarlo. Ya lleva el `IF EXISTS`.

**Orden de aplicación**, de menor a mayor:

```
0028_notifications_advanced
0032_credit_activations          ← desbloquea la compra de activaciones
0037_onboarding_org_fields
0041_block_round_start_if_contest_not_active
0046_add_missing_indexes
0055_waitlist                    ← no-op en producción, necesaria en entornos nuevos
```

Ninguna se ha aplicado todavía: **es decisión de Omar**, no de un agente.

---

## Procedimiento a partir de ahora

1. **Numerar sin colisiones.** El repo tiene dos `0028_*`
   (`notifications_advanced` y `participants_payment_status_partial_refund`);
   no repetirlo.
2. **Nada de `CREATE POLICY IF NOT EXISTS`.** No existe. Usar
   `DROP POLICY IF EXISTS` y luego `CREATE POLICY`. Lo mismo con triggers.
3. **Escribir toda migración para poder re-ejecutarse**: `CREATE OR REPLACE`
   para funciones, `IF NOT EXISTS` para tablas, índices y columnas,
   `DROP … IF EXISTS` antes de políticas y triggers, `ADD CONSTRAINT` precedido
   de su `DROP CONSTRAINT IF EXISTS`.
4. **Comprobar el resultado, no suponerlo.** Aplicar y después verificar el
   objeto:

   ```sql
   select to_regclass('public.mi_tabla'),
          to_regprocedure('public.mi_funcion(uuid)');
   ```

   Un `null` ahí es la señal que faltó durante meses.
5. **Funciones `SECURITY DEFINER` siempre con `SET search_path`.** Referencias
   buenas: `0038_scores_rls_no_recursion.sql` y
   `0040_fix_recursion_and_org_owner_member.sql`.
6. **Cada tabla de producción, su fichero en el repo.** Si aparece una tabla sin
   migración, se reconstruye del esquema vivo y se commitea, como hizo `0055`.

### Auditoría rápida

Para volver a cruzar repo y producción sin depender de los nombres:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

y luego comprobar por objeto con `to_regclass` / `to_regprocedure` /
`pg_indexes`, que es lo único que prueba que algo está de verdad.
