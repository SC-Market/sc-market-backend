import express from "express"
import { apiReference } from "@scalar/express-api-reference"
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
import { SUPPORTED_LANGUAGES } from "../../../constants/languages.js"
import { createResponse } from "./util/response.js"
import { cspReportHandler } from "./util/csp-report.js"
import { testErrorHandler } from "./util/test-error-handler.js"
import { oapi } from "./openapi.js"
import { getKnex } from "../../../clients/database/knex-db.js"

/**
 * v1 API Router - Alias for existing /api/* routes
 * 
 * This router mounts all existing route modules at /api/v1/* to establish
 * explicit versioning while maintaining backward compatibility at /api/*.
 * 
 * All routes, middleware, and endpoints are identical to the original apiRouter.
 */
export const apiV1Router = express.Router()

// Mount all existing route modules on v1 router
apiV1Router.use("/admin", adminRouter)
apiV1Router.use("/prometheus/api/v1", prometheusRouter)
apiV1Router.use("/prometheus", prometheusRouter)
apiV1Router.use("/starmap", starmapRouter)
apiV1Router.use("/commodities", commodityRouter)
apiV1Router.use("/profile", profileRouter)
apiV1Router.use("/notification", notificationRouter)
apiV1Router.use("/push", pushRouter)
apiV1Router.use("/email", emailRouter)
apiV1Router.use("/market", marketRouter)
apiV1Router.use("/recruiting", recruitingRouter)
apiV1Router.use("/comments", commentRouter)
apiV1Router.use("/chats", chatsRouter)
apiV1Router.use("/contractors", contractorsRouter)
apiV1Router.use("/contracts", contractsRouter)
apiV1Router.use("/orders", ordersRouter)
apiV1Router.use("/offers", offersRouter)
apiV1Router.use("/offer", offerRouter)
apiV1Router.use("/services", servicesRouter)
apiV1Router.use("/delivery", deliveryRouter)
apiV1Router.use("/deliveries", deliveriesRouter)
apiV1Router.use("/wiki", wikiRouter)
apiV1Router.use("/moderation", moderationRouter)
apiV1Router.use("/shops", shopRouter)
apiV1Router.use("/tokens", tokensRouter)
apiV1Router.use("/attributes", attributesRouter)

// Languages reference endpoint
apiV1Router.get("/languages", (req, res) => {
  res.json(createResponse({ languages: SUPPORTED_LANGUAGES }))
})

// Public domain resolution — maps a custom hostname to its org's spectrum_id
apiV1Router.get("/domain/:hostname", async (req, res) => {
  try {
    const row = await getKnex()("org_premium_tiers")
      .join("contractors", "contractors.contractor_id", "org_premium_tiers.contractor_id")
      .where({ custom_domain: req.params.hostname })
      .whereNull("revoked_at")
      .select("contractors.spectrum_id", "contractors.name", "contractors.contractor_id")
      .first()

    if (!row) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Domain not found" } })
      return
    }

    res.json(createResponse({
      spectrum_id: row.spectrum_id,
      contractor_id: row.contractor_id,
      name: row.name,
    }))
  } catch {
    res.status(500).json({ error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to resolve domain" } })
  }
})

// CSP reporting endpoint
apiV1Router.post("/csp-report", cspReportHandler)

// Test endpoint for error handler (development/testing only)
if (process.env.NODE_ENV !== "production") {
  apiV1Router.get("/test-error-handler", testErrorHandler)
}

// Serve v1 OpenAPI spec at /api/v1/openapi.json
apiV1Router.get("/openapi.json", (req, res) => {
  // Get the OpenAPI document and update it for v1
  const v1Document = {
    ...oapi.document,
    info: {
      ...oapi.document.info,
      title: "SC Market API v1",
      description: "The v1 API for the SC Market site (existing routes)",
      version: "1.0.0",
    },
    servers: [
      {
        url: "https://api.sc-market.space/api/v1",
        description: "Production v1 API",
      },
      {
        url: "http://localhost:7000/api/v1",
        description: "Development v1 API",
      },
    ],
  }
  
  res.json(v1Document)
})

// Serve v1 API documentation using Scalar
apiV1Router.use(
  "/docs",
  apiReference({
    url: "/api/v1/openapi.json",
  }),
)
