import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Participant, PaginatedResponse } from '~~/types'
import { apiClient } from '~/api/apiClient'

export const useParticipantsStore = defineStore('participants', () => {
  const items = ref<Participant[]>([])
  const fetched = ref(new Set<string>())

  function byContest(contestId: string) {
    return items.value.filter(i => i.contest_id === contestId)
  }

  function byCategory(categoryId: string) {
    return items.value.filter(i => i.category_id === categoryId)
  }

  function _merge(data: Participant[]) {
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

  async function fetch(contestId: string): Promise<Participant[]> {
    if (fetched.value.has(contestId)) return byContest(contestId)
    const data = await apiClient<PaginatedResponse<Participant>>(`/api/contests/${contestId}/participants`)
    _merge(data?.items || [])
    fetched.value.add(contestId)
    return byContest(contestId)
  }

  async function create(contestId: string, payload: any): Promise<Participant> {
    const data = await apiClient<Participant>(`/api/contests/${contestId}/participants`, { method: 'POST', body: payload })
    items.value.push(data)
    return data
  }

  async function update(id: string, payload: any): Promise<Participant> {
    const data = await apiClient<Participant>(`/api/participants/${id}`, { method: 'PATCH', body: payload })
    const idx = items.value.findIndex(i => i.id === id)
    if (idx !== -1) items.value[idx] = { ...items.value[idx], ...data }
    return data
  }

  async function remove(id: string): Promise<{ success: boolean; refunded?: boolean }> {
    const res = await apiClient<{ success: boolean; refunded?: boolean }>(
      `/api/participants/${id}`, { method: 'DELETE' }
    )
    items.value = items.value.filter(i => i.id !== id)
    return res || { success: true }
  }

  return { items, fetched, fetch, create, update, remove, byContest, byCategory, invalidate }
})
