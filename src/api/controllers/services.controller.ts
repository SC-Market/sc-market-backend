// @ts-nocheck
/**
 * Services Controller
 * Handles service listing management
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Route,
  Path,
  Body,
  Query,
  Security,
  Middlewares,
  Request,
  Response,
  SuccessResponse,
  UploadedFiles,
} from "tsoa"
import { BaseController, ValidationErrorClass, ForbiddenError, NotFoundError, ConflictError } from "./base.controller.js"
import {
  Service,
  CreateServiceRequest,
  UpdateServiceRequest,
  ServiceSearchParams,
  ServiceResponse,
  ServiceListResponse,
  ServicePaginatedResponse,
  ServiceCreationResponse,
  ServiceUpdateResponse,
  ServicePhotoUploadResponse,
  ServiceViewResponse,
  ServiceAnalyticsResponse,
} from "../models/services.models.js"
import {
  ErrorResponse,
  ValidationErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/common.models.js"
import { tsoaReadRateLimit, tsoaWriteRateLimit } from "../middleware/tsoa-ratelimit.js"
import * as serviceDb from "../routes/v1/services/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as marketDb from "../routes/v1/market/database.js"
import { has_permission } from "../routes/v1/util/permissions.js"
import { cdn } from "../../../clients/cdn/cdn.js"
import { serializeService } from "../routes/v1/services/serializers.js"
import {
  createServicePhotos,
  validateServicePhotos,
  isSCMarketsCDN,
  isImageAlreadyAssociated,
} from "../routes/v1/services/helpers.js"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import logger from "../../../logger/logger.js"
import type { Request as ExpressRequest } from "express"

interface AuthenticatedRequest extends ExpressRequest {
  user?: any
  contractor?: any
}

/**
 * Controller for service management
 */
@Route("api/v1/services")
export class ServicesController extends BaseController {
  /**
   * Create a new service
   * @summary Create service listing
   */
  @Post()
  @Security("sessionAuth")
  @Security("bearerAuth", ["services:write"])
  @Middlewares(tsoaWriteRateLimit)
  @SuccessResponse(201, "Created")
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  public async createService(
    @Body() payload: CreateServiceRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ServiceCreationResponse> {
    const user = this.getUser(request)

    let contractor_id: string | null = null
    if (payload.contractor) {
      const contractor_obj = await contractorDb.getContractor({
        spectrum_id: payload.contractor,
      })
      if (!contractor_obj) {
        throw new ValidationErrorClass("Invalid contractor")
      }
      contractor_id = contractor_obj.contractor_id

      if (!(await has_permission(contractor_id, user.user_id, "manage_orders"))) {
        throw new ForbiddenError("No permissions")
      }
    }

    const [service] = await serviceDb.createService({
      service_name: payload.service_name,
      service_description: payload.service_description,
      kind: payload.kind || null,
      description: payload.description,
      cost: payload.cost,
      title: payload.title,
      contractor_id: contractor_id,
      rush: payload.rush || false,
      departure: payload.departure || null,
      destination: payload.destination || null,
      collateral: payload.collateral || 0,
      payment_type: payload.payment_type,
      user_id: contractor_id ? undefined : user.user_id,
      status: payload.status,
    })

    try {
      const photoValidation = await validateServicePhotos(payload.photos)
      if (!photoValidation.valid) {
        throw new ValidationErrorClass(photoValidation.error || "Invalid photos")
      }

      await createServicePhotos(service.service_id, payload.photos)
    } catch (error) {
      this.logError("createService", error)
      throw new Error("Failed to create service photos")
    }

    return this.success({ service_id: service.service_id })
  }

  /**
   * Get services for a specific user
   * @summary Get user's services
   */
  @Get("user/{username}")
  @Middlewares(tsoaReadRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  public async getUserServices(
    @Path() username: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ServiceListResponse> {
    const user = request.user

    let target
    try {
      target = await profileDb.getUser({ username }, { noBalance: true })
    } catch {
      throw new ValidationErrorClass("Invalid user")
    }

    const isOwner = user && username === user.username

    const services = await serviceDb.getServices({
      user_id: target.user_id,
      ...(isOwner ? {} : { status: "active" }),
    })

    const serialized = await Promise.all(services.map(serializeService))
    return this.success(serialized as any)
  }

  /**
   * Get public services with filtering and pagination
   * @summary Search public services
   */
  @Get("public")
  @Middlewares(tsoaReadRateLimit)
  public async getPublicServices(
    @Query() page?: number,
    @Query() pageSize?: number,
    @Query() search?: string,
    @Query() kind?: string,
    @Query() minCost?: number,
    @Query() maxCost?: number,
    @Query() paymentType?: string,
    @Query() sortBy?: "timestamp" | "cost" | "service_name",
    @Query() sortOrder?: "asc" | "desc",
    @Query() language_codes?: string,
    @Query() contractor?: string,
    @Query() user?: string,
  ): Promise<ServicePaginatedResponse> {
    let contractor_id: string | undefined
    let user_id: string | undefined

    if (contractor) {
      const contractorObj = await contractorDb.getContractorSafe({
        spectrum_id: contractor,
      })
      if (contractorObj) contractor_id = contractorObj.contractor_id
    }

    if (user) {
      const userObj = await profileDb.findUser({ username: user })
      if (userObj) user_id = userObj.user_id
    }

    const params = {
      page,
      pageSize,
      search,
      kind,
      minCost,
      maxCost,
      paymentType,
      sortBy,
      sortOrder,
      language_codes: language_codes
        ? language_codes.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
      contractor_id,
      user_id,
    }

    const result = await serviceDb.getServicesPaginated(params)
    const serializedServices = await Promise.all(
      result.services.map(serializeService),
    )

    return this.success({
      data: serializedServices as any,
      pagination: {
        page: result.pagination.currentPage,
        pageSize: result.pagination.pageSize,
        total: result.pagination.totalItems,
        totalPages: result.pagination.totalPages,
      },
    })
  }

  /**
   * Get services for a specific contractor
   * @summary Get contractor's services
   */
  @Get("contractor/{spectrum_id}")
  @Security("sessionAuth")
  @Security("bearerAuth", ["services:read"])
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  public async getContractorServices(
    @Path() spectrum_id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ServiceListResponse> {
    const user = this.getUser(request)
    const contractor = request.contractor

    if (!contractor) {
      throw new ValidationErrorClass("Invalid contractor")
    }

    const isAdmin = await has_permission(
      contractor.contractor_id,
      user.user_id,
      "manage_orders",
    )

    const services = await serviceDb.getServices({
      contractor_id: contractor.contractor_id,
      ...(isAdmin ? {} : { status: "active" }),
    })

    const serialized = await Promise.all(services.map(serializeService))
    return this.success(serialized as any)
  }

  /**
   * Update a service
   * @summary Update service listing
   */
  @Put("{service_id}")
  @Security("sessionAuth")
  @Security("bearerAuth", ["services:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  public async updateService(
    @Path() service_id: string,
    @Body() payload: UpdateServiceRequest,
    @Request() request: AuthenticatedRequest,
  ): Promise<ServiceUpdateResponse> {
    const user = this.getUser(request)

    let service
    try {
      service = await serviceDb.getService({ service_id })
    } catch {
      throw new ValidationErrorClass("Invalid service")
    }

    if (!service) {
      throw new ValidationErrorClass("Invalid service")
    }

    // Check permissions
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
        throw new ForbiddenError("No permissions")
      }
    } else {
      if (service.user_id !== user.user_id) {
        throw new ForbiddenError("No permissions")
      }
    }

    // Update service fields
    await serviceDb.updateService(
      { service_id },
      {
        ...(payload.service_name && { service_name: payload.service_name }),
        ...(payload.service_description && {
          service_description: payload.service_description,
        }),
        ...(payload.kind !== undefined && { kind: payload.kind || null }),
        ...(payload.description && { description: payload.description }),
        ...(payload.cost !== undefined && { cost: payload.cost }),
        ...(payload.title && { title: payload.title }),
        ...(payload.rush !== undefined && { rush: payload.rush }),
        ...(payload.departure !== undefined && { departure: payload.departure }),
        ...(payload.destination !== undefined && {
          destination: payload.destination,
        }),
        ...(payload.collateral !== undefined && { collateral: payload.collateral }),
        ...(payload.status && { status: payload.status }),
        ...(payload.payment_type && { payment_type: payload.payment_type }),
      },
    )

    // Handle photo updates
    if (payload.photos !== undefined) {
      const old_photos = await serviceDb.getServiceListingImages({ service_id })

      const photoValidation = await validateServicePhotos(payload.photos, service)
      if (!photoValidation.valid) {
        throw new ValidationErrorClass(photoValidation.error || "Invalid photos")
      }

      const photosToPreserve = new Set<string>()

      for (const photo of payload.photos) {
        if (isSCMarketsCDN(photo)) {
          const isAssociated = await isImageAlreadyAssociated(photo, service)
          if (isAssociated) {
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
            continue
          }
          throw new ValidationErrorClass(
            "Cannot use image from SC markets CDN that is not already associated with this service",
          )
        }

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
          throw new ValidationErrorClass("Invalid photo!")
        }
      }

      for (const p of old_photos) {
        if (!photosToPreserve.has(p.resource_id)) {
          await serviceDb.deleteServiceImages(p)
          try {
            await cdn.removeResource(p.resource_id)
          } catch {}
        }
      }
    }

    return this.success({ result: "Success" })
  }

  /**
   * Get a specific service
   * @summary Get service details
   */
  @Get("{service_id}")
  @Middlewares(tsoaReadRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  public async getService(
    @Path() service_id: string,
  ): Promise<ServiceResponse> {
    let service
    try {
      service = await serviceDb.getService({ service_id })
    } catch {
      throw new ValidationErrorClass("Invalid service")
    }

    if (!service) {
      throw new ValidationErrorClass("Invalid service")
    }

    const serialized = await serializeService(service)
    return this.success(serialized as any)
  }

  /**
   * Upload photos for a service
   * @summary Upload service photos
   */
  @Post("{service_id}/photos")
  @Security("sessionAuth")
  @Security("bearerAuth", ["services:write"])
  @Middlewares(tsoaWriteRateLimit)
  @Response<ValidationErrorResponse>(400, "Validation Error")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Service not found")
  public async uploadServicePhotos(
    @Path() service_id: string,
    @UploadedFiles() photos: Express.Multer.File[],
    @Request() request: AuthenticatedRequest,
  ): Promise<ServicePhotoUploadResponse> {
    try {
      const user = this.getUser(request)

      if (!photos || photos.length === 0) {
        throw new ValidationErrorClass("No photos provided")
      }

      if (photos.length > 5) {
        throw new ValidationErrorClass("Maximum 5 photos can be uploaded at once")
      }

      const service = await serviceDb.getService({ service_id })
      if (!service) {
        throw new NotFoundError("Service not found")
      }

      // Check permissions
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
          throw new ForbiddenError("You are not authorized to modify this service")
        }
      } else {
        if (service.user_id !== user.user_id) {
          throw new ForbiddenError("You are not authorized to modify this service")
        }
      }

      const existing_photos = await serviceDb.getServiceListingImages({
        service_id,
      })

      const totalPhotosAfterUpload = existing_photos.length + photos.length

      if (totalPhotosAfterUpload > 5) {
        const photosToDelete = totalPhotosAfterUpload - 5
        const photosToRemove = existing_photos.slice(0, photosToDelete)

        for (const photo of photosToRemove) {
          try {
            await serviceDb.deleteServiceImages(photo)
            await contractorDb.removeImageResource({
              resource_id: photo.resource_id,
            })
          } catch (error) {
            this.logError("uploadServicePhotos", error)
          }
        }
      }

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
          if (error instanceof Error) {
            if (error.message.includes("Image failed moderation checks")) {
              throw new ValidationErrorClass(
                `Photo ${index + 1} failed content moderation checks and cannot be uploaded.`,
              )
            }

            if (
              error.message.includes("Missing required fields") ||
              error.message.includes("VALIDATION_ERROR") ||
              error.message.includes("UNSUPPORTED_FORMAT")
            ) {
              throw new ValidationErrorClass(
                `Photo ${index + 1} failed validation: ${error.message}`,
              )
            }

            if (error.message.includes("Unsupported MIME type")) {
              throw new ValidationErrorClass(
                `Photo ${index + 1} has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.`,
              )
            }
          }

          this.logError("uploadServicePhotos", error)
          throw new Error(`Failed to upload photo ${index + 1}`)
        }
      }

      const uploadedResources = uploadResults.map((result) => result.resource)

      for (const resource of uploadedResources) {
        await serviceDb.insertServiceImage({
          resource_id: resource.resource_id,
          service_id,
        })
      }

      const photoUrls = await Promise.all(
        uploadedResources.map(async (resource) => ({
          resource_id: resource.resource_id,
          url: await cdn.getFileLinkResource(resource.resource_id),
        })),
      )

      return this.success({
        result: "Photos uploaded successfully",
        photos: photoUrls,
      })
    } finally {
      if (photos && Array.isArray(photos)) {
        for (const file of photos) {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlinkSync(file.path)
            }
          } catch (cleanupError) {
            this.logError("uploadServicePhotos cleanup", cleanupError)
          }
        }
      }
    }
  }

  /**
   * Track a view on a service
   * @summary Track service view
   */
  @Post("{service_id}/view")
  @Middlewares(tsoaWriteRateLimit)
  @Response<NotFound>(404, "Service not found or inactive")
  public async trackServiceView(
    @Path() service_id: string,
    @Request() request: AuthenticatedRequest,
  ): Promise<ServiceViewResponse> {
    try {
      const user = request.user

      const service = await serviceDb.getService({ service_id })
      if (!service || service.status !== "active") {
        throw new NotFoundError("Service not found or inactive")
      }

      await marketDb.trackListingView({
        listing_type: "service",
        listing_id: service_id,
        viewer_id: user ? user.user_id : null,
        viewer_ip: request.ip,
        user_agent: request.get("User-Agent"),
        referrer: request.get("Referer"),
        session_id: request.sessionID,
      })

      return { message: "View tracked successfully" }
    } catch (error) {
      this.logError("trackServiceView", error)
      throw new Error("Internal server error")
    }
  }

  /**
   * Get view analytics for seller's services
   * @summary Get service analytics
   */
  @Get("seller/analytics")
  @Security("sessionAuth")
  @Security("bearerAuth", ["services:read"])
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  public async getSellerAnalytics(
    @Request() request: AuthenticatedRequest,
    @Query() period?: string,
  ): Promise<ServiceAnalyticsResponse> {
    try {
      const user = this.getUser(request)
      const timePeriod = period || "30d"

      const userAnalytics = await marketDb.getSellerListingAnalytics({
        user_id: user.user_id,
        time_period: timePeriod,
      })

      return this.success({
        services: userAnalytics.services,
        total_service_views: Number(userAnalytics.total_service_views),
        time_period: timePeriod,
        user_id: user.user_id,
      })
    } catch (error) {
      this.logError("getSellerAnalytics", error)
      throw new Error("Internal server error")
    }
  }
}
