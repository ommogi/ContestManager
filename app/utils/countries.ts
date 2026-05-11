export interface Country {
  code: string
  name: string
  flag: string
}

export const COUNTRIES: Country[] = [
  { code: 'AF', name: 'Afganistán', flag: '🇦🇫' },
  { code: 'AL', name: 'Albania', flag: '🇦🇱' },
  { code: 'DE', name: 'Alemania', flag: '🇩🇪' },
  { code: 'AD', name: 'Andorra', flag: '🇦🇩' },
  { code: 'AO', name: 'Angola', flag: '🇦🇴' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'AM', name: 'Armenia', flag: '🇦🇲' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'AZ', name: 'Azerbaiyán', flag: '🇦🇿' },
  { code: 'BS', name: 'Bahamas', flag: '🇧🇸' },
  { code: 'BD', name: 'Bangladés', flag: '🇧🇩' },
  { code: 'BB', name: 'Barbados', flag: '🇧🇧' },
  { code: 'BE', name: 'Bélgica', flag: '🇧🇪' },
  { code: 'BZ', name: 'Belice', flag: '🇧🇿' },
  { code: 'BJ', name: 'Benín', flag: '🇧🇯' },
  { code: 'BY', name: 'Bielorrusia', flag: '🇧🇾' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'BA', name: 'Bosnia y Herzegovina', flag: '🇧🇦' },
  { code: 'BW', name: 'Botsuana', flag: '🇧🇼' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: 'BN', name: 'Brunéi', flag: '🇧🇳' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'BF', name: 'Burkina Faso', flag: '🇧🇫' },
  { code: 'BI', name: 'Burundi', flag: '🇧🇮' },
  { code: 'BT', name: 'Bután', flag: '🇧🇹' },
  { code: 'CV', name: 'Cabo Verde', flag: '🇨🇻' },
  { code: 'KH', name: 'Camboya', flag: '🇰🇭' },
  { code: 'CM', name: 'Camerún', flag: '🇨🇲' },
  { code: 'CA', name: 'Canadá', flag: '🇨🇦' },
  { code: 'QA', name: 'Catar', flag: '🇶🇦' },
  { code: 'TD', name: 'Chad', flag: '🇹🇩' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
  { code: 'CY', name: 'Chipre', flag: '🇨🇾' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'KM', name: 'Comoras', flag: '🇰🇲' },
  { code: 'CG', name: 'Congo', flag: '🇨🇬' },
  { code: 'KP', name: 'Corea del Norte', flag: '🇰🇵' },
  { code: 'KR', name: 'Corea del Sur', flag: '🇰🇷' },
  { code: 'CR', name: 'Costa Rica', flag: '🇨🇷' },
  { code: 'HR', name: 'Croacia', flag: '🇭🇷' },
  { code: 'CU', name: 'Cuba', flag: '🇨🇺' },
  { code: 'CW', name: 'Curazao', flag: '🇨🇼' },
  { code: 'DK', name: 'Dinamarca', flag: '🇩🇰' },
  { code: 'DM', name: 'Dominica', flag: '🇩🇲' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'EG', name: 'Egipto', flag: '🇪🇬' },
  { code: 'SV', name: 'El Salvador', flag: '🇸🇻' },
  { code: 'AE', name: 'Emiratos Árabes Unidos', flag: '🇦🇪' },
  { code: 'ER', name: 'Eritrea', flag: '🇪🇷' },
  { code: 'SK', name: 'Eslovaquia', flag: '🇸🇰' },
  { code: 'SI', name: 'Eslovenia', flag: '🇸🇮' },
  { code: 'ES', name: 'España', flag: '🇪🇸' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'EE', name: 'Estonia', flag: '🇪🇪' },
  { code: 'SZ', name: 'Esuatini', flag: '🇸🇿' },
  { code: 'ET', name: 'Etiopía', flag: '🇪🇹' },
  { code: 'PH', name: 'Filipinas', flag: '🇵🇭' },
  { code: 'FI', name: 'Finlandia', flag: '🇫🇮' },
  { code: 'FJ', name: 'Fiyi', flag: '🇫🇯' },
  { code: 'FR', name: 'Francia', flag: '🇫🇷' },
  { code: 'GA', name: 'Gabón', flag: '🇬🇦' },
  { code: 'GM', name: 'Gambia', flag: '🇬🇲' },
  { code: 'GE', name: 'Georgia', flag: '🇬🇪' },
  { code: 'GH', name: 'Ghana', flag: '🇬🇭' },
  { code: 'GD', name: 'Granada', flag: '🇬🇩' },
  { code: 'GR', name: 'Grecia', flag: '🇬🇷' },
  { code: 'GT', name: 'Guatemala', flag: '🇬🇹' },
  { code: 'GN', name: 'Guinea', flag: '🇬🇳' },
  { code: 'GQ', name: 'Guinea Ecuatorial', flag: '🇬🇶' },
  { code: 'GW', name: 'Guinea-Bisáu', flag: '🇬🇼' },
  { code: 'GY', name: 'Guyana', flag: '🇬🇾' },
  { code: 'HT', name: 'Haití', flag: '🇭🇹' },
  { code: 'HN', name: 'Honduras', flag: '🇭🇳' },
  { code: 'HU', name: 'Hungría', flag: '🇭🇺' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'ID', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'IQ', name: 'Irak', flag: '🇮🇶' },
  { code: 'IR', name: 'Irán', flag: '🇮🇷' },
  { code: 'IE', name: 'Irlanda', flag: '🇮🇪' },
  { code: 'IS', name: 'Islandia', flag: '🇮🇸' },
  { code: 'IL', name: 'Israel', flag: '🇮🇱' },
  { code: 'IT', name: 'Italia', flag: '🇮🇹' },
  { code: 'JM', name: 'Jamaica', flag: '🇯🇲' },
  { code: 'JP', name: 'Japón', flag: '🇯🇵' },
  { code: 'JO', name: 'Jordania', flag: '🇯🇴' },
  { code: 'KZ', name: 'Kazajistán', flag: '🇰🇿' },
  { code: 'KE', name: 'Kenia', flag: '🇰🇪' },
  { code: 'KG', name: 'Kirguistán', flag: '🇰🇬' },
  { code: 'KI', name: 'Kiribati', flag: '🇰🇮' },
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'LA', name: 'Laos', flag: '🇱🇦' },
  { code: 'LS', name: 'Lesoto', flag: '🇱🇸' },
  { code: 'LV', name: 'Letonia', flag: '🇱🇻' },
  { code: 'LB', name: 'Líbano', flag: '🇱🇧' },
  { code: 'LR', name: 'Liberia', flag: '🇱🇷' },
  { code: 'LY', name: 'Libia', flag: '🇱🇾' },
  { code: 'LI', name: 'Liechtenstein', flag: '🇱🇮' },
  { code: 'LT', name: 'Lituania', flag: '🇱🇹' },
  { code: 'LU', name: 'Luxemburgo', flag: '🇱🇺' },
  { code: 'MK', name: 'Macedonia del Norte', flag: '🇲🇰' },
  { code: 'MG', name: 'Madagascar', flag: '🇲🇬' },
  { code: 'MY', name: 'Malasia', flag: '🇲🇾' },
  { code: 'MW', name: 'Malaui', flag: '🇲🇼' },
  { code: 'MV', name: 'Maldivas', flag: '🇲🇻' },
  { code: 'ML', name: 'Malí', flag: '🇲🇱' },
  { code: 'MT', name: 'Malta', flag: '🇲🇹' },
  { code: 'MA', name: 'Marruecos', flag: '🇲🇦' },
  { code: 'MH', name: 'Islas Marshall', flag: '🇲🇭' },
  { code: 'MU', name: 'Mauricio', flag: '🇲🇺' },
  { code: 'MR', name: 'Mauritania', flag: '🇲🇷' },
  { code: 'MX', name: 'México', flag: '🇲🇽' },
  { code: 'FM', name: 'Micronesia', flag: '🇫🇲' },
  { code: 'MD', name: 'Moldavia', flag: '🇲🇩' },
  { code: 'MC', name: 'Mónaco', flag: '🇲🇨' },
  { code: 'MN', name: 'Mongolia', flag: '🇲🇳' },
  { code: 'ME', name: 'Montenegro', flag: '🇲🇪' },
  { code: 'MZ', name: 'Mozambique', flag: '🇲🇿' },
  { code: 'MM', name: 'Birmania', flag: '🇲🇲' },
  { code: 'NA', name: 'Namibia', flag: '🇳🇦' },
  { code: 'NR', name: 'Nauru', flag: '🇳🇷' },
  { code: 'NP', name: 'Nepal', flag: '🇳🇵' },
  { code: 'NI', name: 'Nicaragua', flag: '🇳🇮' },
  { code: 'NE', name: 'Níger', flag: '🇳🇪' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'NO', name: 'Noruega', flag: '🇳🇴' },
  { code: 'NZ', name: 'Nueva Zelanda', flag: '🇳🇿' },
  { code: 'OM', name: 'Omán', flag: '🇴🇲' },
  { code: 'NL', name: 'Países Bajos', flag: '🇳🇱' },
  { code: 'PK', name: 'Pakistán', flag: '🇵🇰' },
  { code: 'PW', name: 'Palaos', flag: '🇵🇼' },
  { code: 'PS', name: 'Palestina', flag: '🇵🇸' },
  { code: 'PA', name: 'Panamá', flag: '🇵🇦' },
  { code: 'PG', name: 'Papúa Nueva Guinea', flag: '🇵🇬' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'PE', name: 'Perú', flag: '🇵🇪' },
  { code: 'PL', name: 'Polonia', flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'GB', name: 'Reino Unido', flag: '🇬🇧' },
  { code: 'CF', name: 'República Centroafricana', flag: '🇨🇫' },
  { code: 'CZ', name: 'República Checa', flag: '🇨🇿' },
  { code: 'DO', name: 'República Dominicana', flag: '🇩🇴' },
  { code: 'RW', name: 'Ruanda', flag: '🇷🇼' },
  { code: 'RO', name: 'Rumania', flag: '🇷🇴' },
  { code: 'RU', name: 'Rusia', flag: '🇷🇺' },
  { code: 'WS', name: 'Samoa', flag: '🇼🇸' },
  { code: 'KN', name: 'San Cristóbal y Nieves', flag: '🇰🇳' },
  { code: 'SM', name: 'San Marino', flag: '🇸🇲' },
  { code: 'VC', name: 'San Vicente y las Granadinas', flag: '🇻🇨' },
  { code: 'LC', name: 'Santa Lucía', flag: '🇱🇨' },
  { code: 'ST', name: 'Santo Tomé y Príncipe', flag: '🇸🇹' },
  { code: 'SN', name: 'Senegal', flag: '🇸🇳' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸' },
  { code: 'SC', name: 'Seychelles', flag: '🇸🇨' },
  { code: 'SL', name: 'Sierra Leona', flag: '🇸🇱' },
  { code: 'SG', name: 'Singapur', flag: '🇸🇬' },
  { code: 'SY', name: 'Siria', flag: '🇸🇾' },
  { code: 'SO', name: 'Somalia', flag: '🇸🇴' },
  { code: 'LK', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'ZA', name: 'Sudáfrica', flag: '🇿🇦' },
  { code: 'SD', name: 'Sudán', flag: '🇸🇩' },
  { code: 'SS', name: 'Sudán del Sur', flag: '🇸🇸' },
  { code: 'SE', name: 'Suecia', flag: '🇸🇪' },
  { code: 'CH', name: 'Suiza', flag: '🇨🇭' },
  { code: 'SR', name: 'Surinam', flag: '🇸🇷' },
  { code: 'TH', name: 'Tailandia', flag: '🇹🇭' },
  { code: 'TW', name: 'Taiwán', flag: '🇹🇼' },
  { code: 'TZ', name: 'Tanzania', flag: '🇹🇿' },
  { code: 'TJ', name: 'Tayikistán', flag: '🇹🇯' },
  { code: 'TL', name: 'Timor Oriental', flag: '🇹🇱' },
  { code: 'TG', name: 'Togo', flag: '🇹🇬' },
  { code: 'TO', name: 'Tonga', flag: '🇹🇴' },
  { code: 'TT', name: 'Trinidad y Tobago', flag: '🇹🇹' },
  { code: 'TN', name: 'Túnez', flag: '🇹🇳' },
  { code: 'TM', name: 'Turkmenistán', flag: '🇹🇲' },
  { code: 'TR', name: 'Turquía', flag: '🇹🇷' },
  { code: 'TV', name: 'Tuvalu', flag: '🇹🇻' },
  { code: 'UA', name: 'Ucrania', flag: '🇺🇦' },
  { code: 'UG', name: 'Uganda', flag: '🇺🇬' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'UZ', name: 'Uzbekistán', flag: '🇺🇿' },
  { code: 'VU', name: 'Vanuatu', flag: '🇻🇺' },
  { code: 'VA', name: 'Ciudad del Vaticano', flag: '🇻🇦' },
  { code: 'VE', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'VN', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'YE', name: 'Yemen', flag: '🇾🇪' },
  { code: 'DJ', name: 'Yibuti', flag: '🇩🇯' },
  { code: 'ZM', name: 'Zambia', flag: '🇿🇲' },
  { code: 'ZW', name: 'Zimbabue', flag: '🇿🇼' },
]

export function searchCountries(query: string): Country[] {
  const q = query.toLowerCase().trim()
  if (!q) return COUNTRIES
  return COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.code.toLowerCase().includes(q)
  )
}

export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code)
}

export function findCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find(c => c.code === code)
}

export function findCountryByName(name: string): Country | undefined {
  return COUNTRIES.find(c => c.name.toLowerCase() === name.toLowerCase())
}

// ─── Phone helpers ────────────────────────────────────────────────────────────
// E.164 dial codes keyed by ISO alpha-2. Curated set; falls back to '34' for ES.
export const DIAL_CODES: Record<string, string> = {
  ES: '34',  PT: '351', FR: '33',  IT: '39',  DE: '49',  GB: '44',  IE: '353',
  NL: '31',  BE: '32',  CH: '41',  AT: '43',  PL: '48',  SE: '46',  NO: '47',
  DK: '45',  FI: '358', GR: '30',  RO: '40',  HU: '36',  CZ: '420', SK: '421',
  US: '1',   CA: '1',   MX: '52',  AR: '54',  CL: '56',  CO: '57',  PE: '51',
  UY: '598', VE: '58',  EC: '593', BO: '591', PY: '595', BR: '55',  CU: '53',
  DO: '1',   PR: '1',   MA: '212', JP: '81',  KR: '82',  CN: '86',  AU: '61',
  NZ: '64',  IN: '91',  RU: '7',   TR: '90',  IL: '972', AE: '971', SA: '966',
}

export interface DialCountry { code: string; name: string; dial: string; flag: string }

// Build dial-aware list (only countries with a known dial code)
export const DIAL_COUNTRIES: DialCountry[] = COUNTRIES
  .filter(c => DIAL_CODES[c.code])
  .map(c => ({ code: c.code, name: c.name, flag: c.flag, dial: DIAL_CODES[c.code]! }))

// Phone number patterns by dial code: total length and group sizes
export const PHONE_PATTERNS: Record<string, { len: number; groups: number[] }> = {
  '34':  { len: 9,  groups: [3, 2, 2, 2] },   // ES: 600 11 22 33
  '1':   { len: 10, groups: [3, 3, 4] },       // US/CA: 555 123 4567
  '44':  { len: 10, groups: [4, 3, 3] },       // GB: 7911 123 456
  '33':  { len: 9,  groups: [3, 3, 3] },       // FR: 612 345 678
  '49':  { len: 10, groups: [3, 4, 3] },       // DE: 170 1234 567
  '39':  { len: 10, groups: [3, 3, 4] },       // IT: 312 345 6789
  '52':  { len: 10, groups: [2, 4, 4] },       // MX: 55 1234 5678
  '55':  { len: 11, groups: [2, 5, 4] },       // BR: 11 91234 5678
  '351': { len: 9,  groups: [3, 3, 3] },       // PT: 912 345 678
  '41':  { len: 9,  groups: [3, 3, 3] },       // CH: 789 012 345
  '43':  { len: 10, groups: [3, 3, 4] },       // AT: 664 123 4567
  '32':  { len: 9,  groups: [3, 3, 3] },       // BE: 495 12 34 56
  '31':  { len: 9,  groups: [3, 3, 3] },       // NL: 612 345 678
}

// Format phone number based on dial code patterns. Falls back to groups of 3.
export function formatPhone(digits: string, dial?: string): string {
  const d = (digits || '').replace(/\D/g, '')
  const pattern = dial ? PHONE_PATTERNS[dial] : undefined
  
  if (pattern && d.length <= pattern.len) {
    const parts: string[] = []
    let idx = 0
    for (const size of pattern.groups) {
      if (idx >= d.length) break
      parts.push(d.slice(idx, idx + size))
      idx += size
    }
    return parts.join(' ')
  }
  
  // Fallback: groups of 3
  return d.replace(/(\d{3})(?=\d)/g, '$1 ').trim()
}

// Get max phone length for a dial code
export function getPhoneMaxLength(dial?: string): number {
  if (!dial) return 12
  return PHONE_PATTERNS[dial]?.len ?? 12
}

// Strip prefix from a stored E.164 (e.g. "+34600112233") → { dial, local }.
export function splitE164(value: string | null | undefined, fallbackDial = '34'): { dial: string; local: string } {
  if (!value) return { dial: fallbackDial, local: '' }
  const v = value.trim()
  if (!v.startsWith('+')) return { dial: fallbackDial, local: v.replace(/\D/g, '') }
  const digits = v.replace(/\D/g, '')
  const codes = Object.values(DIAL_CODES).sort((a, b) => b.length - a.length)
  for (const code of codes) {
    if (digits.startsWith(code) && digits.length > code.length) {
      return { dial: code, local: digits.slice(code.length) }
    }
  }
  return { dial: fallbackDial, local: digits }
}

export function joinE164(dial: string, local: string): string {
  const d = (local || '').replace(/\D/g, '')
  if (!d) return ''
  return `+${dial}${d}`
}
