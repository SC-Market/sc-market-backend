import express from "express"
import {
  requireProfileRead,
  requireProfileWrite,
  userAuthorized,
  requireTokenScopes,
  requireSessionAuth,
  anyTokenIdentity,
} from "../../../middleware/auth.js"
import {
  criticalRateLimit,
  writeRateLimit,
  readRateLimit,
  dataExportRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import { singlePhotoUpload, photoUpload, removeUploadsWhenDone } from "../util/upload.js"

import {
  profile_post_auth_link,
  profile_post_auth_sync_handle,
  profile_post_auth_unlink,
  profile_get_auth_ident,
  profile_get_search_query,
  profile_put_root,
  profile_post_update,
  profile_post_avatar,
  profile_post_banner,
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
  profile_get_links,
  profile_get_organizations,
  profile_delete_links_provider_type,
  profile_put_links_provider_type_primary,
  profile_get_languages,
  profile_put_languages,
  profile_patch_in_game_status,
} from "./controller.js"

import {
  profile_post_auth_sync_handle_spec,
  profile_post_auth_unlink_spec,
  profile_put_root_spec,
  profile_post_avatar_spec,
  profile_post_banner_spec,
  profile_get_root_spec,
  profile_get_blocklist_spec,
  profile_post_blocklist_block_spec,
  profile_delete_blocklist_unblock_username_spec,
} from "./openapi.js"

export const profileRouter = express.Router()

// Define OpenAPI schema for profile update

profileRouter.post(
  "/auth/link",
  userAuthorized,
  requireSessionAuth,
  criticalRateLimit,
  profile_post_auth_link,
)

profileRouter.post(
  "/auth/sync-handle",
  userAuthorized,
  requireTokenScopes("profile:write"),
  criticalRateLimit,
  profile_post_auth_sync_handle_spec,
  profile_post_auth_sync_handle,
)

profileRouter.post(
  "/auth/unlink",
  userAuthorized,
  requireSessionAuth,
  criticalRateLimit,
  profile_post_auth_unlink_spec,
  profile_post_auth_unlink,
)

profileRouter.get(
  "/auth/ident",
  userAuthorized,
  requireTokenScopes("profile:read"),
  criticalRateLimit,
  profile_get_auth_ident,
)

profileRouter.get("/search/:query", readRateLimit, profile_get_search_query)

profileRouter.put(
  "",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_put_root_spec,
  profile_put_root,
)

profileRouter.post(
  "/update",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_post_update,
)

profileRouter.post(
  "/avatar",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  removeUploadsWhenDone,
  singlePhotoUpload.single("avatar"),
  profile_post_avatar_spec,
  profile_post_avatar,
)

profileRouter.post(
  "/banner",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  removeUploadsWhenDone,
  photoUpload.single("banner"),
  profile_post_banner_spec,
  profile_post_banner,
)

profileRouter.post(
  "/webhook/create",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_post_webhook_create,
)

profileRouter.post(
  "/webhook/delete",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_post_webhook_delete,
)

profileRouter.get(
  "/webhooks",
  readRateLimit,
  userAuthorized,
  requireProfileRead,
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
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_post_settings_update,
)

profileRouter.post(
  "/availability/update",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_post_availability_update,
)

profileRouter.get(
  "/availability/contractor/:spectrum_id",
  readRateLimit,
  userAuthorized,
  requireTokenScopes("profile:read"),
  profile_get_availability_contractor_spectrum_id,
)

profileRouter.get(
  "/settings/discord",
  readRateLimit,
  userAuthorized,
  requireProfileRead,
  profile_get_settings_discord,
)
profileRouter.post(
  "/settings/discord/use_official",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_post_settings_discord_use_official,
)

profileRouter.get(
  "/availability",
  readRateLimit,
  userAuthorized,
  requireProfileRead,
  profile_get_availability,
)

profileRouter.get(
  "",
  // Intentionally no token scope: this is identity (who the session or token
  // belongs to), and the API token guide checks a token with it. Any valid
  // token may call it. Unverified users may too (needed for Discord login).
  anyTokenIdentity,
  readRateLimit,
  profile_get_root_spec,
  profile_get_root,
)

profileRouter.get(
  "/my_data",
  readRateLimit,
  userAuthorized,
  // The full personal data export (every table that holds the user's data,
  // their tokens' metadata included) is browser-session only: no API token,
  // whatever its scopes. The site opens it as a plain link with the session.
  requireSessionAuth,
  dataExportRateLimit,
  profile_get_my_data,
)

// Blocklist endpoints
profileRouter.get(
  "/blocklist",
  readRateLimit,
  userAuthorized,
  requireProfileRead,
  profile_get_blocklist_spec,
  profile_get_blocklist,
)

profileRouter.post(
  "/blocklist/block",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_post_blocklist_block_spec,
  profile_post_blocklist_block,
)

profileRouter.delete(
  "/blocklist/unblock/:username",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_delete_blocklist_unblock_username_spec,
  profile_delete_blocklist_unblock_username,
)

// Account linking endpoints
profileRouter.get("/links", readRateLimit, userAuthorized, requireProfileRead, profile_get_links)

// Organizations endpoint
profileRouter.get(
  "/organizations",
  readRateLimit,
  userAuthorized,
  requireProfileRead,
  profile_get_organizations,
)

profileRouter.delete(
  "/links/:provider_type",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_delete_links_provider_type,
)

profileRouter.put(
  "/links/:provider_type/primary",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_put_links_provider_type_primary,
)

// Language endpoints
profileRouter.get(
  "/languages",
  userAuthorized,
  requireProfileRead,
  readRateLimit,
  profile_get_languages,
)

profileRouter.put(
  "/languages",
  userAuthorized,
  requireProfileWrite,
  writeRateLimit,
  profile_put_languages,
)

// Email management endpoints
import { emailManagementRoutes } from "../email/routes.js"
import { commonWriteRateLimit } from "../../../middleware/enhanced-ratelimiting.js"

// Add email address
// POST /api/v1/profile/email
profileRouter.post(
  "/email",
  userAuthorized,
  requireSessionAuth,
  emailManagementRoutes.add_email_spec,
  commonWriteRateLimit,
  emailManagementRoutes.addEmail,
)

// Update email address
// PATCH /api/v1/profile/email
profileRouter.patch(
  "/email",
  userAuthorized,
  requireSessionAuth,
  emailManagementRoutes.update_email_spec,
  commonWriteRateLimit,
  emailManagementRoutes.updateEmail,
)

// Remove email address
// DELETE /api/v1/profile/email
profileRouter.delete(
  "/email",
  userAuthorized,
  requireSessionAuth,
  emailManagementRoutes.delete_email_spec,
  commonWriteRateLimit,
  emailManagementRoutes.deleteEmail,
)

// Request verification email
// POST /api/v1/profile/email/verify
profileRouter.post(
  "/email/verify",
  userAuthorized,
  requireSessionAuth,
  emailManagementRoutes.request_verification_spec,
  commonWriteRateLimit,
  emailManagementRoutes.requestVerification,
)

// Verify email address (redirects to frontend)
// GET /api/v1/profile/email/verify/:token
profileRouter.get(
  "/email/verify/:token",
  emailManagementRoutes.verify_email_spec,
  emailManagementRoutes.verifyEmail,
)

// Update in-game status
// PATCH /api/v1/profile/in-game
profileRouter.patch(
  "/in-game",
  userAuthorized,
  requireTokenScopes("profile:write"),
  writeRateLimit,
  profile_patch_in_game_status,
)
