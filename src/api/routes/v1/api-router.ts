import express from "express"
import { starmapRouter } from "./starmap/routes.js"
import { chatsRouter } from "./chats/routes.js"
import { profileRouter } from "./profiles/routes.js"
import { commodityRouter } from "./commodities/routes.js"
import { contractorsRouter } from "./contractors/routes.js"
import { ordersRouter } from "./orders/routes.js"
import { deliveriesRouter, deliveryRouter } from "./deliveries/routes.js"
import { marketRouter } from "./market/routes.js"
import { notificationRouter } from "./notifications/routes.js"
import { pushRouter } from "./push/routes.js"
import { emailRouter } from "./email/routes.js"
import { recruitingRouter } from "./recruiting/routes.js"
import { commentRouter } from "./comments/routes.js"
import { wikiRouter } from "./wiki/routes.js"
import { adminRouter } from "./admin/routes.js"
import { prometheusRouter } from "./prometheus/routes.js"
import { offerRouter, offersRouter } from "./offers/routes.js"
import { servicesRouter } from "./services/routes.js"
import { contractsRouter } from "./contracts/routes.js"
import { shopRouter } from "./shops/routes.js"
import { moderationRouter } from "./moderation/routes.js"
import { tokensRouter } from "./tokens/routes.js"
import { attributesRouter } from "./attributes/routes.js"

export const apiRouter = express.Router()

apiRouter.use("/admin", adminRouter)
apiRouter.use("/prometheus/api/v1", prometheusRouter)
apiRouter.use("/prometheus", prometheusRouter)
apiRouter.use("/starmap", starmapRouter)
apiRouter.use("/commodities", commodityRouter)
apiRouter.use("/profile", profileRouter)
apiRouter.use("/notification", notificationRouter)
apiRouter.use("/push", pushRouter)
apiRouter.use("/email", emailRouter)
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
apiRouter.use("/attributes", attributesRouter)

// Languages reference endpoint
import { SUPPORTED_LANGUAGES } from "../../../constants/languages.js"
import { createResponse } from "./util/response.js"

apiRouter.get("/languages", (req, res) => {
  res.json(createResponse({ languages: SUPPORTED_LANGUAGES }))
})

// CSP reporting endpoint (optional - for monitoring CSP violations)
import { cspReportHandler } from "./util/csp-report.js"
apiRouter.post("/csp-report", cspReportHandler)

// Test endpoint for error handler and CORS verification (development/testing only)
// Note: This endpoint is only available in non-production environments
// Access via: GET /api/test-error-handler?type=<error_type>
// Error types: unhandled, validation, notfound, business, database, normal
import { testErrorHandler } from "./util/test-error-handler.js"
if (process.env.NODE_ENV !== "production") {
  apiRouter.get("/test-error-handler", testErrorHandler)
}
