/**
 * Location Types and Interfaces
 * 
 * Defines the data structures for location management in the stock tracking system.
 */

/**
 * Database representation of a location
 */
export interface DBLocation {
  location_id: string
  name: string                 // max 255 chars
  is_preset: boolean           // true for verse locations, false for custom
  display_order: number | null // for sorting preset locations
  created_by: string | null    // user who created custom location
  created_at: Date
}

/**
 * Input for creating a custom location
 */
export interface CreateLocationInput {
  name: string
  created_by: string
}

/**
 * Filters for searching locations
 */
export interface LocationSearchFilters {
  search?: string              // partial match on name
  preset_only?: boolean        // only return preset locations
  user_id?: string             // include custom locations for this user
}
