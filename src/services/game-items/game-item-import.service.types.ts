/**
 * Game Item Import Service Types
 * Types for importing component attribute data from external sources
 */

/**
 * CStone API Item Response
 * Based on cstone.space API structure
 */
export interface CStoneItem {
  uuid: string
  name: string
  description: string
  image_url?: string
  type?: string
}

/**
 * UEX Corp API Item Response
 * Based on UEX Corp Space API structure
 */
export interface UEXItem {
  id: number
  name: string
  code?: string
  slug?: string
  // Component-specific fields that may be present
  size?: number
  manufacturer?: string
  company_name?: string
  category?: string
  type?: string
}

/**
 * Parsed component attributes from external data
 */
export interface ComponentAttributes {
  size?: number
  grade?: string
  componentClass?: string
  manufacturer?: string
  type?: string
}

/**
 * Import statistics for tracking import progress
 */
export interface ImportStats {
  totalProcessed: number
  successfulUpdates: number
  failedUpdates: number
  skipped: number
  errors: Array<{
    itemName: string
    error: string
  }>
}
