// shared/avatar.ts
// Un avatar generado a partir del nombre, para quien no ha subido foto.
//
// ── Qué sustituye ───────────────────────────────────────────────────────────
// Hasta ahora el respaldo eran las iniciales. Siguen siendo un respaldo
// correcto; esto solo les da forma propia. Quien SÍ tiene `avatar_url` no pasa
// por aquí en ningún caso.
//
// ── Por qué en `shared/` ────────────────────────────────────────────────────
// Hoy solo lo usa la interfaz, pero el núcleo de DiceBear es agnóstico de
// framework: la misma función vale en una plantilla Vue y en una ruta de Nitro.
// El día que haga falta en los PDF o en los correos ya está donde toca. Y aquí
// se puede probar: `vitest.config.ts` solo recoge `server/**/*.test.ts`, así que
// su test vive en `server/utils/avatar.test.ts` — el mismo apaño que
// `shared/storage-path.ts`.

import { Style, Avatar } from '@dicebear/core'
import shapes from '@dicebear/styles/shapes.json' with { type: 'json' }

/**
 * El estilo, en un único sitio.
 *
 * `shapes` es **CC0**: uso comercial sin atribución. Eso no es un detalle —
 * DiceBear reparte licencias por estilo y 14 de ellos son CC BY 4.0, que
 * obligan a dar crédito. Cambiar esta constante por uno de esos metería una
 * obligación legal en un producto de pago sin que nada lo avisara.
 *
 * Lista CC0 completa: https://www.dicebear.com/licenses/
 *
 * Además es abstracto, sin rostro. Para alguien que no ha subido foto, una
 * forma dice menos de él que una cara inventada.
 */
const style = new Style(shapes)

/**
 * Semilla estable para un nombre.
 *
 * Se normaliza para que «Ana García», « Ana García » y «ANA GARCÍA» den el
 * mismo avatar: si no, la misma persona cambiaría de cara según de qué consulta
 * venga su nombre.
 */
function seedFor(name: string): string {
  const limpio = name.trim().replace(/\s+/g, ' ').toLowerCase()
  // Sin nombre no hay nada que representar, pero devolver algo vacío rompería
  // el `<img>`. Una semilla fija da un avatar neutro y siempre el mismo.
  return limpio || 'sin-nombre'
}

/**
 * Data URI SVG del avatar de `name`, listo para un `src`.
 *
 * Determinista: el mismo nombre da siempre exactamente el mismo avatar, que es
 * lo único que hace que sirva para reconocer a alguien. Si cambiara entre
 * recargas no sería un avatar, sería ruido.
 *
 * Ronda los 3 kB por avatar. Para una ficha o una fila es irrelevante; en una
 * tabla larga conviene calcularlo una vez por fila y no dentro del render.
 */
export function generatedAvatarUri(name: string): string {
  return new Avatar(style, { seed: seedFor(name) }).toDataUri()
}
