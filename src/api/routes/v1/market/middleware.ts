import { NextFunction, Request, Response } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { createErrorResponse } from "../util/response.js"
import logger from "../../../../logger/logger.js"

export async function valid_market_listing(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const listing_id = req.params["listing_id"]
  
  if (!listing_id) {
    res.status(400).json(createErrorResponse({ message: "Missing listing_id parameter" }))
    return
  }

  try {
    const listing = await database.getMarketListingComplete(listing_id)
    
    if (!listing) {
      res.status(404).json(createErrorResponse({ message: "Market listing not found" }))
      return
    }

    req.market_listing = listing
    next()
  } catch (error) {
    logger.error("Failed to validate market listing", {
      listing_id,
      error: error instanceof Error ? error.message : String(error)
    })
    res.status(500).json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export async function valid_market_listing_by_user(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const username = req.params["username"]
  
  if (!username) {
    res.status(400).json(createErrorResponse({ message: "Missing username parameter" }))
    return
  }

  try {
    // Get user by username
    const user = await database.getUser({ username })
    
    if (!user) {
      res.status(404).json(createErrorResponse({ message: "User not found" }))
      return
    }

    // Get user's listings
    const listings = await database.getMarketListings({
      user_seller_id: user.user_id,
      status: "active"
    })
    
    // Convert to complete listings
    const completeListings = await Promise.all(
      listings.map(async (listing) => {
        try {
          return await database.getMarketListingComplete(listing.listing_id)
        } catch {
          return null
        }
      })
    )
    
    req.user_listings = completeListings.filter(Boolean) as any[]
    req.user = user
    next()
  } catch (error) {
    logger.error("Failed to validate market listings by user", {
      username,
      error: error instanceof Error ? error.message : String(error)
    })
    res.status(500).json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export async function valid_market_listing_by_contractor(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const spectrum_id = req.params["spectrum_id"]
  
  if (!spectrum_id) {
    res.status(400).json(createErrorResponse({ message: "Missing spectrum_id parameter" }))
    return
  }

  try {
    // First get the contractor
    const contractor = await database.getContractor({ spectrum_id })
    
    if (!contractor) {
      res.status(404).json(createErrorResponse({ message: "Contractor not found" }))
      return
    }

    // Get contractor's listings
    const listings = await database.getMarketListings({
      contractor_seller_id: contractor.contractor_id,
      status: "active"
    })
    
    // Convert to complete listings
    const completeListings = await Promise.all(
      listings.map(async (listing) => {
        try {
          return await database.getMarketListingComplete(listing.listing_id)
        } catch {
          return null
        }
      })
    )
    
    req.contractor_listings = completeListings.filter(Boolean) as any[]
    req.contractor = contractor
    next()
  } catch (error) {
    logger.error("Failed to validate market listings by contractor", {
      spectrum_id,
      error: error instanceof Error ? error.message : String(error)
    })
    res.status(500).json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}