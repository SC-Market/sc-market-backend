import express from "express"
import { starmapRouter } from "./starmap/starmap.js"
import { chatsRouter } from "./chats/routes.js"
import { profileRouter } from "./profiles/profiles.js"
import { commodityRouter } from "./commodities/routes.js"
import { contractorsRouter } from "./contractors/routes.js"
import { ordersRouter } from "./orders/routes.js"
import { deliveriesRouter, deliveryRouter } from "./deliveries/routes.js"
import { marketRouter } from "./market/routes.js"
import { notificationRouter } from "./notifications/routes.js"
import { recruitingRouter } from "./recruiting/routes.js"
import { commentRouter } from "./comments/routes.js"
import { wikiRouter } from "./wiki/wiki.js"
import { adminRouter } from "./admin/routes.js"
import { offerRouter, offersRouter } from "./offers/routes.js"
import { servicesRouter } from "./services/routes.js"
import { contractsRouter } from "./contracts/routes.js"
import { shopRouter } from "./shops/shops.js"
import { moderationRouter } from "./moderation/routes.js"
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
