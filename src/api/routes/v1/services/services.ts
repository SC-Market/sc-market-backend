import express from "express"
import {
  userAuthorized,
  requireServicesRead,
  requireServicesWrite,
} from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import { has_permission } from "../util/permissions.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { serializeService } from "./serializers.js"
import { orderTypes } from "../orders/helpers.js"
import { PAYMENT_TYPES, PaymentType } from "../types/payment-types.js"
import { createServicePhotos } from "./helpers.js"
import {
  oapi,
  Response400,
  Response401,
  Response403,
  Response404,
  Response500,
} from "../openapi.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { valid_contractor } from "../contractors/middleware.js"
import { multiplePhotoUpload } from "../util/upload.js"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import logger from "../../../../logger/logger.js"
import {
  isSCMarketsCDN,
  isImageAlreadyAssociated,
  validateServicePhotos,
} from "./helpers.js"

export const servicesRouter = express.Router()

oapi.schema("ServiceBody", {
  properties: {
    service_name: {
      title: "ServiceBody.service_name",
      type: "string",
      maxLength: 100,
    },
    service_description: {
      title: "ServiceBody.service_description",
      type: "string",
      maxLength: 2000,
    },
    title: {
      title: "ServiceBody.title",
      type: "string",
      maxLength: 100,
    },
    rush: {
      title: "ServiceBody.rush",
      type: "boolean",
    },
    description: {
      title: "ServiceBody.description",
      type: "string",
      maxLength: 2000,
    },
    kind: {
      title: "ServiceBody.kind",
      type: "string",
      enum: orderTypes,
    },
    collateral: {
      title: "ServiceBody.collateral",
      type: "number",
    },
    departure: {
      title: "ServiceBody.departure",
      nullable: true,
      type: "string",
    },
    destination: {
      title: "ServiceBody.destination",
      nullable: true,
      type: "string",
    },
    cost: {
      title: "ServiceBody.cost",
      type: "number",
      minimum: 0,
    },
    payment_type: {
      enum: PAYMENT_TYPES,
      title: "ServiceBody.payment_type",
      type: "string",
    },
    contractor: {
      title: "ServiceBody.contractor",
      nullable: true,
      type: "string",
    },
    status: {
      title: "ServiceBody.status",
      type: "string",
      enum: ["active", "inactive"],
    },
    photos: {
      items: {
        title: "ServiceBody.photos.[]",
        type: "string",
      },
      title: "ServiceBody.photos",
      type: "array",
      minLength: 1,
    },
  },
  required: [
    "service_name",
    "service_description",
    "title",
    "rush",
    "description",
    "collateral",
    "departure",
    "destination",
    "cost",
    "payment_type",
    "status",
    "photos",
  ],
  additionalProperties: false,
  title: "ServiceBody",
  type: "object",
})

servicesRouter.post(
  "",

  requireServicesWrite,
  oapi.validPath({
    summary: "Create a new service",
    deprecated: false,
    description: "",
    operationId: "createService",
    tags: ["Services"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("ServiceBody"),
        },
      },
    },
    responses: {
      "201": {
        description: "Created - Resource successfully created",
        content: {
          "application/json": {
            schema: {
              properties: {},
              type: "object",
              title: "CreateServiceCreated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
    },
    security: [],
  }),
  async (req, res) => {
    const user = req.user as User

    const {
      service_name,
      service_description,
      kind,
      description,
      cost,
      title,
      contractor,
      rush,
      departure,
      destination,
      collateral,
      payment_type,
      photos,
      status,
    }: {
      service_name: string
      service_description: string
      title: string
      rush: boolean
      description: string
      kind: string
      collateral: number
      departure: string | null
      destination: string | null
      cost: number
      contractor?: string | null
      payment_type: PaymentType
      photos: string[]
      status: string
    } = req.body

    let contractor_id
    if (contractor) {
      const contractor_obj = await database.getContractor({
        spectrum_id: contractor,
      })
      if (!contractor_obj) {
        res
          .status(400)
          .json(createErrorResponse({ error: "Invalid contractor" }))
        return
      }
      contractor_id = contractor_obj.contractor_id

      if (
        !(await has_permission(contractor_id, user.user_id, "manage_orders"))
      ) {
        res.status(403).json(createErrorResponse({ error: "No permissions" }))
        return
      }
    } else {
      contractor_id = null
    }

    const [service] = await database.createService({
      service_name: service_name,
      service_description: service_description,
      kind: kind || null,
      description: description,
      cost: cost,
      title: title,
      contractor_id: contractor_id,
      rush: rush || false,
      departure: departure,
      destination: destination,
      collateral: collateral || 0,
      payment_type: payment_type as "one-time" | "hourly" | "daily",
      user_id: contractor_id ? undefined : user.user_id,
      status,
    })

    try {
      // Validate photos for new service (no existing service to check against)
      const photoValidation = await validateServicePhotos(photos)
      if (!photoValidation.valid) {
        res
          .status(400)
          .json(createErrorResponse({ error: photoValidation.error }))
        return
      }

      await createServicePhotos(service.service_id, photos)
    } catch (error) {
      console.error("Failed to create service photos:", error)
      res
        .status(500)
        .json(createErrorResponse({ error: "Failed to create service photos" }))
      return
    }

    res.json(createResponse({ result: "Success" }))
  },
)

servicesRouter.get(
  "/user/:username",
  oapi.validPath({
    summary: "Get services by user",
    deprecated: false,
    description: "",
    operationId: "getServicesByUser",
    tags: ["Services"],
    parameters: [
      {
        name: "username",
        in: "path",
        description: "The username of the user",
        required: true,
        example: "Khuzdul",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("Service"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetServicesByUserOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  async (req, res, next) => {
    const user = req.user as User
    const username = req.params["username"]

    let target
    try {
      target = await database.getUser(
        { username: username },
        { noBalance: true },
      )
    } catch {
      res.status(400).json(createErrorResponse({ error: "Invalid user" }))
      return
    }

    const isOwner = user && username === user.username

    if (isOwner) {
      const services = await database.getServices({
        user_id: target.user_id,
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    } else {
      const services = await database.getServices({
        user_id: target.user_id,
        status: "active",
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    }
  },
)

servicesRouter.get(
  "/public",
  oapi.validPath({
    summary: "Get public services with pagination",
    deprecated: false,
    description:
      "Get paginated list of active services with optional filtering and sorting",
    operationId: "getPublicServices",
    tags: ["Services"],
    parameters: [
      {
        name: "page",
        in: "query",
        description: "Page number (0-based)",
        required: false,
        schema: {
          type: "integer",
          minimum: 0,
          default: 0,
        },
      },
      {
        name: "pageSize",
        in: "query",
        description: "Number of items per page",
        required: false,
        schema: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
        },
      },
      {
        name: "search",
        in: "query",
        description: "Search term for service name and description",
        required: false,
        schema: {
          type: "string",
        },
      },
      {
        name: "kind",
        in: "query",
        description: "Filter by service kind",
        required: false,
        schema: {
          type: "string",
        },
      },
      {
        name: "minCost",
        in: "query",
        description: "Minimum cost filter",
        required: false,
        schema: {
          type: "number",
          minimum: 0,
        },
      },
      {
        name: "maxCost",
        in: "query",
        description: "Maximum cost filter",
        required: false,
        schema: {
          type: "number",
          minimum: 0,
        },
      },
      {
        name: "paymentType",
        in: "query",
        description: "Filter by payment type",
        required: false,
        schema: {
          type: "string",
          enum: PAYMENT_TYPES,
        },
      },
      {
        name: "sortBy",
        in: "query",
        description: "Field to sort by",
        required: false,
        schema: {
          type: "string",
          enum: ["timestamp", "cost", "service_name"],
          default: "timestamp",
        },
      },
      {
        name: "sortOrder",
        in: "query",
        description: "Sort order",
        required: false,
        schema: {
          type: "string",
          enum: ["asc", "desc"],
          default: "desc",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("Service"),
                },
                pagination: {
                  type: "object",
                  properties: {
                    currentPage: { type: "integer" },
                    pageSize: { type: "integer" },
                    totalItems: { type: "integer" },
                    totalPages: { type: "integer" },
                    hasNextPage: { type: "boolean" },
                    hasPreviousPage: { type: "boolean" },
                  },
                  required: [
                    "currentPage",
                    "pageSize",
                    "totalItems",
                    "totalPages",
                    "hasNextPage",
                    "hasPreviousPage",
                  ],
                },
              },
              required: ["data", "pagination"],
              type: "object",
              title: "GetPublicServicesOk",
            },
          },
        },
        headers: {},
      },
    },
  }),
  async (req, res, next) => {
    const {
      page,
      pageSize,
      search,
      kind,
      minCost,
      maxCost,
      paymentType,
      sortBy,
      sortOrder,
    } = req.query

    // Parse and validate parameters
    const params = {
      page: page ? parseInt(page as string) : undefined,
      pageSize: pageSize ? parseInt(pageSize as string) : undefined,
      search: search as string,
      kind: kind as string,
      minCost: minCost ? parseFloat(minCost as string) : undefined,
      maxCost: maxCost ? parseFloat(maxCost as string) : undefined,
      paymentType: paymentType as string,
      sortBy: sortBy as "timestamp" | "cost" | "service_name",
      sortOrder: sortOrder as "asc" | "desc",
    }

    const result = await database.getServicesPaginated(params)

    // Serialize services
    const serializedServices = await Promise.all(
      result.services.map(serializeService),
    )

    res.json(
      createResponse({
        data: serializedServices,
        pagination: result.pagination,
      }),
    )
  },
)

servicesRouter.get(
  "/contractor/:spectrum_id",
  userAuthorized,
  requireServicesRead,
  oapi.validPath({
    summary: "Get services by contractor",
    deprecated: false,
    description: "",
    operationId: "getServicesByContractor",
    tags: ["Services"],
    parameters: [
      {
        name: "spectrum_id",
        in: "path",
        description: "The Spectrum ID of the contractor",
        required: true,
        example: "SCMARKET",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: {
              properties: {
                data: {
                  type: "array",
                  items: oapi.schema("Service"),
                },
              },
              required: ["data"],
              type: "object",
              title: "GetServicesByContractorOk",
            },
          },
        },
        headers: {},
      },
      "404": Response404,
    },
  }),
  valid_contractor,
  async (req, res) => {
    const user = req.user as User

    const isAdmin =
      user &&
      (await has_permission(
        req.contractor!.contractor_id,
        user.user_id,
        "manage_orders",
      ))
    if (isAdmin) {
      const services = await database.getServices({
        contractor_id: req.contractor!.contractor_id,
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    } else {
      const services = await database.getServices({
        contractor_id: req.contractor!.contractor_id,
        status: "active",
      })
      res.json(
        createResponse(await Promise.all(services.map(serializeService))),
      )
    }
  },
)

servicesRouter.put(
  "/:service_id",
  userAuthorized,
  requireServicesWrite,
  oapi.validPath({
    summary: "Update a service",
    deprecated: false,
    description: "",
    operationId: "updateService",
    tags: ["Services"],
    parameters: [
      {
        name: "service_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    requestBody: {
      content: {
        "application/json": {
          schema: oapi.schema("ServiceBody"),
        },
      },
    },
    responses: {
      "204": {
        description: "Updated - Resource successfully updated",
        content: {
          "application/json": {
            schema: {
              properties: {},
              type: "object",
              title: "UpdateServiceUpdated",
            },
          },
        },
        headers: {},
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
    },
    security: [],
  }),
  async (req, res) => {
    const user = req.user as User
    const service_id = req.params["service_id"]

    let service
    try {
      service = await database.getService({ service_id })
    } catch {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    if (!service) {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    const {
      service_name,
      service_description,
      kind,
      description,
      cost,
      title,
      rush,
      departure,
      destination,
      collateral,
      status,
      payment_type,
      photos,
    }: {
      service_name: string
      service_description: string
      title: string
      rush: boolean
      description: string
      kind: string
      collateral: number
      departure: string | null
      destination: string | null
      cost: number
      status: string
      payment_type: PaymentType
      photos: string[]
    } = req.body

    if (service.contractor_id) {
      const contractor = await database.getContractor({
        contractor_id: service.contractor_id,
      })

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_orders",
        ))
      ) {
        res.status(400).json(createErrorResponse({ error: "No permissions!" }))
        return
      }
    } else {
      if (service.user_id !== user.user_id) {
        res.status(400).json(createErrorResponse({ error: "No permissions!" }))
        return
      }
    }

    await database.updateService(
      { service_id },
      {
        service_name,
        service_description,
        kind: kind || null,
        description: description,
        cost: cost,
        title: title,
        rush: rush || false,
        departure: departure,
        destination: destination,
        collateral: collateral || 0,
        status: status,
        payment_type,
      },
    )

    // Handle photo updates
    if (photos !== undefined) {
      const old_photos = await database.getServiceListingImages({ service_id })

      // Validate photos using the helper function
      const photoValidation = await validateServicePhotos(photos, service)
      if (!photoValidation.valid) {
        res
          .status(400)
          .json(createErrorResponse({ error: photoValidation.error }))
        return
      }

      // Track which old photos should be preserved (CDN images that are still being used)
      const photosToPreserve = new Set<string>()

      // Process photos - CDN images that are already associated will be skipped
      for (const photo of photos) {
        // Check if this is a SC markets CDN URL
        if (isSCMarketsCDN(photo)) {
          // Check if the image is already associated with this service
          const isAssociated = await isImageAlreadyAssociated(photo, service)
          if (isAssociated) {
            // Find the corresponding old photo entry and mark it for preservation
            for (const oldPhoto of old_photos) {
              try {
                const resolvedUrl = await cdn.getFileLinkResource(
                  oldPhoto.resource_id,
                )
                if (resolvedUrl === photo) {
                  photosToPreserve.add(oldPhoto.resource_id)
                  break
                }
              } catch {
                // Skip if we can't resolve the URL
              }
            }
            // Skip this image as it's already associated
            continue
          }
          // If we reach here, the image is not associated, but validation should have caught this
          // This is a safety check
          res.status(400).json(
            createErrorResponse({
              error:
                "Cannot use image from SC markets CDN that is not already associated with this service",
            }),
          )
          return
        }

        // For non-CDN images, proceed with normal processing
        try {
          const resource = await cdn.createExternalResource(
            photo,
            service_id + `_photo_${0}`,
          )
          await database.insertServiceImage({
            resource_id: resource.resource_id,
            service_id,
          })
        } catch (e: any) {
          res.status(400).json(createErrorResponse({ error: "Invalid photo!" }))
          return
        }
      }

      // Remove any old photos that are not being preserved
      for (const p of old_photos) {
        if (!photosToPreserve.has(p.resource_id)) {
          await database.deleteServiceImages(p)
          try {
            // Use CDN removeResource to ensure both database and CDN cleanup
            await cdn.removeResource(p.resource_id)
          } catch {}
        }
      }
    }

    res.json(createResponse({ result: "Success" }))
  },
)

servicesRouter.get(
  "/:service_id",
  oapi.validPath({
    summary: "Get a service by ID",
    deprecated: false,
    description: "",
    operationId: "getServiceById",
    tags: ["Services"],
    parameters: [
      {
        name: "service_id",
        in: "path",
        description: "",
        required: true,
        example: "",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "OK - Successful request with response body",
        content: {
          "application/json": {
            schema: oapi.schema("Service"),
          },
        },
        headers: {},
      },
      "400": Response400,
      "404": Response404,
    },
    security: [],
  }),
  async (req, res, next) => {
    const service_id = req.params["service_id"]

    let service
    try {
      service = await database.getService({ service_id })
    } catch {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    if (!service) {
      res.status(400).json(createErrorResponse({ error: "Invalid service" }))
      return
    }

    res.json(createResponse(await serializeService(service)))
  },
)

// Upload photos for a service (multipart/form-data)
servicesRouter.post(
  "/:service_id/photos",
  userAuthorized,
  requireServicesWrite,
  multiplePhotoUpload.array("photos", 5),
  oapi.validPath({
    summary: "Upload photos for a service",
    description:
      "Upload up to 5 photos for a specific service. Photos are stored in CDN and linked to the service. If the total number of photos would exceed 5, the oldest photos will be automatically removed to maintain the limit.",
    operationId: "uploadServicePhotos",
    tags: ["Services"],
    parameters: [
      {
        name: "service_id",
        in: "path",
        required: true,
        description: "ID of the service to upload photos for",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "Photos uploaded successfully",
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/PhotoUploadResponse",
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "404": Response404,
      "500": Response500,
    },
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const service_id = req.params.service_id
      const photos = req.files as unknown as Express.Multer.File[]

      if (!photos || photos.length === 0) {
        res
          .status(400)
          .json(createErrorResponse({ error: "No photos provided" }))
        return
      }

      if (photos.length > 5) {
        res.status(400).json(
          createErrorResponse({
            error: "Maximum 5 photos can be uploaded at once",
          }),
        )
        return
      }

      // Validate service exists
      const service = await database.getService({ service_id })
      if (!service) {
        res
          .status(404)
          .json(createErrorResponse({ error: "Service not found" }))
        return
      }

      // Check if user has permission to modify this service
      if (service.contractor_id) {
        const contractor = await database.getContractor({
          contractor_id: service.contractor_id,
        })
        if (
          !contractor ||
          !(await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_orders",
          ))
        ) {
          res.status(403).json(
            createErrorResponse({
              error: "You are not authorized to modify this service",
            }),
          )
          return
        }
      } else {
        // If no contractor, check if user owns the service
        if (service.user_id !== user.user_id) {
          res.status(403).json(
            createErrorResponse({
              error: "You are not authorized to modify this service",
            }),
          )
          return
        }
      }

      // Get existing photos to check count
      const existing_photos = await database.getServiceListingImages({
        service_id,
      })

      const totalPhotosAfterUpload = existing_photos.length + photos.length

      // Only delete old photos if we would exceed 5 total photos
      if (totalPhotosAfterUpload > 5) {
        // Calculate how many old photos to delete to stay under 5
        const photosToDelete = totalPhotosAfterUpload - 5

        // Delete oldest photos first (assuming they're ordered by creation time)
        const photosToRemove = existing_photos.slice(0, photosToDelete)

        for (const photo of photosToRemove) {
          try {
            await database.deleteServiceImages(photo)
            await database.removeImageResource({
              resource_id: photo.resource_id,
            })
          } catch (error) {
            console.error("Failed to delete old photo:", error)
            // Continue with new photo insertion even if deletion fails
          }
        }
      }

      // Upload new photos to CDN and create database records
      const uploadResults = []
      for (let index = 0; index < photos.length; index++) {
        const photo = photos[index]
        try {
          const fileExtension = photo.mimetype.split("/")[1] || "png"
          const resource = await cdn.uploadFile(
            `${service_id}-photos-${index}-${randomUUID()}.${fileExtension}`,
            photo.path,
            photo.mimetype,
          )

          uploadResults.push({ success: true, resource, index })
        } catch (error) {
          // Handle different types of errors and return appropriate responses
          if (error instanceof Error) {
            if (error.message.includes("Image failed moderation checks")) {
              logger.debug(
                `Photo ${index + 1} failed content moderation:`,
                error,
              )
              res.status(400).json(
                createErrorResponse({
                  error: "Content Moderation Failed",
                  message: `Photo ${index + 1} failed content moderation checks and cannot be uploaded.`,
                  details: "One or more photos contain inappropriate content.",
                }),
              )
              return
            }

            if (
              error.message.includes("Missing required fields") ||
              error.message.includes("VALIDATION_ERROR") ||
              error.message.includes("UNSUPPORTED_FORMAT")
            ) {
              logger.debug(`Photo ${index + 1} failed validation:`, error)
              res.status(400).json(
                createErrorResponse({
                  error: "Validation Failed",
                  message: `Photo ${index + 1} failed validation: ${error.message}`,
                  details: "Please check the file format and try again.",
                }),
              )
              return
            }

            if (error.message.includes("Unsupported MIME type")) {
              logger.debug(`Photo ${index + 1} has unsupported format:`, error)
              res.status(400).json(
                createErrorResponse({
                  error: "Unsupported File Type",
                  message: `Photo ${index + 1} has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.`,
                  details: "Please ensure all photos are in supported formats.",
                }),
              )
              return
            }
          }

          // Log unexpected errors as error level
          logger.error(`Failed to upload photo ${index + 1}:`, error)
          res.status(500).json(
            createErrorResponse({
              error: "Upload Failed",
              message: `Failed to upload photo ${index + 1}`,
              details:
                "An unexpected error occurred during upload. Please try again.",
            }),
          )
          return
        }
      }

      const uploadedResources = uploadResults.map((result) => result.resource)

      // Insert new photos into database
      for (const resource of uploadedResources) {
        await database.insertServiceImage({
          resource_id: resource.resource_id,
          service_id,
        })
      }

      // Get CDN URLs for response
      const photoUrls = await Promise.all(
        uploadedResources.map(async (resource) => ({
          resource_id: resource.resource_id,
          url: await cdn.getFileLinkResource(resource.resource_id),
        })),
      )

      res.json(
        createResponse({
          result: "Photos uploaded successfully",
          photos: photoUrls,
        }),
      )
    } catch (error) {
      // Check for specific error types and return appropriate responses
      if (error instanceof Error) {
        if (error.message.includes("failed content moderation check")) {
          logger.debug("Photo upload failed content moderation check:", {
            error: error.message,
          })
          res.status(400).json(
            createErrorResponse({
              error: "Content Moderation Failed",
              message: error.message,
              details:
                "One or more photos contain inappropriate content and cannot be uploaded.",
            }),
          )
          return
        }

        if (error.message.includes("unsupported file type")) {
          logger.debug("Photo upload failed due to unsupported file type:", {
            error: error.message,
          })
          res.status(400).json(
            createErrorResponse({
              error: "Unsupported File Type",
              message: error.message,
              details:
                "Please ensure all photos are in PNG, JPG, GIF, or WEBP format.",
            }),
          )
          return
        }
      }

      // Log unexpected server errors as error level
      logger.error("Unexpected error uploading photos:", error)
      res.status(500).json(
        createErrorResponse({
          error: "Upload Failed",
          message: "Failed to upload photos. Please try again.",
        }),
      )
    } finally {
      // Clean up uploaded files regardless of success/failure
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path)
            }
          } catch (cleanupError) {
            logger.error(
              `Failed to cleanup temporary file ${file.path}:`,
              cleanupError,
            )
          }
        }
      }
    }
  },
)

// Track a view on a service
servicesRouter.post(
  "/:service_id/view",
  oapi.validPath({
    summary: "Track a view on a service",
    description: "Records a view on a service for analytics purposes",
    operationId: "trackServiceView",
    deprecated: false,
    tags: ["Services"],
    parameters: [
      {
        name: "service_id",
        in: "path",
        required: true,
        description: "ID of the service to track view for",
        schema: {
          type: "string",
        },
      },
    ],
    responses: {
      "200": {
        description: "View tracked successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                message: { type: "string" },
              },
              required: ["message"],
            },
          },
        },
      },
      "400": Response400,
      "404": Response404,
      "500": Response500,
    },
    security: [],
  }),
  async (req, res) => {
    try {
      const { service_id } = req.params
      const user = req.user

      // Verify service exists and is active
      const service = await database.getService({ service_id })
      if (!service || service.status !== "active") {
        return res
          .status(404)
          .json({ message: "Service not found or inactive" })
      }

      // Track the view
      await database.trackListingView({
        listing_type: "service",
        listing_id: service_id,
        viewer_id: user ? (user as User).user_id : null,
        viewer_ip: req.ip,
        user_agent: req.get("User-Agent"),
        referrer: req.get("Referer"),
        session_id: req.sessionID,
      })

      res.json({ message: "View tracked successfully" })
    } catch (error) {
      logger.error("Error tracking service view", {
        error,
        service_id: req.params.service_id,
      })
      res.status(500).json({ message: "Internal server error" })
    }
  },
)

// Get view analytics for a seller's services
servicesRouter.get(
  "/seller/analytics",
  userAuthorized,
  requireServicesRead,
  oapi.validPath({
    summary: "Get seller service analytics",
    description: "Returns analytics data for the authenticated user's services",
    operationId: "getServiceAnalytics",
    deprecated: false,
    tags: ["Services"],
    parameters: [
      {
        name: "period",
        in: "query",
        description: "Time period for analytics (7d, 30d, 90d)",
        schema: {
          type: "string",
          enum: ["7d", "30d", "90d"],
        },
      },
    ],
    responses: {
      "200": {
        description: "Analytics retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                data: {
                  type: "object",
                  properties: {
                    services: { type: "number" },
                    total_service_views: { type: "number" },
                    time_period: { type: "string" },
                    user_id: { type: "string" },
                  },
                  required: [
                    "services",
                    "total_service_views",
                    "time_period",
                    "user_id",
                  ],
                },
              },
              required: ["data"],
            },
          },
        },
      },
      "401": Response401,
      "500": Response500,
    },
    security: [],
  }),
  async (req, res) => {
    try {
      const user = req.user as User
      const period = (req.query.period as string) || "30d"

      // Get analytics for user's services
      const userAnalytics = await database.getSellerListingAnalytics({
        user_id: user.user_id,
        time_period: period,
      })

      res.json(
        createResponse({
          services: userAnalytics.services,
          total_service_views: userAnalytics.total_service_views,
          time_period: period,
          user_id: user.user_id,
        }),
      )
    } catch (error) {
      logger.error("Error fetching service analytics", {
        error,
        user_id: (req.user as User)?.user_id,
      })
      res.status(500).json({ message: "Internal server error" })
    }
  },
)
