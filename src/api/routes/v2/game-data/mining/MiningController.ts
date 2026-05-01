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
  OreQualityDistribution,
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

/** Friendly names for mining group types */
const GROUP_DISPLAY_NAMES: Record<string, string> = {
  SpaceShip_Mineables: "Ship Mining",
  GroundVehicle_Mineables: "Ground Vehicle Mining (ROC)",
  FPS_Mineables: "Hand Mining (FPS)",
}

/** Friendly names for asteroid fields and other locations not in starmap */
const LOCATION_FALLBACK_NAMES: Record<string, string> = {
  aaronhalo: "Aaron Halo Belt",
  lagrange_a: "Stanton–Hurston L1",
  lagrange_b: "Stanton–Hurston L2",
  lagrange_c: "Stanton–Crusader L1",
  lagrange_d: "Stanton–ArcCorp L1",
  lagrange_e: "Stanton–microTech L1",
  lagrange_f: "Stanton–ArcCorp L2",
  lagrange_g: "Stanton–microTech L2",
  lagrange_occupied: "Stanton Lagrange (Occupied)",
  stanton2c_belt: "Yela Asteroid Belt",
  nyx_keegerbelt: "Keeger Belt (Nyx)",
  nyx_glaciemring: "Glaciem Ring (Nyx)",
  pyro_deepspaceasteroids: "Pyro Deep Space Asteroids",
  pyro_warm01: "Pyro Warm Belt 1",
  pyro_warm02: "Pyro Warm Belt 2",
  pyro_cool01: "Pyro Cool Belt 1",
  pyro_cool02: "Pyro Cool Belt 2",
  pyro_akirocluster: "Akiro Cluster (Pyro)",
  asteroidcluster_low_yield: "Low Yield Asteroid Cluster",
  asteroidcluster_medium_yield: "Medium Yield Asteroid Cluster",
  resourcerush_gold: "Gold Rush Event Area",
  resourcerush_gold_highdensity: "Gold Rush Event Area (High Density)",
}

const SYSTEM_DISPLAY_NAMES: Record<string, string> = {
  stanton: "Stanton",
  pyro: "Pyro",
  nyx: "Nyx",
}

/** Build a location name lookup from starmap_locations + fallback map */
async function buildLocationNameLookup(knex: ReturnType<typeof getKnex>): Promise<Map<string, string>> {
  const lookup = new Map<string, string>()
  // Load from starmap_locations with parent info
  const rows = await knex("starmap_locations as sl")
    .leftJoin("starmap_locations as parent", function () {
      this.on(knex.raw("sl.parent_code = parent.location_code"))
    })
    .select("sl.location_code", "sl.location_name", "sl.file_name", "sl.location_type",
      "parent.location_name as parent_name")
  for (const r of rows) {
    if (r.location_name && r.location_code) {
      const code = r.location_code.replace(/^starmapobject\./, "").toLowerCase()
      // For moons, show "Name - Parent-X" (e.g., "Wala - ArcCorp-B")
      let displayName = r.location_name
      if (r.location_type === "Moon" && r.parent_name) {
        const moonMatch = code.match(/\d([a-f])$/)
        if (moonMatch) {
          displayName = `${r.location_name} - ${r.parent_name}-${moonMatch[1].toUpperCase()}`
        } else {
          displayName = `${r.location_name} - ${r.parent_name}`
        }
      }
      lookup.set(code, displayName)
      if (r.file_name) lookup.set(r.file_name.toLowerCase(), displayName)
    }
  }
  // Add fallbacks
  for (const [k, v] of Object.entries(LOCATION_FALLBACK_NAMES)) {
    if (!lookup.has(k)) lookup.set(k, v)
  }
  return lookup
}

function friendlyGroupName(groupName: string): string {
  return GROUP_DISPLAY_NAMES[groupName] || groupName.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function friendlySystem(system: string): string {
  return SYSTEM_DISPLAY_NAMES[system?.toLowerCase()] || system?.charAt(0).toUpperCase() + system?.slice(1) || "Unknown"
}

function friendlyLocationType(lt: string): string {
  if (lt === "asteroidfield") return "Asteroid Field"
  if (lt === "surface") return "Surface"
  return lt?.charAt(0).toUpperCase() + lt?.slice(1) || lt
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

/** Clean a resource or element name into a friendly display name */
function friendlyElementName(displayName: string | null, resourceName: string | null, elementName: string): string {
  if (displayName) return displayName
  if (resourceName) {
    return resourceName.replace(/^Ore_/, "").replace(/^Raw_?/, "").replace(/^Gem_/, "").replace(/_/g, " ")
  }
  return elementName.replace(/_ore$/, "").replace(/_raw$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
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

      // Market price subquery — use game_item_id for direct join
      const priceSubquery = knex("mineable_elements as me2")
        .join("game_items as gi", "gi.id", "me2.game_item_id")
        .join("listing_items as li", "li.game_item_id", "gi.id")
        .join("listings as l", "li.listing_id", "l.listing_id")
        .select(knex.raw("MIN(li.base_price) as min_price"), "me2.element_id")
        .where("l.status", "active")
        .whereNotNull("me2.game_item_id")
        .groupBy("me2.element_id")
        .as("mp")

      // Main aggregation
      const baseQuery = query.clone()
        .leftJoin(priceSubquery, "mp.element_id", "me.element_id")
        .select(
          "me.element_id",
          "me.name",
          "me.display_name",
          "me.resource_name",
          "me.game_item_id",
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
          "me.element_id", "me.name", "me.display_name", "me.resource_name", "me.game_item_id",
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
        const locationNames = await buildLocationNameLookup(knex)
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
                  name: locationNames.get(loc.location_name.toLowerCase()) || loc.location_name,
                  system: friendlySystem(loc.system),
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
            displayName: friendlyElementName(row.display_name, row.resource_name, row.name),
            resourceName: row.resource_name,
            gameItemId: row.game_item_id || null,
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

      // Market price — use game_item_id if available
      let marketPrice: number | null = null
      if (element.game_item_id) {
        const priceRow = await knex("listing_items as li")
          .join("listings as l", "li.listing_id", "l.listing_id")
          .select(knex.raw("MIN(li.base_price) as min_price"))
          .where("l.status", "active")
          .where("li.game_item_id", element.game_item_id)
          .first()
        if (priceRow?.min_price) marketPrice = parseInt(priceRow.min_price, 10)
      }

      const locationNames = await buildLocationNameLookup(knex)
      const oreLocations: OreLocation[] = locations.map((loc: any) => ({
        locationName: locationNames.get(loc.location_name.toLowerCase()) || loc.location_name,
        system: friendlySystem(loc.system),
        locationType: friendlyLocationType(loc.location_type),
        groupName: friendlyGroupName(loc.group_name),
        groupProbability: parseFloat(loc.group_probability),
        relativeProbability: parseFloat(loc.relative_probability),
      }))

      return {
        name: element.name,
        displayName: friendlyElementName(element.display_name, element.resource_name, element.name),
        resourceName: element.resource_name,
        gameItemId: element.game_item_id || null,
        instability: element.instability ? parseFloat(element.instability) : null,
        resistance: element.resistance ? parseFloat(element.resistance) : null,
        optimalWindowMidpoint: element.optimal_window_midpoint ? parseFloat(element.optimal_window_midpoint) : null,
        optimalWindowMidpointRandomness: element.optimal_window_midpoint_randomness ? parseFloat(element.optimal_window_midpoint_randomness) : null,
        optimalWindowThinness: element.optimal_window_thinness ? parseFloat(element.optimal_window_thinness) : null,
        explosionMultiplier: element.explosion_multiplier ? parseFloat(element.explosion_multiplier) : null,
        clusterFactor: element.cluster_factor ? parseFloat(element.cluster_factor) : null,
        rarity: rarityValue,
        marketPrice,
        locations: oreLocations,
        qualityDistributions: await this.getQualityDistributions(knex, rarityValue),
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
          groupName: friendlyGroupName(String(g.group_name)),
          groupProbability: parseFloat(String(g.group_probability)),
          oreCount: parseInt(String(g.ore_count), 10),
          topOres: [],
        })
        groupsByLocation.set(String(g.location_name), arr)
      }

      // Get top 3 ore names per location+group
      const oreRows = await knex("location_mining_spawns as lms")
        .leftJoin("mineable_elements as me", knex.raw("lms.preset_name ILIKE '%' || REGEXP_REPLACE(me.name, '_(ore|raw)$', '') || '%'"))
        .select("lms.location_name", "lms.group_name", "lms.preset_name", "lms.relative_probability",
          "me.display_name", "me.resource_name", "me.name as element_name")
        .whereIn("lms.location_name", locationNames)
        .orderBy("lms.relative_probability", "desc")

      // Assign top ores to groups
      for (const ore of oreRows) {
        const groups = groupsByLocation.get(String(ore.location_name))
        if (!groups) continue
        const friendlyGN = friendlyGroupName(String(ore.group_name))
        const group = groups.find((g) => g.groupName === friendlyGN)
        if (!group || group.topOres.length >= 3) continue
        const name = ore.display_name || (ore.resource_name ? ore.resource_name.replace(/^Ore_/, "").replace(/^Raw_?/, "") : null) || presetDisplayName(ore.preset_name)
        group.topOres.push(name)
      }

      // Check for refinery amenity via starmap_locations
      const refineryCheck = await knex("starmap_locations as sl")
        .join("location_amenities as la", "la.location_id", "sl.location_id")
        .join("starmap_amenity_types as sat", "sat.p4k_id", "la.amenity_p4k_id")
        .select("sl.file_name")
        .where("sat.name", "ilike", "%refinery%")

      const refineryFileNames = new Set(refineryCheck.map((r: any) => r.file_name?.toLowerCase()))

      const locationNameLookup = await buildLocationNameLookup(knex)
      const locations: LocationSearchResult[] = locationRows.map((row: any) => ({
        name: row.location_name,
        displayName: locationNameLookup.get(row.location_name.toLowerCase()) || null,
        system: friendlySystem(row.system),
        locationType: friendlyLocationType(row.location_type),
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

      const locationNameLookup = await buildLocationNameLookup(knex)

      // Apply friendly group names
      const groups = Array.from(groupMap.values()).map((g) => ({
        ...g,
        groupName: friendlyGroupName(g.groupName),
      }))

      return {
        name: firstSpawn.location_name,
        displayName: locationNameLookup.get(firstSpawn.location_name.toLowerCase()) || null,
        system: friendlySystem(firstSpawn.system),
        locationType: friendlyLocationType(firstSpawn.location_type),
        groups,
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

  /** Get quality distributions for a given rarity tier */
  private async getQualityDistributions(knex: ReturnType<typeof getKnex>, rarity: string): Promise<OreQualityDistribution[]> {
    try {
      // Map ore rarity to mining type patterns
      // Ship mining has per-rarity distributions; fps/ground have single defaults
      const rows = await knex("mining_quality_distributions")
        .select("mining_type", "rarity", "dist_min", "dist_max", "dist_mean", "dist_stddev")
        .where("is_location_override", false)
        .where(function () {
          this.where("rarity", rarity)
            .orWhereNull("rarity") // fps/ground defaults
        })
        .orderBy("mining_type")

      return rows.map((r: any) => ({
        miningType: r.mining_type === "ship" ? "Ship Mining" : r.mining_type === "fps" ? "Hand Mining" : r.mining_type === "ground" ? "Ground Vehicle" : r.mining_type,
        rarity: r.rarity,
        min: r.dist_min,
        max: r.dist_max,
        mean: r.dist_mean ? parseFloat(r.dist_mean) : null,
        stddev: r.dist_stddev ? parseFloat(r.dist_stddev) : null,
      }))
    } catch {
      return []
    }
  }
}
