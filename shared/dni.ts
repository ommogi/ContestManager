// Spanish DNI/NIE + generic passport validator.
// Returns { valid, type, error } where type is 'dni' | 'nie' | 'passport' | null.

const LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE'

export type DniKind = 'dni' | 'nie' | 'passport' | null
export interface DniResult {
  valid: boolean
  type: DniKind
  error?: string
  normalized?: string
}

// kind: 'dni' restricts to DNI/NIE; 'passport' restricts to passport; undefined = try all.
export function validateDni(raw: string | null | undefined, kind?: 'dni' | 'passport'): DniResult {
  const v = (raw || '').trim().toUpperCase()
  if (!v) return { valid: false, type: null, error: 'Vacío' }

  if (kind !== 'passport') {
    const dni = v.match(/^(\d{8})([A-Z])$/)
    if (dni) {
      const expected = LETTERS[parseInt(dni[1], 10) % 23]
      if (expected !== dni[2]) return { valid: false, type: 'dni', error: 'Letra de DNI incorrecta' }
      return { valid: true, type: 'dni', normalized: v }
    }
    const nie = v.match(/^([XYZ])(\d{7})([A-Z])$/)
    if (nie) {
      const prefix = { X: '0', Y: '1', Z: '2' }[nie[1] as 'X' | 'Y' | 'Z']
      const num = parseInt(prefix + nie[2], 10)
      const expected = LETTERS[num % 23]
      if (expected !== nie[3]) return { valid: false, type: 'nie', error: 'Letra de NIE incorrecta' }
      return { valid: true, type: 'nie', normalized: v }
    }
    if (kind === 'dni') {
      return { valid: false, type: null, error: 'Formato no válido (DNI o NIE)' }
    }
  }

  // Passport — lenient alphanumeric 6..10
  if (/^[A-Z0-9]{6,10}$/.test(v)) {
    return { valid: true, type: 'passport', normalized: v }
  }
  return { valid: false, type: null, error: 'Pasaporte no válido (6–10 alfanuméricos)' }
}

// Detect kind from a stored value (used to initialize the toggle).
export function detectIdKind(raw: string | null | undefined): 'dni' | 'passport' {
  if (!raw) return 'dni'
  const r = validateDni(raw)
  return r.type === 'passport' ? 'passport' : 'dni'
}
