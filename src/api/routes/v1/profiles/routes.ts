import express from "express"
import {
  adminAuthorized,
  requireProfileRead,
  requireProfileWrite,
  userAuthorized,
} from "../../../middleware/auth.js"
import { rate_limit } from "../../../middleware/ratelimiting.js"

import {
  profile_post_auth_link,
  profile_post_auth_sync_handle,
  profile_get_auth_ident,
  profile_get_search_query,
  profile_put_root,
  profile_post_update,
  profile_post_webhook_create,
  profile_post_webhook_delete,
  profile_get_webhooks,
  profile_get_allusers,
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
  profile_put_root_spec,
  profile_get_root_spec,
  profile_get_blocklist_spec,
  profile_post_blocklist_block_spec,
  profile_delete_blocklist_unblock_username_spec,
} from "./openapi.js"

export const profileRouter = express.Router()

// Define OpenAPI schema for profile update

profileRouter.post("/auth/link", userAuthorized, profile_post_auth_link)

profileRouter.post(
  "/auth/sync-handle",
  rate_limit(30),
  userAuthorized,
  profile_post_auth_sync_handle_spec,
  profile_post_auth_sync_handle,
)

profileRouter.get(
  "/auth/ident",
  rate_limit(1),
  userAuthorized,
  profile_get_auth_ident,
)

profileRouter.get("/search/:query", profile_get_search_query)

profileRouter.put(
  "",
  rate_limit(30),
  userAuthorized,
  requireProfileWrite,
  profile_put_root_spec,
  profile_put_root,
)

profileRouter.post(
  "/update",
  rate_limit(30),
  userAuthorized,
  profile_post_update,
)

profileRouter.post(
  "/webhook/create",
  rate_limit(15),
  userAuthorized,
  profile_post_webhook_create,
)

profileRouter.post(
  "/webhook/delete",
  userAuthorized,
  profile_post_webhook_delete,
)

profileRouter.get("/webhooks", userAuthorized, profile_get_webhooks)

profileRouter.get("/allusers", adminAuthorized, profile_get_allusers)

profileRouter.get("/user/:username/reviews", profile_get_user_username_reviews)

profileRouter.get("/user/:username", profile_get_user_username)

profileRouter.post(
  "/settings/update",
  userAuthorized,
  profile_post_settings_update,
)

profileRouter.post(
  "/availability/update",
  userAuthorized,
  profile_post_availability_update,
)

profileRouter.get(
  "/availability/contractor/:spectrum_id",
  userAuthorized,
  profile_get_availability_contractor_spectrum_id,
)

profileRouter.get(
  "/settings/discord",
  userAuthorized,
  profile_get_settings_discord,
)
profileRouter.post(
  "/settings/discord/use_official",
  userAuthorized,
  profile_post_settings_discord_use_official,
)

profileRouter.get("/availability", userAuthorized, profile_get_availability)

profileRouter.get(
  "",
  rate_limit(1),
  userAuthorized,
  requireProfileRead,
  profile_get_root_spec,
  profile_get_root,
)

profileRouter.get(
  "/my_data",
  rate_limit(30),
  userAuthorized,
  profile_get_my_data,
)

// Blocklist endpoints
profileRouter.get(
  "/blocklist",
  userAuthorized,
  profile_get_blocklist_spec,
  profile_get_blocklist,
)

profileRouter.post(
  "/blocklist/block",
  userAuthorized,
  profile_post_blocklist_block_spec,
  profile_post_blocklist_block,
)

profileRouter.delete(
  "/blocklist/unblock/:username",
  userAuthorized,
  profile_delete_blocklist_unblock_username_spec,
  profile_delete_blocklist_unblock_username,
)
