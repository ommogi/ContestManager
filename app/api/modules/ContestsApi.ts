import { ApiService } from '../apiService'
import type { Database, ContestFormPayload, PaginatedResponse } from '~~/types'

type Contest = Database['public']['Tables']['contests']['Row']

/**
 * Módulo de la API dedicado a la gestión de Concursos.
 */
export class ContestsApi extends ApiService {
  /**
   * Envía el payload reestructurado a nuestro backend de Nitro para insertar.
   */
  async createContest(payload: ContestFormPayload): Promise<Contest> {
    return this.post<Contest>('/api/contests', payload)
  }

  /**
   * Obtiene la lista base de concursos (Placeholder estructurado).
   */
  async fetchContests(): Promise<Contest[]> {
    const res = await this.get<PaginatedResponse<Contest>>('/api/contests')
    return res.items
  }

  /**
   * Elimina un concurso por ID.
   */
  async deleteContest(id: string): Promise<void> {
    return this.delete<void>(`/api/contests/${id}`)
  }
}

// Puedes exportar la clase para instanciarla, o un Singleton ya construido
export const contestsApi = new ContestsApi()
