/**
 * Shared page/page_size handling for v2 list endpoints.
 *
 * Every list is OFFSET-paginated, so unbounded input is a query-cost problem:
 * a negative page_size became a negative LIMIT (Postgres answers with a 500),
 * and ?page=100000 forced a deep scan that can hold a pool connection until the
 * statement timeout. This helper is the one place that bounds both.
 *
 * Rules:
 * - page and page_size must be whole numbers >= 1, otherwise 400.
 * - page_size above the endpoint's maximum is clamped to it (lists have always
 *   clamped, and clients rely on asking for "a lot").
 * - page above MAX_PAGE is a 400: clamping it would silently return the wrong
 *   rows.
 */

import { ValidationError } from "../../v1/util/errors.js"

/** Largest page_size any v2 list serves. */
export const MAX_PAGE_SIZE = 100
/** Deepest page any v2 list serves (bounds OFFSET to MAX_PAGE * page_size). */
export const MAX_PAGE = 500

export interface PaginationOptions {
  /** page_size when the caller sends none. Default 20. */
  defaultPageSize?: number
  /** Largest page_size for this endpoint (<= MAX_PAGE_SIZE). Default 100. */
  maxPageSize?: number
  /** Deepest page for this endpoint (<= MAX_PAGE). Default MAX_PAGE. */
  maxPage?: number
  /** Query parameter names, for error messages. */
  pageParam?: string
  pageSizeParam?: string
}

export interface Pagination {
  page: number
  page_size: number
  offset: number
}

function asWhole(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined
  const n = typeof value === "number" ? value : Number(value)
  return Number.isFinite(n) ? n : NaN
}

/**
 * Validates and bounds page/page_size. Throws a 400 ValidationError for
 * values below 1, non-integers and pages past the cap.
 */
export function clampPagination(
  page: unknown,
  pageSize: unknown,
  options: PaginationOptions = {},
): Pagination {
  const maxPageSize = Math.min(
    options.maxPageSize ?? MAX_PAGE_SIZE,
    MAX_PAGE_SIZE,
  )
  const maxPage = Math.min(options.maxPage ?? MAX_PAGE, MAX_PAGE)
  const defaultPageSize = Math.min(options.defaultPageSize ?? 20, maxPageSize)
  const pageParam = options.pageParam ?? "page"
  const pageSizeParam = options.pageSizeParam ?? "page_size"

  const p = asWhole(page) ?? 1
  const s = asWhole(pageSize) ?? defaultPageSize

  const errors: { field: string; message: string }[] = []
  if (!Number.isInteger(p) || p < 1) {
    errors.push({
      field: pageParam,
      message: `${pageParam} must be a whole number of at least 1`,
    })
  } else if (p > maxPage) {
    errors.push({
      field: pageParam,
      message: `${pageParam} must be at most ${maxPage}`,
    })
  }
  if (!Number.isInteger(s) || s < 1) {
    errors.push({
      field: pageSizeParam,
      message: `${pageSizeParam} must be a whole number between 1 and ${maxPageSize}`,
    })
  }
  if (errors.length)
    throw new ValidationError("Invalid pagination parameters", errors)

  const page_size = Math.min(s, maxPageSize)
  return { page: p, page_size, offset: (p - 1) * page_size }
}
