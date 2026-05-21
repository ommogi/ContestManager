import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Contest, ContestFormPayload, PaginatedResponse } from '~~/types'
import { apiClient } from '~/api/apiClient'

export const useContestsStore = defineStore('contests', () => {
  const items = ref<Contest[]>([])
  const currentId = ref<string | null>(null)
  const fetched = ref(new Set<string>())

  const current = computed(() => items.value.find(c => c.id === currentId.value) ?? null)

  function _merge(data: Contest[]) {
    for (const item of data) {
      const idx = items.value.findIndex(i => i.id === item.id)
      if (idx !== -1) items.value[idx] = item
      else items.value.push(item)
    }
  }

  function invalidate(ctxId?: string) {
    if (ctxId) fetched.value.delete(ctxId)
    else fetched.value.clear()
  }

  async function fetchAll(): Promise<Contest[]> {
    if (fetched.value.has('all')) return items.value
    const data = await apiClient<PaginatedResponse<Contest>>('/api/contests')
    _merge(data?.items || [])
    fetched.value.add('all')
    return items.value
  }

  async function fetchOne(slugOrId: string): Promise<Contest> {
    const data = await apiClient<Contest>(`/api/contests/${slugOrId}`)
    _merge([data])
    currentId.value = data.id
    return data
  }

  async function create(payload: ContestFormPayload): Promise<Contest> {
    const data = await apiClient<Contest>('/api/contests', { method: 'POST', body: payload })
    items.value.push(data)
    return data
  }

  async function update(idOrSlug: string, payload: any): Promise<Contest> {
    const data = await apiClient<Contest>(`/api/contests/${idOrSlug}`, { method: 'PATCH', body: payload })
    const idx = items.value.findIndex(i => i.id === data.id)
    if (idx !== -1) items.value[idx] = { ...items.value[idx], ...data }
    if (currentId.value === data.id) {
      const cidx = items.value.findIndex(i => i.id === data.id)
      if (cidx !== -1) items.value[cidx] = data
    }
    return data
  }

  async function remove(idOrSlug: string): Promise<void> {
    await apiClient(`/api/contests/${idOrSlug}`, { method: 'DELETE' })
    items.value = items.value.filter(i => i.id !== idOrSlug && i.slug !== idOrSlug)
  }

  return { items, currentId, current, fetched, fetchAll, fetchOne, create, update, remove, invalidate }
})
