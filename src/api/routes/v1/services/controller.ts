import { RequestHandler } from "express"
import { User as User } from "../api-models.js"
import { database as database } from "../../../../clients/database/knex-db.js"
import * as serviceDb from "./database.js"
import * as contractorDb from "../contractors/database.js"
import * as profileDb from "../profiles/database.js"
import * as marketDb from "../market/database.js"
import { has_permission as has_permission } from "../util/permissions.js"
import { cdn as cdn } from "../../../../clients/cdn/cdn.js"
import { serializeService as serializeService } from "./serializers.js"
import { PaymentType as PaymentType } from "../types/payment-types.js"
import { createServicePhotos as createServicePhotos } from "./helpers.js"
import {
  createErrorResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { createResponse as createResponse } from "../util/response.js"
import { randomUUID as randomUUID } from "node:crypto"
import fs from "node:fs"
import logger from "../../../../logger/logger.js"
import { isSCMarketsCDN as isSCMarketsCDN } from "./helpers.js"
import { isImageAlreadyAssociated as isImageAlreadyAssociated } from "./helpers.js"
import { validateServicePhotos as validateServicePhotos } from "./helpers.js"

export const services_post_root: RequestHandler = async (req, res) => {
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
    const contractor_obj = await contractorDb.getContractor({
      spectrum_id: contractor,
    })
    if (!contractor_obj) {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid contractor"),
        )
      return
    }
    contractor_id = contractor_obj.contractor_id

    if (!(await has_permission(contractor_id, user.user_id, "manage_orders"))) {
      res.status(403).json(createForbiddenErrorResponse("No permissions"))
      return
    }
  } else {
    contractor_id = null
  }

  const [service] = await serviceDb.createService({
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
    logger.error("Failed to create service photos", { error })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to create service photos",
        ),
      )
    return
  }

  res.json(createResponse({ service_id: service.service_id }))
}

export const services_get_user_username: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const username = req.params["username"]

  let target
  try {
    target = await profileDb.getUser(
      { username: username },
      { noBalance: true },
    )
  } catch {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid user"))
    return
  }

  const isOwner = user && username === user.username

  if (isOwner) {
    const services = await serviceDb.getServices({
      user_id: target.user_id,
    })
    res.json(createResponse(await Promise.all(services.map(serializeService))))
  } else {
    const services = await serviceDb.getServices({
      user_id: target.user_id,
      status: "active",
    })
    res.json(createResponse(await Promise.all(services.map(serializeService))))
  }
}

export const services_get_public: RequestHandler = async (req, res, next) => {
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
    language_codes,
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
    language_codes: language_codes
      ? (language_codes as string)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
  }

  const result = await serviceDb.getServicesPaginated(params)

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
}

export const services_get_contractor_spectrum_id: RequestHandler = async (
  req,
  res,
) => {
  const user = req.user as User

  const isAdmin =
    user &&
    (await has_permission(
      req.contractor!.contractor_id,
      user.user_id,
      "manage_orders",
    ))
  if (isAdmin) {
    const services = await serviceDb.getServices({
      contractor_id: req.contractor!.contractor_id,
    })
    res.json(createResponse(await Promise.all(services.map(serializeService))))
  } else {
    const services = await serviceDb.getServices({
      contractor_id: req.contractor!.contractor_id,
      status: "active",
    })
    res.json(createResponse(await Promise.all(services.map(serializeService))))
  }
}

export const services_put_service_id: RequestHandler = async (req, res) => {
  const user = req.user as User
  const service_id = req.params["service_id"]

  let service
  try {
    service = await serviceDb.getService({ service_id })
  } catch {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid service"))
    return
  }

  if (!service) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid service"))
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
    const contractor = await contractorDb.getContractor({
      contractor_id: service.contractor_id,
    })

    if (
      !(await has_permission(
        contractor.contractor_id,
        user.user_id,
        "manage_orders",
      ))
    ) {
      res.status(403).json(createForbiddenErrorResponse("No permissions"))
      return
    }
  } else {
    if (service.user_id !== user.user_id) {
      res.status(403).json(createForbiddenErrorResponse("No permissions"))
      return
    }
  }

  await serviceDb.updateService(
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
    const old_photos = await serviceDb.getServiceListingImages({ service_id })

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
        res
          .status(400)
          .json(
            createErrorResponse(
              ErrorCode.VALIDATION_ERROR,
              "Cannot use image from SC markets CDN that is not already associated with this service",
            ),
          )
        return
      }

      // For non-CDN images, proceed with normal processing
      try {
        const resource = await cdn.createExternalResource(
          photo,
          service_id + `_photo_${0}`,
        )
        await serviceDb.insertServiceImage({
          resource_id: resource.resource_id,
          service_id,
        })
      } catch (e: any) {
        res
          .status(400)
          .json(
            createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid photo!"),
          )
        return
      }
    }

    // Remove any old photos that are not being preserved
    for (const p of old_photos) {
      if (!photosToPreserve.has(p.resource_id)) {
        await serviceDb.deleteServiceImages(p)
        try {
          // Use CDN removeResource to ensure both database and CDN cleanup
          await cdn.removeResource(p.resource_id)
        } catch {}
      }
    }
  }

  res.json(createResponse({ result: "Success" }))
}

export const services_get_service_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const service_id = req.params["service_id"]

  let service
  try {
    service = await serviceDb.getService({ service_id })
  } catch {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid service"))
    return
  }

  if (!service) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid service"))
    return
  }

  res.json(createResponse(await serializeService(service)))
}

export const services_post_service_id_photos: RequestHandler = async (
  req,
  res,
) => {
  try {
    const user = req.user as User
    const service_id = req.params.service_id
    const photos = req.files as unknown as Express.Multer.File[]

    if (!photos || photos.length === 0) {
      res
        .status(400)
        .json(
          createErrorResponse(ErrorCode.VALIDATION_ERROR, "No photos provided"),
        )
      return
    }

    if (photos.length > 5) {
      res
        .status(400)
        .json(
          createErrorResponse(
            ErrorCode.VALIDATION_ERROR,
            "Maximum 5 photos can be uploaded at once",
          ),
        )
      return
    }

    // Validate service exists
    const service = await serviceDb.getService({ service_id })
    if (!service) {
      res
        .status(404)
        .json(createErrorResponse(ErrorCode.NOT_FOUND, "Service not found"))
      return
    }

    // Check if user has permission to modify this service
    if (service.contractor_id) {
      const contractor = await contractorDb.getContractor({
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
        res
          .status(403)
          .json(
            createForbiddenErrorResponse(
              "You are not authorized to modify this service",
            ),
          )
        return
      }
    } else {
      // If no contractor, check if user owns the service
      if (service.user_id !== user.user_id) {
        res
          .status(403)
          .json(
            createForbiddenErrorResponse(
              "You are not authorized to modify this service",
            ),
          )
        return
      }
    }

    // Get existing photos to check count
    const existing_photos = await serviceDb.getServiceListingImages({
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
          await serviceDb.deleteServiceImages(photo)
          await contractorDb.removeImageResource({
            resource_id: photo.resource_id,
          })
        } catch (error) {
          logger.error("Failed to delete old photo", { error })
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
            logger.debug(`Photo ${index + 1} failed content moderation:`, error)
            res.status(400).json(
              createErrorResponse(
                ErrorCode.VALIDATION_ERROR,
                `Photo ${index + 1} failed content moderation checks and cannot be uploaded.`,
                {
                  details: "One or more photos contain inappropriate content.",
                },
              ),
            )
            return
          }

          if (
            error.message.includes("Missing required fields") ||
            error.message.includes("VALIDATION_ERROR") ||
            error.message.includes("UNSUPPORTED_FORMAT")
          ) {
            logger.debug(`Photo ${index + 1} failed validation:`, error)
            res
              .status(400)
              .json(
                createErrorResponse(
                  ErrorCode.VALIDATION_ERROR,
                  `Photo ${index + 1} failed validation: ${error.message}`,
                  { details: "Please check the file format and try again." },
                ),
              )
            return
          }

          if (error.message.includes("Unsupported MIME type")) {
            logger.debug(`Photo ${index + 1} has unsupported format:`, error)
            res.status(400).json(
              createErrorResponse(
                ErrorCode.VALIDATION_ERROR,
                `Photo ${index + 1} has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.`,
                {
                  details: "Please ensure all photos are in supported formats.",
                },
              ),
            )
            return
          }
        }

        // Log unexpected errors as error level
        logger.error(`Failed to upload photo ${index + 1}:`, error)
        res.status(500).json(
          createErrorResponse(
            ErrorCode.INTERNAL_SERVER_ERROR,
            `Failed to upload photo ${index + 1}`,
            {
              details:
                "An unexpected error occurred during upload. Please try again.",
            },
          ),
        )
        return
      }
    }

    const uploadedResources = uploadResults.map((result) => result.resource)

    // Insert new photos into database
    for (const resource of uploadedResources) {
      await serviceDb.insertServiceImage({
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
          createErrorResponse(ErrorCode.VALIDATION_ERROR, error.message, {
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
          createErrorResponse(ErrorCode.VALIDATION_ERROR, error.message, {
            details:
              "Please ensure all photos are in PNG, JPG, GIF, or WEBP format.",
          }),
        )
        return
      }
    }

    // Log unexpected server errors as error level
    logger.error("Unexpected error uploading photos:", error)
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Failed to upload photos. Please try again.",
        ),
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
}

export const services_post_service_id_view: RequestHandler = async (
  req,
  res,
) => {
  try {
    const { service_id } = req.params
    const user = req.user

    // Verify service exists and is active
    const service = await serviceDb.getService({ service_id })
    if (!service || service.status !== "active") {
      return res
        .status(404)
        .json(
          createErrorResponse(
            ErrorCode.NOT_FOUND,
            "Service not found or inactive",
          ),
        )
    }

    // Track the view
    await marketDb.trackListingView({
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
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}

export const services_get_seller_analytics: RequestHandler = async (
  req,
  res,
) => {
  try {
    const user = req.user as User
    const period = (req.query.period as string) || "30d"

    // Get analytics for user's services
    const userAnalytics = await marketDb.getSellerListingAnalytics({
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
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
  }
}
