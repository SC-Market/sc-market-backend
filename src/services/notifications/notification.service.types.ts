import {
  DBAdminAlert,
  DBContractorInvite,
  DBMarketBid,
  DBMarketListing,
  DBMarketListingComplete,
  DBMarketOffer,
  DBMessage,
  DBOfferSession,
  DBOrder,
  DBOrderComment,
  DBReview,
} from "../../clients/database/db-models.js"
import { User } from "../../api/routes/v1/api-models.js"

/**
 * Input types for notification service methods
 */
export type NotificationServiceInputs = {
  createOrderNotification: { order: DBOrder }
  createOrderAssignedNotification: { order: DBOrder }
  createOrderMessageNotification: { order: DBOrder; message: DBMessage }
  createOrderCommentNotification: { comment: DBOrderComment; actorId: string }
  createOrderReviewNotification: { review: DBReview }
  createOrderStatusNotification: {
    order: DBOrder
    newStatus: string
    actorId: string
  }
  createOfferNotification: {
    offer: DBOfferSession
    type: "create" | "counteroffer"
  }
  createOfferMessageNotification: {
    session: DBOfferSession
    message: DBMessage
  }
  createMarketBidNotification: {
    listing: DBMarketListingComplete
    bid: DBMarketBid
  }
  createMarketOfferNotification: {
    listing: DBMarketListing
    offer: DBMarketOffer
  }
  createContractorInviteNotification: { invite: DBContractorInvite }
  createAdminAlertNotification: { alert: DBAdminAlert }
  createOrderReviewRevisionNotification: {
    review: DBReview
    requester: User
  }
}
