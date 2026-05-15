/**
 * Wiki V2 Controller
 *
 * TSOA controller for game database wiki endpoints.
 * Provides comprehensive item, ship, commodity, location, and manufacturer browsing.
 *
 * Requirements: 8.9 - Game Database Wiki backend
 */

import { Controller, Get, Route, Tags, Query, Path } from "tsoa"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  SearchWikiItemsRequest,
  SearchWikiItemsResponse,
  WikiItemDetail,
  WikiShipSearchResult,
  WikiShipDetail,
  WikiCommoditySearchResult,
  WikiLocationNode,
  WikiManufacturerSearchResult,
  WikiManufacturerDetail,
} from "./wiki.types.js"
import logger from "../../../../../logger/logger.js"

@Route("game-data/wiki")
@Tags("Game Data - Wiki")
export class WikiController extends BaseController {
  /**
   * Search and filter game items with full stats
   *
   * Returns comprehensive item database with filtering by type, size, grade,
   * manufacturer, and full-text search. Includes all item attributes extracted
   * from game data (weapon stats, shield stats, power output, etc.).
   *
   * @summary Search wiki items
   * @param text Full-text search on item name
   * @param type Filter by item type (e.g., WeaponGun, Shield, PowerPlant)
   * @param sub_type Filter by item sub-type
   * @param size Filter by item size (1-5, S1-S5)
   * @param grade Filter by item grade (A, B, C, D, F)
   * @param manufacturer Filter by manufacturer name
   * @param category Filter by game item category
   * @param version_id Game version ID (defaults to active LIVE version)
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Wiki item search results with pagination
   */
  @Get("items")
  public async searchItems(
    @Query() text?: string,
    @Query() type?: string,
    @Query() sub_type?: string,
    @Query() size?: string,
    @Query() grade?: string,
    @Query() manufacturer?: string,
    @Query() category?: string,
    @Query() version_id?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<SearchWikiItemsResponse> {
    const knex = getKnex()

    // Validate pagination parameters
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    logger.info("Searching wiki items", {
      text,
      type,
      manufacturer,
      page: validatedPage,
      page_size: validatedPageSize,
    })

    try {
      // Build query
      let itemsQuery = knex("game_items as gi")
        .leftJoin("wiki_manufacturers as wm", "wm.code", "gi.manufacturer")
        .select(
          "gi.id",
          "gi.name",
          "gi.type",
          "gi.sub_type",
          "gi.size",
          "gi.grade",
          "gi.manufacturer",
          knex.raw("wm.name as manufacturer_name"),
          "gi.image_url",
          "gi.thumbnail_path",
          "gi.display_type",
          knex.raw(`(
            SELECT COALESCE(ir.external_url, 'https://cdn.sc-market.space/' || ir.filename)
            FROM listing_items li
            JOIN listings l ON l.listing_id = li.listing_id AND l.status = 'active'
            JOIN listing_photos_v2 lp ON lp.listing_id = l.listing_id
            JOIN image_resources ir ON lp.resource_id = ir.resource_id
            WHERE li.game_item_id::text = gi.id::text
            ORDER BY lp.display_order ASC LIMIT 1
          ) as listing_photo`),
        )

      // Apply text search filter
      if (text && text.length > 0) {
        itemsQuery = itemsQuery.where(function () {
          this.whereRaw(
            "to_tsvector('english', gi.name) @@ plainto_tsquery('english', ?)",
            [text],
          ).orWhere("gi.name", "ilike", `%${text}%`)
        })
      }

      // Apply type filter
      if (type) {
        itemsQuery = itemsQuery.where("gi.type", type)
      }

      // Apply sub_type filter
      if (sub_type) {
        itemsQuery = itemsQuery.where("gi.sub_type", sub_type)
      }

      // Apply size filter
      if (size) {
        itemsQuery = itemsQuery.where("gi.size", size)
      }

      // Apply grade filter
      if (grade) {
        itemsQuery = itemsQuery.where("gi.grade", grade)
      }

      // Apply manufacturer filter
      if (manufacturer) {
        itemsQuery = itemsQuery.where("gi.manufacturer", manufacturer)
      }

      // Apply category filter
      if (category) {
        itemsQuery = itemsQuery.where("gi.category", category)
      }

      // Get total count for pagination
      const countQuery = itemsQuery.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply sorting and pagination
      itemsQuery = itemsQuery.orderBy("gi.name", "asc")

      // Apply pagination
      const offset = (validatedPage - 1) * validatedPageSize
      itemsQuery = itemsQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const itemsResults = await itemsQuery

      logger.info("Wiki items search completed", {
        total,
        returned: itemsResults.length,
        page: validatedPage,
      })

      // Transform results
      const items = itemsResults.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type || undefined,
        sub_type: row.sub_type || undefined,
        size: row.size || undefined,
        grade: row.grade || undefined,
        manufacturer: row.manufacturer_name || row.manufacturer || undefined,
        image_url: row.image_url || row.listing_photo || undefined,
        thumbnail_path: row.thumbnail_path || undefined,
        display_type: row.display_type || undefined,
      }))

      return {
        items,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to search wiki items", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get item detail with all attributes, crafting recipes, and related missions
   *
   * Returns complete item information including all extracted attributes
   * (weapon stats, shield stats, power output, etc.), blueprints that craft
   * this item, missions that reward this item, and market listing statistics.
   *
   * @summary Get item details
   * @param id Game item UUID
   * @returns Complete item details with attributes, recipes, and missions
   */
  @Get("items/{id}")
  public async getItemDetail(@Path() id: string): Promise<WikiItemDetail> {
    const knex = getKnex()

    if (!id) {
      this.throwValidationError("id is required", [
        { field: "id", message: "Item ID is required" },
      ])
    }

    logger.info("Fetching wiki item detail", { id })

    try {
      // Get item data
      const itemRow = await knex("game_items").where("id", id).first()

      if (!itemRow) {
        this.throwNotFound("Item", id)
      }

      // Get item attributes
      const attributesRows = await knex("game_item_attributes")
        .where("game_item_id", id)
        .select("attribute_name", "attribute_value")

      const attributes: Record<string, any> = {}
      for (const row of attributesRows) {
        attributes[row.attribute_name] = row.attribute_value
      }

      // Get blueprints that output this item
      const blueprintsRows = await knex("blueprints as b")
        .where("b.output_game_item_id", id)
        .where("b.is_active", true)
        .select(
          "b.blueprint_id",
          "b.blueprint_name",
          "b.rarity",
          "b.tier",
          "b.crafting_time_seconds",
        )
        .orderBy("b.blueprint_name", "asc")

      const craftable_from = blueprintsRows.map((row: any) => ({
        blueprint_id: row.blueprint_id,
        blueprint_name: row.blueprint_name,
        rarity: row.rarity || undefined,
        tier: row.tier || undefined,
        crafting_time_seconds: row.crafting_time_seconds || undefined,
      }))

      // Get missions that reward blueprints for this item
      const missionsRows = await knex("missions as m")
        .join("mission_blueprint_rewards as mbr", "m.mission_id", "mbr.mission_id")
        .join("blueprints as b", "mbr.blueprint_id", "b.blueprint_id")
        .where("b.output_game_item_id", id)
        .where("b.is_active", true)
        .select(
          "m.mission_id",
          "m.mission_name",
          "m.star_system",
          "mbr.drop_probability",
          "b.blueprint_id",
          "b.blueprint_name",
        )
        .orderBy("mbr.drop_probability", "desc")
        .orderBy("m.mission_name", "asc")

      const rewarded_by = missionsRows.map((row: any) => ({
        mission_id: row.mission_id,
        mission_name: row.mission_name,
        star_system: row.star_system || undefined,
        drop_probability: parseFloat(row.drop_probability),
        blueprint_id: row.blueprint_id,
        blueprint_name: row.blueprint_name,
      }))

      // Get market listing statistics
      const marketStatsRow = await knex("listings as l")
        .join("listing_items as li", "l.listing_id", "li.listing_id")
        .where("li.game_item_id", id)
        .where("l.status", "active")
        .select(
          knex.raw("COUNT(DISTINCT l.listing_id) as listing_count"),
          knex.raw("MIN(li.base_price) as min_price"),
          knex.raw("MAX(li.base_price) as max_price"),
          knex.raw("SUM(li.quantity_available) as total_quantity"),
        )
        .first()

      const market_stats = marketStatsRow
        ? {
            listing_count: parseInt(String(marketStatsRow.listing_count), 10) || 0,
            min_price: marketStatsRow.min_price
              ? parseInt(String(marketStatsRow.min_price), 10)
              : undefined,
            max_price: marketStatsRow.max_price
              ? parseInt(String(marketStatsRow.max_price), 10)
              : undefined,
            total_quantity: parseInt(String(marketStatsRow.total_quantity), 10) || 0,
          }
        : {
            listing_count: 0,
            total_quantity: 0,
          }

      logger.info("Wiki item detail fetched successfully", {
        id,
        craftable_from_count: craftable_from.length,
        rewarded_by_count: rewarded_by.length,
      })

      return {
        id: itemRow.id,
        name: itemRow.name,
        type: itemRow.type || undefined,
        sub_type: itemRow.sub_type || undefined,
        size: itemRow.size || undefined,
        grade: itemRow.grade || undefined,
        manufacturer: itemRow.manufacturer || undefined,
        image_url: itemRow.image_url || undefined,
        thumbnail_path: itemRow.thumbnail_path || undefined,
        display_type: itemRow.display_type || undefined,
        p4k_id: itemRow.p4k_id || undefined,
        p4k_file: itemRow.p4k_file || undefined,
        name_key: itemRow.name_key || undefined,
        attributes,
        craftable_from,
        rewarded_by,
        market_stats,
      }
    } catch (error) {
      logger.error("Failed to fetch wiki item detail", {
        id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get ship list with manufacturer, focus, and size
   *
   * Returns all ships with basic information for browsing. Ships are identified
   * by specific item types in the game data.
   *
   * @summary Get ships
   * @param manufacturer Filter by manufacturer
   * @param focus Filter by ship focus (e.g., Combat, Exploration, Mining)
   * @param size Filter by ship size
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Ship search results with pagination
   */
  @Get("ships")
  public async getShips(
    @Query() manufacturer?: string,
    @Query() focus?: string,
    @Query() size?: string,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<{ ships: WikiShipSearchResult[]; total: number; page: number; page_size: number }> {
    const knex = getKnex()

    // Validate pagination — allow up to 500 since the frontend fetches all for client-side filtering
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(500, Math.max(1, page_size || 20))

    logger.info("Fetching ships", { manufacturer, focus, size, page: validatedPage })

    try {
      // Use the latest version (most recent upload), not just active LIVE
      const latestVersion = await knex("game_versions")
        .whereIn("version_type", ["LIVE", "PTU"])
        .orderBy("created_at", "desc")
        .first()

      if (!latestVersion) {
        return { ships: [], total: 0, page: validatedPage, page_size: validatedPageSize }
      }

      // Primary source: wiki_ships (versioned, deduplicated by name)
      // LEFT JOIN game_items for the UUID (used for market linking)
      let shipsQuery = knex(
        knex.raw(
          `(SELECT DISTINCT ON (name) * FROM wiki_ships WHERE version_id = ? ORDER BY name, ship_code) as ws`,
          [latestVersion.version_id],
        ),
      )
        .leftJoin("game_items as gi", function () {
          this.on("gi.name", "=", "ws.name").andOn(
            "gi.type",
            "=",
            knex.raw("?", ["Ship for Sale/Rental"]),
          )
        })
        .select(
          knex.raw("COALESCE(gi.id::text, ws.ship_id::text) as id"),
          "ws.name",
          knex.raw("COALESCE(ws.manufacturer_code, gi.manufacturer) as manufacturer"),
          "ws.size",
          "gi.image_url",
          "ws.focus",
          "ws.ship_code",
          "ws.crew_size",
          "ws.career",
          "ws.role",
          "ws.length_m",
          "ws.width_m",
          "ws.height_m",
        )

      // Apply manufacturer filter
      if (manufacturer) {
        shipsQuery = shipsQuery.where(function () {
          this.where("ws.manufacturer_code", manufacturer).orWhere("gi.manufacturer", manufacturer)
        })
      }

      // Apply focus filter
      if (focus) {
        shipsQuery = shipsQuery.where("ws.focus", focus)
      }

      // Apply size filter
      if (size) {
        shipsQuery = shipsQuery.where("ws.size", size)
      }

      // Get total count
      const countQuery = shipsQuery.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply sorting and pagination
      shipsQuery = shipsQuery.orderBy("ws.name", "asc")
      const offset = (validatedPage - 1) * validatedPageSize
      shipsQuery = shipsQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const shipsResults = await shipsQuery

      const ships = shipsResults.map((row: any) => ({
        id: row.id,
        name: row.name,
        ship_code: row.ship_code || undefined,
        manufacturer: row.manufacturer || undefined,
        focus: row.focus || undefined,
        size: row.size != null ? String(row.size) : undefined,
        image_url: row.image_url || undefined,
        crew_size: row.crew_size != null ? Number(row.crew_size) : undefined,
        career: row.career || undefined,
        role: row.role || undefined,
        length_m: row.length_m != null ? parseFloat(row.length_m) : undefined,
        width_m: row.width_m != null ? parseFloat(row.width_m) : undefined,
        height_m: row.height_m != null ? parseFloat(row.height_m) : undefined,
      }))

      logger.info("Ships fetched successfully", { total, returned: ships.length })

      return {
        ships,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch ships", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get ship detail with default loadout and description
   *
   * Returns complete ship information including all attributes, default loadout
   * components, and detailed specifications.
   *
   * @summary Get ship details
   * @param id Ship game item UUID
   * @returns Complete ship details with loadout
   */
  @Get("ships/{id}")
  public async getShipDetail(@Path() id: string): Promise<WikiShipDetail> {
    const knex = getKnex()

    if (!id) {
      this.throwValidationError("id is required", [
        { field: "id", message: "Ship ID is required" },
      ])
    }

    logger.info("Fetching ship detail", { id })

    try {
      // Use the latest version (most recent upload)
      const latestVersion = await knex("game_versions")
        .whereIn("version_type", ["LIVE", "PTU"])
        .orderBy("created_at", "desc")
        .first()

      // Support lookup by UUID or ship_code
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      let shipRow: any
      let wikiShip: any = null

      if (isUuid) {
        shipRow = await knex("game_items").where("id", id).first()
        if (shipRow && latestVersion) {
          wikiShip = await knex("wiki_ships")
            .where("name", shipRow.name)
            .where("version_id", latestVersion.version_id)
            .first()
        }
      } else {
        // Lookup by ship_code
        if (latestVersion) {
          wikiShip = await knex("wiki_ships")
            .where("ship_code", id)
            .where("version_id", latestVersion.version_id)
            .first()
        }
        if (wikiShip) {
          shipRow = await knex("game_items")
            .where("name", wikiShip.name)
            .where("type", "Ship for Sale/Rental")
            .first()
        }
        if (!shipRow) {
          shipRow = await knex("game_items").where("p4k_id", id).first()
        }
      }

      if (!shipRow) {
        this.throwNotFound("Ship", id)
      }

      // Get ship attributes
      const attributesRows = await knex("game_item_attributes")
        .where("game_item_id", shipRow.id)
        .select("attribute_name", "attribute_value")

      const attributes: Record<string, any> = {}
      for (const row of attributesRows) {
        attributes[row.attribute_name] = row.attribute_value
      }

      const focus = attributes.ship_focus || undefined
      const description = attributes.description || undefined
      const movement_class = attributes.movement_class || undefined
      const default_loadout = attributes.default_loadout || undefined

      logger.info("Ship detail fetched successfully", { id })

      return {
        id: shipRow.id,
        name: shipRow.name,
        ship_code: wikiShip?.ship_code || undefined,
        manufacturer: shipRow.manufacturer || undefined,
        focus,
        size: shipRow.size || undefined,
        description,
        movement_class,
        image_url: shipRow.image_url || undefined,
        default_loadout,
        attributes,
        crew_size: wikiShip?.crew_size != null ? Number(wikiShip.crew_size) : undefined,
        career: wikiShip?.career || undefined,
        role: wikiShip?.role || undefined,
        length_m: wikiShip?.length_m != null ? parseFloat(wikiShip.length_m) : undefined,
        width_m: wikiShip?.width_m != null ? parseFloat(wikiShip.width_m) : undefined,
        height_m: wikiShip?.height_m != null ? parseFloat(wikiShip.height_m) : undefined,
      }
    } catch (error) {
      logger.error("Failed to fetch ship detail", {
        id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get commodity/resource list with mining stats
   *
   * Returns all resources and commodities with acquisition methods and mining
   * statistics where applicable.
   *
   * @summary Get commodities
   * @param category Filter by resource category
   * @param can_be_mined Filter to mineable resources only
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   * @returns Commodity search results with pagination
   */
  @Get("commodities")
  public async getCommodities(
    @Query() category?: string,
    @Query() can_be_mined?: boolean,
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<{
    commodities: WikiCommoditySearchResult[]
    total: number
    page: number
    page_size: number
  }> {
    const knex = getKnex()

    // Validate pagination parameters
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    logger.info("Fetching commodities", { category, can_be_mined, page: validatedPage })

    try {
      // Get active LIVE version
      const activeVersion = await knex("game_versions")
        .where("version_type", "LIVE")
        .where("is_active", true)
        .orderBy("created_at", "desc")
        .first()

      if (!activeVersion) {
        this.throwNotFound("Active LIVE game version", "LIVE")
      }

      // Build query
      let commoditiesQuery = knex("resources as r")
        .join("game_items as gi", "r.game_item_id", "gi.id")
        .where("r.version_id", activeVersion.version_id)
        .select(
          "r.resource_id",
          "gi.id as game_item_id",
          "gi.name",
          "r.resource_category",
          "r.resource_subcategory",
          "r.can_be_mined",
          "r.can_be_purchased",
          "r.can_be_salvaged",
          "r.can_be_looted",
          "gi.image_url",
        )

      // Apply category filter
      if (category) {
        commoditiesQuery = commoditiesQuery.where("r.resource_category", category)
      }

      // Apply mineable filter
      if (can_be_mined !== undefined) {
        commoditiesQuery = commoditiesQuery.where("r.can_be_mined", can_be_mined)
      }

      // Get total count
      const countQuery = commoditiesQuery.clone().clearSelect().clearOrder().count("* as count")
      const [{ count: totalCount }] = await countQuery
      const total = parseInt(String(totalCount), 10)

      // Apply sorting and pagination
      commoditiesQuery = commoditiesQuery.orderBy("gi.name", "asc")
      const offset = (validatedPage - 1) * validatedPageSize
      commoditiesQuery = commoditiesQuery.limit(validatedPageSize).offset(offset)

      // Execute query
      const commoditiesResults = await commoditiesQuery

      const commodities = commoditiesResults.map((row: any) => ({
        resource_id: row.resource_id,
        game_item_id: row.game_item_id,
        name: row.name,
        resource_category: row.resource_category,
        resource_subcategory: row.resource_subcategory || undefined,
        can_be_mined: row.can_be_mined || false,
        can_be_purchased: row.can_be_purchased || false,
        can_be_salvaged: row.can_be_salvaged || false,
        can_be_looted: row.can_be_looted || false,
        image_url: row.image_url || undefined,
      }))

      logger.info("Commodities fetched successfully", { total, returned: commodities.length })

      return {
        commodities,
        total,
        page: validatedPage,
        page_size: validatedPageSize,
      }
    } catch (error) {
      logger.error("Failed to fetch commodities", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get starmap hierarchy browser
   *
   * Returns hierarchical location data (System → Planet → Moon → Outpost)
   * for browsing the game universe.
   *
   * @summary Get locations
   * @param parent_id Optional parent location ID to get children
   * @returns Location hierarchy nodes
   */
  @Get("locations")
  public async getLocations(@Query() parent_id?: string): Promise<WikiLocationNode[]> {
    const knex = getKnex()

    logger.info("Fetching locations", { parent_id })

    try {
      // Query all locations with jurisdiction friendly name
      const rows = await knex("starmap_locations as sl")
        .leftJoin("jurisdictions as j", "sl.jurisdiction_code", "j.code")
        .select(
          "sl.location_id",
          "sl.location_code",
          "sl.location_name",
          "sl.location_type",
          "sl.parent_code",
          "sl.jurisdiction",
          "sl.jurisdiction_code",
          "sl.description",
          "sl.size",
          "sl.nav_icon",
          "sl.respawn_type",
          "sl.file_name",
          "sl.qt_arrival_radius",
          "sl.qt_obstruction_radius",
          "j.name as jurisdiction_name",
        )

      // Query amenities for all locations
      const amenityRows = await knex("location_amenities as la")
        .join("starmap_locations as sl2", "la.location_id", "sl2.location_id")
        .join("starmap_amenity_types as sat", "la.amenity_p4k_id", "sat.p4k_id")
        .select("sl2.location_code", "sat.name")

      // Build amenities map: location_code -> amenity names
      const amenitiesMap = new Map<string, string[]>()
      for (const row of amenityRows) {
        if (!amenitiesMap.has(row.location_code)) {
          amenitiesMap.set(row.location_code, [])
        }
        amenitiesMap.get(row.location_code)!.push(row.name)
      }

      // Map rows to WikiLocationNode and index by location_code
      const nodeMap = new Map<string, WikiLocationNode>()
      for (const row of rows) {
        nodeMap.set(row.location_code, {
          id: row.location_code,
          name: row.location_name,
          type: row.location_type || row.nav_icon || "unknown",
          navIcon: row.nav_icon || null,
          description: row.description || null,
          parentId: row.parent_code || null,
          jurisdiction: row.jurisdiction_name || row.jurisdiction || null,
          respawnType: row.respawn_type || null,
          size: row.size != null ? Number(row.size) : null,
          qtArrivalRadius: row.qt_arrival_radius != null ? parseFloat(row.qt_arrival_radius) : null,
          qtObstructionRadius: row.qt_obstruction_radius != null ? parseFloat(row.qt_obstruction_radius) : null,
          amenities: amenitiesMap.get(row.location_code) || [],
          children: [],
        })
      }

      // Build tree: attach children to parents
      const roots: WikiLocationNode[] = []
      for (const node of nodeMap.values()) {
        const parent = node.parentId ? nodeMap.get(node.parentId) : null
        if (parent) {
          parent.children.push(node)
        } else {
          roots.push(node)
        }
      }

      // Sort children by name at each level
      const sortChildren = (nodes: WikiLocationNode[]) => {
        nodes.sort((a, b) => a.name.localeCompare(b.name))
        for (const node of nodes) {
          if (node.children.length > 0) sortChildren(node.children)
        }
      }
      sortChildren(roots)

      logger.info("Locations fetched successfully", { count: roots.length })

      return roots
    } catch (error) {
      logger.error("Failed to fetch locations", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get manufacturer list with lore
   *
   * Returns all manufacturers with descriptions and item counts.
   *
   * @summary Get manufacturers
   * @returns Manufacturer list
   */
  @Get("manufacturers")
  public async getManufacturers(): Promise<WikiManufacturerSearchResult[]> {
    const knex = getKnex()

    logger.info("Fetching manufacturers")

    try {
      // Get manufacturers from game_items with counts
      // Use lower() grouping to deduplicate case variants (e.g. "RSI" vs "rsi")
      const manufacturersQuery = await knex("game_items as gi")
        .leftJoin("wiki_manufacturers as wm", function () {
          this.on(knex.raw("lower(wm.code) = lower(gi.manufacturer)"))
        })
        .select(knex.raw("lower(gi.manufacturer) as manufacturer"), knex.raw("MAX(wm.name) as display_name"))
        .count("* as item_count")
        .whereNotNull("gi.manufacturer")
        .andWhere("gi.manufacturer", "!=", "")
        .groupByRaw("lower(gi.manufacturer)")
        .orderByRaw("COALESCE(MAX(wm.name), lower(gi.manufacturer)) ASC")

      const manufacturers = manufacturersQuery.map((row: any) => ({
        manufacturer: row.manufacturer,
        display_name: row.display_name || null,
        item_count: parseInt(String(row.item_count), 10),
      }))

      logger.info("Manufacturers fetched successfully", { count: manufacturers.length })

      return manufacturers
    } catch (error) {
      logger.error("Failed to fetch manufacturers", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }

  /**
   * Get manufacturer detail with all items
   *
   * Returns complete manufacturer information including all items produced
   * by this manufacturer.
   *
   * @summary Get manufacturer details
   * @param id Manufacturer name
   * @returns Complete manufacturer details with items
   */
  @Get("manufacturers/{id}")
  public async getManufacturerDetail(@Path() id: string): Promise<WikiManufacturerDetail> {
    const knex = getKnex()

    if (!id) {
      this.throwValidationError("id is required", [
        { field: "id", message: "Manufacturer ID is required" },
      ])
    }

    logger.info("Fetching manufacturer detail", { id })

    try {
      // Get items by this manufacturer
      const itemsQuery = await knex("game_items")
        .where("manufacturer", id)
        .select("id", "name", "type", "size", "grade", "image_url")
        .orderBy("name", "asc")

      if (itemsQuery.length === 0) {
        this.throwNotFound("Manufacturer", id)
      }

      const items = itemsQuery.map((row: any) => ({
        id: row.id,
        name: row.name,
        type: row.type || undefined,
        size: row.size || undefined,
        grade: row.grade || undefined,
        image_url: row.image_url || undefined,
      }))

      logger.info("Manufacturer detail fetched successfully", {
        id,
        item_count: items.length,
      })

      // Get manufacturer display name
      const mfrRow = await knex("wiki_manufacturers").where("code", id).select("name", "description").first()

      return {
        manufacturer: id,
        display_name: mfrRow?.name || null,
        description: mfrRow?.description || undefined,
        item_count: items.length,
        items,
      }
    } catch (error) {
      logger.error("Failed to fetch manufacturer detail", {
        id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      })

      throw error
    }
  }
}
