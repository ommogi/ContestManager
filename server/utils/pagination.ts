import { createError, getQuery } from 'h3'
import type { H3Event } from 'h3'

export interface PaginationParams {
  page: number
  limit: number
  offset: number
}

export function getPagination(event: H3Event, defaultLimit = 50, maxLimit = 100): PaginationParams {
  const query = getQuery(event)
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1)
  const limit = Math.min(maxLimit, Math.max(1, parseInt(String(query.limit ?? String(defaultLimit)), 10) || defaultLimit))
  const offset = (page - 1) * limit
  return { page, limit, offset }
}

export function paginationResponse<T>(items: T[], page: number, limit: number, total?: number) {
  return {
    items,
    page,
    limit,
    total: total ?? items.length,
  }
}
