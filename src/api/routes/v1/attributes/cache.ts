import { LRUCache } from "lru-cache"
import { AttributeDefinition } from "./types.js"
import * as db from "./database.js"
import logger from "../../../../logger/logger.js"

/**
 * Cache configuration for attribute definitions
 */
const CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour
const CACHE_MAX_SIZE = 500 // Maximum number of cached entries

/**
 * Cache key prefixes
 */
const CACHE_KEY_ALL = "all_definitions"
const CACHE_KEY_BY_NAME = "definition_by_name:"
const CACHE_KEY_BY_TYPES = "definitions_by_types:"

/**
 * In-memory cache for attribute definitions using LRU cache.
 * Attribute definitions change infrequently, so caching significantly
 * reduces database load for this read-heavy data.
 */
class AttributeDefinitionCache {
  private cache: LRUCache<string, AttributeDefinition[] | AttributeDefinition>

  constructor() {
    this.cache = new LRUCache({
      max: CACHE_MAX_SIZE,
      ttl: CACHE_TTL_MS,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
    })

    logger.info("Attribute definition cache initialized", {
      ttl: `${CACHE_TTL_MS / 1000}s`,
      maxSize: CACHE_MAX_SIZE,
    })
  }

  /**
   * Get all attribute definitions with optional filtering by item types.
   * Results are cached to reduce database queries.
   */
  async getAttributeDefinitions(
    applicableItemTypes?: string[]
  ): Promise<AttributeDefinition[]> {
    const cacheKey = applicableItemTypes && applicableItemTypes.length > 0
      ? `${CACHE_KEY_BY_TYPES}${applicableItemTypes.sort().join(",")}`
      : CACHE_KEY_ALL

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached && Array.isArray(cached)) {
      logger.debug("Attribute definitions cache hit", { cacheKey })
      return cached
    }

    // Cache miss - fetch from database
    logger.debug("Attribute definitions cache miss", { cacheKey })
    const definitions = await db.getAttributeDefinitions(applicableItemTypes)

    // Store in cache
    this.cache.set(cacheKey, definitions)

    return definitions
  }

  /**
   * Get a single attribute definition by name.
   * Results are cached to reduce database queries.
   */
  async getAttributeDefinition(
    attributeName: string
  ): Promise<AttributeDefinition | null> {
    const cacheKey = `${CACHE_KEY_BY_NAME}${attributeName}`

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached && !Array.isArray(cached)) {
      logger.debug("Attribute definition cache hit", { cacheKey })
      return cached
    }

    // Cache miss - fetch from database
    logger.debug("Attribute definition cache miss", { cacheKey })
    const definition = await db.getAttributeDefinition(attributeName)

    // Store in cache (even if null to avoid repeated lookups)
    if (definition) {
      this.cache.set(cacheKey, definition)
    }

    return definition
  }

  /**
   * Invalidate cache when an attribute definition is created.
   * This ensures the cache stays consistent with the database.
   */
  invalidateOnCreate(attributeName: string): void {
    logger.info("Invalidating attribute definition cache on create", {
      attributeName,
    })

    // Clear all cached queries since a new definition affects all queries
    this.cache.clear()
  }

  /**
   * Invalidate cache when an attribute definition is updated.
   * This ensures the cache stays consistent with the database.
   */
  invalidateOnUpdate(attributeName: string): void {
    logger.info("Invalidating attribute definition cache on update", {
      attributeName,
    })

    // Clear specific definition cache
    this.cache.delete(`${CACHE_KEY_BY_NAME}${attributeName}`)

    // Clear all list caches since the update might affect filtering
    for (const key of this.cache.keys()) {
      if (key === CACHE_KEY_ALL || key.startsWith(CACHE_KEY_BY_TYPES)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Invalidate cache when an attribute definition is deleted.
   * This ensures the cache stays consistent with the database.
   */
  invalidateOnDelete(attributeName: string): void {
    logger.info("Invalidating attribute definition cache on delete", {
      attributeName,
    })

    // Clear all cached queries since deletion affects all queries
    this.cache.clear()
  }

  /**
   * Manually clear the entire cache.
   * Useful for testing or administrative operations.
   */
  clearAll(): void {
    logger.info("Clearing all attribute definition cache")
    this.cache.clear()
  }

  /**
   * Get cache statistics for monitoring
   */
  getStats(): {
    size: number
    maxSize: number
    ttl: number
  } {
    return {
      size: this.cache.size,
      maxSize: CACHE_MAX_SIZE,
      ttl: CACHE_TTL_MS,
    }
  }

  /**
   * Warm up the cache by pre-loading commonly accessed data.
   * This can be called on server startup to improve initial response times.
   */
  async warmUp(): Promise<void> {
    logger.info("Warming up attribute definition cache")

    try {
      // Pre-load all definitions
      await this.getAttributeDefinitions()

      // Pre-load definitions for common item types
      const commonItemTypes = [
        ["Quantum Drive"],
        ["Cooler"],
        ["Power Plant"],
        ["Shield"],
        ["Ship Weapon"],
        ["Helmet", "Torso", "Arms", "Legs"],
        ["Ranged Weapon"],
      ]

      await Promise.all(
        commonItemTypes.map((types) => this.getAttributeDefinitions(types))
      )

      logger.info("Attribute definition cache warmed up successfully")
    } catch (error) {
      logger.error("Failed to warm up attribute definition cache", { error })
    }
  }
}

/**
 * Singleton instance of the attribute definition cache
 */
export const attributeDefinitionCache = new AttributeDefinitionCache()

/**
 * Cached versions of database functions that use the cache layer
 */
export const cachedDb = {
  /**
   * Get all attribute definitions with caching
   */
  getAttributeDefinitions: (applicableItemTypes?: string[]) =>
    attributeDefinitionCache.getAttributeDefinitions(applicableItemTypes),

  /**
   * Get a single attribute definition with caching
   */
  getAttributeDefinition: (attributeName: string) =>
    attributeDefinitionCache.getAttributeDefinition(attributeName),

  /**
   * Create attribute definition and invalidate cache
   */
  createAttributeDefinition: async (payload: Parameters<typeof db.createAttributeDefinition>[0]) => {
    const result = await db.createAttributeDefinition(payload)
    attributeDefinitionCache.invalidateOnCreate(result.attribute_name)
    return result
  },

  /**
   * Update attribute definition and invalidate cache
   */
  updateAttributeDefinition: async (
    attributeName: string,
    payload: Parameters<typeof db.updateAttributeDefinition>[1]
  ) => {
    const result = await db.updateAttributeDefinition(attributeName, payload)
    if (result) {
      attributeDefinitionCache.invalidateOnUpdate(attributeName)
    }
    return result
  },

  /**
   * Delete attribute definition and invalidate cache
   */
  deleteAttributeDefinition: async (attributeName: string, cascadeDelete?: boolean) => {
    const result = await db.deleteAttributeDefinition(attributeName, cascadeDelete)
    if (result) {
      attributeDefinitionCache.invalidateOnDelete(attributeName)
    }
    return result
  },
}
