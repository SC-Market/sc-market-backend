import express from "express"
import {
  requireProfileRead,
  requireProfileWrite,
  userAuthorized,
} from "../../../middleware/auth.js"
import {
  criticalRateLimit,
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import {
  profile_post_auth_link,
  profile_post_auth_sync_handle,
  profile_post_auth_unlink,
  profile_get_auth_ident,
  profile_get_search_query,
  profile_put_root,
  profile_post_update,
  profile_post_webhook_create,
  profile_post_webhook_delete,
  profile_get_webhooks,
  profile_get_user_username_reviews,
  profile_get_user_username,
  profile_post_settings_update,
  profile_post_availability_update,
  profile_get_availability_contractor_spectrum_id,
  profile_get_settings_discord,
  profile_post_settings_discord_use_official,
  profile_get_availability,
  profile_get_root,
  profile_get_my_data,
  profile_get_blocklist,
  profile_post_blocklist_block,
  profile_delete_blocklist_unblock_username,
} from "./controller.js"

import {
  profile_post_auth_sync_handle_spec,
  profile_post_auth_unlink_spec,
  profile_put_root_spec,
  profile_get_root_spec,
  profile_get_blocklist_spec,
  profile_post_blocklist_block_spec,
  profile_delete_blocklist_unblock_username_spec,
} from "./openapi.js"

export const profileRouter = express.Router()

// Define OpenAPI schema for profile update

profileRouter.post(
  "/auth/link",
  criticalRateLimit,
  userAuthorized,
  profile_post_auth_link,
)

profileRouter.post(
  "/auth/sync-handle",
  criticalRateLimit,
  userAuthorized,
  profile_post_auth_sync_handle_spec,
  profile_post_auth_sync_handle,
)

profileRouter.post(
  "/auth/unlink",
  criticalRateLimit,
  userAuthorized,
  profile_post_auth_unlink_spec,
  profile_post_auth_unlink,
)

profileRouter.get(
  "/auth/ident",
  criticalRateLimit,
  userAuthorized,
  profile_get_auth_ident,
)

profileRouter.get("/search/:query", readRateLimit, profile_get_search_query)

profileRouter.put(
  "",
  writeRateLimit,
  userAuthorized,
  requireProfileWrite,
  profile_put_root_spec,
  profile_put_root,
)

profileRouter.post(
  "/update",
  writeRateLimit,
  userAuthorized,
  profile_post_update,
)

profileRouter.post(
  "/webhook/create",
  writeRateLimit,
  userAuthorized,
  profile_post_webhook_create,
)

profileRouter.post(
  "/webhook/delete",
  writeRateLimit,
  userAuthorized,
  profile_post_webhook_delete,
)

profileRouter.get(
  "/webhooks",
  readRateLimit,
  userAuthorized,
  profile_get_webhooks,
)

profileRouter.get(
  "/user/:username/reviews",
  readRateLimit,
  profile_get_user_username_reviews,
)

profileRouter.get("/user/:username", readRateLimit, profile_get_user_username)

profileRouter.post(
  "/settings/update",
  writeRateLimit,
  userAuthorized,
  profile_post_settings_update,
)

profileRouter.post(
  "/availability/update",
  writeRateLimit,
  userAuthorized,
  profile_post_availability_update,
)

profileRouter.get(
  "/availability/contractor/:spectrum_id",
  readRateLimit,
  userAuthorized,
  profile_get_availability_contractor_spectrum_id,
)

profileRouter.get(
  "/settings/discord",
  readRateLimit,
  userAuthorized,
  profile_get_settings_discord,
)
profileRouter.post(
  "/settings/discord/use_official",
  writeRateLimit,
  userAuthorized,
  profile_post_settings_discord_use_official,
)

profileRouter.get(
  "/availability",
  readRateLimit,
  userAuthorized,
  profile_get_availability,
)

profileRouter.get(
  "",
  readRateLimit,
  userAuthorized,
  requireProfileRead,
  profile_get_root_spec,
  profile_get_root,
)

profileRouter.get(
  "/my_data",
  readRateLimit,
  userAuthorized,
  profile_get_my_data,
)

// Blocklist endpoints
profileRouter.get(
  "/blocklist",
  readRateLimit,
  userAuthorized,
  profile_get_blocklist_spec,
  profile_get_blocklist,
)

profileRouter.post(
  "/blocklist/block",
  writeRateLimit,
  userAuthorized,
  profile_post_blocklist_block_spec,
  profile_post_blocklist_block,
)

profileRouter.delete(
  "/blocklist/unblock/:username",
  writeRateLimit,
  userAuthorized,
  profile_delete_blocklist_unblock_username_spec,
  profile_delete_blocklist_unblock_username,
)
