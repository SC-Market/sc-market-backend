/**
 * Service-related database operations.
 * This module contains all database queries specific to services and service images.
 */

import { getKnex } from "../../../../clients/database/knex-db.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import {
  DBService,
  DBServiceImage,
} from "../../../../clients/database/db-models.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Get services by where clause.
 */
export async function getServices(where: any): Promise<DBService[]> {
  return knex()<DBService>("services").where(where).select()
}

/**
 * Get services with pagination and filtering.
 */
export async function getServicesPaginated(params: {
  page?: number
  pageSize?: number
  search?: string
  kind?: string
  minCost?: number
  maxCost?: number
  paymentType?: string
  sortBy?: "timestamp" | "cost" | "service_name"
  sortOrder?: "asc" | "desc"
  status?: string
}): Promise<{
  services: DBService[]
  pagination: {
    currentPage: number
    pageSize: number
    totalItems: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
}> {
  const {
    page = 0,
    pageSize = 20,
    search,
    kind,
    minCost,
    maxCost,
    paymentType,
    sortBy = "timestamp",
    sortOrder = "desc",
    status = "active",
  } = params

  // Build base query with filters
  let query = knex()<DBService>("services")
  let countQuery = knex()<DBService>("services")

  // Apply status filter
  query = query.where("status", status)
  countQuery = countQuery.where("status", status)

  // Apply search filter (search in service_name and service_description)
  if (search) {
    const searchTerm = `%${search.toLowerCase()}%`
    query = query.where(function () {
      this.whereRaw("service_name ILIKE ?", [searchTerm]).orWhereRaw(
        "service_description ILIKE ?",
        [searchTerm],
      )
    })
    countQuery = countQuery.where(function () {
      this.whereRaw("service_name ILIKE ?", [searchTerm]).orWhereRaw(
        "service_description ILIKE ?",
        [searchTerm],
      )
    })
  }

  // Apply kind filter
  if (kind) {
    query = query.where("kind", kind)
    countQuery = countQuery.where("kind", kind)
  }

  // Apply cost range filters
  if (minCost !== undefined) {
    query = query.where("cost", ">=", minCost)
    countQuery = countQuery.where("cost", ">=", minCost)
  }
  if (maxCost !== undefined) {
    query = query.where("cost", "<=", maxCost)
    countQuery = countQuery.where("cost", "<=", maxCost)
  }

  // Apply payment type filter
  if (paymentType) {
    query = query.where("payment_type", paymentType)
    countQuery = countQuery.where("payment_type", paymentType)
  }

  // Get total count
  const totalCountResult = await countQuery.count("* as count").first()
  const totalItems = parseInt((totalCountResult as any).count)

  // Calculate pagination
  const totalPages = Math.ceil(totalItems / pageSize)
  const offset = page * pageSize

  // Apply sorting and pagination
  query = query.orderBy(sortBy, sortOrder).offset(offset).limit(pageSize)

  // Execute query
  const services = await query.select()

  return {
    services,
    pagination: {
      currentPage: page,
      pageSize,
      totalItems,
      totalPages,
      hasNextPage: page < totalPages - 1,
      hasPreviousPage: page > 0,
    },
  }
}

/**
 * Get a service by where clause.
 */
export async function getService(where: any): Promise<DBService | undefined> {
  return knex()<DBService>("services").where(where).first()
}

/**
 * Create a new service.
 */
export async function createService(
  data: Partial<DBService>,
): Promise<DBService[]> {
  return knex()<DBService>("services").insert(data).returning("*")
}

/**
 * Update a service by where clause.
 */
export async function updateService(
  where: Partial<DBService>,
  data: Partial<DBService>,
): Promise<DBService[]> {
  return knex()<DBService>("services").update(data).where(where).returning("*")
}

/**
 * Get service listing images by where clause.
 */
export async function getServiceListingImages(
  where: Partial<DBServiceImage>,
): Promise<DBServiceImage[]> {
  return knex()<DBServiceImage>("service_images").where(where).select()
}

/**
 * Get service listing images with resolved CDN URLs.
 * Returns array of resolved URL strings.
 */
export async function getServiceListingImagesResolved(
  where: Partial<DBServiceImage>,
): Promise<string[]> {
  const images = await getServiceListingImages(where)
  const urls = await Promise.all(
    images.map((entry) => cdn.getFileLinkResource(entry.resource_id)),
  )
  return urls.filter((x) => x) as string[]
}

/**
 * Delete service images by where clause.
 */
export async function deleteServiceImages(
  where: Partial<DBServiceImage>,
): Promise<DBServiceImage[]> {
  return knex()<DBServiceImage>("service_images")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Insert a service image.
 */
export async function insertServiceImage(
  body: DBServiceImage,
): Promise<DBServiceImage[]> {
  return knex()<DBServiceImage>("service_images").insert(body).returning("*")
}
