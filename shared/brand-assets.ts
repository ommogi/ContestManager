// shared/brand-assets.ts
// Las dos imágenes de marca, en un solo sitio.
//
// ── Por qué existe ──────────────────────────────────────────────────────────
// Estaban escritas como URL absoluta completa en nueve sitios: cuatro plantillas
// de `app/`, dos `const logoUrl` redeclaradas dentro del MISMO fichero
// (`server/utils/email.ts`) y tres `const DEFAULT_COVER` idénticas. Cambiar el
// nombre de un fichero o el bucket obligaba a encontrar los nueve, y **el que se
// olvidara no fallaba al compilar**: daba una imagen rota en producción.
//
// Peor que la duplicación: cada una de esas URLs llevaba incrustada la
// referencia del proyecto Supabase, así que el identificador aparecía nueve
// veces en el repositorio. Ahora vive aquí y solo aquí.
//
// ── Por qué absolutas y no rutas ────────────────────────────────────────────
// Porque el correo las necesita así: `server/utils/email.ts` construye HTML que
// se abre fuera de la aplicación, donde una ruta relativa no resuelve contra
// nada. Salen de un bucket público, de modo que la URL es estable y no requiere
// firma.
//
// ── Lo que este módulo NO alcanza ───────────────────────────────────────────
// `supabase/seed/demo.sql` repite el literal de la portada tres veces: SQL no
// puede importar TypeScript, así que ahí se queda. Si algún día cambia la base,
// ese fichero hay que tocarlo a mano.

/**
 * Raíz pública de Storage del proyecto.
 *
 * Es el único lugar del código donde aparece la referencia del proyecto
 * Supabase. Derivarla de `SUPABASE_URL` en tiempo de ejecución sería más limpio,
 * pero `shared/` no tiene acceso a `useRuntimeConfig()` y forzarlo convertiría
 * cada punto de uso en un composable — demasiado para lo que se gana.
 */
const STORAGE_PUBLIC_BASE = 'https://thaftosvbwcoudzfwiou.supabase.co/storage/v1/object/public'

/** Bucket de los assets compartidos de marca y de las portadas de concurso. */
const BRAND_BUCKET = 'contest-assets'

/** Logo de Contest Manager. Cabecera de la aplicación, login y correos. */
export const BRAND_LOGO_URL = `${STORAGE_PUBLIC_BASE}/${BRAND_BUCKET}/logo.png`

/** Portada que se muestra cuando un concurso no tiene la suya. */
export const DEFAULT_CONTEST_COVER_URL = `${STORAGE_PUBLIC_BASE}/${BRAND_BUCKET}/default-cover.png`
