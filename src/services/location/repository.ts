/**
 * Location Repository
 *
 * Provides database access methods for locations.
 */

import { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import {
  DBLocation,
  CreateLocationInput,
  LocationSearchFilters,
} from "./types.js"

export class LocationRepository {
  private knex: Knex

  constructor(knex?: Knex) {
    this.knex = knex || getKnex()
  }

  /**
   * Get a location by ID
   */
  async getById(locationId: string): Promise<DBLocation | null> {
    const location = await this.knex<DBLocation>("locations")
      .where({ location_id: locationId })
      .first()

    return location || null
  }

  /**
   * Get a location by name (for preset locations)
   */
  async getByName(name: string): Promise<DBLocation | null> {
    const location = await this.knex<DBLocation>("locations")
      .where({ name })
      .first()

    return location || null
  }

  /**
   * Get all preset locations
   */
  async getPresetLocations(): Promise<DBLocation[]> {
    const locations = await this.knex<DBLocation>("locations")
      .where({ is_preset: true })
      .orderBy("display_order", "asc")

    return locations
  }

  /**
   * Get custom locations created by a specific user
   */
  async getUserLocations(userId: string): Promise<DBLocation[]> {
    const locations = await this.knex<DBLocation>("locations")
      .where({
        is_preset: false,
        created_by: userId,
      })
      .orderBy("created_at", "asc")

    return locations
  }

  /**
   * Search locations with filters
   */
  async searchLocations(filters: LocationSearchFilters): Promise<DBLocation[]> {
    let query = this.knex<DBLocation>("locations")

    // Filter by preset only if specified
    if (filters.preset_only) {
      query = query.where({ is_preset: true })
    } else if (filters.user_id) {
      // Include preset locations and user's custom locations
      query = query.where((builder) => {
        builder.where({ is_preset: true }).orWhere({
          is_preset: false,
          created_by: filters.user_id,
        })
      })
    } else {
      // Only preset locations if no user specified
      query = query.where({ is_preset: true })
    }

    // Apply search filter if provided
    if (filters.search) {
      query = query.where("name", "ilike", `%${filters.search}%`)
    }

    // Order by preset first (with display_order), then custom by created_at
    const locations = await query.orderByRaw(
      "is_preset DESC, display_order ASC NULLS LAST, created_at ASC",
    )

    return locations
  }

  /**
   * Create a custom location
   */
  async createCustomLocation(input: CreateLocationInput): Promise<DBLocation> {
    const [location] = await this.knex<DBLocation>("locations")
      .insert({
        name: input.name,
        is_preset: false,
        created_by: input.created_by,
      })
      .returning("*")

    return location
  }

  /**
   * Check if a location name already exists for a user
   */
  async locationExistsForUser(name: string, userId: string): Promise<boolean> {
    const location = await this.knex<DBLocation>("locations")
      .where({
        name,
        created_by: userId,
      })
      .first()

    return !!location
  }

  /**
   * Check if a preset location name exists
   */
  async presetLocationExists(name: string): Promise<boolean> {
    const location = await this.knex<DBLocation>("locations")
      .where({
        name,
        is_preset: true,
      })
      .first()

    return !!location
  }
}
