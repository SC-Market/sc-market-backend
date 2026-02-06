/**
 * Location Service
 *
 * Provides business logic for location management in the stock tracking system.
 */

import { LocationRepository } from "./repository.js"
import {
  DBLocation,
  CreateLocationInput,
  LocationSearchFilters,
} from "./types.js"

export class LocationService {
  private repository: LocationRepository

  constructor(repository?: LocationRepository) {
    this.repository = repository || new LocationRepository()
  }

  /**
   * Search locations with partial match
   * Returns preset locations first, then custom locations
   * Filters by user ownership for custom locations
   *
   * Requirements: 15.1, 15.2, 15.3, 15.4
   */
  async searchLocations(
    search?: string,
    userId?: string,
    presetOnly?: boolean,
  ): Promise<DBLocation[]> {
    const filters: LocationSearchFilters = {
      search,
      user_id: userId,
      preset_only: presetOnly,
    }

    return this.repository.searchLocations(filters)
  }

  /**
   * Get all preset locations
   */
  async getPresetLocations(): Promise<DBLocation[]> {
    return this.repository.getPresetLocations()
  }

  /**
   * Get custom locations created by a specific user
   */
  async getUserLocations(userId: string): Promise<DBLocation[]> {
    return this.repository.getUserLocations(userId)
  }

  /**
   * Get a location by ID
   */
  async getLocationById(locationId: string): Promise<DBLocation | null> {
    return this.repository.getById(locationId)
  }

  /**
   * Create a custom location
   * Validates name length (max 255 chars)
   * Associates with creating user
   *
   * Requirements: 2.4, 15.6
   */
  async createCustomLocation(
    name: string,
    userId: string,
  ): Promise<DBLocation> {
    // Validate name length
    if (!name || name.trim().length === 0) {
      throw new Error("Location name cannot be empty")
    }

    if (name.length > 255) {
      throw new Error("Location name cannot exceed 255 characters")
    }

    const trimmedName = name.trim()

    // Check if a preset location with this name already exists
    const presetExists = await this.repository.presetLocationExists(trimmedName)
    if (presetExists) {
      throw new Error(
        "A preset location with this name already exists. Please use a different name.",
      )
    }

    // Check if user already has a custom location with this name
    const userLocationExists = await this.repository.locationExistsForUser(
      trimmedName,
      userId,
    )
    if (userLocationExists) {
      throw new Error(
        "You already have a custom location with this name. Please use a different name.",
      )
    }

    const input: CreateLocationInput = {
      name: trimmedName,
      created_by: userId,
    }

    return this.repository.createCustomLocation(input)
  }

  /**
   * Get the Unspecified location (default location)
   */
  async getUnspecifiedLocation(): Promise<DBLocation | null> {
    return this.repository.getByName("Unspecified")
  }
}

// Singleton instance
export const locationService = new LocationService()
