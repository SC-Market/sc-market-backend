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

declare global {
  declare namespace Express {
    interface Request {
      contractor?: DBContractor
      order?: DBOrder
      offer_session?: DBOfferSession
      most_recent_offer?: DBOffer
      contract?: DBPublicContract
      chat?: DBChat
      recruiting_post?: DBRecruitingPost
      market_listing?: DBMarketListing
      user_listings?: DBMarketListingComplete[]
      contractor_listings?: DBMarketListingComplete[]
      users?: Map<string, DBUser>
      contractors?: Map<string, DBContractor>
    }
  }
}
