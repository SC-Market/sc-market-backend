import {
  Controller,
  Get,
  Path,
  Query,
  Request,
  Response,
  Route,
  Security,
  Tags,
} from "tsoa"
import type { Request as ExpressRequest } from "express"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { ListingsV2Controller } from "../../../v2/listings/ListingsV2Controller.js"
import type { GetMyListingsResponse } from "../../../v2/types/listings.types.js"
import { clampPagination } from "../../../v2/util/pagination.js"
import {
  DEFAULT_PAGE_SIZE,
  reachableShop,
  reachableShops,
  type ReachableShop,
} from "../access.js"
import type { PublicErrorBody } from "../errors.js"
import type { PublicData, PublicShop, PublicShopList } from "../types.js"

function iso(value: unknown): string {
  const d = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString()
}

async function toPublicShops(shops: ReachableShop[]): Promise<PublicShop[]> {
  const orgIds = [
    ...new Set(
      shops
        .map((s) => s.owner_contractor_id)
        .filter((id): id is string => !!id),
    ),
  ]
  const spectrum = new Map<string, string>()
  if (orgIds.length) {
    const rows: { contractor_id: string; spectrum_id: string }[] =
      await getKnex()("contractors")
        .whereIn("contractor_id", orgIds)
        .select("contractor_id", "spectrum_id")
    for (const r of rows) spectrum.set(r.contractor_id, r.spectrum_id)
  }
  return shops.map((s) => ({
    shop_id: s.shop_id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    status: s.status,
    owner: s.owner_contractor_id
      ? {
          type: "org" as const,
          user_id: null,
          spectrum_id: spectrum.get(s.owner_contractor_id) ?? null,
        }
      : { type: "user" as const, user_id: s.owner_user_id, spectrum_id: null },
    supported_languages: s.supported_languages ?? [],
    tags: s.tags ?? [],
    accepts_custom_orders: s.accepts_custom_orders ?? false,
    created_at: iso(s.created_at),
    updated_at: iso(s.updated_at),
    permissions: s.permissions,
  }))
}

@Route("shops")
@Tags("Shops")
@Response<PublicErrorBody>(401, "Missing, invalid, expired or revoked token")
@Response<PublicErrorBody>(
  403,
  "The token lacks the required scope (INSUFFICIENT_SCOPE)",
)
@Response<PublicErrorBody>(429, "Rate limit exceeded")
export class ShopsController extends Controller {
  /**
   * Shops the token's user belongs to: their personal shop, and the shops of
   * the orgs the token was granted, with the user's permissions in each.
   *
   * @summary List shops
   * @param page Page number, from 1
   * @param page_size Results per page, 1-100 (default 25)
   */
  @Get("")
  @Security("apiToken", ["shops:read"])
  public async listShops(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<PublicData<PublicShopList>> {
    const p = clampPagination(page, page_size, {
      defaultPageSize: DEFAULT_PAGE_SIZE,
    })
    const all = await reachableShops(request)
    const shops = await toPublicShops(
      all.slice(p.offset, p.offset + p.page_size),
    )
    return {
      data: { shops, total: all.length, page: p.page, page_size: p.page_size },
    }
  }

  /**
   * One shop, by UUID or slug. 404 when the token doesn't reach it.
   *
   * @summary Get shop
   * @param shop Shop UUID or slug
   */
  @Get("{shop}")
  @Security("apiToken", ["shops:read"])
  @Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
  public async getShop(
    @Path() shop: string,
    @Request() request: ExpressRequest,
  ): Promise<PublicData<PublicShop>> {
    const [result] = await toPublicShops([await reachableShop(request, shop)])
    return { data: result }
  }

  /**
   * The shop's listings, every status and visibility, as its seller sees
   * them. Archived (cancelled) listings only with status=cancelled.
   *
   * @summary List a shop's listings
   * @param shop Shop UUID or slug
   * @param status Only listings with this status
   * @param updated_since Only listings updated at or after this time
   * @param page Page number, from 1
   * @param page_size Results per page, 1-100 (default 25)
   */
  @Get("{shop}/listings")
  @Security("apiToken", ["listings:read"])
  @Response<PublicErrorBody>(404, "Not found, or not reachable with this token")
  public async listShopListings(
    @Path() shop: string,
    @Request() request: ExpressRequest,
    @Query() status?: "active" | "inactive" | "sold" | "expired" | "cancelled",
    @Query() updated_since?: Date,
    @Query() sort_by?: "created_at" | "updated_at" | "price" | "quantity",
    @Query() sort_order?: "asc" | "desc",
    @Query() page?: number,
    @Query() page_size?: number,
  ): Promise<PublicData<GetMyListingsResponse>> {
    const target = await reachableShop(request, shop)
    const listings = await new ListingsV2Controller(request).getMyListings(
      status,
      page,
      page_size ?? DEFAULT_PAGE_SIZE,
      sort_by,
      sort_order,
      undefined,
      target.shop_id,
      request,
      updated_since,
    )
    return { data: listings }
  }
}
