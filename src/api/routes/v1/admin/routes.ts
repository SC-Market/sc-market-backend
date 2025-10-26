import express from "express"
import { adminAuthorized } from "../../../middleware/auth.js"
import { spectrumMigrationRouter } from "./spectrum-migration.js"
import { adminAlertsRouter } from "./alerts.js"

import {
  admin_get_activity,
  admin_get_orders_analytics,
  admin_get_users,
  admin_get_membership_analytics,
} from "./controller.js"

import {
  admin_get_activity_spec,
  admin_get_orders_analytics_spec,
  admin_get_users_spec,
  admin_get_membership_analytics_spec,
} from "./openapi.js"

export const adminRouter = express.Router()

// Mount spectrum migration routes
adminRouter.use("/spectrum-migration", spectrumMigrationRouter)

// Mount admin alerts routes
adminRouter.use("/alerts", adminAlertsRouter)

// Define schemas

adminRouter.get(
  "/activity",
  admin_get_activity_spec,
  adminAuthorized,
  admin_get_activity,
)

adminRouter.get(
  "/orders/analytics",
  admin_get_orders_analytics_spec,
  adminAuthorized,
  admin_get_orders_analytics,
)

adminRouter.get(
  "/users",
  admin_get_users_spec,
  adminAuthorized,
  admin_get_users,
)

adminRouter.get(
  "/membership/analytics",
  admin_get_membership_analytics_spec,
  adminAuthorized,
  admin_get_membership_analytics,
)
