/**
 * Admin › Orders: every order on the site, and the order stats. Orders
 * involving a test buyer, seller, org or shop (services/test-accounts) are
 * left out of the list, its counts and the stats unless `includeTest` is set;
 * when shown, each order says whether it is a test order.
 */
import { search_orders_optimized, type OptimizedOrderRow } from "../../api/routes/v1/orders/helpers.js"
import { getOrderAnalytics } from "../../api/routes/v1/orders/database.js"
import { formatOrderStubOptimized } from "../../api/routes/v1/util/formatting.js"
import type {
  AdminOrderAnalytics,
  AdminOrderCounts,
  AdminOrderSearchStatus,
  AdminOrderSortMethod,
  AdminOrderStub,
  AdminOrdersPage,
} from "../../api/routes/v2/types/admin-orders.types.js"

export interface AdminOrderSearch {
  status?: AdminOrderSearchStatus
  unassigned?: boolean
  /** 0-based page. */
  index: number
  page_size: number
  sort_method: AdminOrderSortMethod
  reverse_sort: boolean
  buyer_username?: string
  seller_username?: string
  has_market_listings?: boolean
  has_service?: boolean
  includeTest: boolean
}

async function toStub(row: OptimizedOrderRow): Promise<AdminOrderStub> {
  return {
    ...(await formatOrderStubOptimized(row)),
    kind: row.kind,
    is_test: row.is_test === true,
  }
}

export async function listAdminOrders(search: AdminOrderSearch): Promise<AdminOrdersPage> {
  const result = await search_orders_optimized({
    status: search.status,
    unassigned: search.unassigned,
    index: search.index,
    page_size: search.page_size,
    sort_method: search.sort_method,
    reverse_sort: search.reverse_sort,
    buyer_username: search.buyer_username,
    seller_username: search.seller_username,
    has_market_listings: search.has_market_listings,
    has_service: search.has_service,
    exclude_test: !search.includeTest,
  })
  const c = result.item_counts
  const item_counts: AdminOrderCounts = {
    fulfilled: c.fulfilled ?? 0,
    "in-progress": c["in-progress"] ?? 0,
    "not-started": c["not-started"] ?? 0,
    cancelled: c.cancelled ?? 0,
    unassigned: c.unassigned ?? 0,
  }
  return { item_counts, items: await Promise.all(result.items.map(toStub)) }
}

export async function adminOrderAnalytics(includeTest: boolean): Promise<AdminOrderAnalytics> {
  return getOrderAnalytics({ includeTest })
}
