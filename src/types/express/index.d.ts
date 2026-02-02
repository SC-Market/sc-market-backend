import { DBContractor } from "../database/db-models.js"
import {
  DBChat,
  DBOffer,
  DBOfferSession,
  DBOrder,
  DBRecruitingPost,
  DBUser,
  DBMarketListingComplete,
  DBMarketListing,
} from "../../clients/database/db-models.js"
import { DBPublicContract } from "../../api/routes/v1/contracts/types.js"
import { User as AppUser } from "../../api/routes/v1/api-models.js"
import { DBStockLot } from "../../services/stock-lot/types.js"

declare global {
  declare namespace Express {
    // Extend Express.User to use our custom User type
    // This makes req.user typed as our User interface instead of Express's default User
    interface User extends AppUser {}

    interface Request {
      contractor?: DBContractor
      order?: DBOrder
      offer_session?: DBOfferSession
      offer_sessions?: DBOfferSession[]
      most_recent_offer?: DBOffer
      contract?: DBPublicContract
      chat?: DBChat
      recruiting_post?: DBRecruitingPost
      market_listing?: DBMarketListing
      stock_lot?: DBStockLot
      user_listings?: DBMarketListingComplete[]
      contractor_listings?: DBMarketListingComplete[]
      users?: Map<string, AppUser>
      contractors?: Map<string, DBContractor>
    }
  }
}
