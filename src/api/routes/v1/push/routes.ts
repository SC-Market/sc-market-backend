import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import {
  readRateLimit,
  commonWriteRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import {
  push_subscribe,
  push_unsubscribe,
  push_get_preferences,
  push_update_preference,
} from "./controller.js"
import {
  push_subscribe_spec,
  push_unsubscribe_spec,
  push_get_preferences_spec,
  push_update_preference_spec,
} from "./openapi.js"

export const pushRouter = express.Router()

/*
 * Push Notification API
 *
 * POST   /subscribe              - Subscribe to push notifications
 * DELETE /subscribe/:subscription_id - Unsubscribe from push notifications
 * GET    /preferences            - Get push notification preferences
 * PATCH  /preferences            - Update push notification preferences
 */

// Subscribe to push notifications
// POST /push/subscribe
pushRouter.post(
  "/subscribe",
  userAuthorized,
  push_subscribe_spec,
  commonWriteRateLimit,
  push_subscribe,
)

// Unsubscribe from push notifications
// DELETE /push/subscribe/:subscription_id
pushRouter.delete(
  "/subscribe/:subscription_id",
  userAuthorized,
  push_unsubscribe_spec,
  commonWriteRateLimit,
  push_unsubscribe,
)

// Get push notification preferences
// GET /push/preferences
pushRouter.get(
  "/preferences",
  userAuthorized,
  push_get_preferences_spec,
  readRateLimit,
  push_get_preferences,
)

// Update push notification preferences
// PATCH /push/preferences
pushRouter.patch(
  "/preferences",
  userAuthorized,
  push_update_preference_spec,
  commonWriteRateLimit,
  push_update_preference,
)
