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
import { TokenInfo } from "../../api/routes/v2/middleware/token-scopes.js"

declare module "express-session" {
  // Auth-flow scratch data written by the /auth routes and read back by the
  // passport verify callbacks (src/api/util/passport-strategies.ts).
  interface SessionData {
    discord_auth_action?: "signup" | "signin"
    citizenid_auth_action?: "signup" | "signin"
    citizenid_redirect_path?: string
    citizenid_origin?: string
  }
}

declare global {
  declare namespace Express {
    // Extend Express.User to use our custom User type
    // This makes req.user typed as our User interface instead of Express's default User
    interface User extends AppUser {}

    interface Request {
      // Bearer API-token metadata stashed by the populate-user middleware and
      // read by the v1/v2 scope guards. `expires_at` is widened to allow null
      // because that is what the api_tokens row carries for non-expiring tokens.
      __tokenInfo?: Omit<TokenInfo, "expires_at"> & {
        expires_at?: Date | null
      }
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
