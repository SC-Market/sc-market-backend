import express from "express"
import { starmapRouter } from "./starmap/starmap.js"
import { chatsRouter } from "./chats/chats.js"
import { profileRouter } from "./profiles/profiles.js"
import { commodityRouter } from "./commodities/commodities.js"
import { contractorsRouter } from "./contractors/routes.js"
import { ordersRouter } from "./orders/routes.js"
import { deliveriesRouter, deliveryRouter } from "./deliveries/deliveries.js"
import { marketRouter } from "./market/market.js"
import { notificationRouter } from "./notifications/notification.js"
import { recruitingRouter } from "./recruiting/routes.js"
import { commentRouter } from "./comments/comments.js"
import { wikiRouter } from "./wiki/wiki.js"
import { adminRouter } from "./admin/admin.js"
import { offerRouter, offersRouter } from "./offers/offers.js"
import { servicesRouter } from "./services/services.js"
import { contractsRouter } from "./contracts/contracts.js"
import { shopRouter } from "./shops/shops.js"
import { moderationRouter } from "./moderation/moderation.js"
import { tokensRouter } from "./tokens/tokens.js"

export const apiRouter = express.Router()

apiRouter.use("/admin", adminRouter)
apiRouter.use("/starmap", starmapRouter)
apiRouter.use("/commodities", commodityRouter)
apiRouter.use("/profile", profileRouter)
apiRouter.use("/notification", notificationRouter)
apiRouter.use("/market", marketRouter)
apiRouter.use("/recruiting", recruitingRouter)
apiRouter.use("/comments", commentRouter)

apiRouter.use("/chats", chatsRouter)

apiRouter.use("/contractors", contractorsRouter)

apiRouter.use("/contracts", contractsRouter)
apiRouter.use("/orders", ordersRouter)
apiRouter.use("/offers", offersRouter)
apiRouter.use("/offer", offerRouter)
apiRouter.use("/services", servicesRouter)

// apiRouter.use("/transaction", transactionRouter)
// apiRouter.use("/transactions", transactionsRouter)

apiRouter.use("/delivery", deliveryRouter)
apiRouter.use("/deliveries", deliveriesRouter)

// apiRouter.use("/ship", shipRouter)
// apiRouter.use("/ships", shipsRouter)

apiRouter.use("/wiki", wikiRouter)
apiRouter.use("/moderation", moderationRouter)
apiRouter.use("/shops", shopRouter)
apiRouter.use("/tokens", tokensRouter)
