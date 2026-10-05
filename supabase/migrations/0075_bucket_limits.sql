-- 0075_bucket_limits.sql
-- Dejar en el repo los límites de bucket que solo vivían en producción, y
-- poner techo al único que no tenía ninguno.
--
-- ── Numeración ──────────────────────────────────────────────────────────────
-- 0075 y no 0073: `origin/main` está en 0072, pero hay ramas en curso que ya
-- ocupan 0073 y 0074. Coger el siguiente libre de main habría chocado con
-- trabajo sin mergear, que es contra lo que avisa la regla 1 de
-- `docs/database.md`.
--
-- ── Por qué existe ──────────────────────────────────────────────────────────
-- KAN-84 se abrió afirmando que `avatars` no tenía límites. Era falso: tiene
-- 2 MB y cuatro tipos de imagen, puestos desde el panel el 17/04/2026, antes de
-- que el historial de migraciones cubriera buckets. La afirmación salió de leer
-- el repo y deducir producción en vez de mirarla — la regla 4, incumplida otra
-- vez.
--
-- Lo que sí falla es la regla 8: cada objeto de producción, su fichero en el
-- repo. Hoy un entorno nuevo levantado desde estas migraciones nacería con
-- `avatars` SIN límites, porque nada los declara.
--
-- ── Qué hace, y qué no ──────────────────────────────────────────────────────
-- Son `UPDATE`, no `INSERT … ON CONFLICT`: los cuatro buckets ya existen y
-- recrearlos tocaría columnas que no son asunto de esta migración.

-- ── 1. `avatars`: no-op en producción, red de seguridad en cualquier otro sitio
--
-- Estos son EXACTAMENTE los valores que ya tiene. Aplicada contra producción no
-- cambia un solo byte, y así debe leerse: no es un cambio, es dejar escrito lo
-- que ya es cierto. Su valor está en el entorno que todavía no existe.
UPDATE storage.buckets
   SET file_size_limit   = 2097152,  -- 2 MB
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif']
 WHERE id = 'avatars';

-- ── 2. `inscription-uploads`: el único sin techo ─────────────────────────────
--
-- `0054` lo crea con `(id, name, public)` y nada más, así que el único freno son
-- los 25 MB de `PLATFORM_MAX_FILE_SIZE_MB` en
-- `server/utils/inscription-uploads.ts`.
--
-- Storage aplica `file_size_limit` incluso al `service_role`, así que esto
-- protege de un fallo NUESTRO: si algún día un camino de subida olvida
-- comprobar el tamaño, el bucket lo para. No protege de quien tenga la clave de
-- servicio —ese puede hacer lo que quiera— y no conviene venderlo como otra
-- cosa.
--
-- ⚠️ Queda acoplado a `PLATFORM_MAX_FILE_SIZE_MB`. Si alguien sube esa
-- constante y no toca esto, el bucket empezará a rechazar en silencio ficheros
-- que la app considera válidos. El aviso recíproco está junto a la constante.
--
-- No se declaran `allowed_mime_types` a propósito: duplicaría la lista de
-- `EXTENSIONS_BY_MIME` dentro de la base de datos, y las dos copias se
-- separarían en cuanto alguien añadiera un formato. El olfateo de bytes del
-- servidor es la comprobación real, y es una sola.
UPDATE storage.buckets
   SET file_size_limit = 26214400  -- 25 MB = PLATFORM_MAX_FILE_SIZE_MB
 WHERE id = 'inscription-uploads';
