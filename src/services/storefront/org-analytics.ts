/** Helpers of the org analytics rollup (api/routes/v2/analytics/OrgAnalyticsV2Controller.ts). */

export interface OrgMemberOrders {
  username: string
  display_name: string
  /** Orders assigned to the member (all time). */
  assigned: number
  /** Of those, fulfilled. */
  completed: number
  /** Of those, not started or in progress. */
  open: number
}

export function conversionRate(sales: number, views: number): number {
  return views > 0 ? Number(((sales / views) * 100).toFixed(2)) : 0
}

/** Members' order counts in display order: by name, never by count. */
export function sortMembersByName(rows: OrgMemberOrders[]): OrgMemberOrders[] {
  return [...rows].sort((a, b) =>
    (a.display_name || a.username).localeCompare(b.display_name || b.username, "en", {
      sensitivity: "base",
    }),
  )
}


/**
 * One customer of an org: someone who placed orders with it (with the org
 * itself or any shop it owns), cancelled orders left out.
 */
export interface OrgCustomer {
  user_id: string
  username: string
  display_name: string
  avatar: string | null
  /** The customer's orders with the org, cancelled ones excluded. */
  orders: number
  /** Of those, fulfilled. */
  fulfilled_orders: number
  /** Sum of those orders' totals (orders.cost is the order total), aUEC. */
  total_value: number
  /** When the customer last placed one of those orders. */
  last_order_at: string | null
}

/** A row of the per-customer GROUP BY; Postgres returns COUNT/SUM of bigint as strings. */
export interface OrgCustomerRow {
  user_id: string
  username: string
  display_name: string | null
  avatar: string | null
  orders: string | number
  fulfilled_orders: string | number
  total_value: string | number | null
  last_order_at: Date | string | null
}

const num = (v: unknown): number => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

/**
 * The per-customer rows as the API returns them: numbers parsed (never
 * string-concatenated), biggest total first, then by name.
 */
export function toOrgCustomers(rows: OrgCustomerRow[]): OrgCustomer[] {
  return rows
    .map((r) => ({
      user_id: r.user_id,
      username: r.username,
      display_name: r.display_name ?? "",
      avatar: r.avatar ?? null,
      orders: num(r.orders),
      fulfilled_orders: num(r.fulfilled_orders),
      total_value: num(r.total_value),
      last_order_at:
        r.last_order_at == null
          ? null
          : r.last_order_at instanceof Date
            ? r.last_order_at.toISOString()
            : new Date(r.last_order_at).toISOString(),
    }))
    .sort(
      (a, b) =>
        b.total_value - a.total_value ||
        a.username.localeCompare(b.username, "en", { sensitivity: "base" }),
    )
}
