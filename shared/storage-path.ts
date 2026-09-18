// shared/storage-path.ts
// Turning a Supabase Storage public URL back into its object path.
//
// Needed because a replaced logo has to be deleted, and all the app keeps is
// the public URL it stored in `organizations.logo_url`. Without this, every
// replacement leaks the previous object — which is what happened for as long as
// no policy let anyone delete (see 0059_org_logos_hardening.sql).

/**
 * The object path inside `bucket`, or null when the URL is not a public URL for
 * that bucket.
 *
 * Public URLs look like:
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path...>
 *
 * Returns null rather than guessing for anything else — a blob: preview, an
 * external URL a previous version allowed, or a signed URL from a private
 * bucket. Deleting is destructive, so an unrecognised shape must mean "do
 * nothing", never "delete something that looked close enough".
 */
export function objectPathFromPublicUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url || !bucket) return null

  let pathname: string
  try {
    pathname = new URL(url).pathname
  } catch {
    return null
  }

  const marker = `/storage/v1/object/public/${bucket}/`
  const at = pathname.indexOf(marker)
  if (at === -1) return null

  const path = pathname.slice(at + marker.length)
  if (!path) return null

  // The path travels URL-encoded; Storage wants it decoded.
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}
