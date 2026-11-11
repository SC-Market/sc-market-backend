import express from "express"
import { userAuthorized, requireTokenScopes } from "../../../middleware/auth.js"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import { moderation_post_report, moderation_get_reports } from "./controller.js"

import {
  moderation_post_report_spec,
  moderation_get_reports_spec,
} from "./openapi.js"

export const moderationRouter = express.Router()

// Report content endpoint
moderationRouter.post(
  "/report",
  userAuthorized,
  requireTokenScopes("profile:write"),
  moderation_post_report_spec,
  writeRateLimit,
  moderation_post_report,
)

// Get user's own reports (optional endpoint for users to see their report history)
moderationRouter.get(
  "/reports",
  userAuthorized,
  requireTokenScopes("profile:read"),
  moderation_get_reports_spec,
  readRateLimit,
  moderation_get_reports,
)

// Admin report handling moved to TSOA: /api/v2/admin/moderation/reports
// (routes/v2/admin/AdminModerationController.ts).
