/**
 * Mining V2 Controller
 *
 * TSOA controller for mining data endpoints.
 * Handles ore search, ore detail, location search, and location detail.
 */

import { Get, Route, Tags, Query, Path } from "tsoa"
import { BaseController } from "../../base/BaseController.js"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import {
  SearchOresResponse,
  OreSearchResult,
  OreTopLocation,
  OreDetailResponse,
  OreLocation,
  SearchLocationsResponse,
  LocationSearchResult,
  LocationGroup,
  LocationDetailResponse,
  LocationMiningGroup,
  LocationOre,
  RefiningMethodsResponse,
} from "./mining.types.js"
import logger from "../../../../../logger/logger.js"

const MINING_METHOD_PATTERN: Record<string, string> = {
  ship: "SpaceShip",
  ground: "GroundVehicle",
  fps: "FPS",
}

function deriveRarity(presetName: string): string {
  if (presetName.startsWith("mining_legendary")) return "legendary"
  if (presetName.startsWith("mining_epic")) return "epic"
  if (presetName.startsWith("mining_rare")) return "rare"
  if (presetName.startsWith("mining_uncommon")) return "uncommon"
  return "common"
}

/** Strip _ore/_raw suffix to get the base mineral name for preset matching */
function baseMineral(elementName: string): string {
  return elementName.replace(/_ore$/, "").replace(/_raw$/, "")
}

/** Derive a friendly display name from a preset name like mining_asteroidrare_beryl */
function presetDisplayName(presetName: string): string {
  // Strip prefixes: mining_, fpsmining_, groundvehiclemining_
  let name = presetName
    .replace(/^mining_asteroid(common|uncommon|rare|epic|legendary)_/, "")
    .replace(/^mining_(common|uncommon|rare|epic|legendary)_/, "")
    .replace(/^fpsmining_/, "")
    .replace(/^groundvehiclemining_/, "")
    .replace(/^mining_/, "")
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

@Route("game-data/mining")
@Tags("Game Data - Mining")
export class MiningController extends BaseController {
  /**
   * Search ores with filters
   *
   * @summary Search ores
   * @param text Search ore name
   * @param system Filter by star system
   * @param mining_method Filter by mining method
   * @param rarity Filter by rarity
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   */
  @Get("ores")
  public async searchOres(
    @Query() text?: string,
    @Query() system?: string,
    @Query() mining_method?: "ship" | "ground" | "fps",
    @Query() rarity?: "common" | "uncommon" | "rare" | "epic" | "legendary",
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<SearchOresResponse> {
    const knex = getKnex()
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    logger.info("Searching ores", { text, system, mining_method, rarity, page: validatedPage, page_size: validatedPageSize })

    try {
      // Build base query for elements with rarity derived from spawns
      let query = knex("mineable_elements as me")
        .leftJoin("location_mining_spawns as lms", function () {
          this.on(knex.raw("lms.preset_name ILIKE '%' || REGEXP_REPLACE(me.name, '_(ore|raw)$', '') || '%'"))
        })

      // Filter by system
      if (system) {
        query = query.where("lms.system", system)
      }

      // Filter by mining method
      if (mining_method && MINING_METHOD_PATTERN[mining_method]) {
        query = query.where("lms.group_name", "ilike", `%${MINING_METHOD_PATTERN[mining_method]}%`)
      }

      // Filter by rarity — derive from preset_name
      if (rarity) {
        query = query.where("lms.preset_name", "ilike", `mining_${rarity}%`)
      }

      // Text search
      if (text) {
        query = query.where("me.name", "ilike", `%${text}%`)
      }

      // Market price subquery
      const priceSubquery = knex("game_items as gi")
        .join("listing_items as li", "li.game_item_id", "gi.id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .select(knex.raw("MIN(li.base_price) as min_price"), "gi.name")
        .where("l.status", "active")
        .groupBy("gi.name")
        .as("mp")

      // Main aggregation
      const baseQuery = query.clone()
        .leftJoin(priceSubquery, function () {
          this.on(knex.raw("mp.name ILIKE '%' || me.resource_name || '%'"))
        })
        .select(
          "me.element_id",
          "me.name",
          "me.resource_name",
          "me.instability",
          "me.resistance",
          "me.optimal_window_midpoint",
          "me.optimal_window_thinness",
          "me.explosion_multiplier",
          "me.cluster_factor",
          knex.raw("MIN(lms.preset_name) as sample_preset"),
          knex.raw("COALESCE(mp.min_price, NULL) as market_price"),
          knex.raw("COUNT(DISTINCT lms.location_name)::integer as location_count"),
        )
        .groupBy(
          "me.element_id", "me.name", "me.resource_name",
          "me.instability", "me.resistance", "me.optimal_window_midpoint",
          "me.optimal_window_thinness", "me.explosion_multiplier", "me.cluster_factor",
          "mp.min_price",
        )

      // Count total
      const countResult = await knex.raw(
        `SELECT COUNT(*) as count FROM (${baseQuery.toQuery()}) as sub`,
      )
      const total = parseInt(countResult.rows[0].count, 10)

      // Apply sort and pagination
      const rows = await baseQuery
        .orderByRaw("market_price DESC NULLS LAST")
        .orderBy("me.name", "asc")
        .limit(validatedPageSize)
        .offset((validatedPage - 1) * validatedPageSize)

      // For each ore, get top 3 locations
      const ores: OreSearchResult[] = []
      if (rows.length > 0) {
        const elementNames = rows.map((r: any) => r.name)
        const baseNames = elementNames.map(baseMineral)
        const topLocations = await knex("location_mining_spawns as lms")
          .select("lms.location_name", "lms.system", "lms.relative_probability", "lms.preset_name")
          .whereRaw(
            `EXISTS (SELECT 1 FROM unnest(?::text[]) AS en(n) WHERE lms.preset_name ILIKE '%' || en.n || '%')`,
            [baseNames],
          )
          .orderBy("lms.relative_probability", "desc")

        // Group top locations by element
        const locationsByElement = new Map<string, OreTopLocation[]>()
        for (const loc of topLocations) {
          for (let i = 0; i < elementNames.length; i++) {
            if (loc.preset_name.toLowerCase().includes(baseNames[i].toLowerCase())) {
              const arr = locationsByElement.get(elementNames[i]) || []
              if (arr.length < 3) {
                arr.push({
                  name: loc.location_name,
                  system: loc.system,
                  probability: parseFloat(loc.relative_probability),
                })
                locationsByElement.set(elementNames[i], arr)
              }
              break
            }
          }
        }

        for (const row of rows) {
          ores.push({
            name: row.name,
            resourceName: row.resource_name,
            instability: row.instability ? parseFloat(row.instability) : null,
            resistance: row.resistance ? parseFloat(row.resistance) : null,
            optimalWindowMidpoint: row.optimal_window_midpoint ? parseFloat(row.optimal_window_midpoint) : null,
            optimalWindowThinness: row.optimal_window_thinness ? parseFloat(row.optimal_window_thinness) : null,
            explosionMultiplier: row.explosion_multiplier ? parseFloat(row.explosion_multiplier) : null,
            clusterFactor: row.cluster_factor ? parseFloat(row.cluster_factor) : null,
            rarity: row.sample_preset ? deriveRarity(row.sample_preset) : "common",
            marketPrice: row.market_price ? parseInt(row.market_price, 10) : null,
            locationCount: row.location_count,
            topLocations: locationsByElement.get(row.name) || [],
          })
        }
      }

      return { ores, total, page: validatedPage, page_size: validatedPageSize }
    } catch (error) {
      logger.error("Failed to search ores", { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Get ore detail by name
   *
   * @summary Get ore details
   * @param name Element name (e.g. 'gold_ore')
   */
  @Get("ores/{name}")
  public async getOreDetail(@Path() name: string): Promise<OreDetailResponse> {
    const knex = getKnex()

    logger.info("Fetching ore detail", { name })

    try {
      const element = await knex("mineable_elements").where("name", name).first()
      if (!element) {
        this.throwNotFound("Ore", name)
      }

      // Get all locations
      const baseName = baseMineral(name)
      const locations = await knex("location_mining_spawns as lms")
        .select(
          "lms.location_name", "lms.system", "lms.location_type",
          "lms.group_name", "lms.group_probability", "lms.relative_probability",
          "lms.preset_name",
        )
        .whereRaw("lms.preset_name ILIKE ?", [`%${baseName}%`])
        .orderBy("lms.relative_probability", "desc")

      // Derive rarity from first spawn preset
      const samplePreset = locations.length > 0 ? locations[0].preset_name : `mining_common_${name}`
      const rarityValue = deriveRarity(samplePreset)

      // Market price
      const priceRow = await knex("game_items as gi")
        .join("listing_items as li", "li.game_item_id", "gi.id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .select(knex.raw("MIN(li.base_price) as min_price"))
        .where("l.status", "active")
        .whereRaw("gi.name ILIKE ?", [`%${element.resource_name || name}%`])
        .first()

      const oreLocations: OreLocation[] = locations.map((loc: any) => ({
        locationName: loc.location_name,
        system: loc.system,
        locationType: loc.location_type,
        groupName: loc.group_name,
        groupProbability: parseFloat(loc.group_probability),
        relativeProbability: parseFloat(loc.relative_probability),
      }))

      return {
        name: element.name,
        resourceName: element.resource_name,
        instability: element.instability ? parseFloat(element.instability) : null,
        resistance: element.resistance ? parseFloat(element.resistance) : null,
        optimalWindowMidpoint: element.optimal_window_midpoint ? parseFloat(element.optimal_window_midpoint) : null,
        optimalWindowMidpointRandomness: element.optimal_window_midpoint_randomness ? parseFloat(element.optimal_window_midpoint_randomness) : null,
        optimalWindowThinness: element.optimal_window_thinness ? parseFloat(element.optimal_window_thinness) : null,
        explosionMultiplier: element.explosion_multiplier ? parseFloat(element.explosion_multiplier) : null,
        clusterFactor: element.cluster_factor ? parseFloat(element.cluster_factor) : null,
        rarity: rarityValue,
        marketPrice: priceRow?.min_price ? parseInt(priceRow.min_price, 10) : null,
        locations: oreLocations,
      }
    } catch (error) {
      logger.error("Failed to fetch ore detail", { name, error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Search mining locations with filters
   *
   * @summary Search mining locations
   * @param text Search location name
   * @param system Filter by star system
   * @param location_type Filter by location type
   * @param mining_method Filter by mining method
   * @param page Page number (default: 1)
   * @param page_size Results per page (default: 20, max: 100)
   */
  @Get("locations")
  public async searchLocations(
    @Query() text?: string,
    @Query() system?: string,
    @Query() location_type?: "surface" | "asteroidfield",
    @Query() mining_method?: "ship" | "ground" | "fps",
    @Query() page: number = 1,
    @Query() page_size: number = 20,
  ): Promise<SearchLocationsResponse> {
    const knex = getKnex()
    const validatedPage = Math.max(1, page || 1)
    const validatedPageSize = Math.min(100, Math.max(1, page_size || 20))

    logger.info("Searching mining locations", { text, system, location_type, mining_method, page: validatedPage })

    try {
      // Get distinct locations with filters
      let locQuery = knex("location_mining_spawns as lms")
        .select("lms.location_name", "lms.system", "lms.location_type")
        .groupBy("lms.location_name", "lms.system", "lms.location_type")

      if (system) locQuery = locQuery.having("lms.system", "=", system)
      if (location_type) locQuery = locQuery.having("lms.location_type", "=", location_type)
      if (text) locQuery = locQuery.having("lms.location_name", "ilike", `%${text}%`)
      if (mining_method && MINING_METHOD_PATTERN[mining_method]) {
        locQuery = locQuery.whereRaw(
          "EXISTS (SELECT 1 FROM location_mining_spawns sub WHERE sub.location_name = lms.location_name AND sub.group_name ILIKE ?)",
          [`%${MINING_METHOD_PATTERN[mining_method]}%`],
        )
      }

      // Count
      const countResult = await knex.raw(`SELECT COUNT(*) as count FROM (${locQuery.toQuery()}) as sub`)
      const total = parseInt(countResult.rows[0].count, 10)

      // Paginate
      const locationRows = await locQuery
        .orderBy("lms.location_name", "asc")
        .limit(validatedPageSize)
        .offset((validatedPage - 1) * validatedPageSize)

      if (locationRows.length === 0) {
        return { locations: [], total, page: validatedPage, page_size: validatedPageSize }
      }

      const locationNames = locationRows.map((r: any) => r.location_name)

      // Get groups for these locations
      const groupRows = await knex("location_mining_spawns")
        .select("location_name", "group_name", "group_probability")
        .count("* as ore_count")
        .whereIn("location_name", locationNames)
        .groupBy("location_name", "group_name", "group_probability")
        .orderBy("group_probability", "desc")

      const groupsByLocation = new Map<string, LocationGroup[]>()
      for (const g of groupRows) {
        const arr = groupsByLocation.get(String(g.location_name)) || []
        arr.push({
          groupName: String(g.group_name),
          groupProbability: parseFloat(String(g.group_probability)),
          oreCount: parseInt(String(g.ore_count), 10),
        })
        groupsByLocation.set(String(g.location_name), arr)
      }

      // Check for refinery amenity via starmap_locations
      const refineryCheck = await knex("starmap_locations as sl")
        .join("location_amenities as la", "la.location_id", "sl.location_id")
        .join("starmap_amenity_types as sat", "sat.p4k_id", "la.amenity_p4k_id")
        .select("sl.file_name")
        .where("sat.name", "ilike", "%refinery%")

      const refineryFileNames = new Set(refineryCheck.map((r: any) => r.file_name?.toLowerCase()))

      const locations: LocationSearchResult[] = locationRows.map((row: any) => ({
        name: row.location_name,
        displayName: null,
        system: row.system,
        locationType: row.location_type,
        groups: groupsByLocation.get(row.location_name) || [],
        hasRefinery: refineryFileNames.has(row.location_name.toLowerCase()),
      }))

      return { locations, total, page: validatedPage, page_size: validatedPageSize }
    } catch (error) {
      logger.error("Failed to search locations", { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Get mining location detail
   *
   * @summary Get location details
   * @param name Location name (e.g. 'stanton1b')
   */
  @Get("locations/{name}")
  public async getLocationDetail(@Path() name: string): Promise<LocationDetailResponse> {
    const knex = getKnex()

    logger.info("Fetching location detail", { name })

    try {
      // Get all spawns for this location
      const spawns = await knex("location_mining_spawns as lms")
        .leftJoin("mineable_elements as me", knex.raw("lms.preset_name ILIKE '%' || REGEXP_REPLACE(me.name, '_(ore|raw)$', '') || '%'"))
        .select(
          "lms.location_name", "lms.system", "lms.location_type",
          "lms.group_name", "lms.group_probability", "lms.preset_name",
          "lms.relative_probability",
          "me.name as element_name", "me.resource_name",
          "me.instability", "me.resistance",
          "me.optimal_window_midpoint", "me.optimal_window_thinness",
          "me.explosion_multiplier", "me.cluster_factor",
        )
        .where("lms.location_name", name)
        .orderBy("lms.group_name")
        .orderBy("lms.relative_probability", "desc")

      if (spawns.length === 0) {
        this.throwNotFound("Mining location", name)
      }

      const firstSpawn = spawns[0]

      // Get market prices for all resource names in one query
      const resourceNames = [...new Set(spawns.map((s: any) => s.resource_name).filter(Boolean))]
      const priceMap = new Map<string, number>()

      if (resourceNames.length > 0) {
        const prices = await knex("game_items as gi")
          .join("listing_items as li", "li.game_item_id", "gi.id")
          .join("listings as l", "li.listing_id", "l.listing_id")
          .select("gi.name", knex.raw("MIN(li.base_price) as min_price"))
          .where("l.status", "active")
          .where(function () {
            for (const rn of resourceNames) {
              this.orWhere("gi.name", "ilike", `%${rn}%`)
            }
          })
          .groupBy("gi.name")

        for (const p of prices) {
          // Map back to resource_name
          for (const rn of resourceNames) {
            if (p.name.toLowerCase().includes(rn.toLowerCase())) {
              const existing = priceMap.get(rn)
              const price = parseInt(p.min_price, 10)
              if (!existing || price < existing) priceMap.set(rn, price)
            }
          }
        }
      }

      // Build groups
      const groupMap = new Map<string, LocationMiningGroup>()
      for (const spawn of spawns) {
        const key = spawn.group_name
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            groupName: spawn.group_name,
            groupProbability: parseFloat(spawn.group_probability),
            ores: [],
          })
        }
        const mp = spawn.resource_name ? (priceMap.get(spawn.resource_name) ?? null) : null
        const relProb = parseFloat(spawn.relative_probability)

        groupMap.get(key)!.ores.push({
          presetName: spawn.preset_name,
          displayName: presetDisplayName(spawn.preset_name),
          elementName: spawn.element_name || null,
          resourceName: spawn.resource_name || null,
          rarity: deriveRarity(spawn.preset_name),
          relativeProbability: relProb,
          instability: spawn.instability ? parseFloat(spawn.instability) : null,
          resistance: spawn.resistance ? parseFloat(spawn.resistance) : null,
          optimalWindowMidpoint: spawn.optimal_window_midpoint ? parseFloat(spawn.optimal_window_midpoint) : null,
          optimalWindowThinness: spawn.optimal_window_thinness ? parseFloat(spawn.optimal_window_thinness) : null,
          explosionMultiplier: spawn.explosion_multiplier ? parseFloat(spawn.explosion_multiplier) : null,
          clusterFactor: spawn.cluster_factor ? parseFloat(spawn.cluster_factor) : null,
          marketPrice: mp,
          estimatedValue: mp !== null ? Math.round(relProb * mp) : null,
        })
      }

      // Check amenities
      const amenityRows = await knex("starmap_locations as sl")
        .join("location_amenities as la", "la.location_id", "sl.location_id")
        .join("starmap_amenity_types as sat", "sat.p4k_id", "la.amenity_p4k_id")
        .select("sat.name", "sat.display_name")
        .where("sl.file_name", "ilike", `%${name}%`)

      const amenities = amenityRows.map((a: any) => a.display_name || a.name)
      const hasRefinery = amenities.some((a: string) => a.toLowerCase().includes("refinery"))

      return {
        name: firstSpawn.location_name,
        displayName: null,
        system: firstSpawn.system,
        locationType: firstSpawn.location_type,
        groups: Array.from(groupMap.values()),
        hasRefinery,
        amenities,
      }
    } catch (error) {
      logger.error("Failed to fetch location detail", { name, error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Get all refining methods
   *
   * @summary Get refining methods
   */
  @Get("refining-methods")
  public async getRefiningMethods(): Promise<RefiningMethodsResponse> {
    const knex = getKnex()
    try {
      const rows = await knex("refining_processes").select("name", "speed", "quality").orderBy("speed").orderBy("quality")
      return { methods: rows }
    } catch (error) {
      logger.error("Failed to fetch refining methods", { error: error instanceof Error ? error.message : String(error) })
      return { methods: [] }
    }
  }
}
