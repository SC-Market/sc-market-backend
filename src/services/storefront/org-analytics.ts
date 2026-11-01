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

