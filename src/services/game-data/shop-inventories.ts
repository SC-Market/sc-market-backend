/**
 * In-game NPC shop inventories, imported as a step of the game data import.
 *
 * DISABLED BY DEFAULT. The only source so far, Data/Scripts/ShopInventories
 * in Data.p4k, is stale: the files date from 2024, list Port Olisar and
 * placeholder shops, and current inventories and prices are server-side, not
 * in the game files. extract-game-data no longer packs shop-inventories.json
 * into game-data.zip, and the admin import ignores the file (even in an older
 * ZIP that has it) unless GAME_DATA_IMPORT_SHOPS=true is set, deliberately,
 * for a source that is known to be current. See shopImportEnabled().
 *
 * When enabled, each import is a full snapshot:
 *
 * - shops are upserted on (name, location), so a shop keeps its id across
 *   imports (v1 /shops/game/:id links stay valid);
 * - inventory rows are upserted on (shop_id, item_uuid) and only rewritten
 *   when a value changed;
 * - rows the snapshot no longer lists are deleted: an item a shop stopped
 *   selling, and every shop the game data no longer has (its rows cascade);
 * - game_item_id links each row to game_items via p4k_id, so the step runs
 *   after the item import has written this patch's items.
 *
 * Everything happens in one transaction, so the wiki "where to buy" section
 * sees either the old inventory or the new one. game_shops / game_shop_items
 * are only read by the wiki and v1 shop pages and hold a few thousand rows;
 * the transaction takes row locks only and finishes in seconds.
 */

import type { Knex } from "knex"

/**
 * Whether the game data import may write in-game shops. Off unless the server
 * runs with GAME_DATA_IMPORT_SHOPS=true: shops from the game files are stale
 * and must never be published by a routine import.
 */
export function shopImportEnabled(): boolean {
  return process.env.GAME_DATA_IMPORT_SHOPS === "true"
}

export const SHOP_IMPORT_DISABLED_NOTE =
  "shop-inventories.json was ignored: in-game shops are not imported (the game files' shop data is stale; set GAME_DATA_IMPORT_SHOPS=true to enable)"

export interface P4KShopInventoryItem {
  /** Item record UUID in Data.p4k (game_items.p4k_id). */
  id: string
  name: string | null
  type: string | null
  subType: string | null
  buyPrice: number
  sellPrice: number
}

export interface P4KShopInventory {
  shop: string
  location: string
  filename: string | null
  items: P4KShopInventoryItem[]
}

export interface ShopInventoryImportStats {
  shopsImported: number
  shopItemsImported: number
  /** Inventory rows matched to a game_items row by p4k_id. */
  shopItemsLinked: number
  /** Shops no longer in the game data, deleted with their inventory. */
  shopsRemoved: number
  /** Inventory rows no longer in the game data (removed shops included). */
  shopItemsRemoved: number
  errors: string[]
}

// Column widths from migrations/20260519000000_shop_inventories.ts.
const WIDTH = {
  name: 200,
  location: 200,
  filename: 300,
  itemUuid: 100,
  itemName: 300,
  itemType: 100,
}
const CHUNK = 500

interface ShopRow {
  name: string
  location: string
  filename: string | null
  items: Map<string, P4KShopInventoryItem>
}

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null

const price = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null

/** Validates the snapshot; malformed shops and items are skipped with an error. */
function normalize(
  inventories: P4KShopInventory[],
  errors: string[],
): ShopRow[] {
  const shops = new Map<string, ShopRow>()

  for (const entry of inventories) {
    const name = text(entry?.shop)
    const location = text(entry?.location)
    if (
      !name ||
      !location ||
      name.length > WIDTH.name ||
      location.length > WIDTH.location
    ) {
      errors.push(
        `Shop skipped: invalid name/location ${JSON.stringify([entry?.shop, entry?.location])}`,
      )
      continue
    }
    const filename = text(entry.filename)
    const key = `${name}\u0000${location}`
    let shop = shops.get(key)
    if (!shop) {
      shop = {
        name,
        location,
        filename:
          filename && filename.length <= WIDTH.filename ? filename : null,
        items: new Map(),
      }
      shops.set(key, shop)
    } else {
      errors.push(
        `Shop ${name} @ ${location} appears more than once; inventories merged`,
      )
    }

    for (const item of Array.isArray(entry.items) ? entry.items : []) {
      const uuid = text(item?.id)
      if (!uuid || uuid.length > WIDTH.itemUuid) {
        errors.push(
          `Shop ${name} @ ${location}: item skipped, invalid id ${JSON.stringify(item?.id)}`,
        )
        continue
      }
      if (shop.items.has(uuid)) {
        errors.push(
          `Shop ${name} @ ${location}: item ${uuid} listed more than once; first listing kept`,
        )
        continue
      }
      shop.items.set(uuid, item)
    }
  }

  return [...shops.values()]
}

export async function importShopInventories(
  knex: Knex,
  inventories: P4KShopInventory[],
): Promise<ShopInventoryImportStats> {
  const stats: ShopInventoryImportStats = {
    shopsImported: 0,
    shopItemsImported: 0,
    shopItemsLinked: 0,
    shopsRemoved: 0,
    shopItemsRemoved: 0,
    errors: [],
  }

  const shops = normalize(inventories, stats.errors)
  // An empty or wholly malformed snapshot must not wipe the tables.
  if (shops.length === 0) {
    stats.errors.push(
      "shop-inventories.json has no valid shops; in-game shops were not changed",
    )
    return stats
  }

  await knex.transaction(async (trx) => {
    const uuids = [...new Set(shops.flatMap((s) => [...s.items.keys()]))]
    const gameItemByP4kId = new Map<string, string>()
    for (let i = 0; i < uuids.length; i += CHUNK) {
      const rows: Array<{ id: string; p4k_id: string }> = await trx(
        "game_items",
      )
        .whereIn("p4k_id", uuids.slice(i, i + CHUNK))
        .select("id", "p4k_id")
      for (const row of rows) gameItemByP4kId.set(row.p4k_id, row.id)
    }

    const shopRows: Array<{ id: string; name: string; location: string }> =
      await trx("game_shops")
        .insert(
          shops.map((s) => ({
            name: s.name,
            location: s.location,
            filename: s.filename,
          })),
        )
        .onConflict(["name", "location"])
        .merge({
          filename: trx.raw("EXCLUDED.filename"),
          updated_at: trx.fn.now(),
        })
        .returning(["id", "name", "location"])
    const shopId = new Map(
      shopRows.map((r) => [`${r.name}\u0000${r.location}`, r.id]),
    )
    stats.shopsImported = shopRows.length

    const keepShopIds: string[] = []
    const keepItemUuids: string[] = []
    const itemRows = shops.flatMap((s) => {
      const id = shopId.get(`${s.name}\u0000${s.location}`)!
      return [...s.items.entries()].map(([uuid, item]) => {
        keepShopIds.push(id)
        keepItemUuids.push(uuid)
        const gameItemId = gameItemByP4kId.get(uuid) ?? null
        if (gameItemId) stats.shopItemsLinked++
        return {
          shop_id: id,
          game_item_id: gameItemId,
          item_uuid: uuid,
          item_name: text(item.name)?.slice(0, WIDTH.itemName) ?? null,
          item_type: text(item.type)?.slice(0, WIDTH.itemType) ?? null,
          item_sub_type: text(item.subType)?.slice(0, WIDTH.itemType) ?? null,
          buy_price: price(item.buyPrice),
          sell_price: price(item.sellPrice),
        }
      })
    })
    stats.shopItemsImported = itemRows.length

    const columns = [
      "game_item_id",
      "item_name",
      "item_type",
      "item_sub_type",
      "buy_price",
      "sell_price",
    ]
    for (let i = 0; i < itemRows.length; i += CHUNK) {
      await trx("game_shop_items")
        .insert(itemRows.slice(i, i + CHUNK))
        .onConflict(["shop_id", "item_uuid"])
        .merge({
          ...Object.fromEntries(
            columns.map((c) => [c, trx.raw(`EXCLUDED.${c}`)]),
          ),
          updated_at: trx.fn.now(),
        })
        // Unchanged rows are left alone (no rewrite, updated_at keeps the
        // time of the last real change).
        .whereRaw(
          `(${columns.map((c) => `game_shop_items.${c}`).join(", ")}) IS DISTINCT FROM (${columns
            .map((c) => `EXCLUDED.${c}`)
            .join(", ")})`,
        )
    }

    // Items an imported shop no longer stocks.
    const staleItems = await trx.raw(
      `DELETE FROM game_shop_items gsi
        WHERE gsi.shop_id = ANY(?::uuid[])
          AND NOT EXISTS (
            SELECT 1 FROM unnest(?::uuid[], ?::text[]) AS keep(shop_id, item_uuid)
             WHERE keep.shop_id = gsi.shop_id AND keep.item_uuid = gsi.item_uuid
          )`,
      [shopRows.map((r) => r.id), keepShopIds, keepItemUuids],
    )
    // Shops the game data no longer has, with their inventory.
    const goneShopIds: string[] = (
      await trx("game_shops")
        .whereNotIn(
          "id",
          shopRows.map((r) => r.id),
        )
        .select("id")
    ).map((r: { id: string }) => r.id)
    let goneItems = 0
    if (goneShopIds.length > 0) {
      goneItems = await trx("game_shop_items")
        .whereIn("shop_id", goneShopIds)
        .delete()
      stats.shopsRemoved = await trx("game_shops")
        .whereIn("id", goneShopIds)
        .delete()
    }
    stats.shopItemsRemoved = (staleItems.rowCount ?? 0) + goneItems
  })

  return stats
}
