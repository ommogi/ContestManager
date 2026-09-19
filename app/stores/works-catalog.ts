import { defineStore } from 'pinia'
import { ref } from 'vue'
import { apiClient } from '~/api/apiClient'
import { useAuthStore } from '~/stores/auth'

// Catalogue of composers and works of the owner's organisation (KAN-16).

export interface CatalogComposer {
  id: string
  name: string
  archived_at: string | null
}

export interface CatalogWork {
  id: string
  composer_id: string
  title: string
  catalog_ref: string | null
  duration_seconds: number | null
  archived_at: string | null
  composer: { id: string; name: string } | null
}

export interface WorkInput {
  composer_id: string
  title: string
  catalog_ref: string | null
  duration_seconds: number | null
}

// apiClient's route-typed signature does not know these endpoints yet.
const api = apiClient as unknown as <T>(url: string, opts?: { method?: string; body?: unknown; query?: Record<string, unknown> }) => Promise<T>

export const useWorksCatalogStore = defineStore('works-catalog', () => {
  const composers = ref<CatalogComposer[]>([])
  const works = ref<CatalogWork[]>([])
  const isFetching = ref(false)
  const includeArchived = ref(false)

  function base(): string {
    const id = (useAuthStore().organization as { id?: string } | null)?.id
    if (!id) throw new Error('No organization')
    return `/api/organizations/${id}`
  }

  async function fetchAll(q?: string): Promise<void> {
    isFetching.value = true
    try {
      const query = { q: q || undefined, includeArchived: includeArchived.value ? 'true' : undefined }
      const [c, w] = await Promise.all([
        // Composers always include archived ones: the work form must still be
        // able to show an archived composer that a work points at.
        api<CatalogComposer[]>(`${base()}/composers`, { query: { includeArchived: 'true' } }),
        api<CatalogWork[]>(`${base()}/works`, { query }),
      ])
      composers.value = c
      works.value = w
    } finally {
      isFetching.value = false
    }
  }

  async function createComposer(name: string, force = false): Promise<CatalogComposer> {
    const created = await api<CatalogComposer>(`${base()}/composers`, { method: 'POST', body: { name, force } })
    composers.value = [...composers.value, created].sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return created
  }

  async function saveWork(input: WorkInput, id?: string): Promise<CatalogWork> {
    const saved = id
      ? await api<CatalogWork>(`${base()}/works/${id}`, { method: 'PATCH', body: input })
      : await api<CatalogWork>(`${base()}/works`, { method: 'POST', body: input })
    const index = works.value.findIndex(w => w.id === saved.id)
    if (index === -1) works.value = [saved, ...works.value]
    else works.value[index] = saved
    return saved
  }

  async function setWorkArchived(id: string, archived: boolean): Promise<void> {
    const saved = await api<CatalogWork>(`${base()}/works/${id}`, { method: 'PATCH', body: { archived } })
    const index = works.value.findIndex(w => w.id === id)
    if (index === -1) return
    if (archived && !includeArchived.value) works.value.splice(index, 1)
    else works.value[index] = saved
  }

  /** Deletes, or archives when the work is in use; says which happened. */
  async function removeWork(id: string): Promise<{ deleted: boolean; archived: boolean }> {
    const result = await api<{ deleted: boolean; archived: boolean }>(`${base()}/works/${id}`, { method: 'DELETE' })
    if (result.deleted || !includeArchived.value) works.value = works.value.filter(w => w.id !== id)
    else await fetchAll()
    return result
  }

  return {
    composers, works, isFetching, includeArchived,
    fetchAll, createComposer, saveWork, setWorkArchived, removeWork,
  }
})
