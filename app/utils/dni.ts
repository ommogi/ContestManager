// Moved to shared/ so the server-side inscription-form validator can reuse it:
// the `dni` custom rule must not reimplement the check-digit algorithm.
// Re-exported here so existing `~/utils/dni` importers are unaffected.
// Relative rather than aliased: unimport scans this directory and does not
// resolve `#shared` when doing so.

export * from '../../shared/dni'
