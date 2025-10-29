import express from "express"
import { userAuthorized, adminAuthorized } from "../../../middleware/auth.js"
import {
  writeRateLimit,
  readRateLimit,
  criticalRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import {
  moderation_post_report,
  moderation_get_reports,
  moderation_get_admin_reports,
  moderation_put_admin_reports_report_id,
} from "./controller.js"

import {
  moderation_post_report_spec,
  moderation_get_reports_spec,
  moderation_get_admin_reports_spec,
  moderation_put_admin_reports_report_id_spec,
} from "./openapi.js"

export const moderationRouter = express.Router()

// Report content endpoint
moderationRouter.post(
  "/report",
  userAuthorized,
  moderation_post_report_spec,
  writeRateLimit,
  moderation_post_report,
)

// Get user's own reports (optional endpoint for users to see their report history)
moderationRouter.get(
  "/reports",
  userAuthorized,
  moderation_get_reports_spec,
  readRateLimit,
  moderation_get_reports,
)

// Admin endpoint to get all unprocessed reports with pagination
moderationRouter.get(
  "/admin/reports",
  adminAuthorized,
  moderation_get_admin_reports_spec,
  criticalRateLimit,
  moderation_get_admin_reports,
)

// Admin endpoint to update report status and add moderation details
moderationRouter.put(
  "/admin/reports/:report_id",
  adminAuthorized,
  moderation_put_admin_reports_report_id_spec,
  criticalRateLimit,
  moderation_put_admin_reports_report_id,
)
