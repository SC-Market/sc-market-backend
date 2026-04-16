import express from "express"
import { adminAuthorized } from "../../../middleware/auth.js"
import {
  criticalRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { spectrumMigrationRouter } from "./spectrum-migration.js"
import { adminAlertsRouter } from "./alerts.js"

import {
  admin_get_activity,
  admin_get_orders_analytics,
  admin_get_users,
  admin_get_membership_analytics,
  admin_get_audit_logs,
  admin_post_users_username_unlink,
  admin_post_test_notification,
} from "./controller.js"

import {
  admin_get_activity_spec,
  admin_get_orders_analytics_spec,
  admin_get_users_spec,
  admin_get_membership_analytics_spec,
  admin_get_audit_logs_spec,
  admin_post_users_username_unlink_spec,
  admin_post_test_notification_spec,
} from "./openapi.js"

export const adminRouter = express.Router()

// Mount spectrum migration routes
adminRouter.use("/spectrum-migration", spectrumMigrationRouter)

// Mount admin alerts routes
adminRouter.use("/alerts", adminAlertsRouter)

// Define schemas

adminRouter.get(
  "/activity",
  adminAuthorized,
  criticalRateLimit,
  admin_get_activity_spec,
  admin_get_activity,
)

adminRouter.get(
  "/orders/analytics",
  adminAuthorized,
  readRateLimit,
  admin_get_orders_analytics_spec,
  admin_get_orders_analytics,
)

adminRouter.get(
  "/users",
  adminAuthorized,
  criticalRateLimit,
  admin_get_users_spec,
  admin_get_users,
)

adminRouter.get(
  "/membership/analytics",
  adminAuthorized,
  readRateLimit,
  admin_get_membership_analytics_spec,
  admin_get_membership_analytics,
)

adminRouter.get(
  "/audit-logs",
  adminAuthorized,
  readRateLimit,
  admin_get_audit_logs_spec,
  admin_get_audit_logs,
)

adminRouter.post(
  "/users/:username/unlink",
  adminAuthorized,
  criticalRateLimit,
  admin_post_users_username_unlink_spec,
  admin_post_users_username_unlink,
)

adminRouter.post(
  "/notifications/test",
  adminAuthorized,
  criticalRateLimit,
  admin_post_test_notification_spec,
  admin_post_test_notification,
)
