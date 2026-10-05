// Vive bajo server/ porque vitest.config.ts solo recoge server/**/*.test.ts,
// aunque el módulo probado esté en shared/ — mismo apaño que
// server/utils/storage-path.test.ts.
import { describe, it, expect } from 'vitest'
import { generatedAvatarUri } from '../../shared/avatar'

describe('generatedAvatarUri', () => {
  // La propiedad que hace que un avatar sirva para algo. Si cambiara entre
  // recargas no sería un avatar, sería ruido: nadie reconocería a nadie.
  it('da siempre el mismo avatar para el mismo nombre', () => {
    const a = generatedAvatarUri('Ana García')
    const b = generatedAvatarUri('Ana García')

    expect(a).toBe(b)
  })

  it('da avatares distintos a personas distintas', () => {
    expect(generatedAvatarUri('Ana García')).not.toBe(generatedAvatarUri('Luis Pérez'))
  })

  // La misma persona no puede cambiar de cara según de qué consulta venga su
  // nombre, con o sin espacios de más y en cualquier caja.
  it('normaliza espacios y mayúsculas, para que no cambie la cara', () => {
    const referencia = generatedAvatarUri('Ana García')

    expect(generatedAvatarUri('  Ana García  ')).toBe(referencia)
    expect(generatedAvatarUri('ANA GARCÍA')).toBe(referencia)
    expect(generatedAvatarUri('Ana   García')).toBe(referencia)
  })

  // Un nombre vacío no puede devolver algo vacío: rompería el `<img>` que lo
  // consume. Tiene que dar un avatar neutro, y siempre el mismo.
  it('devuelve un avatar utilizable cuando no hay nombre', () => {
    for (const vacio of ['', '   ', '\n\t']) {
      const uri = generatedAvatarUri(vacio)
      expect(uri.startsWith('data:image/svg+xml')).toBe(true)
      expect(uri).toBe(generatedAvatarUri(''))
    }
  })

  it('es un data URI que un src puede usar tal cual', () => {
    const uri = generatedAvatarUri('Ana García')

    expect(uri.startsWith('data:image/svg+xml')).toBe(true)
    expect(uri.length).toBeGreaterThan(100)
  })

  // Los nombres de este proyecto llevan tildes y eñes, y hay participantes
  // internacionales: nada de esto puede lanzar.
  it('aguanta acentos, eñes y alfabetos no latinos', () => {
    for (const nombre of ['Begoña Muñoz', 'Jiří Bělohlávek', '李云迪', 'Ólafur Arnalds']) {
      expect(generatedAvatarUri(nombre).startsWith('data:image/svg+xml')).toBe(true)
    }
  })

  it('distingue nombres que solo cambian en un carácter', () => {
    expect(generatedAvatarUri('Ana García')).not.toBe(generatedAvatarUri('Ana Garcia'))
  })
})
