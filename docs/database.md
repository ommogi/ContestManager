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
| `0028_notifications_advanced` | `notify_schedule_assigned()` | ✅ Sí, **17/09/2026**, reparada antes |
| `0032_credit_activations` | `credit_activations()` | ✅ Sí, **aplicada el 15/09/2026** (KAN-64) |
| `0036_new_pricing` / `0044_updated_bundle_pricing` | `get_plan_bundles()` | ✅ Sí |
| `0037_onboarding_org_fields` | `organizations.logo_url` | ✅ Sí |
| `0037_onboarding_org_fields` | `contact_phone`, bucket `org_logos` | ✅ Sí, **17/09/2026**, reparada antes |
| `0039_add_rules_column` | `contests.rules` | ✅ Sí |
| `0039_add_rules_column` | `get_contest_by_token` **con filtro de estado** | ❌ **No** — ver abajo |
| `0041_block_round_start_if_contest_not_active` | la función homónima | ✅ Sí, **17/09/2026** |
| `0043_backfill_participant_names` | `_participants_backfill_name()` | ✅ Sí |
| `0046_add_missing_indexes` | los 7 índices que no estaban duplicados | ✅ Sí, **17/09/2026**, podada — ver abajo |
| `0047_email_logs` | `public.email_logs` | ✅ Sí, pero **por otra vía** |
| — | `public.waitlist` | ✅ Sí, **sin migración en el repo** hasta 0055 |

### La misma migración, aplicada a medias

`0039_add_rules_column` es el caso más traicionero del inventario, porque
**parte de ella sí está**: `contests.rules` existe en producción. Pero el mismo
fichero redefine `get_contest_by_token` añadiendo
`AND c.status IN ('active','finished')`, y la función desplegada **no tiene ese
filtro**. Su cuerpo real es:

```sql
WHERE c.registration_token = p_token
LIMIT 1
```

Comprobado el 15 de septiembre de 2026 con `pg_get_functiondef`, y confirmado
de extremo a extremo: el endpoint público de schema para un concurso en `draft`
responde **200 con el formulario publicado**, no 404.

Consecuencia: un enlace de inscripción sigue resolviendo para un concurso en
borrador o terminado, y lo único que impide inscribirse es
`contests.registration_open`. Severidad baja —el token es la credencial y un
schema de formulario no es secreto—, pero desmonta una afirmación que llegué a
escribir en `0057_invitation_expiry.sql` y en el PR de KAN-40.

**Cómo se coló:** leyendo el fichero de migración en lugar de la función
desplegada. Es exactamente lo que la regla 4 de más abajo existe para evitar, y
lo cometí yo después de escribirla. Que una migración esté registrada, o que
parte de sus objetos existan, no prueba que se aplicara entera.

Dos matices que la tabla no recoge:

`email_logs` existe, pero no la creó este fichero: llegó por una migración
registrada como `email_logs` (`20260514085642`) que nunca se commiteó. El
`0047` del repo seguía siendo inválido.

`waitlist` vivía en producción desde el 18 de mayo de 2026 sin fichero que la
describiera. La incorpora `0055_waitlist.sql`, reconstruida del esquema vivo.

### Consecuencia con impacto real: la compra de activaciones estuvo muerta

*Resuelto el 15 de septiembre de 2026 (KAN-64). Se deja escrito porque es el
mejor ejemplo de por qué esta deriva importa, y porque el arreglo destapó una
trampa peor.*

`credit_activations()` no existía en producción, pero
`organizations.activation_balance` sí, y `handleActivationsTopup` en
`server/services/stripe-webhook.ts` llama a esa RPC cuando alguien compra un
pack de activaciones. Se podía **gastar** saldo —`consume_activation()` sí
estaba— pero no **comprarlo**. El primer cliente que lo intentara habría pagado,
no habría recibido nada, y Stripe habría reintentado indefinidamente contra una
función ausente. Nadie llegó a sufrirlo: cero transacciones
`purchase_activations` en `billing_transactions`.

No es deuda de documentación: era un camino de cobro roto que nadie vería hasta
que un cliente lo pisara.

#### La trampa: aplicar la migración tal cual habría roto los reembolsos

`0032` no solo crea la función, también rehace
`billing_transactions_reason_check` con una **lista literal**. Y esa lista se
escribió sobre una rama que no llevaba `0026`:

| Fichero | Motivos |
|---|---|
| `0022_billing_reason_purchase_tickets` | 8 |
| `0026_refund_ticket` | esos 8 + `refund_ticket` ← lo que estaba desplegado |
| `0032_credit_activations`, como estaba escrita | los 8 de **0022** + `purchase_activations`, **sin `refund_ticket`** |

Aplicarla sin tocar habría fallado en el acto —producción ya tenía una fila con
`reason = 'refund_ticket'`, así que el `ADD CONSTRAINT` la habría rechazado— y,
de haber colado, habría roto `refund_ticket()`, que se llama al borrar un
participante o una categoría.

Se corrigió a la unión de las tres listas (diez motivos) antes de aplicarla.

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

**Ya no queda ninguna pendiente.** El 17 de septiembre de 2026 se aplicaron las
siete que faltaban —`0028`, `0037`, `0041`, `0046`, `0056`, `0057`, `0058`—
después de auditarlas una por una contra el estado desplegado. `0055` era no-op:
`waitlist` ya existía.

Tres necesitaron reparación **antes** de aplicarse, y las tres son la misma
lección con distinto disfraz: una migración vieja lleva dentro el mundo de su
época.

| | Qué le pasaba |
|---|---|
| `0028` | Cuatro funciones `SECURITY DEFINER` sin `SET search_path`. Contra la regla 6, y no es cosmético: sin la ruta fijada, quien pueda crear objetos en un esquema de la ruta puede sustituir un nombre que el cuerpo resuelve y hacerlo ejecutar con los permisos del propietario. |
| `0037` | Creaba una política `SELECT` pública sobre `storage.objects` para `org_logos`. **`0020_storage_no_listing.sql` había retirado justo eso** —una política SELECT sobre un bucket público solo concede listar, exponiendo el inventario de ficheros— así que aplicarla habría reintroducido el problema para un bucket nuevo. Retirada; nada se rompe, porque la app lee los logos con `getPublicUrl()` y nadie lista el bucket. |
| `0046` | Declaraba once índices y **cuatro ya existían con otro nombre**. Detalle abajo. |

Y `0057` traía una afirmación falsa en su cabecera: decía que la invitación
pendiente ya estaba fuera de plazo. 05/09 + 14 días = **19/09**; se aplicó el
17/09 y la invitación siguió viva, con su plazo intacto. La resta estaba mal en
el fichero y se propagó a KAN-40 y a dos planes porque nadie la hizo.

### El caso `0046`: comprobar por nombre no basta, hay que comparar definiciones

Cuatro de sus once índices duplicaban uno ya desplegado bajo otro nombre:

```
contests_registration_token_idx      → contests_registration_token_key
participants_payment_intent_idx      → participants_pi_idx
contest_members_contest_user_idx     → contest_members_contest_id_user_id_key
processed_stripe_events_event_id_idx → processed_stripe_events_pkey
```

Lo incómodo: **este mismo documento citaba los dos primeros como prueba de que
`0046` faltaba**. Faltaban los *nombres*; la *capacidad* estaba desde el
principio. El inventario comparó nombres donde tenía que comparar definiciones.

`rounds_category_id_idx` sí hacía falta, aunque existan dos índices sobre
`rounds(category_id)`: los dos son **parciales** (`WHERE is_final` y
`WHERE is_ranking`) y no sirven para una búsqueda general. Un cruce laxo lo
habría podado por error.

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
5. **Comparar definiciones, no nombres.** Un objeto puede existir con otro
   nombre y hacer exactamente lo mismo. `0046` declaraba cuatro índices que ya
   estaban desplegados bajo otro nombre, y este documento llegó a citar dos de
   ellos como prueba de que faltaba la migración. Para índices, comparar
   `indexdef`; para constraints, `pg_get_constraintdef`; para funciones,
   `pg_get_functiondef`. Y cuidado con el cruce laxo: dos índices **parciales**
   sobre la misma columna no equivalen a uno completo.

6. **Una lista literal se reconstruye desde lo desplegado, no desde el fichero
   anterior del repo.** Una `CHECK` no se puede ampliar: hay que soltarla y
   volver a crearla con la lista entera, así que cada migración que añade un
   valor repite todas las demás. Si se copia la lista de la migración anterior
   del repo y otra rama añadió un valor por su cuenta, la nueva lo borra. Es la
   variante cara de la regla 4, porque el fallo no aparece al escribir la
   migración sino al aplicarla —o peor, después, cuando algo intenta insertar el
   valor que desapareció—. `0032` lo hizo con `refund_ticket`; el detalle está
   más arriba. Antes de tocar una constraint así:

   ```sql
   select pg_get_constraintdef(oid) from pg_constraint where conname = '…';
   ```

7. **Funciones `SECURITY DEFINER` siempre con `SET search_path`.** Referencias
   buenas: `0038_scores_rls_no_recursion.sql` y
   `0040_fix_recursion_and_org_owner_member.sql`.
8. **Cada tabla de producción, su fichero en el repo.** Si aparece una tabla sin
   migración, se reconstruye del esquema vivo y se commitea, como hizo `0055`.

### Auditoría rápida

Para volver a cruzar repo y producción sin depender de los nombres:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

y luego comprobar por objeto con `to_regclass` / `to_regprocedure` /
`pg_indexes`, que es lo único que prueba que algo está de verdad.
