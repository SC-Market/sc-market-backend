import { createErrorResponse, createResponse } from "../util/response.js"
import { User } from "../api-models.js"
import { Request, RequestHandler } from "express"
import { has_permission, is_member } from "../util/permissions.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  formatBuyOrderChartDetails,
  formatListing,
  formatListingComplete,
  formatMarketAggregateComplete,
  formatMarketMultipleComplete,
  formatPriceHistory,
  formatPrivateSearchResult,
  serializeListingStats,
} from "../util/formatting.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import {
  convertQuery,
  isImageAlreadyAssociated,
  isSCMarketsCDN,
  validateMarketListingPhotos,
  verify_listings,
} from "./helpers.js"
import moment from "moment/moment.js"
import { serializeOrderDetails } from "../orders/serializers.js"
import logger from "../../../../logger/logger.js"
import { marketBidNotification } from "../util/notifications.js"
import { createOffer } from "../orders/helpers.js"
import { DEFAULT_PLACEHOLDER_PHOTO_URL } from "./constants.js"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import { MarketSearchQuery, MarketSearchQueryArguments } from "./types.js"
import {
  DBContractor,
  DBMultipleListingComplete,
  DBUniqueListing,
} from "../../../../clients/database/db-models.js"

export const get_listing_stats: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const { listing_ids } = req.body as { listing_ids: string[] }

    if (
      !listing_ids ||
      !Array.isArray(listing_ids) ||
      listing_ids.length === 0
    ) {
      res.status(400).json(
        createErrorResponse({
          error: "listing_ids array is required and must not be empty",
        }),
      )
      return
    }

    if (listing_ids.length > 96) {
      res.status(400).json(
        createErrorResponse({
          error: "Maximum 96 listing IDs allowed per request",
        }),
      )
      return
    }

    const stats = []

    for (const listing_id of listing_ids) {
      try {
        // Get the listing
        const listing = await database.getMarketListing({ listing_id })

        if (!listing) {
          res.status(400).json(
            createErrorResponse({
              error: `Listing ${listing_id} not found`,
            }),
          )
          return
        }

        // Check permissions
        let hasPermission = false

        // Check if user owns the listing
        if (listing.user_seller_id && listing.user_seller_id === user.user_id) {
          hasPermission = true
        }

        // Check contractor permissions
        if (listing.contractor_seller_id) {
          const contractor = await database.getContractor({
            contractor_id: listing.contractor_seller_id,
          })
          if (
            contractor &&
            (await is_member(contractor.contractor_id, user.user_id))
          ) {
            hasPermission = true
          }
        }

        if (!hasPermission) {
          res.status(403).json(
            createErrorResponse({
              error: `You don't have permission to view stats for listing ${listing_id}`,
            }),
          )
          return
        }

        // Get stats for this listing
        const listingStats = await serializeListingStats(listing)
        stats.push({
          listing_id,
          ...listingStats,
        })
      } catch (error) {
        console.error(`Error processing listing ${listing_id}:`, error)
        res.status(500).json(
          createErrorResponse({
            error: `Error processing listing ${listing_id}`,
          }),
        )
        return
      }
    }

    res.json(createResponse({ stats }))
  } catch (error) {
    console.error("Error in /listings/stats:", error)
    res
      .status(500)
      .json(createErrorResponse({ error: "Internal server error" }))
  }
}

export const update_listing: RequestHandler = async (req, res) => {
  const listing_id = req.params["listing_id"]
  const user = req.user as User
  const listing = req.market_listing!

  if (listing.status === "archived") {
    res.status(400).json({ error: "Cannot update archived listing" })
    return
  }

  if (listing.sale_type === "auction" && user.role !== "admin") {
    res.status(400).json({ error: "Cannot update auction listings" })
    return
  }

  const {
    status,
    title,
    description,
    item_type,
    item_name,
    price,
    quantity_available,
    photos,
    minimum_bid_increment,
    internal,
  }: {
    title?: string
    description?: string
    item_type?: string
    item_name?: string

    status?: string
    price?: number
    quantity_available?: number

    minimum_bid_increment?: number
    internal?: boolean

    photos?: string[]
  } = req.body

  if (
    (title || description || item_type) &&
    listing.sale_type === "aggregate"
  ) {
    res
      .status(400)
      .json({ error: "Can't update details for aggregate listing" })
    return
  }

  if (listing.sale_type === "auction" && price) {
    res.status(400).json({ error: "Cannot edit price of auction" })
    return
  }

  if (minimum_bid_increment && listing.sale_type !== "auction") {
    res.status(400).json({ error: "Cannot set bid increment for non auction" })
    return
  }

  let game_item_id: string | null | undefined = undefined
  if (item_name !== undefined) {
    if (item_name === null) {
      game_item_id = null
    } else {
      const item = await database.getGameItem({ name: item_name })
      if (!item) {
        res.status(400).json({ error: "Invalid item name" })
        return
      }
      game_item_id = item.id
    }
  }

  if (
    status ||
    price !== undefined ||
    quantity_available !== undefined ||
    internal !== undefined
  ) {
    // Only allow internal=true for contractor listings
    // User listings must always be public (internal=false)
    if (internal && !listing.contractor_seller_id) {
      res.status(400).json({
        error: "Internal listings can only be created for contractor listings",
      })
      return
    }

    await database.updateMarketListing(listing_id, {
      status,
      price,
      quantity_available,
      internal,
    })
  }

  if (minimum_bid_increment) {
    await database.updateAuctionDetails(
      { listing_id },
      { minimum_bid_increment },
    )
  }

  if (title || description || item_type || item_name) {
    const unique = await database.getMarketUniqueListing({ listing_id })
    await database.updateListingDetails(
      { details_id: unique.details_id },
      { title, description, item_type, game_item_id },
    )
  }

  // Handle photo updates
  if (photos !== undefined) {
    const old_photos = await database.getMarketListingImagesByListingID(listing)

    // Validate photos using the helper function
    const photoValidation = await validateMarketListingPhotos(photos, listing)
    if (!photoValidation.valid) {
      res.status(400).json({ error: photoValidation.error })
      return
    }

    // Track which old photos should be preserved (CDN images that are still being used)
    const photosToPreserve = new Set<string>()

    // Process photos - CDN images that are already associated will be skipped
    for (const photo of photos) {
      // Check if this is a SC markets CDN URL
      if (isSCMarketsCDN(photo)) {
        // Check if the image is already associated with this listing
        const isAssociated = await isImageAlreadyAssociated(photo, listing)
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
        res.status(400).json({
          error:
            "Cannot use image from SC markets CDN that is not already associated with this listing",
        })
        return
      }

      // For non-CDN images, proceed with normal processing
      try {
        const resource = await cdn.createExternalResource(
          photo,
          listing_id + `_photo_${0}`,
        )
        await database.insertMarketListingPhoto(listing, [
          { resource_id: resource.resource_id },
        ])
      } catch {
        res.status(400).json({ error: "Invalid photo!" })
        return
      }
    }

    // Remove any old photos that are not being preserved
    for (const p of old_photos) {
      if (!photosToPreserve.has(p.resource_id)) {
        await database.deleteMarketListingImages(p)
        try {
          // Use CDN removeResource to ensure both database and CDN cleanup
          await cdn.removeResource(p.resource_id)
        } catch {}
      }
    }
  }

  res.json({ result: "Success" })
}

export const update_listing_quantity: RequestHandler = async (req, res) => {
  const {
    quantity_available,
  }: {
    quantity_available: number
  } = req.body

  const listing = req.market_listing!

  if (listing.status === "archived") {
    res
      .status(400)
      .json(createErrorResponse({ error: "Cannot update archived listing" }))
    return
  }

  await database.updateMarketListing(listing.listing_id, {
    quantity_available,
  })

  res.json(createResponse({ result: "Success" }))
}

export const refresh_listing: RequestHandler = async (req, res) => {
  const listing_id = req.params["listing_id"]
  const listing = req.market_listing!

  if (listing.status === "archived") {
    res.status(400).json({ error: "Cannot update archived listing" })
    return
  }

  const expiration = moment(listing.expiration)
  if (expiration > moment().add(1, "months").subtract(3, "days")) {
    res.status(400).json({ error: "Too soon to refresh" })
    return
  } // If expiration is at least 1 month - 3 days in the future

  await database.updateMarketListing(listing_id, { expiration: new Date() })

  res.json({ result: "Success" })
}

export const get_order_stats: RequestHandler = async (req, res) => {
  const order_stats = await database.getOrderStats()

  // Check if Grafana format is requested
  if (req.query.format === "grafana") {
    const { convertStatsToGrafana } = await import(
      "../admin/grafana-formatter.js"
    )
    const grafanaData = convertStatsToGrafana(order_stats)
    res.json(grafanaData)
    return
  }

  // Check if Prometheus format is requested
  if (req.query.format === "prometheus") {
    const { convertStatsToPrometheus } = await import(
      "../admin/grafana-formatter.js"
    )
    const prometheusData = convertStatsToPrometheus(order_stats)
    res.json(prometheusData)
    return
  }

  res.json(createResponse(order_stats))
  return
}

export const create_listing: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const {
      price,
      title,
      description,
      sale_type,
      item_type,
      item_name,
      quantity_available,
      photos,
      minimum_bid_increment,
      status,
      end_time,
      spectrum_id,
    } = req.body

    let contractor
    if (spectrum_id) {
      // Validate contractor exists and user has permissions
      contractor = await database.getContractor({ spectrum_id })
      if (!contractor) {
        res.status(400).json({ message: "Invalid contractor" })
        return
      }

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        res.status(403).json({
          message:
            "You are not authorized to create listings on behalf of this contractor!",
        })
        return
      }
    }

    // Handle empty photos by using default placeholder
    const photosToProcess =
      photos && photos.length > 0 ? photos : [DEFAULT_PLACEHOLDER_PHOTO_URL]

    // Validate urls are valid
    if (photosToProcess.find((p: string) => !cdn.verifyExternalResource(p))) {
      res.status(400).json({ message: "Invalid photo!" })
      return
    }

    // Validate auction end time
    if (sale_type === "auction") {
      if (new Date(end_time) < new Date()) {
        res.status(400).json({ message: "Invalid end time" })
        return
      }
    }

    // Validate game item if provided
    let game_item_id: string | null = null
    if (item_name) {
      const item = await database.getGameItem({ name: item_name })
      if (!item) {
        res.status(400).json({ message: "Invalid item name" })
        return
      }
      game_item_id = item.id
    }

    const details = (
      await database.createListingDetails({
        title,
        description,
        item_type,
        game_item_id,
      })
    )[0]

    const [listing] = await database.createMarketListing({
      price,
      sale_type,
      quantity_available,
      user_seller_id: contractor ? null : user.user_id,
      contractor_seller_id: contractor ? contractor.contractor_id : null,
      status,
    })

    await database.createUniqueListing({
      accept_offers: false,
      details_id: details.details_id,
      listing_id: listing.listing_id,
    })

    if (sale_type === "auction") {
      await database.createAuctionDetails({
        minimum_bid_increment,
        end_time,
        listing_id: listing.listing_id,
        status: "active",
      })
    }

    const resources = await Promise.all(
      photosToProcess
        .filter((p: string) => p)
        .map(
          async (p: string, i: number) =>
            await cdn.createExternalResource(
              p,
              listing.listing_id + `_photo_${i}`,
            ),
        ),
    )

    await database.insertMarketListingPhoto(
      listing,
      resources.map((r) => ({ resource_id: r.resource_id })),
    )

    res.json(createResponse(await formatListing(listing)))
  } catch (e) {
    console.error(e)
    res.status(500).json({ message: "Internal server error" })
    return
  }
}

export const get_listing_details: RequestHandler = async (req, res) => {
  const user = req.user as User | null | undefined
  const listing = req.market_listing!

  if (user) {
    if (listing.contractor_seller_id) {
      const contractors = await database.getUserContractors({
        user_id: user.user_id,
      })

      if (
        contractors.find(
          (c) => c.contractor_id === listing.contractor_seller_id,
        ) ||
        listing.user_seller_id === user.user_id ||
        user.role === "admin"
      ) {
        res.json(createResponse(await formatListing(listing, true)))
        return
      }
    } else {
      if (listing.user_seller_id === user.user_id) {
        res.json(createResponse(await formatListing(listing, true)))
        return
      }
    }
  }

  res.json(createResponse(await formatListing(listing)))
}

export const get_linked_orders: RequestHandler = async (req, res) => {
  const listing_id = req.params["listing_id"]
  const page = parseInt(req.query["page"] as string) || 1
  const pageSize = parseInt(req.query["pageSize"] as string) || 20
  const status = req.query["status"] as string | undefined
  const sortBy = (req.query["sortBy"] as string) || "timestamp"
  const sortOrder = (req.query["sortOrder"] as string) || "desc"
  const statusArray: string[] | undefined = status ? status.split(",") : []

  try {
    const result = await database.getOrdersForListingPaginated({
      listing_id,
      page,
      pageSize,
      status: statusArray,
      sortBy: sortBy as "timestamp" | "status",
      sortOrder: sortOrder as "asc" | "desc",
    })

    // Format the orders using the existing serialization
    const formattedOrders = await Promise.all(
      result.orders.map(async (order) => {
        return await serializeOrderDetails(order, null)
      }),
    )

    res.json({
      data: formattedOrders,
      pagination: result.pagination,
    })
  } catch (error) {
    logger.error("Error fetching listing orders:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
  }
}

export const purchase_listings: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User

    const {
      items,
      note,
      offer,
    }: {
      items: {
        listing_id: string
        quantity: number
      }[]
      note: string
      offer?: number
    } = req.body

    if (!items || !items.length) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Missing required fields" }))
      return
    }

    const listings = await verify_listings(res, items, user)
    if (listings === undefined) {
      return // Response handled by verify_listings
    }

    let total = 0
    let message = `Complete the delivery of sold items to [${user.username}](https://sc-market.space/user/${user.username})\n`

    for (const { quantity, listing } of listings) {
      total += quantity * +listing.listing.price
      message += `- [${listing.details.title}](https://sc-market.space/market/${
        listing.listing.listing_id
      }) (${(+listing.listing.price).toLocaleString(
        "en-us",
      )} aUEC x${quantity.toLocaleString("en-us")})\n`
    }

    message += `- Total: ${total.toLocaleString("en-us")} aUEC\n`
    message += `- User Offer: ${(offer || total).toLocaleString(
      "en-us",
    )} aUEC\n`
    if (note) {
      message += `\nNote from buyer:\n> ${note || "None"}`
    }

    // Check if user is blocked by the seller (all items are from same seller)
    const firstListing = listings[0].listing.listing

    // Check contractor blocking
    if (firstListing.contractor_seller_id) {
      const isBlockedByContractor = await database.isUserBlocked(
        firstListing.contractor_seller_id,
        user.user_id,
        "contractor",
      )
      if (isBlockedByContractor) {
        res.status(403).json(
          createErrorResponse({
            message:
              "You are blocked from creating offers with this contractor",
          }),
        )
        return
      }
    }

    // Check user blocking
    if (firstListing.user_seller_id) {
      const isBlockedByUser = await database.isUserBlocked(
        firstListing.user_seller_id,
        user.user_id,
        "user",
      )
      if (isBlockedByUser) {
        res.status(403).json(
          createErrorResponse({
            message: "You are blocked from creating offers with this user",
          }),
        )
        return
      }
    }

    const {
      offer: offer_obj,
      session,
      discord_invite,
    } = await createOffer(
      {
        customer_id: user.user_id,
        assigned_id: listings[0].listing.listing.user_seller_id,
        contractor_id: listings[0].listing.listing.contractor_seller_id,
      },
      {
        actor_id: user.user_id,
        kind: "Delivery",
        cost: (offer || total).toString(),
        title: `Items Sold to ${user.username}`,
        description: message,
      },
      listings,
    )

    res.json({
      result: "Success",
      offer_id: offer_obj.id,
      session_id: session.id,
      discord_invite: discord_invite,
    })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid formatting!" })
  }
}

export const get_listing_bids: RequestHandler = async (req, res) => {
  const user = req.user as User

  const {
    listing_id,
    bid,
  }: {
    listing_id: string
    bid: number
  } = req.body

  if (!(listing_id || bid)) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  const listing = req.market_listing!

  let price = +listing.price
  if (listing.sale_type !== "auction") {
    res.status(400).json({ error: "Invalid listing" })
    return
  }

  const bids = await database.getMarketBids({
    listing_id: listing.listing_id,
  })
  if (bids.length) {
    price = Math.max(...bids.map((bid) => bid.bid))
  }

  const details = await database.getAuctionDetail({ listing_id })
  if (!details) {
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }

  if (new Date(details.end_time) < new Date()) {
    res.status(500).json({ error: "Auction is over" })
    return
  }

  if (bid < price + details.minimum_bid_increment) {
    res.status(400).json({ error: "Invalid bid amount!" })
    return
  }

  if (listing.user_seller_id === user.user_id) {
    res.status(400).json({ error: "You cannot buy your own item!" })
    return
  }

  await database.deleteMarketBids({
    listing_id: listing.listing_id,
    user_bidder_id: user.user_id,
  })

  const bid_results = await database.createMarketBid({
    listing_id: listing.listing_id,
    bid: bid,
    user_bidder_id: user.user_id,
  })

  const complete = await database.getMarketListingComplete(listing.listing_id)
  await marketBidNotification(complete, bid_results[0])

  res.json({ result: "Success" })
}

export const add_listing_photos: RequestHandler = async (req, res) => {
  try {
    const listing_id = req.params.listing_id
    const photos = req.files as unknown as Express.Multer.File[]

    if (!photos || photos.length === 0) {
      res.status(400).json({ message: "No photos provided" })
      return
    }

    if (photos.length > 5) {
      res
        .status(400)
        .json({ message: "Maximum 5 photos can be uploaded at once" })
      return
    }

    const listing = req.market_listing!

    // Get existing photos to check count
    const existing_photos =
      await database.getMarketListingImagesByListingID(listing)

    // Check if any existing photos are the default placeholder and should be removed
    const photosToRemove: any[] = []

    // First, identify and remove default placeholder photos
    for (const photo of existing_photos) {
      try {
        const resolvedUrl = await cdn.getFileLinkResource(photo.resource_id)
        if (resolvedUrl === DEFAULT_PLACEHOLDER_PHOTO_URL) {
          photosToRemove.push(photo)
        }
      } catch (error) {
        console.error("Failed to resolve photo URL:", error)
        // Continue processing other photos
      }
    }

    // Calculate total photos after upload (excluding default photos that will be removed)
    const totalPhotosAfterUpload =
      existing_photos.length - photosToRemove.length + photos.length

    // If we would still exceed 5 total photos, remove additional old photos
    if (totalPhotosAfterUpload > 5) {
      const additionalPhotosToDelete = totalPhotosAfterUpload - 5
      const nonDefaultPhotos = existing_photos.filter(
        (photo) =>
          !photosToRemove.some(
            (toRemove) => toRemove.resource_id === photo.resource_id,
          ),
      )

      // Delete oldest non-default photos first
      const additionalPhotosToRemove = nonDefaultPhotos.slice(
        0,
        additionalPhotosToDelete,
      )
      photosToRemove.push(...additionalPhotosToRemove)
    }

    // Remove identified photos
    for (const photo of photosToRemove) {
      try {
        await database.deleteMarketListingImages(photo)
        // Use CDN removeResource to ensure both database and CDN cleanup
        await cdn.removeResource(photo.resource_id)
      } catch (error) {
        console.error("Failed to delete old photo:", error)
        // Continue with new photo insertion even if deletion fails
      }
    }

    // Upload new photos to CDN and create database records
    const uploadResults = []
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index]
      try {
        const fileExtension = photo.mimetype.split("/")[1] || "png"
        const resource = await cdn.uploadFile(
          `${listing_id}-photos-${index}-${randomUUID()}.${fileExtension}`,
          photo.path,
          photo.mimetype,
        )

        uploadResults.push({ success: true, resource, index })
      } catch (error) {
        // Handle different types of errors and return appropriate responses
        if (error instanceof Error) {
          if (error.message.includes("Image failed moderation checks")) {
            logger.debug(`Photo ${index + 1} failed content moderation:`, error)
            res.status(400).json({
              error: "Content Moderation Failed",
              message: `Photo ${index + 1} failed content moderation checks and cannot be uploaded.`,
              details: "One or more photos contain inappropriate content.",
            })
            return
          }

          if (
            error.message.includes("Missing required fields") ||
            error.message.includes("VALIDATION_ERROR") ||
            error.message.includes("UNSUPPORTED_FORMAT")
          ) {
            logger.debug(`Photo ${index + 1} failed validation:`, error)
            res.status(400).json({
              error: "Validation Failed",
              message: `Photo ${index + 1} failed validation: ${error.message}`,
              details: "Please check the file format and try again.",
            })
            return
          }

          if (error.message.includes("Unsupported MIME type")) {
            logger.debug(`Photo ${index + 1} has unsupported format:`, error)
            res.status(400).json({
              error: "Unsupported File Type",
              message: `Photo ${index + 1} has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.`,
              details: "Please ensure all photos are in supported formats.",
            })
            return
          }
        }

        // Log unexpected errors as error level
        logger.error(`Failed to upload photo ${index + 1}:`, error)
        res.status(500).json({
          error: "Upload Failed",
          message: `Failed to upload photo ${index + 1}`,
          details:
            "An unexpected error occurred during upload. Please try again.",
        })
        return
      }
    }

    const uploadedResources = uploadResults.map((result) => result.resource)

    // Insert new photos into database
    await database.insertMarketListingPhoto(
      listing,
      uploadedResources.map((r) => ({ resource_id: r.resource_id })),
    )

    // Get CDN URLs for response
    const photoUrls = await Promise.all(
      uploadedResources.map(async (resource) => ({
        resource_id: resource.resource_id,
        url: await cdn.getFileLinkResource(resource.resource_id),
      })),
    )

    res.json({
      result: "Photos uploaded successfully",
      photos: photoUrls,
    })
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

export const handle_listing_view: RequestHandler = async (req, res) => {
  try {
    const { listing_id } = req.params
    const user = req.user

    // Track the view
    await database.trackListingView({
      listing_type: "market",
      listing_id,
      viewer_id: user ? (user as User).user_id : null,
      viewer_ip: req.ip,
      user_agent: req.get("User-Agent"),
      referrer: req.get("Referer"),
      session_id: req.sessionID,
    })

    res.json({ message: "View tracked successfully" })
  } catch (error) {
    logger.error("Error tracking market listing view", {
      error,
      listing_id: req.params.listing_id,
    })
    res.status(500).json({ message: "Internal server error" })
  }
}

export const get_my_listings: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const contractorId = req.query.contractor_id as string
    const searchQuery = await convertQuery(
      req.query as Partial<MarketSearchQueryArguments>,
    )

    // Use the unified market search approach
    const marketSearchQuery: MarketSearchQuery = {
      query: searchQuery.query || "",
      statuses: searchQuery.statuses || null,
      sale_type: searchQuery.sale_type || null,
      item_type: searchQuery.item_type || null,
      listing_type: searchQuery.listing_type || null,
      minCost: searchQuery.minCost || 0,
      maxCost: searchQuery.maxCost || null,
      quantityAvailable: searchQuery.quantityAvailable || 0,
      sort: searchQuery.sort,
      reverseSort: searchQuery.reverseSort,
      index: searchQuery.index,
      page_size: searchQuery.page_size,
      rating: null,
      seller_rating: 0,
    }

    // Add seller filter
    if (contractorId) {
      // Look up contractor_id from spectrum_id
      const contractor = await database.getContractor({
        spectrum_id: contractorId,
      })
      marketSearchQuery.contractor_seller_id = contractor.contractor_id
    } else {
      marketSearchQuery.user_seller_id = user.user_id
    }

    // Get unified results from unmaterialized view for real-time data
    const searchResults =
      await database.searchMarketUnmaterialized(marketSearchQuery)

    // Format listings using the same approach as market search
    const formattedListings = await Promise.all(
      searchResults.map((listing) => formatPrivateSearchResult(listing)),
    )

    // Extract total count from the first result (if any)
    const total = searchResults.length > 0 ? searchResults[0].full_count : 0

    res.json(createResponse({ listings: formattedListings, total }))
  } catch (error) {
    logger.error("Error in /mine:", error)
    res
      .status(500)
      .json(createErrorResponse({ error: "Internal server error" }))
  }
}

export const search_listings: RequestHandler = async (req, res) => {
  let query
  try {
    query = await convertQuery(req.query)
  } catch (e) {
    res.status(400).json(createErrorResponse({ message: "Invalid query" }))
    return
  }

  try {
    // Determine if we should include internal listings
    let includeInternal = false

    // If contractor_seller_id is specified and user is authenticated, check if user is a member
    if (query.contractor_seller_id && req.user) {
      const user = req.user as User
      if (await is_member(query.contractor_seller_id, user.user_id)) {
        includeInternal = true
      }
    }

    const searchResults = await database.searchMarket(query, {
      ...(includeInternal ? {} : { internal: "false" }), // Only filter internal when we don't want to include them
    })

    res.json(
      createResponse({
        total: searchResults[0] ? searchResults[0].full_count : 0,
        listings: searchResults.map((r) => ({
          listing_id: r.listing_id,
          listing_type: r.listing_type,
          item_type: r.item_type,
          item_name: r.item_name,
          game_item_id: r.game_item_id,
          sale_type: r.sale_type === "sale" ? r.listing_type : r.sale_type, // Map 'sale' to listing_type
          price: Number(r.price), // Convert string to number
          expiration: r.expiration,
          minimum_price: Number(r.minimum_price), // Convert string to number
          maximum_price: Number(r.maximum_price), // Convert string to number
          quantity_available: Number(r.quantity_available), // Convert string to number
          timestamp: r.timestamp,
          total_rating: r.total_rating,
          avg_rating: r.avg_rating,
          details_id: r.details_id,
          status: r.status,
          user_seller: r.user_seller,
          contractor_seller: r.contractor_seller,
          auction_end_time: r.auction_end_time,
          rating_count: r.rating_count,
          rating_streak: r.rating_streak,
          total_orders: r.total_orders,
          // Add responsive badge data
          total_assignments: r.total_assignments,
          response_rate: r.response_rate,
          title: r.title,
          photo: r.photo,
          internal: r.internal,
        })),
      }),
    )
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
  }
}

export const get_active_listings_by_user: RequestHandler = async (req, res) => {
  const username = req.params["username"]
  const user = await database.getUser({ username: username })
  if (!user) {
    res.status(400).json({ error: "Invalid user" })
    return
  }

  const listings = await database.getMarketUniqueListingsComplete({
    status: "active",
    user_seller_id: user.user_id,
  })
  const multiples = await database.getMarketMultipleListingsComplete({
    "market_multiples.user_seller_id": user.user_id,
    status: "active",
  })

  res.json(
    await Promise.all(
      [...listings, ...multiples].map((l) => formatListingComplete(l, false)),
    ),
  )
  return
}

export const get_active_listings_by_org: RequestHandler = async (req, res) => {
  try {
    const contractor = req.contractor

    if (req.user) {
      const user = req.user as User
      if (await is_member(contractor.contractor_id, user.user_id)) {
        const listings = await database.getMarketUniqueListingsComplete({
          status: "active",
          contractor_seller_id: contractor.contractor_id,
        })
        const multiples = await database.getMarketMultipleListingsComplete({
          status: "active",
          "market_multiples.contractor_seller_id": contractor.contractor_id,
        })

        res.json(
          await Promise.all(
            [...listings, ...multiples].map((l) =>
              formatListingComplete(l, false),
            ),
          ),
        )
        return
      }
    }

    const listings = await database.getMarketUniqueListingsComplete({
      status: "active",
      internal: false,
      contractor_seller_id: contractor.contractor_id,
    })
    const multiples = await database.getMarketMultipleListingsComplete({
      status: "active",
      internal: false,
      "market_multiples.contractor_seller_id": contractor.contractor_id,
    })

    res.json(
      await Promise.all(
        [...listings, ...multiples].map((l) => formatListingComplete(l)),
      ),
    )
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" })) // Fixed status code from 400 to 500
  }
}

export const get_buy_orders: RequestHandler = async (req, res) => {
  try {
    const aggregates = await database.getMarketBuyOrdersComplete()
    res.json(
      await Promise.all(
        aggregates.map((a) => formatMarketAggregateComplete(a)),
      ),
    )
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
  }
}

export const get_buy_order_chart: RequestHandler = async (req, res) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const buy_orders = await database.getBuyOrdersByGameItemID(
      game_item_id,
      true,
    )
    res.json(await formatBuyOrderChartDetails(buy_orders))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
}

export const get_aggregate_history: RequestHandler = async (req, res) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const price_history = await database.getPriceHistory({ game_item_id })
    res.json(await formatPriceHistory(price_history))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
}

export const update_aggregate: RequestHandler = async (req, res) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const game_item = await database.getGameItem({
      id: game_item_id,
    })

    if (!game_item) {
      res.status(400).json({ error: "Invalid item" })
      return
    }

    const details_id = game_item.details_id

    const { title, description, photo } = req.body as {
      title?: string
      description?: string
      photo?: string
    }

    if (title || description) {
      await database.updateListingDetails(
        { details_id },
        { title, description },
      )
    }

    if (photo) {
      let resource
      try {
        resource = await cdn.createExternalResource(
          photo,
          game_item_id.toString() + `_photo_${0}`,
        )
      } catch (e: any) {
        res.status(400).json({ error: "Invalid photo!" })
        return
      }

      const photos = await database.getMarketListingImages({ details_id })
      for (const p of photos) {
        await database.deleteMarketListingImages(p)
        try {
          // Use CDN removeResource to ensure both database and CDN cleanup
          await cdn.removeResource(p.resource_id)
        } catch {}
      }

      await database.insertMarketDetailsPhoto({
        details_id,
        resource_id: resource.resource_id,
      })
    }

    res.json({ result: "Success" })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
}

export const get_aggregate_details: RequestHandler = async (req, res) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const aggregate = await database.getMarketAggregateComplete(game_item_id, {
      status: "active",
      internal: false,
    })

    if (aggregate === null) {
      res.status(400).json({ error: "Invalid item" })
      return
    }

    res.json(await formatMarketAggregateComplete(aggregate))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
}

export const get_multiple_details: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User | undefined | null
    const multiple_id = req.params["multiple_id"]
    const multiple = await database.getMarketMultipleComplete(multiple_id, {})

    if (multiple === null) {
      res.status(400).json({ error: "Invalid item" })
      return
    }

    let show_private = false
    if (user) {
      if (multiple.contractor_seller_id) {
        show_private = await is_member(
          multiple.contractor_seller_id,
          user.user_id,
        )
      } else {
        show_private = multiple.user_seller_id === user.user_id
      }
    }

    res.json(await formatMarketMultipleComplete(multiple, show_private))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
}

export const create_contractor_multiple: RequestHandler = async (req, res) => {
  try {
    const { listings, default_listing_id, title, item_type, description } =
      req.body as {
        listings: string[]
        default_listing_id: string
        title: string
        item_type: string
        description: string
      }

    if (
      !title ||
      !title.length ||
      !description ||
      !description.length ||
      !item_type ||
      !item_type.length
    ) {
      res.status(400).json({ error: "Missing required field" })
      return
    }

    if (!listings.includes(default_listing_id)) {
      listings.push(default_listing_id)
    }

    const listingObjects: DBUniqueListing[] = []
    for (const listing of listings) {
      try {
        const listingObject = await database.getMarketListing({
          listing_id: listing,
        })
        const listingObjectUnique = await database.getMarketUniqueListing({
          listing_id: listing,
        })
        listingObjects.push(listingObjectUnique)
        if (listingObject.sale_type !== "sale") {
          res.status(400).json({ error: "Invalid listing sale type" })
          return
        }
        if (
          listingObject.contractor_seller_id !== req.contractor.contractor_id
        ) {
          res
            .status(400)
            .json({ error: "Cannot add listing owned by another user" })
          return
        }
      } catch (e) {
        res.status(400).json({ error: "Invalid listing" })
        return
      }
    }

    const details = await database.createListingDetails({
      item_type,
      title,
      description,
    })

    const multiples = await database.createMarketMultiple({
      contractor_seller_id: req.contractor.contractor_id,
      details_id: details[0].details_id,
      default_listing_id: default_listing_id,
    })

    await database.createMarketMultipleListing(
      listingObjects.map((l) => ({
        multiple_listing_id: l.listing_id,
        multiple_id: multiples[0].multiple_id,
        details_id: l.details_id,
      })),
    )

    for (const listingObject of listingObjects) {
      // Set it to type multiple
      await database.updateMarketListing(listingObject.listing_id, {
        sale_type: "multiple",
      })
      // Remove unique listing
      await database.removeUniqueListing({
        listing_id: listingObject.listing_id,
      })
      // Make multiples compatible with unique/aggregate listing lookup by ID
    }

    res.json(
      await formatListingComplete(
        await database.getMarketMultipleComplete(multiples[0].multiple_id, {}),
      ),
    )
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
  }
}

export const create_multiple: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User

    const { listings, default_listing_id, title, item_type, description } =
      req.body as {
        listings: string[]
        default_listing_id: string
        title: string
        item_type: string
        description: string
      }

    if (
      !title ||
      !title.length ||
      !description ||
      !description.length ||
      !item_type ||
      !item_type.length
    ) {
      res.status(400).json({ error: "Missing required field" })
      return
    }

    if (!listings.includes(default_listing_id)) {
      listings.push(default_listing_id)
    }

    const listingObjects: DBUniqueListing[] = []
    for (const listing of listings) {
      try {
        const listingObject = await database.getMarketListing({
          listing_id: listing,
        })
        const listingObjectUnique = await database.getMarketUniqueListing({
          listing_id: listing,
        })
        listingObjects.push(listingObjectUnique)
        if (listingObject.sale_type !== "sale") {
          res.status(400).json({ error: "Invalid listing sale type" })
          return
        }
        if (
          listingObject.contractor_seller_id &&
          listingObject.contractor_seller_id !== req.contractor?.contractor_id
        ) {
          res
            .status(400)
            .json({ error: "Cannot add listing owned by another user" })
          return
        }
      } catch (e) {
        console.error(e)
        res.status(400).json({ error: "Invalid listing" })
        return
      }
    }

    const details = await database.createListingDetails({
      item_type,
      title,
      description,
    })

    const multiples = await database.createMarketMultiple({
      user_seller_id: user.user_id,
      details_id: details[0].details_id,
      default_listing_id: default_listing_id,
    })

    const response = await database.createMarketMultipleListing(
      listingObjects.map((l) => ({
        multiple_listing_id: l.listing_id,
        multiple_id: multiples[0].multiple_id,
        details_id: l.details_id,
      })),
    )

    for (const listingObject of listingObjects) {
      // Set it to type multiple
      await database.updateMarketListing(listingObject.listing_id, {
        sale_type: "multiple",
      })
      // Remove unique listing
      await database.removeUniqueListing({
        listing_id: listingObject.listing_id,
      })
    }

    res.json(response[0])
    return
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export const update_multiple: RequestHandler = async (req, res) => {
  try {
    const multiple_id = req.params.multiple_id
    const user = req.user as User

    const { listings, default_listing_id, title, item_type, description } =
      req.body as {
        listings: string[]
        default_listing_id: string
        title: string
        item_type: string
        description: string
      }

    const multiple = await database.getMarketMultipleComplete(multiple_id, {})
    if (multiple.contractor_seller_id) {
      if (
        !(await has_permission(
          multiple.contractor_seller_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        res.status(403).json({ error: "Missing required permissions" })
        return
      }
    } else {
      if (multiple.user_seller_id !== user.user_id) {
        res.status(403).json({ error: "Missing required permissions" })
        return
      }
    }

    if (
      (title && !title.length) ||
      (description && !description.length) ||
      (item_type && !item_type.length)
    ) {
      res.status(400).json({ error: "Missing required field" })
      return
    }

    if (!listings.includes(default_listing_id)) {
      listings.push(default_listing_id)
    }

    const old_set = new Set(multiple.listings.map((l) => l.listing.listing_id))
    const new_set = new Set(listings)
    const removed = new Set(Array.from(old_set).filter((l) => !new_set.has(l))) // in old but not new
    const added = new Set(Array.from(new_set).filter((l) => !old_set.has(l))) // in new but not old

    const uniqueListingObjects: DBUniqueListing[] = []
    const multipleListingObjects: DBMultipleListingComplete[] = []
    for (const listing of added) {
      try {
        const listingObject = await database.getMarketListing({
          listing_id: listing,
        })
        if (listingObject.sale_type === "sale") {
          const listingObjectUnique = await database.getMarketUniqueListing({
            listing_id: listing,
          })
          uniqueListingObjects.push(listingObjectUnique)
        } else {
          const listingObject =
            await database.getMarketMultipleListingComplete(listing)
          multipleListingObjects.push(listingObject)
        }

        if (!["sale", "multiple"].includes(listingObject.sale_type)) {
          res.status(400).json({ error: "Invalid listing sale type" })
          return
        }
        if (listingObject.contractor_seller_id) {
          if (
            listingObject.contractor_seller_id !== multiple.contractor_seller_id
          ) {
            res
              .status(400)
              .json({ error: "Cannot add listing owned by another user" })
            return
          }
        }

        if (listingObject.user_seller_id !== multiple.user_seller_id) {
          res
            .status(400)
            .json({ error: "Cannot add listing owned by another user" })
          return
        }
      } catch (e) {
        console.error(e)
        res.status(400).json({ error: "Invalid listing" })
        return
      }
    }

    for (const listingObject of uniqueListingObjects) {
      // Set it to type multiple
      await database.updateMarketListing(listingObject.listing_id, {
        sale_type: "multiple",
      })
      // Remove unique listing
      await database.removeUniqueListing({
        listing_id: listingObject.listing_id,
      })
    }

    for (const listingObject of multipleListingObjects) {
      // Remove old multiple listing
      await database.removeMultipleListing({
        multiple_listing_id: listingObject.listing.listing_id,
      })
    }

    if (uniqueListingObjects.length) {
      await database.createMarketMultipleListing(
        uniqueListingObjects.map((l) => ({
          multiple_listing_id: l.listing_id,
          multiple_id: multiple_id,
          details_id: l.details_id,
        })),
      )
    }

    if (multipleListingObjects.length) {
      await database.createMarketMultipleListing(
        multipleListingObjects.map((l) => ({
          multiple_listing_id: l.listing.listing_id,
          multiple_id: multiple_id,
          details_id: l.details.details_id,
        })),
      )
    }

    for (const listing_id of removed) {
      const listing =
        await database.getMarketMultipleListingComplete(listing_id)
      // Set it to type multiple
      await database.updateMarketListing(listing_id, { sale_type: "sale" })
      // Remove old multiple listing
      await database.removeMultipleListing({
        multiple_listing_id: listing_id,
      })
      // Create unique listing
      await database.createUniqueListing({
        listing_id: listing_id,
        accept_offers: true,
        details_id: listing.details.details_id,
      })
    }

    if (title || description || item_type) {
      await database.updateListingDetails(
        { details_id: multiple.details_id },
        { title, description, item_type },
      )
    }

    if (default_listing_id) {
      await database.updateMarketMultiple(multiple_id, { default_listing_id })
    }

    res.json({ result: "Success" })
    return
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export const create_buy_order: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User

    const { quantity, price, expiry, game_item_id } = req.body as {
      quantity: number
      price: number
      expiry: string
      game_item_id: string
    }

    const aggregate = await database.getGameItem({
      id: game_item_id,
    })

    if (!aggregate) {
      res.status(400).json(createErrorResponse({ message: "Invalid listing" }))
      return
    }

    if (quantity < 1) {
      res.status(400).json(createErrorResponse({ message: "Invalid quantity" }))
      return
    }

    if (price < 1) {
      res.status(400).json(createErrorResponse({ message: "Invalid price" }))
      return
    }

    if (new Date(expiry) < new Date()) {
      res.status(400).json(createErrorResponse({ message: "Invalid expiry" }))
      return
    }

    const orders = await database.createBuyOrder({
      quantity,
      price,
      expiry,
      game_item_id,
      buyer_id: user.user_id,
    })

    res.json(createResponse(orders[0]))
    return
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export const fulfill_buy_order: RequestHandler = async (req, res) => {
  try {
    const { contractor_spectrum_id } = req.body as {
      contractor_spectrum_id?: string | null
    }

    const user = req.user as User
    const buy_order_id = req.params["buy_order_id"]

    let contractor: DBContractor | null = null
    if (contractor_spectrum_id) {
      contractor = await database.getContractor({
        spectrum_id: contractor_spectrum_id,
      })
      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_orders",
        ))
      ) {
        res.status(400).json({ error: "No permissions" })
        return
      }
    }

    const buy_order = await database.getBuyOrder({ buy_order_id })
    if (
      !buy_order ||
      buy_order.fulfilled_timestamp ||
      buy_order.expiry < new Date()
    ) {
      res.status(400).json({ error: "Invalid buy order" })
      return
    }

    if (buy_order.buyer_id === user.user_id) {
      res.status(400).json({ error: "Can't fulfill own order" })
      return
    }

    const buyer = await database.getUser({ user_id: buy_order.buyer_id })
    const listing = await database.getMarketAggregateComplete(
      buy_order.game_item_id,
      {},
    )

    await database.updateBuyOrder(
      {
        buy_order_id,
      },
      { fulfilled_timestamp: new Date() },
    )

    const total = buy_order.quantity * buy_order.price
    let message = `Complete buy order for [${buyer.username}](https://sc-market.space/user/${buyer.username})\n`

    message += `- [${listing.details.title}](https://sc-market.space/market/${
      listing.game_item_id
    }) (${(+buy_order.price).toLocaleString(
      "en-us",
    )} aUEC x${buy_order.quantity.toLocaleString("en-us")})\n`
    message += `- Total: ${total.toLocaleString("en-us")} aUEC\n`

    const { offer, session, discord_invite } = await createOffer(
      {
        customer_id: buy_order.buyer_id,
        assigned_id: contractor ? null : user.user_id,
        contractor_id: contractor ? contractor.contractor_id : null,
      },
      {
        actor_id: user.user_id,
        kind: "Delivery",
        cost: (buy_order.quantity * buy_order.price).toString(),
        title: `Complete Buy Order for ${buyer.username}`,
        description: message,
      },
      [],
    )

    res.json({ offer, session, discord_invite })
    return
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export const cancel_buy_order: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const buy_order_id = req.params["buy_order_id"]

    const buy_order = await database.getBuyOrder({ buy_order_id })
    if (
      !buy_order ||
      buy_order.fulfilled_timestamp ||
      buy_order.expiry < new Date()
    ) {
      res.status(400).json({ error: "Invalid buy order" })
      return
    }

    if (buy_order.buyer_id !== user.user_id) {
      res.status(400).json({ error: "No permissions" })
      return
    }

    await database.updateBuyOrder(
      {
        buy_order_id,
      },
      { expiry: database.knex.fn.now() },
    )

    res.json({ result: "Success" })
    return
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export const export_Listings: RequestHandler = async (req, res) => {
  // TODO: Do this
}

export const get_category_details: RequestHandler = async (req, res) => {
  const { category } = req.params
  const items = await database.getMarketItemsBySubcategory(category)
  res.json(createResponse(items))
}

export const get_categories: RequestHandler = async (req, res) => {
  const raw_categories = await database.getMarketCategories()

  res.json(createResponse(raw_categories))
}

export const get_game_item: RequestHandler = async (req, res) => {
  try {
    const item_name = req.params["name"]

    if (!item_name) {
      res
        .status(400)
        .json(createErrorResponse({ error: "Item name is required" }))
      return
    }

    const game_item = await database.getGameItem({ name: item_name })

    if (!game_item) {
      res
        .status(400)
        .json(createErrorResponse({ error: "Game item not found" }))
      return
    }

    // Fetch the details from market_listing_details using the details_id
    const details = await database.getMarketListingDetails({
      details_id: game_item.details_id,
    })

    // Get the image URL from the market listing images
    const images = await database.getMarketListingImagesResolved({
      details_id: game_item.details_id,
    })

    res.json(
      createResponse({
        id: game_item.id,
        name: game_item.name,
        type: game_item.type,
        description: details.description,
        image_url: images.length > 0 ? images[0] : null,
      }),
    )
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
  }
}

export const get_seller_analytics: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const period = (req.query.period as string) || "30d"

    // Get analytics for user's listings
    const userAnalytics = await database.getSellerListingAnalytics({
      user_id: user.user_id,
      time_period: period,
    })

    // TODO: Add seller analytics using org data

    res.json(
      createResponse({
        ...userAnalytics,
        user_id: user.user_id,
      }),
    )
  } catch (error) {
    logger.error("Error fetching seller analytics", {
      error,
      user_id: (req.user as User)?.user_id,
    })
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
  }
}
