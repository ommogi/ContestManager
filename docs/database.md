# Base de datos: migraciones, estado real y procedimiento

Proyecto Supabase de producción: `thaftosvbwcoudzfwiou`.

Este documento existe porque el repositorio y la base de datos llevaban meses
describiendo cosas distintas sin que nada lo señalara (KAN-61). Lo que sigue es
la causa de la divergencia, el inventario y el procedimiento para que no vuelva
a ocurrir.

**Reauditado el 19 de septiembre de 2026, hasta `0070`.** Dos cosas cambiaron
desde la primera redacción:

- **No queda ninguna divergencia.** La que este documento daba por su hallazgo
  principal —`get_contest_by_token` sin filtro de estado— era **falsa**. Está
  explicada abajo, corregida, porque cómo se coló importa más que el hecho.
- Las migraciones posteriores (`0059`–`0070`) están aplicadas y **cumplen el
  procedimiento de este documento**. La crisis que lo motivó está cerrada; lo
  que queda es el procedimiento.

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
| `0039_add_rules_column` | `get_contest_by_token` y `get_public_contest_by_slug` | ✅ Sí, **ambas idénticas al repo** — ver abajo |
| `0041_block_round_start_if_contest_not_active` | la función homónima | ✅ Sí, **17/09/2026** |
| `0043_backfill_participant_names` | `_participants_backfill_name()` | ✅ Sí |
| `0046_add_missing_indexes` | los 7 índices que no estaban duplicados | ✅ Sí, **17/09/2026**, podada — ver abajo |
| `0047_email_logs` | `public.email_logs` | ✅ Sí, pero **por otra vía** |
| — | `public.waitlist` | ✅ Sí, **sin migración en el repo** hasta 0055 |

### El hallazgo que este documento dio por bueno y era falso

*Corregido el 19 de septiembre de 2026. Se deja escrito porque el error es de
manual y porque lo cometió este mismo documento mientras presumía de no
cometerlo.*

Aquí se afirmaba que `0039_add_rules_column` se había aplicado a medias: que
`contests.rules` sí estaba, pero que la redefinición de `get_contest_by_token`
**con filtro de estado** no. Se llamaba «el caso más traicionero del
inventario». **Era falso.**

`0039` define **dos** funciones, y el filtro pertenece a la segunda:

| Línea | Función | `WHERE` |
|---|---|---|
| 22 | `get_contest_by_token` | `registration_token = p_token` · `LIMIT 1` — **sin filtro de estado, por diseño** |
| 54 | `get_public_contest_by_slug` | `slug = p_slug` · `AND c.status IN ('active','finished')` |

Extraídas cláusula a cláusula de lo desplegado, las dos coinciden **exactamente**
con el fichero del repo. No hay divergencia, y nunca la hubo.

La consecuencia que se deducía —«un enlace de inscripción sigue resolviendo para
un concurso en borrador»— tampoco era una desviación: es el comportamiento
correcto y **necesario**. Las inscripciones ocurren mientras el concurso está en
`draft`; `checkout.post.ts` rechaza explícitamente `active|finished|cancelled`.
Una `get_contest_by_token` que filtrara a `('active','finished')` **rompería el
alta de participantes**. La supuesta corrección habría sido el fallo.

**Cómo se coló, que es lo aprovechable.** Este documento decía: *«leyendo el
fichero de migración en lugar de la función desplegada»*. Se equivocaba también
en eso. Se leyó el fichero correcto **y la función equivocada dentro de él**: dos
funciones seguidas, una cláusula `AND c.status` visible, y la atribución a la
primera sin comprobar a cuál pertenecía.

Es la regla 5 un paso más allá. No basta comparar definiciones en vez de nombres:
hay que asegurarse de comparar **la misma** definición. Y es la segunda vez que
este fichero falla por comparar de más — ya le pasó con `0046` citando índices
por nombre. El patrón no es descuido, es exceso de confianza en una coincidencia
de texto.

La comprobación que lo zanja, por si vuelve a dudarse:

```sql
select p.proname, l.n, trim(l.line)
from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace,
lateral unnest(string_to_array(pg_get_functiondef(p.oid), chr(10)))
        with ordinality as l(line, n)
where ns.nspname = 'public'
  and p.proname in ('get_contest_by_token','get_public_contest_by_slug')
  and (l.line ilike '%where c.%' or l.line ilike '%and c.status%');
```

**Dónde más vive, comprobado y no supuesto.** La cabecera de
`0057_invitation_expiry.sql` la lleva en una forma a medio corregir: vio que la
función desplegada no filtra, pero siguió concluyendo que eso la separa del
repo. No la separa. En cambio **KAN-40 no la contiene** —sus comentarios
arrastran otra afirmación falsa distinta, la de la resta de fechas, que ya está
corregida allí—. Se comprobó antes de escribirlo, que es justo lo que faltó la
primera vez.

La cabecera de `0057` se deja como está: es una migración ya aplicada y no se
abre un PR de migraciones por un comentario. La corrección queda en KAN-61.

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

---

## Después de la reconciliación: `0059`–`0070`

*Verificado el 19 de septiembre de 2026 por existencia de objeto.*

Seis migraciones de seguridad, escritas a raíz de auditar lo que este documento
destapó. De ellas salen sus reglas 5 y 6:

| | Qué hizo |
|---|---|
| `0059_org_logos_hardening` | Límites del bucket `org_logos` (2 MB, sin SVG) y políticas acotadas a la carpeta del propio usuario. |
| `0060_storage_policy_hardening` | `contest-assets` acotado a `covers/<contest_id>/`. Retiró una política `INSERT` de `inscription-uploads` cuyo `storage.foldername(c.name)` leía el **nombre** del concurso, no su carpeta. |
| `0061_pin_search_path_security_definer` | 16 funciones `SECURITY DEFINER` sin `search_path` fijado, incluidas todas las del dinero. |
| `0062_schedule_upload_purge` | La purga de subidas, con `pg_cron` + `pg_net`. |
| `0063_revoke_rpc_execute` | 40 RPC `SECURITY DEFINER` eran invocables por `anon` desde internet, `credit_tickets()` entre ellas. |
| `0064_rls_initplan` | 29 políticas reevaluaban `auth.uid()` por fila; envueltas en `(select auth.uid())`. |

Y siete de producto (`0065`–`0070`: ventana horaria, orden de sorteo, aplicación
de cuadrante, ajuste manual, idioma de organización, catálogo de obras).

**Estado: sin deriva.** Los once objetos comprobados existen en producción
—`maintenance_runs`, `invoke_inscription_upload_purge()`, `rounds.session_date`,
`contests.call_offset_minutes`, `round_participants.draw_number`,
`set_round_draw()`, `apply_round_schedule()`,
`round_participants.schedule_edited_at`, `organizations.locale`, `composers`,
`works`—.

Y **el procedimiento se está cumpliendo**, que es lo que había que comprobar:

- Las funciones nuevas (`set_round_draw`, `apply_round_schedule`, `catalog_key`,
  `works_same_org_as_composer`, `invoke_inscription_upload_purge`) llevan todas
  `search_path` fijado **con `pg_temp`**.
- `0070` es la única que crea triggers y políticas: 7 `CREATE` y 7
  `DROP … IF EXISTS`. Regla 3 cumplida.
- El linter de seguridad no encuentra deuda nueva. Los dos `SECURITY DEFINER`
  que siguen expuestos —`is_contest_member` e `is_contest_organizer`— se
  conservan **a propósito**: se evalúan dentro de políticas RLS con los permisos
  del rol que consulta, así que revocarles el `EXECUTE` rompería las políticas
  que protegen.

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

7. **Funciones `SECURITY DEFINER` siempre con `SET search_path`, y que incluya
   `pg_temp`.** Esta segunda mitad es la que importa y faltaba aquí:
   `pg_temp` **se busca el primero** cuando no se lista explícitamente, así que
   `SET search_path = public` a secas sigue siendo vulnerable —cualquiera que
   pueda crear un objeto temporal secuestra un nombre que el cuerpo resuelve, y
   se ejecuta con los permisos del propietario—. Lo correcto es
   `SET search_path = public, pg_temp`, que es lo que hace `0061` sobre las 16
   funciones que no lo tenían. Referencias buenas:
   `0038_scores_rls_no_recursion.sql` y
   `0040_fix_recursion_and_org_owner_member.sql`.
8. **Cada tabla de producción, su fichero en el repo.** Si aparece una tabla sin
   migración, se reconstruye del esquema vivo y se commitea, como hizo `0055`.
9. **Cuando se tocan muchos objetos a la vez, generar las sentencias desde el
   catálogo, no escribirlas a mano.** Copiar 29 predicados o 40 firmas a mano
   introduce erratas que ninguna prueba detecta, porque el resultado *parece*
   correcto. `0063` y `0064` se generaron desde `pg_proc` y `pg_policies`; en
   `0064` la transcripción se confirmó comparando el md5 del fichero con el de
   la salida del generador **antes** de aplicar nada.
10. **`ALTER`, no `DROP` + `CREATE`, cuando el objeto *es* una protección
    activa.** `ALTER POLICY … USING (…)` y `ALTER FUNCTION … SET` modifican en
    sitio: no hay ningún instante en el que la política no exista. Un
    `DROP`+`CREATE` abre una ventana —por breve que sea— con la tabla
    desprotegida, y en `0064` eran 29 políticas a la vez.

    Para comprobar que un cambio masivo así no alteró la semántica, sirve una
    **huella del catálogo entero** normalizando lo que se pretendía cambiar: si
    el md5 de `schema|tabla|política|cmd|roles|qual|with_check` coincide antes y
    después, nada más se movió. Con una salvedad que hay que respetar: esa huella
    sola no prueba nada, porque una migración que no hiciera **nada** la
    reproduciría igual. Hace falta la contraprueba de que el cambio sí ocurrió.

### Auditoría rápida

Para volver a cruzar repo y producción sin depender de los nombres:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

y luego comprobar por objeto con `to_regclass` / `to_regprocedure` /
`pg_indexes`, que es lo único que prueba que algo está de verdad.
