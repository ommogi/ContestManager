import { describe, it, expect } from 'vitest'
import {
  CONTEST_STORAGE_QUOTA_MB,
  PLATFORM_MAX_FILE_SIZE_MB,
  buildUploadPath,
  effectiveLimits,
  matchesAccept,
  parseUploadPath,
  pendingUploadsByField,
  sanitizeFileName,
  sniffMimeType,
  toFileReference,
  validateUpload,
} from './inscription-uploads'
import type { FormField, FormFieldFile } from '../../shared/inscription-form'
import type { PendingUploadRow } from './inscription-uploads'

// ─── Fixtures ────────────────────────────────────────────────────────────────

function bytes(...parts: (string | number[])[]): Uint8Array {
  const out: number[] = []
  for (const part of parts) {
    if (typeof part === 'string') out.push(...[...part].map(c => c.charCodeAt(0)))
    else out.push(...part)
  }
  return Uint8Array.from(out)
}

/** A byte blob of a given size that carries a real PDF header. */
function pdfOfSize(size: number): Uint8Array {
  const buf = new Uint8Array(size)
  buf.set(bytes('%PDF-1.7'), 0)
  // Fill the rest with printable bytes so nothing else sniffs it.
  buf.fill(0x41, 8)
  return buf
}

const PDF = bytes('%PDF-1.4\n1 0 obj')
const PNG = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], [0x00, 0x00, 0x00, 0x0D])
const JPEG = bytes([0xFF, 0xD8, 0xFF, 0xE0], 'JFIF')
// The KAN-59 case: a Windows executable that someone renamed to .pdf.
const EXE = bytes('MZ', [0x90, 0x00, 0x03, 0x00])
const ELF = bytes([0x7F], 'ELF', [0x02, 0x01, 0x01])
const SHELL = bytes('#!/bin/sh\nrm -rf /')

function fileField(overrides: Partial<FormFieldFile> = {}): FormField {
  return {
    id: 'partitura',
    type: 'file',
    label: 'Partitura',
    required: false,
    order: 0,
    hidden: false,
    validation: {},
    ...overrides,
  } as FormField
}

const noPressure = { existingCount: 0, contestBytesUsed: 0 }

// ─── Sniffing ────────────────────────────────────────────────────────────────

describe('sniffMimeType', () => {
  it('identifies the formats an inscription actually asks for', () => {
    expect(sniffMimeType(PDF).mime).toBe('application/pdf')
    expect(sniffMimeType(PNG).mime).toBe('image/png')
    expect(sniffMimeType(JPEG).mime).toBe('image/jpeg')
    expect(sniffMimeType(bytes('GIF89a')).mime).toBe('image/gif')
    expect(sniffMimeType(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ')).mime).toBe('image/webp')
    expect(sniffMimeType(bytes([0, 0, 0, 0x18], 'ftypmp42')).mime).toBe('video/mp4')
    expect(sniffMimeType(bytes('ID3', [0x03, 0x00])).mime).toBe('audio/mpeg')
  })

  it('flags executables and scripts as dangerous whatever they are called', () => {
    for (const blob of [EXE, ELF, SHELL, bytes('<?php system($_GET[0]);')]) {
      const result = sniffMimeType(blob)
      expect(result.dangerous).toBe(true)
      expect(result.mime).toBeNull()
    }
  })

  it('flags Mach-O and Java class magic too', () => {
    expect(sniffMimeType(bytes([0xCF, 0xFA, 0xED, 0xFE])).dangerous).toBe(true)
    expect(sniffMimeType(bytes([0xCA, 0xFE, 0xBA, 0xBE])).dangerous).toBe(true)
  })

  it('tells OOXML documents apart from a plain zip', () => {
    const zip = [0x50, 0x4B, 0x03, 0x04]
    expect(sniffMimeType(bytes(zip, '[Content_Types].xml word/document.xml')).mime)
      .toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(sniffMimeType(bytes(zip, '[Content_Types].xml xl/workbook.xml')).mime)
      .toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(sniffMimeType(bytes(zip, 'random/entry.txt')).mime).toBe('application/zip')
  })

  it('treats clean ASCII as text and binary noise as unknown', () => {
    expect(sniffMimeType(bytes('nombre,apellidos\nAna,Ruiz\n')).mime).toBe('text/plain')
    expect(sniffMimeType(bytes([0x1F, 0x8B, 0x08, 0x00])).mime).toBeNull()
  })

  it('does not call an empty buffer text', () => {
    expect(sniffMimeType(new Uint8Array(0)).mime).toBeNull()
  })
})

// ─── accept matching ─────────────────────────────────────────────────────────

describe('matchesAccept', () => {
  it('accepts anything when the field declares no accept', () => {
    expect(matchesAccept('application/pdf', undefined)).toBe(true)
    expect(matchesAccept(null, '')).toBe(true)
  })

  it('matches an exact mime type', () => {
    expect(matchesAccept('application/pdf', 'application/pdf')).toBe(true)
    expect(matchesAccept('image/png', 'application/pdf')).toBe(false)
  })

  it('matches a wildcard family', () => {
    expect(matchesAccept('image/png', 'image/*')).toBe(true)
    expect(matchesAccept('application/pdf', 'image/*')).toBe(false)
  })

  it('matches an extension against the sniffed type, not the filename', () => {
    expect(matchesAccept('application/pdf', '.pdf')).toBe(true)
    expect(matchesAccept('image/jpeg', '.jpg,.jpeg')).toBe(true)
    // An executable sniffs to null, so `.pdf` can never match it.
    expect(matchesAccept(null, '.pdf')).toBe(false)
  })

  it('handles a mixed, spaced list the way the HTML attribute is written', () => {
    expect(matchesAccept('image/png', 'application/pdf, image/*')).toBe(true)
    expect(matchesAccept('application/pdf', ' .pdf , image/png ')).toBe(true)
  })

  it('rejects an unrecognised type once accept is restrictive', () => {
    expect(matchesAccept(null, 'application/pdf')).toBe(false)
  })
})

// ─── Paths ───────────────────────────────────────────────────────────────────

describe('sanitizeFileName', () => {
  it('strips directory traversal and separators', () => {
    expect(sanitizeFileName('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFileName('C:\\Users\\ana\\score.pdf')).toBe('score.pdf')
  })

  it('collapses unsafe characters but keeps the extension', () => {
    expect(sanitizeFileName('Partitura Nº 3 (final).pdf')).toBe('Partitura-N-3-final-.pdf')
  })

  it('never returns an empty or dot-leading name', () => {
    expect(sanitizeFileName('')).toBe('archivo')
    expect(sanitizeFileName('...')).toBe('archivo')
    expect(sanitizeFileName('.htaccess')).toBe('htaccess')
  })

  it('caps the length', () => {
    expect(sanitizeFileName(`${'a'.repeat(400)}.pdf`).length).toBeLessThanOrEqual(120)
  })
})

describe('buildUploadPath / parseUploadPath', () => {
  const uuid = '11111111-2222-3333-4444-555555555555'

  it('builds the four-segment key KAN-59 specifies', () => {
    const path = buildUploadPath({
      contestId: 'c-1',
      ownerId: 'u-1',
      fieldId: 'partitura',
      fileName: 'obra.pdf',
    }, uuid)
    expect(path).toBe(`c-1/u-1/partitura/${uuid}-obra.pdf`)
    expect(path.split('/')).toHaveLength(4)
  })

  it('cannot be made to escape its prefix through the filename', () => {
    const path = buildUploadPath({
      contestId: 'c-1',
      ownerId: 'u-1',
      fieldId: '../../admin',
      fileName: '../../../etc/passwd',
    }, uuid)
    expect(path.split('/')).toHaveLength(4)
    expect(path).not.toContain('..')
  })

  it('round-trips', () => {
    const parsed = parseUploadPath(`c-1/u-1/partitura/${uuid}-obra.pdf`)
    expect(parsed).toEqual({
      contestId: 'c-1',
      ownerId: 'u-1',
      fieldId: 'partitura',
      fileName: `${uuid}-obra.pdf`,
    })
  })

  it('rejects a key with the wrong shape', () => {
    expect(parseUploadPath('c-1/u-1/partitura')).toBeNull()
    expect(parseUploadPath('c-1/u-1/partitura/a/b')).toBeNull()
    expect(parseUploadPath('c-1//partitura/x.pdf')).toBeNull()
  })
})

// ─── Limits ──────────────────────────────────────────────────────────────────

describe('effectiveLimits', () => {
  it('honours what the schema declares', () => {
    const limits = effectiveLimits(fileField({ maxSizeMB: 5, maxFiles: 3 }) as FormFieldFile)
    expect(limits.maxBytes).toBe(5 * 1024 * 1024)
    expect(limits.maxFiles).toBe(3)
  })

  it('clamps a schema that asks for more than the platform allows', () => {
    // FormSchemaBodySchema permits declaring up to 100 MB and 20 files; that is
    // the ceiling of what may be configured, not of what is accepted.
    const limits = effectiveLimits(fileField({ maxSizeMB: 100, maxFiles: 20 }) as FormFieldFile)
    expect(limits.maxBytes).toBe(PLATFORM_MAX_FILE_SIZE_MB * 1024 * 1024)
    expect(limits.maxFiles).toBe(10)
  })

  it('defaults to one file and the platform size when nothing is declared', () => {
    const limits = effectiveLimits(fileField() as FormFieldFile)
    expect(limits.maxFiles).toBe(1)
    expect(limits.maxBytes).toBe(PLATFORM_MAX_FILE_SIZE_MB * 1024 * 1024)
  })
})

// ─── validateUpload — the acceptance criteria ────────────────────────────────

describe('validateUpload', () => {
  const pdfField = fileField({ accept: 'application/pdf', maxSizeMB: 5 })

  it('accepts a real PDF for a PDF field and records the sniffed type', () => {
    const result = validateUpload(pdfField, { fileName: 'obra.pdf', bytes: PDF }, noPressure)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.mimeType).toBe('application/pdf')
    expect(result.value.size).toBe(PDF.byteLength)
  })

  it('rejects an .exe renamed to .pdf, in Spanish', () => {
    const result = validateUpload(pdfField, { fileName: 'obra.pdf', bytes: EXE }, noPressure)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('dangerous_content')
    expect(result.error.message).toMatch(/ejecutable/)
  })

  it('rejects an 8 MB PDF when the field allows 5 MB, in Spanish', () => {
    const result = validateUpload(
      pdfField,
      { fileName: 'obra.pdf', bytes: pdfOfSize(8 * 1024 * 1024) },
      noPressure,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('too_large')
    expect(result.error.message).toMatch(/supera el tamaño máximo de 5 MB/)
  })

  it('accepts a 4 MB PDF at the same limit', () => {
    const result = validateUpload(
      pdfField,
      { fileName: 'obra.pdf', bytes: pdfOfSize(4 * 1024 * 1024) },
      noPressure,
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a PNG for a PDF-only field and names the field', () => {
    const result = validateUpload(pdfField, { fileName: 'foto.png', bytes: PNG }, noPressure)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('type_not_allowed')
    expect(result.error.message).toMatch(/Partitura/)
  })

  it('still refuses an executable when the field accepts anything', () => {
    // "Any file" must not mean "any file including malware".
    const result = validateUpload(fileField(), { fileName: 'x.bin', bytes: EXE }, noPressure)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('dangerous_content')
  })

  it('enforces maxFiles against what is already stored', () => {
    const field = fileField({ maxFiles: 2 })
    expect(validateUpload(field, { fileName: 'a.pdf', bytes: PDF }, {
      existingCount: 1, contestBytesUsed: 0,
    }).ok).toBe(true)

    const full = validateUpload(field, { fileName: 'c.pdf', bytes: PDF }, {
      existingCount: 2, contestBytesUsed: 0,
    })
    expect(full.ok).toBe(false)
    if (full.ok) return
    expect(full.error.code).toBe('too_many_files')
    expect(full.error.message).toMatch(/solo admite 2 archivos/)
  })

  it('uses the singular message for a single-file field', () => {
    const result = validateUpload(fileField(), { fileName: 'b.pdf', bytes: PDF }, {
      existingCount: 1, contestBytesUsed: 0,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.message).toMatch(/solo admite un archivo/)
  })

  it('rejects an empty file', () => {
    const result = validateUpload(pdfField, { fileName: 'v.pdf', bytes: new Uint8Array(0) }, noPressure)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('empty_file')
  })

  it('refuses an unknown field id and a non-file field', () => {
    const missing = validateUpload(undefined, { fileName: 'a.pdf', bytes: PDF }, noPressure)
    expect(missing.ok).toBe(false)
    if (!missing.ok) expect(missing.error.code).toBe('field_not_found')

    const textField = { ...fileField(), type: 'text' } as FormField
    const wrong = validateUpload(textField, { fileName: 'a.pdf', bytes: PDF }, noPressure)
    expect(wrong.ok).toBe(false)
    if (!wrong.ok) expect(wrong.error.code).toBe('field_not_file')
  })

  it('stops an upload that would push the contest past its quota', () => {
    const result = validateUpload(pdfField, { fileName: 'a.pdf', bytes: PDF }, {
      existingCount: 0,
      contestBytesUsed: CONTEST_STORAGE_QUOTA_MB * 1024 * 1024,
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('contest_quota_exceeded')
    expect(result.error.message).toMatch(/límite de almacenamiento/)
  })

  it('reports the disguised executable as dangerous, not as a size or type error', () => {
    // Order matters: a 40 MB executable must not be reported as merely "too
    // large", and a PDF-field executable not as merely "wrong type".
    const result = validateUpload(fileField({ accept: 'image/*' }), {
      fileName: 'foto.png', bytes: EXE,
    }, noPressure)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('dangerous_content')
  })

  it('sanitises the stored name', () => {
    const result = validateUpload(pdfField, { fileName: '../../obra final.pdf', bytes: PDF }, noPressure)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.fileName).toBe('obra-final.pdf')
  })
})

// ─── The stored reference ────────────────────────────────────────────────────

describe('toFileReference', () => {
  it('carries a reference, never the contents', () => {
    const result = validateUpload(
      fileField({ accept: '.pdf' }),
      { fileName: 'obra.pdf', bytes: PDF },
      noPressure,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const ref = toFileReference('c-1/u-1/partitura/uuid-obra.pdf', result.value, '2026-01-01T00:00:00.000Z')
    expect(ref).toEqual({
      path: 'c-1/u-1/partitura/uuid-obra.pdf',
      name: 'obra.pdf',
      size: PDF.byteLength,
      mimeType: 'application/pdf',
      uploadedAt: '2026-01-01T00:00:00.000Z',
    })
    // The KAN-59 criterion: JSON.stringify of this is a real object, not `{}`.
    expect(JSON.parse(JSON.stringify(ref))).toEqual(ref)
    expect(Object.keys(JSON.parse(JSON.stringify(ref)))).toHaveLength(5)
  })
})

// ─── Resuming a half-filled form (KAN-67) ────────────────────────────────────

describe('pendingUploadsByField', () => {
  function row(overrides: Partial<PendingUploadRow> = {}): PendingUploadRow {
    return {
      field_id: 'partitura',
      path: 'c-1/u-1/partitura/uuid-obra.pdf',
      file_name: 'obra.pdf',
      size_bytes: 1024,
      mime_type: 'application/pdf',
      created_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    }
  }

  const schema = [fileField()]

  it('rebuilds the same reference shape an upload returns', () => {
    const byField = pendingUploadsByField([row()], schema)
    expect(byField).toEqual({
      partitura: [{
        path: 'c-1/u-1/partitura/uuid-obra.pdf',
        name: 'obra.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        uploadedAt: '2026-01-01T00:00:00.000Z',
      }],
    })
  })

  // PostgREST hands BIGINT back as a string often enough that a reference with
  // a string `size` would reach the page and render as "NaN KB".
  it('coerces a bigint that arrived as a string', () => {
    const [ref] = pendingUploadsByField([row({ size_bytes: '2048' })], schema).partitura!
    expect(ref!.size).toBe(2048)
    expect(typeof ref!.size).toBe('number')
  })

  it('groups by field and keeps upload order oldest first', () => {
    const byField = pendingUploadsByField([
      row({ path: 'p/2', file_name: 'b.pdf', created_at: '2026-01-02T00:00:00.000Z' }),
      row({ path: 'p/1', file_name: 'a.pdf', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ field_id: 'foto', path: 'p/3', file_name: 'c.png', mime_type: 'image/png' }),
    ], [fileField(), fileField({ id: 'foto', label: 'Foto' })])

    expect(byField.partitura!.map(r => r.name)).toEqual(['a.pdf', 'b.pdf'])
    expect(byField.foto!.map(r => r.name)).toEqual(['c.png'])
  })

  // The schema can be republished between the upload and the reload. A row for
  // a question that no longer exists must not come back as an answer to it.
  it('drops rows whose field is gone, hidden, or no longer a file field', () => {
    const rows = [
      row({ field_id: 'borrado', path: 'p/1' }),
      row({ field_id: 'oculto', path: 'p/2' }),
      row({ field_id: 'ahora-texto', path: 'p/3' }),
      row({ path: 'p/4' }),
    ]
    const byField = pendingUploadsByField(rows, [
      fileField(),
      fileField({ id: 'oculto', hidden: true }),
      { id: 'ahora-texto', type: 'text', label: 'Texto', required: false, order: 1, hidden: false, validation: {} } as FormField,
    ])

    expect(Object.keys(byField)).toEqual(['partitura'])
    expect(byField.partitura!).toHaveLength(1)
  })

  // Lowering maxFiles after the fact must not hide rows: they still count on
  // the server, so a hidden one is a field the participant cannot unblock.
  it('returns every row even when the field now admits fewer', () => {
    const rows = [
      row({ path: 'p/1', created_at: '2026-01-01T00:00:00.000Z' }),
      row({ path: 'p/2', created_at: '2026-01-02T00:00:00.000Z' }),
      row({ path: 'p/3', created_at: '2026-01-03T00:00:00.000Z' }),
    ]
    expect(pendingUploadsByField(rows, [fileField({ maxFiles: 1 })]).partitura!).toHaveLength(3)
  })

  it('returns nothing when there is nothing pending', () => {
    expect(pendingUploadsByField([], schema)).toEqual({})
  })
})
