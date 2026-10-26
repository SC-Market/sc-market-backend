import {
  Body,
  Delete,
  Get,
  Patch,
  Path,
  Post,
  Request,
  Route,
  Security,
  Tags,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import {
  addWatchlistItem,
  describeWatchlistItems,
  listWatchlistItems,
  removeWatchlistItem,
  updateWatchlistItemPrice,
  WATCHLIST_MAX_ITEMS,
  WatchlistError,
  type WatchlistItemView,
} from "../../../../services/watchlist/watchlist-items.service.js"
import type {
  AddWatchlistItemRequest,
  UpdateWatchlistItemRequest,
  WatchlistItem,
  WatchlistResponse,
} from "../types/watchlist.types.js"

function toIso(value: Date | string | null): string | null {
  if (value == null) return null
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

function serialize(item: WatchlistItemView): WatchlistItem {
  return {
    id: item.id,
    query: item.query,
    game_item_id: item.game_item_id,
    item_name: item.item_name,
    item_image_url: item.item_image_url,
    max_price: item.max_price,
    current_lowest: item.current_lowest,
    last_notified_at: toIso(item.last_notified_at),
    created_at: toIso(item.created_at) ?? "",
  }
}

/**
 * The signed-in user's watchlist: price alerts for items they want to buy.
 * The same list the Discord bot's `/watchlist` commands manage.
 */
@Route("watchlist")
@Tags("Watchlist")
export class WatchlistV2Controller extends BaseController {
  /**
   * List the current user's watched items with their current lowest price
   * @summary List my watchlist
   */
  @Security("loggedin")
  @Get()
  public async getWatchlist(
    @Request() request: ExpressRequest,
  ): Promise<WatchlistResponse> {
    this.request = request
    const items = await listWatchlistItems(getKnex(), this.getUserId())
    return { items: items.map(serialize), max_items: WATCHLIST_MAX_ITEMS }
  }

  /**
   * Watch a game item (or a text query) with a target price
   * @summary Add a watchlist item
   */
  @Security("loggedin")
  @Post()
  public async addWatchlistItem(
    @Body() body: AddWatchlistItemRequest,
    @Request() request: ExpressRequest,
  ): Promise<WatchlistItem> {
    this.request = request
    const db = getKnex()
    const row = await this.run(() =>
      addWatchlistItem(db, this.getUserId(), body),
    )
    const [view] = await describeWatchlistItems(db, [row])
    return serialize(view)
  }

  /**
   * Change the target price of a watched item
   * @summary Update a watchlist item
   */
  @Security("loggedin")
  @Patch("{watchlist_id}")
  public async updateWatchlistItem(
    @Path() watchlist_id: string,
    @Body() body: UpdateWatchlistItemRequest,
    @Request() request: ExpressRequest,
  ): Promise<WatchlistItem> {
    this.request = request
    const db = getKnex()
    const row = await this.run(() =>
      updateWatchlistItemPrice(
        db,
        this.getUserId(),
        watchlist_id,
        body.max_price,
      ),
    )
    const [view] = await describeWatchlistItems(db, [row])
    return serialize(view)
  }

  /**
   * Stop watching an item
   * @summary Remove a watchlist item
   */
  @Security("loggedin")
  @Delete("{watchlist_id}")
  public async removeWatchlistItem(
    @Path() watchlist_id: string,
    @Request() request: ExpressRequest,
  ): Promise<{ success: boolean }> {
    this.request = request
    await this.run(() =>
      removeWatchlistItem(getKnex(), this.getUserId(), watchlist_id),
    )
    return { success: true }
  }

  /** Report a WatchlistError as the matching API error. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn()
    } catch (error) {
      if (!(error instanceof WatchlistError)) throw error
      if (error.code === "not_found") this.throwNotFound("Watchlist item")
      if (error.code === "duplicate") this.throwConflict(error.message)
      if (error.code === "limit") {
        this.throwBusinessError(ErrorCode.VALIDATION_ERROR, error.message)
      }
      this.throwValidationError(error.message, [
        { field: error.field ?? "body", message: error.message },
      ])
    }
  }
}
