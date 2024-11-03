import express, { NextFunction, Request, Response } from "express"
import {
  adminAuthorized,
  userAuthorized,
  verifiedUser,
} from "../../../middleware/auth.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  DBAggregateListingComplete,
  DBContractor,
  DBMarketListing,
  DBMultipleListingComplete,
  DBMultipleListingCompositeComplete,
  DBUniqueListing,
  DBUniqueListingComplete,
} from "../../../../clients/database/db-models.js"
import { User } from "../api-models.js"
import AsyncLock from "async-lock"
import {
  formatBuyOrderChartDetails,
  formatListing,
  formatListingComplete,
  formatMarketAggregateComplete,
  formatMarketMultipleComplete,
  formatPriceHistory,
} from "../util/formatting.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { marketBidNotification } from "../util/notifications.js"
import { createOffer } from "../orders/helpers.js"
import { has_permission, is_member } from "../util/permissions.js"
import { org_permission } from "../contractors/middleware.js"
import moment from "moment"

export const marketRouter = express.Router()

/* TODO:
    - Buy a listing
    - Delete a listing
    - Edit a listing
    - Buying a listing will create a transaction and an order
    - The transaction will be pending until 30 days have passed or the buyer marks the transaction as complete
    - Need some way to account for the available stock, some items will be unlimited some may not be
 */

marketRouter.get("/stats", async (req, res) => {
  const order_stats = await database.getOrderStats()
  res.status(200).json(order_stats)
  return
})

marketRouter.post(
  "/listing/:listing_id/update",
  userAuthorized,
  async (req, res, next) => {
    const listing_id = req.params["listing_id"]
    const user = req.user as User

    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    if (user.role !== "admin") {
      if (listing.contractor_seller_id) {
        const contractor = await database.getContractor({
          contractor_id: listing.contractor_seller_id,
        })

        if (
          !(await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_market",
          ))
        ) {
          res.status(403).json({
            error:
              "You are not authorized to update listings on behalf of this contractor!",
          })
          return
        }
      } else {
        if (listing.user_seller_id !== user.user_id) {
          res
            .status(403)
            .json({ error: "You are not authorized to update this listing!" })
          return
        }
      }
    }

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
    }: {
      title?: string
      description?: string
      item_type?: string
      item_name?: string

      status?: string
      price?: number
      quantity_available?: number

      minimum_bid_increment?: number

      photos?: string[]
    } = req.body

    if (
      !(
        status ||
        title ||
        description ||
        item_type ||
        price !== undefined ||
        quantity_available !== undefined ||
        (photos && photos.length) ||
        minimum_bid_increment
      )
    ) {
      res.status(400).json({ error: "Missing required fields" })
      return
    }

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

    if (!["active", "inactive", "archived", undefined].includes(status)) {
      res.status(400).json({ error: "Invalid status" })
      return
    }

    if (quantity_available !== undefined && quantity_available < 0) {
      res.status(400).json({ error: "Invalid quantity" })
      return
    }

    if (minimum_bid_increment && minimum_bid_increment < 1) {
      res.status(400).json({ error: "Invalid bid increment!" })
      return
    }

    if (minimum_bid_increment && listing.sale_type !== "auction") {
      res
        .status(400)
        .json({ error: "Cannot set bid increment for non auction" })
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

    if (status || price !== undefined || quantity_available !== undefined) {
      await database.updateMarketListing(listing_id, {
        status,
        price,
        quantity_available,
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

    if (photos && photos.length) {
      const old_photos =
        await database.getMarketListingImagesByListingID(listing)

      for (const photo of photos) {
        try {
          const resource = await cdn.createExternalResource(
            photo,
            listing_id + `_photo_${0}`,
          )
          await database.insertMarketListingPhoto(listing, [
            { resource_id: resource.resource_id },
          ])
        } catch (e: any) {
          res.status(400).json({ error: "Invalid photo!" })
          return
        }
      }

      for (const p of old_photos) {
        await database.deleteMarketListingImages(p)
        try {
          await database.removeImageResource({ resource_id: p.resource_id })
        } catch {}
      }
    }

    res.status(200).json({ result: "Success" })
  },
)

export async function handle_quantity_update(
  res: any,
  user: User,
  listing: DBMarketListing,
  quantity_available: number,
) {
  if (user.role !== "admin") {
    if (listing.contractor_seller_id) {
      const contractor = await database.getContractor({
        contractor_id: listing.contractor_seller_id,
      })

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        res.status(403).json({
          error:
            "You are not authorized to update listings on behalf of this contractor!",
        })
        return
      }
    } else {
      if (listing.user_seller_id !== user.user_id) {
        res
          .status(403)
          .json({ error: "You are not authorized to update this listing!" })
        return
      }
    }
  }

  if (listing.status === "archived") {
    res.status(400).json({ error: "Cannot update archived listing" })
    return
  }

  if (quantity_available === undefined) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  if (quantity_available < 0) {
    res.status(400).json({ error: "Invalid quantity" })
    return
  }

  await database.updateMarketListing(listing.listing_id, { quantity_available })

  res.status(200).json({ result: "Success" })
}

marketRouter.post(
  "/listing/:listing_id/update_quantity",
  userAuthorized,
  async (req, res, next) => {
    const listing_id = req.params["listing_id"]
    const user = req.user as User

    const {
      quantity_available,
    }: {
      quantity_available: number
    } = req.body

    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    await handle_quantity_update(res, user, listing, quantity_available)
  },
)

marketRouter.post(
  "/listing/:listing_id/refresh",
  userAuthorized,
  async (req, res, next) => {
    const listing_id = req.params["listing_id"]
    const user = req.user as User

    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    if (user.role !== "admin") {
      if (listing.contractor_seller_id) {
        const contractor = await database.getContractor({
          contractor_id: listing.contractor_seller_id,
        })

        if (
          !(await has_permission(
            contractor.contractor_id,
            user.user_id,
            "manage_market",
          ))
        ) {
          res.status(403).json({
            error:
              "You are not authorized to update listings on behalf of this contractor!",
          })
          return
        }
      } else {
        if (listing.user_seller_id !== user.user_id) {
          res
            .status(403)
            .json({ error: "You are not authorized to update this listing!" })
          return
        }
      }
    }

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

    res.status(200).json({ result: "Success" })
  },
)

marketRouter.post("/offer/accept", userAuthorized, async (req, res, next) => {
  const user = req.user as User

  const {
    listing_id,
    offer_id,
  }: {
    listing_id: string
    offer_id: number
  } = req.body

  if (!listing_id || !offer_id) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  let listing
  try {
    listing = await database.getMarketListing({ listing_id })
  } catch {
    res.status(400).json({ error: "Invalid listing" })
    return
  }

  if (user.role !== "admin") {
    if (listing.contractor_seller_id) {
      const contractor = await database.getContractor({
        contractor_id: listing.contractor_seller_id,
      })
      const role = await database.getContractorRoleLegacy(
        user.user_id,
        contractor.contractor_id,
      )

      if (
        !(await has_permission(
          contractor.contractor_id,
          user.user_id,
          "manage_market",
        ))
      ) {
        res.status(403).json({
          error:
            "You are not authorized to update listings on behalf of this contractor!",
        })
        return
      }
    } else {
      if (listing.user_seller_id !== user.user_id) {
        res
          .status(403)
          .json({ error: "You are not authorized to update this listing!" })
        return
      }
    }
  }

  const offers = await database.getMarketOffers({ listing_id, offer_id })
  if (!offers.length) {
    res.status(400).json({ error: "Invalid bid" })
    return
  }
  const offer = offers[0]

  await database.removeMarketOffers({ listing_id, offer_id })

  // const orders = await database.createOrder({
  //     customer_id: user.user_id,
  //     kind: 'Delivery',
  //     cost: (+offer.offer) * offer.quantity,
  //     title: `Item Sold: ${listing.title} (x${offer.quantity}) to ${user.username}`,
  //     description: `Complete the delivery of sold item ${listing.title} (x${offer.quantity}) to ${user.username}\n\n${listing.description}`,
  //     assigned_id: listing.user_seller_id,
  //     contractor_id: listing.contractor_seller_id,
  // })
  //
  // await database.insertMarketListingOrder({order_id: orders[0].order_id, listing_id})
  //
  // await sendOrderWebhooks(orders[0])
  // await createOrderNotifications(orders[0])
  //
  //     res.status(200).json({result: 'Success'})
  return
})

marketRouter.get("/listing/:listing_id", async (req, res, next) => {
  const user = req.user as User | null | undefined
  const listing_id = req.params["listing_id"]
  let listing: DBMarketListing
  try {
    listing = await database.getMarketListing({ listing_id: listing_id })
  } catch (e) {
    res.status(400).json({ error: "Invalid listing" })
    return
  }

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
        res.status(200).json(await formatListing(listing, true))
        return
      }
    } else {
      if (listing.user_seller_id === user.user_id) {
        res.status(200).json(await formatListing(listing, true))
        return
      }
    }
  }

  res.status(200).json(await formatListing(listing))
})

const userListingLock = new AsyncLock()
const contractorListingLock = new AsyncLock()

export async function lockUserMarket(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user as User
  await userListingLock.acquire(user.user_id, next)
}

export async function lockContractorMarket(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const spectrum_id = req.params["spectrum_id"]
  await contractorListingLock.acquire(spectrum_id, next)
}

export interface MarketListingBody {
  price: number
  title: string
  description: string
  sale_type: string
  item_type: string
  quantity_available: number
}

function sameSeller(listings: DBMarketListing[]) {
  if (!listings.length) {
    return true
  }
  const user_seller = listings[0].user_seller_id
  const contractor_seller = listings[0].contractor_seller_id

  for (const listing of listings) {
    if (user_seller && listing.user_seller_id !== user_seller) {
      return false
    }
    if (
      contractor_seller &&
      listing.contractor_seller_id !== contractor_seller
    ) {
      return false
    }
  }

  return true
}

export async function verify_listings(
  res: Response,
  items: { listing_id: string; quantity: number }[],
  user: User,
) {
  const listings: {
    listing:
      | DBAggregateListingComplete
      | DBUniqueListingComplete
      | DBMultipleListingCompositeComplete
    quantity: number
  }[] = []
  for (const { listing_id, quantity } of items) {
    let listing
    try {
      listing = await database.getMarketListingComplete(listing_id)
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    if (!listing) {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    if (listing.listing.quantity_available < quantity || quantity < 1) {
      res.status(400).json({ error: "Invalid quantity" })
      return
    }

    if (listing.listing.user_seller_id === user.user_id) {
      res.status(400).json({ error: "You cannot buy your own item!" })
      return
    }

    listings.push({ quantity, listing })
  }

  if (!sameSeller(listings.map((u) => u.listing.listing))) {
    res.status(400).json({ message: "All items must be from same seller" })
    return
  }

  return listings
}

marketRouter.post("/purchase", verifiedUser, async (req, res, next) => {
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
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    const listings = await verify_listings(res, items, user)
    if (listings === undefined) {
      return
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

    res.status(200).json({
      result: "Success",
      offer_id: offer_obj.id,
      session_id: session.id,
      discord_invite: discord_invite,
    })
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid formatting!" })
  }
})

marketRouter.post("/offer", verifiedUser, async (req, res, next) => {
  const user = req.user as User

  const {
    items,
    offer,
  }: {
    items: { listing_id: string; quantity: number }[]
    offer: number
  } = req.body

  if (!(items || offer)) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  if (!items.length) {
    res.status(400).json({ error: "Missing required fields" })
    return
  }

  const listings = []
  for (const { listing_id, quantity } of items) {
    let listing
    try {
      listing = await database.getMarketListing({ listing_id })
    } catch {
      res.status(400).json({ error: "Invalid listing" })
      return
    }

    if (listing.quantity_available < quantity || quantity < 1) {
      res.status(400).json({ error: "Invalid quantity" })
      return
    }

    if (listing.user_seller_id === user.user_id) {
      res.status(400).json({ error: "You cannot buy your own item!" })
      return
    }

    listings.push({ quantity, listing })
  }

  if (!sameSeller(listings.map((u) => u.listing))) {
    res.status(400).json({ message: "All items must be from same seller" })
    return
  }

  if (offer < 1) {
    res.status(400).json({ error: "Invalid quantity" })
    return
  }

  // const offer_results = await database.createMarketOffer({
  //     listing_id: listing.listing_id,
  //     offer: offer,
  //     buyer_user_id: user.user_id,
  //     seller_user_id: listings[0].listing.user_seller_id,
  //     seller_contractor_id: listings[0].listing.contractor_seller_id,
  // })
  //
  // await marketOfferNotification(listing, offer_results[0])

  res.status(200).json({ result: "Success" })
})

marketRouter.post("/bid", verifiedUser, async (req, res, next) => {
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

  let listing
  try {
    listing = await database.getMarketListing({ listing_id })
  } catch {
    res.status(400).json({ error: "Invalid listing" })
    return
  }

  let price = +listing.price
  if (listing.sale_type !== "auction") {
    res.status(400).json({ error: "Invalid listing" })
    return
  }

  const bids = await database.getMarketBids({ listing_id: listing.listing_id })
  if (bids.length) {
    price = Math.max(...bids.map((bid) => bid.bid))
  }

  const details = await database.getAuctionDetail({ listing_id })
  if (!details) {
    res.status(500).json({ error: "Internal server error" })
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

  res.status(200).json({ result: "Success" })
})

marketRouter.post("/create", verifiedUser, async (req, res, next) => {
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
    }: {
      price: number
      title: string
      description: string
      sale_type: string
      item_type: string
      item_name: string
      quantity_available: number
      photos: string[]
      minimum_bid_increment: number
      status: string
      end_time: string
    } = req.body

    if (
      !(
        price !== undefined &&
        title &&
        description &&
        sale_type &&
        item_type &&
        quantity_available !== undefined &&
        minimum_bid_increment &&
        photos[0] &&
        status
      )
    ) {
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    if (price < 0) {
      res.status(400).json({ error: "Invalid price" })
      return
    }

    if (quantity_available < 0) {
      res.status(400).json({ error: "Invalid quantity available" })
      return
    }

    if (photos.find((p) => !cdn.verifyExternalResource(p))) {
      res.status(400).json({ error: "Invalid photo!" })
      return
    }

    if (!photos.length) {
      res.status(400).json({ error: "Must include a photo!" })
      return
    }

    if (!["active", "inactive"].includes(status)) {
      res.status(400).json({ error: "Invalid status!" })
      return
    }

    if (sale_type === "auction") {
      if (!end_time) {
        res.status(400).json({ error: "Invalid end time" })
        return
      } else {
        const endDate = new Date(end_time)
        if (endDate < new Date()) {
          res.status(400).json({ error: "Invalid end time" })
          return
        }
      }
    }

    let game_item_id: string | null = null
    if (item_name) {
      const item = await database.getGameItem({ name: item_name })
      if (!item) {
        res.status(400).json({ error: "Invalid item name" })
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

    const listings = await database.createMarketListing({
      price,
      sale_type,
      quantity_available,
      user_seller_id: user.user_id,
      status,
    })

    await database.createUniqueListing({
      accept_offers: false,
      details_id: details.details_id,
      listing_id: listings[0].listing_id,
    })

    if (sale_type === "auction") {
      await database.createAuctionDetails({
        minimum_bid_increment,
        end_time,
        listing_id: listings[0].listing_id,
        status: "active",
      })
    }

    let resources
    try {
      resources = await Promise.all(
        photos
          .filter((p) => p)
          .map(
            async (p, i) =>
              await cdn.createExternalResource(
                p,
                listings[0].listing_id + `_photo_${i}`,
              ),
          ),
      )
    } catch (e: any) {
      res.status(400).json({ error: "Invalid photo!" })
      return
    }

    await database.insertMarketListingPhoto(
      listings[0],
      resources.map((r) => ({ resource_id: r.resource_id })),
    )

    res.status(200).json(listings[0])
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "Internal server error" })
    return
  }
})

marketRouter.post(
  "/contractor/:spectrum_id/create",
  verifiedUser,
  async (req, res, next) => {
    const spectrum_id = req.params["spectrum_id"]
    const user = req.user as User

    const contractor = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(400).json({ error: "Invalid contractor" })
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
        error:
          "You are not authorized to create listings on behalf of this contractor!",
      })
      return
    }

    const {
      price,
      title,
      description,
      sale_type,
      item_type,
      item_name,
      quantity_available,
      photos,
      status,
      internal,
      end_time,
      minimum_bid_increment,
    }: {
      price: number
      title: string
      description: string
      sale_type: string
      item_type: string
      item_name: string
      quantity_available: number
      photos: string[]
      status: string
      internal: boolean
      end_time: string
      minimum_bid_increment: number
    } = req.body

    if (
      !(
        price !== undefined &&
        title &&
        description &&
        sale_type &&
        item_type &&
        quantity_available !== undefined &&
        photos &&
        status &&
        internal !== undefined
      )
    ) {
      res.status(400).json({ error: "Missing required fields" })
      return
    }

    if (price < 1) {
      res.status(400).json({ error: "Invalid price" })
      return
    }

    if (quantity_available < 1) {
      res.status(400).json({ error: "Invalid quantity available" })
      return
    }

    if (photos.find((p) => !cdn.verifyExternalResource(p))) {
      res.status(400).json({ error: "Invalid photo!" })
      return
    }

    if (!["active", "inactive"].includes(status)) {
      res.status(400).json({ error: "Invalid status!" })
      return
    }

    if (sale_type === "auction") {
      if (!end_time) {
        res.status(400).json({ error: "Invalid end time" })
        return
      } else {
        const endDate = new Date(end_time)
        if (endDate < new Date()) {
          res.status(400).json({ error: "Invalid end time" })
          return
        }
      }
    }

    let game_item_id: string | null = null
    if (item_name) {
      const item = await database.getGameItem({ name: item_name })
      if (!item) {
        res.status(400).json({ error: "Invalid item name" })
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

    const listings = await database.createMarketListing({
      price,
      sale_type,
      quantity_available,
      contractor_seller_id: contractor.contractor_id,
      status,
      internal,
    })

    await database.createUniqueListing({
      accept_offers: false,
      details_id: details.details_id,
      listing_id: listings[0].listing_id,
    })

    if (sale_type === "auction") {
      await database.createAuctionDetails({
        minimum_bid_increment,
        end_time,
        listing_id: listings[0].listing_id,
        status: "active",
      })
    }

    let resources
    try {
      resources = await Promise.all(
        photos
          .filter((p) => p)
          .map(
            async (p, i) =>
              await cdn.createExternalResource(
                p,
                listings[0].listing_id + `_photo_${i}`,
              ),
          ),
      )
    } catch (e: any) {
      res.status(400).json({ error: "Invalid photo!" })
      return
    }

    await database.insertMarketListingPhoto(
      listings[0],
      resources.map((r) => ({ resource_id: r.resource_id })),
    )

    res.status(200).json(listings[0])
  },
)

export async function get_my_listings(user: User) {
  const listings = await database.getMarketUniqueListingsComplete({
    user_seller_id: user.user_id,
  })
  const multiples = await database.getMarketMultiplesComplete(
    {
      "market_multiples.user_seller_id": user.user_id,
    },
    {},
  )

  const multiple_listings = await database.getMarketMultipleListingsComplete({
    "market_multiples.user_seller_id": user.user_id,
  })

  return await Promise.all(
    [...listings, ...multiples, ...multiple_listings].map((l) =>
      formatListingComplete(l, true),
    ),
  )
}

marketRouter.get("/mine", userAuthorized, async (req, res, next) => {
  try {
    const user = req.user as User

    res.status(200).json(await get_my_listings(user))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: "Internal server error" })
    return
  }
})

const sortingMethods = [
  "title",
  "timestamp",
  "minimum_price",
  "maximum_price",
  "avg_rating",
  "total_rating",
  "expiration",
]

export interface MarketSearchQueryArguments {
  item_type: string | null
  sale_type: string | null
  minCost: string
  rating: string | null
  maxCost: string | null
  quantityAvailable: string
  query: string
  sort: string
  seller_rating: string
  index: string
  page_size: string
  user_seller: string
  contractor_seller: string
  listing_type: string | null
}

export interface MarketSearchQuery {
  item_type: string | null
  sale_type: string | null
  minCost: number
  rating: number | null
  maxCost: number | null
  quantityAvailable: number
  query: string
  sort: string
  seller_rating: number
  index: number
  page_size: number
  reverseSort: boolean
  user_seller_id?: string | null
  contractor_seller_id?: string | null
  listing_type?: string | null
}

export async function convertQuery(
  query: Partial<MarketSearchQueryArguments>,
): Promise<MarketSearchQuery> {
  let sorting = (query.sort || "timestamp").toLowerCase()
  if (sorting === "date-old") {
    sorting = "timestamp"
  }

  if (sorting === "date-new") {
    sorting = "timestamp-reverse"
  }

  if (sorting === "rating") {
    sorting = "total_rating"
  }

  if (sorting === "title") {
    sorting = "title-reverse"
  }

  if (sorting === "price-low") {
    sorting = "minimum_price-reverse"
  }

  if (sorting === "price-high") {
    sorting = "minimum_price"
  }

  if (sorting === "quantity-low") {
    sorting = "quantity_available-reverse"
  }

  if (sorting === "quantity-high") {
    sorting = "quantity_available"
  }

  if (sorting === "activity") {
    sorting = "expiration"
  }

  const reverseSort = sorting.endsWith("-reverse")
  if (reverseSort) {
    sorting = sorting.slice(0, sorting.length - "-reverse".length)
  }

  if (sortingMethods.indexOf(sorting) === -1) {
    sorting = "timestamp"
  }

  let user_seller_id = undefined
  let contractor_seller_id = undefined

  if (query.user_seller) {
    const user = await database.getUser({ username: query.user_seller })
    user_seller_id = user.user_id
  }

  if (query.contractor_seller) {
    const contractor = await database.getContractor({
      spectrum_id: query.contractor_seller,
    })
    contractor_seller_id = contractor.contractor_id
  }

  const searchQuery = (query.query || "").toLowerCase()
  const seller_rating = +(query.seller_rating || 0)
  const page_size = Math.min(+(query.page_size || 16), 96)
  return {
    sale_type: query.sale_type || null,
    maxCost: query.maxCost && query.maxCost !== "null" ? +query.maxCost : null,
    minCost: +(query.minCost || 0),
    quantityAvailable: +(query.quantityAvailable || 0),
    item_type: query.item_type || null,
    index: +(query.index || 0),
    rating: +(query.rating || 0),
    reverseSort,
    sort: sorting,
    query: searchQuery,
    seller_rating,
    page_size: page_size,
    user_seller_id,
    contractor_seller_id,
    listing_type: query.listing_type || null,
  }
}

marketRouter.get("/public/search", async (req, res, next) => {
  let query
  try {
    query = await convertQuery(req.query)
  } catch (e) {
    res.status(400).json({ error: "Invalid query" })
    return
  }

  try {
    const searchResults = await database.searchMarket(query, {
      status: "active",
      internal: "false",
    })

    res.status(200).json({
      total: searchResults[0] ? searchResults[0].full_count : 0,
      listings: searchResults.map((r) => ({
        listing_id: r.listing_id,
        listing_type: r.listing_type,
        item_type: r.item_type,
        item_name: r.item_name,
        game_item_id: r.game_item_id,
        sale_type: r.sale_type,
        price: r.price,
        expiration: r.expiration,
        minimum_price: r.minimum_price,
        maximum_price: r.maximum_price,
        quantity_available: r.quantity_available,
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
        title: r.title,
        photo: r.photo,
      })),
      // listings: await Promise.all(searchResults.map(formatSearchResult))
    })
  } catch (e) {
    console.error(e)
    res.status(500)
  }
})

marketRouter.get("/public", async (req, res, next) => {
  try {
    const listings = await database.getMarketUniqueListingsComplete({
      status: "active",
      internal: false,
    })
    const aggregates = await database.getMarketAggregatesComplete(
      {},
      { status: "active", internal: false },
      true,
    )
    const multiples = await database.getMarketMultiplesComplete(
      {},
      { status: "active", internal: false },
      true,
    )

    res
      .status(200)
      .json(
        await Promise.all(
          [...listings, ...aggregates, ...multiples].map((l) =>
            formatListingComplete(l),
          ),
        ),
      )
  } catch (e) {
    console.error(e)
    res.status(500)
  }
})

marketRouter.get("/all_listings", adminAuthorized, async (req, res, next) => {
  const listings = await database.getMarketListings({})

  res
    .status(200)
    .json(await Promise.all(listings.map((l) => formatListing(l, true))))
})

marketRouter.get("/user/:username", async (req, res, next) => {
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
  // const aggregates = await database.getMarketAggregateListingsComplete({
  //   status: "active",
  //   user_seller_id: user.user_id,
  // })
  const multiples = await database.getMarketMultipleListingsComplete({
    "market_multiples.user_seller_id": user.user_id,
    status: "active",
  })

  res
    .status(200)
    .json(
      await Promise.all(
        [...listings, ...multiples].map((l) => formatListingComplete(l, false)),
      ),
    )
  return
})

export async function get_org_listings(contractor: DBContractor) {
  const listings = await database.getMarketUniqueListingsComplete({
    contractor_seller_id: contractor.contractor_id,
  })
  const multiples = await database.getMarketMultiplesComplete(
    {
      "market_multiples.contractor_seller_id": contractor.contractor_id,
    },
    {},
  )
  const multiple_listings = await database.getMarketMultipleListingsComplete({
    "market_multiples.contractor_seller_id": contractor.contractor_id,
  })

  return await Promise.all(
    [...listings, ...multiples, ...multiple_listings].map((l) =>
      formatListingComplete(l, true),
    ),
  )
}

marketRouter.get(
  "/contractor/:spectrum_id/mine",
  userAuthorized,
  async (req, res, next) => {
    try {
      const spectrum_id = req.params["spectrum_id"]
      const contractor = await database.getContractor({
        spectrum_id: spectrum_id,
      })
      if (!contractor) {
        res.status(400).json({ error: "Invalid contractor" })
        return
      }

      const user = req.user as User
      const contractors = await database.getUserContractors({
        "contractor_members.user_id": user.user_id,
      })

      if (
        contractors.filter((c) => c.contractor_id === contractor.contractor_id)
          .length === 0
      ) {
        res
          .status(403)
          .json({ error: "You are not authorized to view these listings" })
        return
      }

      res.status(200).json(await get_org_listings(contractor))
    } catch (e) {
      console.error(e)
    }
  },
)

marketRouter.get("/contractor/:spectrum_id", async (req, res, next) => {
  try {
    const spectrum_id = req.params["spectrum_id"]
    const contractor = await database.getContractor({
      spectrum_id: spectrum_id,
    })
    if (!contractor) {
      res.status(400).json({ error: "Invalid contractor" })
      return
    }

    if (req.user) {
      const user = req.user as User
      if (
        await database.getContractorRoleLegacy(
          user.user_id,
          contractor.contractor_id,
        )
      ) {
        const listings = await database.getMarketUniqueListingsComplete({
          status: "active",
          contractor_seller_id: contractor.contractor_id,
        })
        const multiples = await database.getMarketMultipleListingsComplete({
          status: "active",
          "market_multiples.contractor_seller_id": contractor.contractor_id,
        })

        res
          .status(200)
          .json(
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

    res
      .status(200)
      .json(
        await Promise.all(
          [...listings, ...multiples].map((l) => formatListingComplete(l)),
        ),
      )
    return
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Internal server error" })
  }
})

// marketRouter.get("/aggregate/contractor/:spectrum_id", userAuthorized, async (req, res, next) => {
//     try {
//         const spectrum_id = req.params['spectrum_id']
//         const contractor = await database.getContractor({spectrum_id: spectrum_id})
//         if (!contractor) {
//             res.status(400).json({error: "Invalid contractor"})
//             return
//         }
//
//         const user = req.user as User
//
//         const role = await database.getContractorRoleLegacy(user.user_id, contractor.contractor_id)
//
//         let where: any = {
//             contractor_seller_id: contractor.contractor_id,
//         }
//
//         if (!await has_permission(contractor.contractor_id, user.user_id, 'manage_market')) {
//             if (role) {
//                 where = {
//                     contractor_seller_id: contractor.contractor_id,
//                     status: "active",
//                 }
//             } else {
//                 where = {
//                     contractor_seller_id: contractor.contractor_id,
//                     status: "active",
//                     internal: false,
//                 }
//             }
//         }
//
//         let listings = []
//         listings.push(...await database.getMarketAggregateListingsComplete(where))
//         listings.push(...await database.getMarketUniqueListingsComplete(where))
//
//         res.status(200).json(await Promise.all(listings.map(l => formatListingComplete(l, false))))
//     } catch (e) {
//         console.error(e)
//         res.status(400).json({error: "Invalid listing"})
//     }
// })

marketRouter.get("/aggregates/buyorders", async (req, res, next) => {
  try {
    const aggregates = await database.getMarketBuyOrdersComplete()
    res
      .status(200)
      .json(
        await Promise.all(
          aggregates.map((a) => formatMarketAggregateComplete(a)),
        ),
      )
    return
  } catch (e) {
    console.error(e)
  }
})

marketRouter.get("/aggregates", async (req, res, next) => {
  try {
    const aggregates = await database.getMarketAggregatesComplete(
      {},
      { status: "active" },
      true,
    )
    res
      .status(200)
      .json(
        await Promise.all(
          aggregates.map((a) => formatMarketAggregateComplete(a)),
        ),
      )
    return
  } catch (e) {
    console.error(e)
  }
})

marketRouter.get("/aggregate/:game_item_id/chart", async (req, res, next) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const buy_orders = await database.getBuyOrdersByGameItemID(
      game_item_id,
      true,
    )
    res.status(200).json(await formatBuyOrderChartDetails(buy_orders))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
})

marketRouter.get("/aggregate/:game_item_id/history", async (req, res, next) => {
  try {
    const game_item_id = req.params["game_item_id"]
    const price_history = await database.getPriceHistory({ game_item_id })
    res.status(200).json(await formatPriceHistory(price_history))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
})

// TODO: Redo
marketRouter.post(
  "/aggregate/:game_item_id/update",
  adminAuthorized,
  async (req, res, next) => {
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
            await database.removeImageResource({ resource_id: p.resource_id })
          } catch {}
        }

        await database.insertMarketDetailsPhoto({
          details_id,
          resource_id: resource.resource_id,
        })
      }

      res.status(200).json({ result: "Success" })
    } catch (e) {
      console.error(e)
      res.status(400).json({ error: "Invalid item" })
      return
    }
  },
)

marketRouter.get("/aggregate/:game_item_id", async (req, res, next) => {
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

    res.status(200).json(await formatMarketAggregateComplete(aggregate))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
})

marketRouter.get("/multiple/:multiple_id", async (req, res, next) => {
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

    res
      .status(200)
      .json(await formatMarketMultipleComplete(multiple, show_private))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid item" })
    return
  }
})

marketRouter.post(
  "/multiple/contractor/:spectrum_id/create",
  verifiedUser,
  org_permission("manage_market"),
  async (req: Request, res, next) => {
    try {
      const contractor = req.contractor
      const user = req.user

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

      res
        .status(200)
        .json(
          await formatListingComplete(
            await database.getMarketMultipleComplete(
              multiples[0].multiple_id,
              {},
            ),
          ),
        )
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/multiple/create",
  verifiedUser,
  async (req: Request, res, next) => {
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

      res.status(200).json(response[0])
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/multiple/:multiple_id/update",
  userAuthorized,
  async (req: Request, res, next) => {
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

      const old_set = new Set(
        multiple.listings.map((l) => l.listing.listing_id),
      )
      const new_set = new Set(listings)
      const removed = new Set(
        Array.from(old_set).filter((l) => !new_set.has(l)),
      ) // in old but not new
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
              listingObject.contractor_seller_id !==
              multiple.contractor_seller_id
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

      res.status(200).json({ result: "Success" })
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/buyorder/create",
  verifiedUser,
  async (req: Request, res, next) => {
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
        res.status(400).json({ error: "Invalid listing" })
        return
      }

      if (quantity < 1) {
        res.status(400).json({ error: "Invalid quantity" })
        return
      }

      if (price < 1) {
        res.status(400).json({ error: "Invalid price" })
        return
      }

      if (new Date(expiry) < new Date()) {
        res.status(400).json({ error: "Invalid expiry" })
        return
      }

      const orders = await database.createBuyOrder({
        quantity,
        price,
        expiry,
        game_item_id,
        buyer_id: user.user_id,
      })

      res.status(200).json(orders[0])
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/buyorder/:buy_order_id/fulfill",
  verifiedUser,
  async (req: Request, res, next) => {
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

      res.status(200).json({ offer, session, discord_invite })
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.post(
  "/buyorder/:buy_order_id/cancel",
  userAuthorized,
  async (req: Request, res, next) => {
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

      res.status(200).json({ result: "Success" })
      return
    } catch (e) {
      console.error(e)
      res.status(500).json({ error: "Internal server error" })
      return
    }
  },
)

marketRouter.get("/export", userAuthorized, async (req: Request, res, next) => {
  // TODO: Do this
})

marketRouter.get("/category/:category", async (req: Request, res, next) => {
  const { category } = req.params
  const items = await database.getMarketItemsBySubcategory(category)
  res.status(200).json(items)
})

marketRouter.get("/categories", async (req: Request, res, next) => {
  const raw_categories = await database.getMarketCategories()
  // const categories: { [key: string]: string[] } = {}
  // raw_categories.forEach((c) => {
  //   if (categories[c.category]) {
  //     categories[c.category].push(c.subcategory)
  //   } else {
  //     categories[c.category] = [c.subcategory]
  //   }
  // })

  res.status(200).json(raw_categories)
})

// TODO: Create listing as part of multiple
//  ~~fetch a multiple~~
//  ~~convert a unique to a multiple~~
//  ~~convert a multiple back to unique~~
//  ~~user create multiple~~
//  ~~provide multiples in normal lookup endpoints~~
//  create helper func for finding kinds of listings complete
//  ~~Make multiples compatible with unique/aggregate listing lookup by ID~~
//  attach orders to aggregate composite, multiples, and multiple composites when fetched
