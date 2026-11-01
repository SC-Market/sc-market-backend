/**
 * Org analytics: the per-shop analytics (views, cart adds, orders, sales,
 * the same data as /analytics/listing-stats) rolled up over every shop an
 * org owns, plus orders per member for officers who manage orders.
 *
 * Orders per member (owner decision 2026-11-01): only for members with
 * manage_orders, plain counts per member, sorted by name. Never ranked:
 * it's for spreading the work, not a leaderboard.
 */
import { Get, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { has_permission, is_member } from "../../v1/util/permissions.js"
import {
  conversionRate,
  sortMembersByName,
  toOrgCustomers,
  type OrgCustomer,
  type OrgCustomerRow,
  type OrgMemberOrders,
} from "../../../../services/storefront/org-analytics.js"
import { imageUrlSql } from "../util/image-url-sql.js"

export interface OrgShopStats {
  shop_id: string
  slug: string
  name: string
  views: number
  unique_viewers: number
  cart_adds: number
  orders: number
  sales: number
  /** sales ÷ views, percent */
  conversion_rate: number
  /** Fulfilled orders (all kinds, from the shop's metrics). */
  completed_orders: number
  active_listings: number
}

export interface OrgTopListing {
  listing_id: string
  title: string
  shop_slug: string
  views: number
  sales: number
}

export interface OrgStatsTotals {
  views: number
  unique_viewers: number
  cart_adds: number
  orders: number
  sales: number
  conversion_rate: number
  completed_orders: number
  active_listings: number
}

export interface GetOrgStatsResponse {
  spectrum_id: string
  shops: OrgShopStats[]
  totals: OrgStatsTotals
  /** The org's 10 most viewed listings. */
  top_listings: OrgTopListing[]
  /** Whether the caller may see orders per member (manage_orders). */
  orders_by_member_visible: boolean
  /**
   * Orders per member, sorted by name (never ranked); null without
   * manage_orders. Members with no assigned orders are left out.
   */
  orders_by_member: OrgMemberOrders[] | null
  /** Open orders nobody has claimed yet; null without manage_orders. */
  unassigned_open_orders: number | null
}

export interface GetOrgCustomersResponse {
  spectrum_id: string
  /**
   * People who placed orders with the org (the org itself or any shop it
   * owns), biggest order value first. Stats are per customer and leave
   * cancelled orders out. Not the org's members (a member who ordered from
   * the org is listed like anyone else).
   */
  customers: OrgCustomer[]
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

@Route("analytics")
@Tags("Analytics V2")
export class OrgAnalyticsV2Controller extends BaseController {
  /**
   * Analytics of every shop an org owns, rolled up: views, unique viewers,
   * cart adds, orders, sales and conversion per shop and in total, the
   * org's most viewed listings, and, for members with Manage Orders only,
   * orders per member (plain counts, by name). For the org's members and
   * site admins.
   *
   * @summary Get org analytics (rollup of its shops)
   * @param spectrum_id The org's spectrum ID
   */
  @Get("org-stats")
  @Security("loggedin")
  public async getOrgStats(
    @Query() spectrum_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<GetOrgStatsResponse> {
    if (request) this.request = request
    const db = getKnex()
    const org = await db("contractors")
      .where({ spectrum_id })
      .first<{ contractor_id: string; spectrum_id: string; archived: boolean } | undefined>(
        "contractor_id",
        "spectrum_id",
        "archived",
      )
    if (!org || org.archived) this.throwNotFound("Contractor", spectrum_id)
    const admin = this.isAdmin()
    const userId = this.getUserId()
    if (!admin && !(await is_member(org.contractor_id, userId))) {
      this.throwForbidden("Only the org's members can see its analytics")
    }
    const seeMembers = admin || (await has_permission(org.contractor_id, userId, "manage_orders"))

    const shops = await db("shops")
      .where("owner_contractor_id", org.contractor_id)
      .where("status", "active")
      .orderBy("created_at", "asc")
      .select<{ shop_id: string; slug: string; name: string; total_completed: number | null }[]>(
        "shop_id",
        "slug",
        "name",
        "total_completed",
      )
    const shopIds = shops.map((s) => s.shop_id)

    const [views, carts, orders, listings, top] = shopIds.length
      ? await Promise.all([
          db("listing_views_v2 as lv")
            .join("listings as l", "lv.listing_id", "l.listing_id")
            .whereIn("l.shop_id", shopIds)
            .groupBy("l.shop_id")
            .select(
              "l.shop_id",
              db.raw("COUNT(*)::integer as views"),
              db.raw("COUNT(DISTINCT lv.viewer_id)::integer as unique_viewers"),
            ),
          db("cart_items_v2 as ci")
            .join("listings as l", "ci.listing_id", "l.listing_id")
            .whereIn("l.shop_id", shopIds)
            .groupBy("l.shop_id")
            .select("l.shop_id", db.raw("COUNT(DISTINCT ci.user_id)::integer as cart_adds")),
          db("order_market_items_v2 as omi")
            .join("listings as l", "omi.listing_id", "l.listing_id")
            .join("orders as o", "omi.order_id", "o.order_id")
            .whereIn("l.shop_id", shopIds)
            .groupBy("l.shop_id")
            .select(
              "l.shop_id",
              db.raw("COUNT(DISTINCT o.order_id)::integer as orders"),
              db.raw(
                "COUNT(DISTINCT o.order_id) FILTER (WHERE o.status = 'fulfilled')::integer as sales",
              ),
            ),
          db("listing_search as ls")
            .whereIn("ls.shop_id", shopIds)
            .where("ls.status", "active")
            .groupBy("ls.shop_id")
            .select("ls.shop_id", db.raw("COUNT(*)::integer as active_listings")),
          db("listing_views_v2 as lv")
            .join("listings as l", "lv.listing_id", "l.listing_id")
            .join("shops as s", "s.shop_id", "l.shop_id")
            .whereIn("l.shop_id", shopIds)
            .groupBy("l.listing_id", "l.title", "s.slug")
            .orderByRaw("COUNT(*) DESC")
            .limit(10)
            .select(
              "l.listing_id",
              "l.title",
              "s.slug as shop_slug",
              db.raw("COUNT(*)::integer as views"),
              db.raw(`(
                SELECT COUNT(DISTINCT o.order_id)::integer
                FROM order_market_items_v2 omi
                JOIN orders o ON o.order_id = omi.order_id
                WHERE omi.listing_id = l.listing_id AND o.status = 'fulfilled'
              ) as sales`),
            ),
        ])
      : [[], [], [], [], []]

    const by = <T extends { shop_id: string }>(rows: T[]) =>
      new Map(rows.map((r) => [r.shop_id, r]))
    const viewsBy = by(views as { shop_id: string; views: number; unique_viewers: number }[])
    const cartsBy = by(carts as { shop_id: string; cart_adds: number }[])
    const ordersBy = by(orders as { shop_id: string; orders: number; sales: number }[])
    const listingsBy = by(listings as { shop_id: string; active_listings: number }[])

    const shopStats: OrgShopStats[] = shops.map((s) => {
      const v = viewsBy.get(s.shop_id)
      const o = ordersBy.get(s.shop_id)
      return {
        shop_id: s.shop_id,
        slug: s.slug,
        name: s.name,
        views: n(v?.views),
        unique_viewers: n(v?.unique_viewers),
        cart_adds: n(cartsBy.get(s.shop_id)?.cart_adds),
        orders: n(o?.orders),
        sales: n(o?.sales),
        conversion_rate: conversionRate(n(o?.sales), n(v?.views)),
        completed_orders: n(s.total_completed),
        active_listings: n(listingsBy.get(s.shop_id)?.active_listings),
      }
    })

    const totals = shopStats.reduce<OrgStatsTotals>(
      (acc, s) => ({
        views: acc.views + s.views,
        unique_viewers: acc.unique_viewers + s.unique_viewers,
        cart_adds: acc.cart_adds + s.cart_adds,
        orders: acc.orders + s.orders,
        sales: acc.sales + s.sales,
        conversion_rate: 0,
        completed_orders: acc.completed_orders + s.completed_orders,
        active_listings: acc.active_listings + s.active_listings,
      }),
      {
        views: 0,
        unique_viewers: 0,
        cart_adds: 0,
        orders: 0,
        sales: 0,
        conversion_rate: 0,
        completed_orders: 0,
        active_listings: 0,
      },
    )
    totals.conversion_rate = conversionRate(totals.sales, totals.views)

    let ordersByMember: OrgMemberOrders[] | null = null
    let unassignedOpen: number | null = null
    if (seeMembers) {
      const orgOrders = (q: ReturnType<typeof db>) =>
        q.where((w) => {
          w.where("o.contractor_id", org.contractor_id)
          if (shopIds.length) w.orWhereIn("o.shop_id", shopIds)
        })
      const [memberRows, unassigned] = await Promise.all([
        orgOrders(db("orders as o"))
          .join("contractor_members as cm", function () {
            this.on("cm.user_id", "=", "o.assigned_id").andOnVal(
              "cm.contractor_id",
              "=",
              org.contractor_id,
            )
          })
          .join("accounts as a", "a.user_id", "o.assigned_id")
          .groupBy("a.user_id", "a.username", "a.display_name")
          .select(
            "a.username",
            "a.display_name",
            db.raw("COUNT(*)::integer as assigned"),
            db.raw("COUNT(*) FILTER (WHERE o.status = 'fulfilled')::integer as completed"),
            db.raw(
              "COUNT(*) FILTER (WHERE o.status IN ('not-started', 'in-progress'))::integer as open",
            ),
          ),
        orgOrders(db("orders as o"))
          .whereNull("o.assigned_id")
          .whereIn("o.status", ["not-started", "in-progress"])
          .count("* as count")
          .first(),
      ])
      ordersByMember = sortMembersByName(
        (memberRows as OrgMemberOrders[]).map((r) => ({
          username: r.username,
          display_name: r.display_name,
          assigned: n(r.assigned),
          completed: n(r.completed),
          open: n(r.open),
        })),
      )
      unassignedOpen = n((unassigned as { count?: unknown } | undefined)?.count)
    }

    this.setHeader("Cache-Control", "private, no-store")
    return {
      spectrum_id: org.spectrum_id,
      shops: shopStats,
      totals,
      top_listings: (top as OrgTopListing[]).map((t) => ({
        listing_id: t.listing_id,
        title: t.title,
        shop_slug: t.shop_slug,
        views: n(t.views),
        sales: n(t.sales),
      })),
      orders_by_member_visible: seeMembers,
      orders_by_member: ordersByMember,
      unassigned_open_orders: unassignedOpen,
    }
  }

  /**
   * The org's customers: everyone who placed orders with the org or any of
   * its shops, each with their own order count, fulfilled count, total
   * order value (aUEC) and last order date. Cancelled orders are left out.
   * For the org's members and site admins.
   *
   * @summary Get an org's customers with per-customer order stats
   * @param spectrum_id The org's spectrum ID
   */
  @Get("org-customers")
  @Security("loggedin")
  public async getOrgCustomers(
    @Query() spectrum_id: string,
    @Request() request?: ExpressRequest,
  ): Promise<GetOrgCustomersResponse> {
    if (request) this.request = request
    const db = getKnex()
    const org = await db("contractors")
      .where({ spectrum_id })
      .first<{ contractor_id: string; spectrum_id: string; archived: boolean } | undefined>(
        "contractor_id",
        "spectrum_id",
        "archived",
      )
    if (!org || org.archived) this.throwNotFound("Contractor", spectrum_id)
    if (!this.isAdmin() && !(await is_member(org.contractor_id, this.getUserId()))) {
      this.throwForbidden("Only the org's members can see its customers")
    }

    // Every shop the org owns, inactive ones too: their past orders were
    // still placed with the org. Orders link to the org by contractor_id
    // (V1-era and org-addressed orders) or by the shop they were bought from.
    const shopIds = (
      await db("shops").where("owner_contractor_id", org.contractor_id).select<{ shop_id: string }[]>("shop_id")
    ).map((s) => s.shop_id)

    const rows = await db("orders as o")
      .join("accounts as a", "a.user_id", "o.customer_id")
      .leftJoin("image_resources as avatar_img", "avatar_img.resource_id", "a.avatar")
      .where((w) => {
        w.where("o.contractor_id", org.contractor_id)
        if (shopIds.length) w.orWhereIn("o.shop_id", shopIds)
      })
      .whereNot("o.status", "cancelled")
      .groupBy(
        "a.user_id",
        "a.username",
        "a.display_name",
        "avatar_img.resource_id",
        "avatar_img.external_url",
        "avatar_img.filename",
      )
      .select(
        "a.user_id",
        "a.username",
        "a.display_name",
        db.raw(`${imageUrlSql("avatar_img")} as avatar`),
        db.raw("COUNT(*)::integer as orders"),
        db.raw("COUNT(*) FILTER (WHERE o.status = 'fulfilled')::integer as fulfilled_orders"),
        db.raw("COALESCE(SUM(o.cost), 0)::bigint as total_value"),
        db.raw("MAX(o.timestamp) as last_order_at"),
      )

    this.setHeader("Cache-Control", "private, no-store")
    return {
      spectrum_id: org.spectrum_id,
      customers: toOrgCustomers(rows as OrgCustomerRow[]),
    }
  }
}
