import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { apiClient } from '@/api/apiClient'

/**
 * Download a PDF generated on the server (KAN-19): the session goes with the
 * request through apiClient, the file is saved through a temporary link.
 */
export function useServerPdf() {
  const isDownloading = ref(false)

  async function download(path: string, filename: string): Promise<boolean> {
    isDownloading.value = true
    try {
      const blob = await (apiClient as unknown as (url: string, opts: { responseType: 'blob' }) => Promise<Blob>)(
        path, { responseType: 'blob' },
      )
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)
      return true
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status
      toast.error(status === 403 ? 'No tienes acceso a este documento' : 'No se ha podido generar el PDF')
      return false
    } finally {
      isDownloading.value = false
    }
  }

  return { isDownloading, download }
}

/** "Ronda Final" → "ronda-final", for download names. */
export function pdfSlug(value: string | null | undefined): string {
  return (value || 'ronda').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
