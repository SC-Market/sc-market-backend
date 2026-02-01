/**
 * Attribute Import Service Types
 * Defines interfaces for importing game item attributes from external sources
 */

/**
 * Represents a single attribute record to be imported
 */
export interface AttributeRecord {
  game_item_id: string
  attribute_name: string
  attribute_value: string
}

/**
 * Raw item attributes fetched from external sources
 */
export interface ItemAttributes {
  [key: string]: string | number | null | undefined
}

/**
 * Interface for attribute importers from external data sources
 */
export interface AttributeImporter {
  /**
   * Identifier for the data source
   */
  source: "cstone" | "uexcorp"

  /**
   * Fetches item attributes from the external source
   * @param itemId - The game item identifier
   * @returns Promise resolving to raw item attributes
   */
  fetchItemAttributes(itemId: string): Promise<ItemAttributes>

  /**
   * Maps external data format to internal attribute schema
   * @param externalData - Raw data from external source
   * @returns Array of attribute records in internal format
   */
  mapToInternalSchema(externalData: ItemAttributes): AttributeRecord[]
}
