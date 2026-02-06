import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import {
  readRateLimit,
  commonWriteRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import {
  addEmail,
  updateEmail,
  deleteEmail,
  requestVerification,
  verifyEmail,
  getNotificationTypes,
  getEmailPreferences,
  updateEmailPreferences,
  unsubscribe,
} from "./controller.js"
import {
  add_email_spec,
  update_email_spec,
  delete_email_spec,
  request_verification_spec,
  verify_email_spec,
  get_email_preferences_spec,
  update_email_preferences_spec,
  unsubscribe_spec,
} from "./openapi.js"

/**
 * Email preferences router (for /email/* routes)
 */
export const emailRouter = express.Router()

/*
 * Email Preferences API
 *
 * GET    /notification-types   - Get available notification types
 * GET    /preferences          - Get email notification preferences
 * PATCH  /preferences          - Update email notification preferences
 * POST   /unsubscribe/:token   - Unsubscribe via token (no auth)
 */

// Get available notification types
// GET /api/email/notification-types
emailRouter.get(
  "/notification-types",
  userAuthorized,
  readRateLimit,
  getNotificationTypes,
)

// Get email notification preferences
// GET /api/email/preferences
emailRouter.get(
  "/preferences",
  userAuthorized,
  readRateLimit,
  get_email_preferences_spec,
  getEmailPreferences,
)

// Update email notification preferences
// PATCH /api/v1/email/preferences
emailRouter.patch(
  "/preferences",
  userAuthorized,
  commonWriteRateLimit,
  update_email_preferences_spec,
  updateEmailPreferences,
)

// Unsubscribe from emails (no auth required)
// POST /api/v1/email/unsubscribe/:token
emailRouter.post("/unsubscribe/:token", unsubscribe_spec, unsubscribe)

/**
 * Email management routes (to be added to profileRouter)
 * These are exported so they can be registered in profileRouter
 */
export const emailManagementRoutes = {
  addEmail,
  updateEmail,
  deleteEmail,
  requestVerification,
  verifyEmail,
  add_email_spec,
  update_email_spec,
  delete_email_spec,
  request_verification_spec,
  verify_email_spec,
}
