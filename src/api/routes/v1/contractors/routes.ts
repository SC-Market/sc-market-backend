import express from "express"
import {
  adminAuthorized,
  requireContractorAccessFromSpectrumId,
  requireContractorsRead,
  requireContractorsWrite,
  userAuthorized,
} from "../../../middleware/auth.js"

import {
  criticalRateLimit,
  writeRateLimit,
  readRateLimit,
  bulkRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import {
  org_authorized,
  org_permission,
  valid_contractor,
} from "./middleware.js"
import { singlePhotoUpload, photoUpload } from "../util/upload.js"
import { contractorAllocationsRouter } from "../market/stock-lots.routes.js"

import {
  delete_spectrum_id_blocklist_unblock_username,
  delete_spectrum_id,
  delete_spectrum_id_invites_invite_id,
  delete_spectrum_id_members_username,
  delete_spectrum_id_roles_role_id,
  delete_spectrum_id_roles_role_id_members_username,
  delete_spectrum_id_webhooks_webhook_id,
  get_invites_invite_id,
  get_root,
  get_search_query,
  get_spectrum_id,
  get_spectrum_id_audit_logs,
  get_spectrum_id_blocklist,
  get_spectrum_id_customers,
  get_spectrum_id_invites,
  get_spectrum_id_members,
  get_spectrum_id_members_csv,
  get_spectrum_id_members_search_query,
  get_spectrum_id_members_username,
  get_spectrum_id_reviews,
  get_spectrum_id_settings_discord,
  get_spectrum_id_webhooks,
  post_admin_express_verify,
  post_auth_link,
  post_invites_invite_id_accept,
  post_root,
  post_spectrum_id_accept,
  post_spectrum_id_blocklist_block,
  post_spectrum_id_decline,
  post_spectrum_id_invites,
  post_spectrum_id_leave,
  post_spectrum_id_members,
  post_spectrum_id_refetch,
  post_spectrum_id_roles,
  post_spectrum_id_roles_role_id_members_username,
  post_spectrum_id_settings_discord_use_official,
  post_spectrum_id_transfer_ownership,
  post_spectrum_id_webhooks,
  contractors_post_spectrum_id_avatar,
  contractors_post_spectrum_id_banner,
  put_spectrum_id,
  put_spectrum_id_roles_role_id,
  get_spectrum_id_languages,
  put_spectrum_id_languages,
} from "./controller.js"

import {
  delete_spectrum_id_blocklist_unblock_username_spec,
  delete_spectrum_id_spec,
  delete_spectrum_id_invites_invite_id_spec,
  delete_spectrum_id_members_username_spec,
  delete_spectrum_id_roles_role_id_members_username_spec,
  delete_spectrum_id_roles_role_id_spec,
  delete_spectrum_id_webhooks_webhook_id_spec,
  get_invites_invite_id_spec,
  get_root_spec,
  get_search_query_spec,
  get_spectrum_id_audit_logs_spec,
  get_spectrum_id_blocklist_spec,
  get_spectrum_id_customers_spec,
  get_spectrum_id_invites_spec,
  get_spectrum_id_members_csv_spec,
  get_spectrum_id_members_search_query_spec,
  get_spectrum_id_members_spec,
  get_spectrum_id_members_username_spec,
  get_spectrum_id_reviews_spec,
  get_spectrum_id_settings_discord_spec,
  get_spectrum_id_spec,
  get_spectrum_id_webhooks_spec,
  post_auth_link_spec,
  post_invites_invite_id_accept_spec,
  post_root_spec,
  post_spectrum_id_accept_spec,
  post_spectrum_id_blocklist_block_spec,
  post_spectrum_id_decline_spec,
  post_spectrum_id_invites_spec,
  post_spectrum_id_leave_spec,
  post_spectrum_id_members_spec,
  post_spectrum_id_roles_role_id_members_username_spec,
  post_spectrum_id_roles_spec,
  post_spectrum_id_settings_discord_use_official_spec,
  post_spectrum_id_transfer_ownership_spec,
  post_spectrum_id_webhooks_spec,
  contractors_post_spectrum_id_avatar_spec,
  contractors_post_spectrum_id_banner_spec,
  put_spectrum_id_roles_role_id_spec,
  put_spectrum_id_spec,
} from "./openapi.js"

export const contractorsRouter = express.Router()

contractorsRouter.post(
  "/auth/link",
  userAuthorized,
  requireContractorsWrite,
  post_auth_link_spec,
  criticalRateLimit,
  post_auth_link,
)

contractorsRouter.post(
  "/",
  userAuthorized,
  requireContractorsWrite,
  post_root_spec,
  criticalRateLimit,
  post_root,
)

contractorsRouter.get(
  "/search/:query",
  userAuthorized,
  requireContractorsRead,
  get_search_query_spec,
  readRateLimit,
  get_search_query,
)

contractorsRouter.get(
  "/invites/:invite_id",
  userAuthorized,
  requireContractorsRead,
  get_invites_invite_id_spec,
  readRateLimit,
  get_invites_invite_id,
)

contractorsRouter.post(
  "/invites/:invite_id/accept",
  userAuthorized,
  requireContractorsWrite,
  post_invites_invite_id_accept_spec,
  criticalRateLimit,
  post_invites_invite_id_accept,
)

contractorsRouter.get(
  "/:spectrum_id/members/search/:query",
  userAuthorized,
  requireContractorsRead,
  get_spectrum_id_members_search_query_spec,
  readRateLimit,
  valid_contractor,
  requireContractorAccessFromSpectrumId(),
  get_spectrum_id_members_search_query,
)

contractorsRouter.get(
  "/:spectrum_id/members/csv",
  userAuthorized,
  requireContractorsRead,
  get_spectrum_id_members_csv_spec,
  bulkRateLimit,
  valid_contractor,
  requireContractorAccessFromSpectrumId(),
  get_spectrum_id_members_csv,
)

contractorsRouter.get(
  "/:spectrum_id/customers",
  userAuthorized,
  requireContractorsRead,
  get_spectrum_id_customers_spec,
  readRateLimit,
  valid_contractor,
  get_spectrum_id_customers,
)

contractorsRouter.get(
  "/:spectrum_id/reviews",
  valid_contractor,
  get_spectrum_id_reviews_spec,
  readRateLimit,
  get_spectrum_id_reviews,
)

contractorsRouter.get(
  "/:spectrum_id/audit-logs",
  userAuthorized,
  requireContractorsRead,
  get_spectrum_id_audit_logs_spec,
  readRateLimit,
  valid_contractor,
  requireContractorAccessFromSpectrumId(),
  get_spectrum_id_audit_logs,
)

contractorsRouter.get(
  "/:spectrum_id",
  get_spectrum_id_spec,
  valid_contractor,
  readRateLimit,
  get_spectrum_id,
)

contractorsRouter.delete(
  "/:spectrum_id",
  userAuthorized,
  requireContractorsWrite,
  delete_spectrum_id_spec,
  criticalRateLimit,
  valid_contractor,
  requireContractorAccessFromSpectrumId(),
  delete_spectrum_id,
)

contractorsRouter.get(
  "/:spectrum_id/members/:username",
  get_spectrum_id_members_username_spec,
  valid_contractor,
  readRateLimit,
  get_spectrum_id_members_username,
)

contractorsRouter.get(
  "/:spectrum_id/members",
  get_spectrum_id_members_spec,
  valid_contractor,
  readRateLimit,
  get_spectrum_id_members,
)

contractorsRouter.post(
  "/:spectrum_id/roles",
  userAuthorized,
  requireContractorsWrite,
  post_spectrum_id_roles_spec,
  org_permission("manage_roles"),
  writeRateLimit,
  post_spectrum_id_roles,
)

contractorsRouter.put(
  "/:spectrum_id/roles/:role_id",
  userAuthorized,
  requireContractorsWrite,
  put_spectrum_id_roles_role_id_spec,
  org_permission("manage_roles"),
  writeRateLimit,
  put_spectrum_id_roles_role_id,
)

contractorsRouter.delete(
  "/:spectrum_id/roles/:role_id",
  userAuthorized,
  requireContractorsWrite,
  delete_spectrum_id_roles_role_id_spec,
  org_permission("manage_roles"),
  writeRateLimit,
  delete_spectrum_id_roles_role_id,
)

contractorsRouter.post(
  "/:spectrum_id/roles/:role_id/members/:username",
  userAuthorized,
  requireContractorsWrite,
  post_spectrum_id_roles_role_id_members_username_spec,
  org_permission("manage_roles"),
  writeRateLimit,
  post_spectrum_id_roles_role_id_members_username,
)

contractorsRouter.delete(
  "/:spectrum_id/roles/:role_id/members/:username",
  userAuthorized,
  requireContractorsWrite,
  delete_spectrum_id_roles_role_id_members_username_spec,
  org_permission("manage_roles"),
  writeRateLimit,
  delete_spectrum_id_roles_role_id_members_username,
)

contractorsRouter.delete(
  "/:spectrum_id/members/:username",
  userAuthorized,
  requireContractorsWrite,
  delete_spectrum_id_members_username_spec,
  org_permission("kick_members"),
  writeRateLimit,
  delete_spectrum_id_members_username,
)

contractorsRouter.post(
  "/:spectrum_id/transfer-ownership",
  userAuthorized,
  requireContractorsWrite,
  post_spectrum_id_transfer_ownership_spec,
  org_authorized,
  writeRateLimit,
  post_spectrum_id_transfer_ownership,
)

contractorsRouter.put(
  "/:spectrum_id",
  userAuthorized,
  requireContractorsWrite,
  put_spectrum_id_spec,
  org_permission("manage_org_details"),
  writeRateLimit,
  put_spectrum_id,
)

// Language endpoints
contractorsRouter.get(
  "/:spectrum_id/languages",
  userAuthorized,
  valid_contractor,
  readRateLimit,
  get_spectrum_id_languages,
)

contractorsRouter.put(
  "/:spectrum_id/languages",
  userAuthorized,
  valid_contractor,
  org_permission("manage_org_details"),
  writeRateLimit,
  put_spectrum_id_languages,
)

contractorsRouter.post(
  "/:spectrum_id/avatar",
  userAuthorized,
  requireContractorsWrite,
  valid_contractor,
  org_permission("manage_org_details"),
  singlePhotoUpload.single("avatar"),
  contractors_post_spectrum_id_avatar_spec,
  writeRateLimit,
  contractors_post_spectrum_id_avatar,
)

contractorsRouter.post(
  "/:spectrum_id/banner",
  userAuthorized,
  requireContractorsWrite,
  valid_contractor,
  org_permission("manage_org_details"),
  photoUpload.single("banner"),
  contractors_post_spectrum_id_banner_spec,
  writeRateLimit,
  contractors_post_spectrum_id_banner,
)

contractorsRouter.post(
  "/:spectrum_id/webhooks",
  userAuthorized,
  requireContractorsWrite,
  post_spectrum_id_webhooks_spec,
  org_permission("manage_webhooks"),
  writeRateLimit,
  post_spectrum_id_webhooks,
)

contractorsRouter.delete(
  "/:spectrum_id/webhooks/:webhook_id",
  userAuthorized,
  requireContractorsWrite,
  delete_spectrum_id_webhooks_webhook_id_spec,
  org_permission("manage_webhooks"),
  writeRateLimit,
  delete_spectrum_id_webhooks_webhook_id,
)

contractorsRouter.get(
  "/:spectrum_id/webhooks",
  userAuthorized,
  requireContractorsRead,
  get_spectrum_id_webhooks_spec,
  org_permission("manage_webhooks"),
  readRateLimit,
  get_spectrum_id_webhooks,
)

contractorsRouter.post(
  "/:spectrum_id/invites",
  userAuthorized,
  requireContractorsWrite,
  post_spectrum_id_invites_spec,
  org_permission("manage_invites"),
  writeRateLimit,
  post_spectrum_id_invites,
)

contractorsRouter.delete(
  "/:spectrum_id/invites/:invite_id",
  userAuthorized,
  requireContractorsWrite,
  delete_spectrum_id_invites_invite_id_spec,
  org_permission("manage_invites"),
  writeRateLimit,
  delete_spectrum_id_invites_invite_id,
)

contractorsRouter.get(
  "/:spectrum_id/invites",
  userAuthorized,
  requireContractorsRead,
  get_spectrum_id_invites_spec,
  org_permission("manage_invites"),
  readRateLimit,
  get_spectrum_id_invites,
)

contractorsRouter.post(
  "/:spectrum_id/members",
  userAuthorized,
  requireContractorsWrite,
  post_spectrum_id_members_spec,
  org_permission("manage_invites"),
  writeRateLimit,
  post_spectrum_id_members,
)

contractorsRouter.post(
  "/:spectrum_id/refetch",
  adminAuthorized,
  bulkRateLimit,
  post_spectrum_id_refetch,
)

contractorsRouter.post(
  "/:spectrum_id/accept",
  post_spectrum_id_accept_spec,
  userAuthorized,
  valid_contractor,
  criticalRateLimit,
  post_spectrum_id_accept,
)

contractorsRouter.post(
  "/:spectrum_id/decline",
  post_spectrum_id_decline_spec,
  userAuthorized,
  valid_contractor,
  criticalRateLimit,
  post_spectrum_id_decline,
)

contractorsRouter.post(
  "/admin/express_verify",
  adminAuthorized,
  bulkRateLimit,
  post_admin_express_verify,
)

contractorsRouter.get("", get_root_spec, readRateLimit, get_root)

contractorsRouter.get(
  "/:spectrum_id/settings/discord",
  get_spectrum_id_settings_discord_spec,
  userAuthorized,
  org_permission("manage_webhooks"),
  readRateLimit,
  get_spectrum_id_settings_discord,
)

contractorsRouter.post(
  "/:spectrum_id/settings/discord/use_official",
  post_spectrum_id_settings_discord_use_official_spec,
  userAuthorized,
  org_permission("manage_webhooks"),
  writeRateLimit,
  post_spectrum_id_settings_discord_use_official,
)

contractorsRouter.post(
  "/:spectrum_id/leave",
  post_spectrum_id_leave_spec,
  org_authorized,
  writeRateLimit,
  post_spectrum_id_leave,
)

// Organization blocklist endpoints
contractorsRouter.get(
  "/:spectrum_id/blocklist",
  org_authorized,
  org_permission("manage_blocklist"),
  get_spectrum_id_blocklist_spec,
  readRateLimit,
  get_spectrum_id_blocklist,
)

contractorsRouter.post(
  "/:spectrum_id/blocklist/block",
  org_authorized,
  org_permission("manage_blocklist"),
  post_spectrum_id_blocklist_block_spec,
  criticalRateLimit,
  post_spectrum_id_blocklist_block,
)

contractorsRouter.delete(
  "/:spectrum_id/blocklist/unblock/:username",
  org_authorized,
  org_permission("manage_blocklist"),
  delete_spectrum_id_blocklist_unblock_username_spec,
  criticalRateLimit,
  delete_spectrum_id_blocklist_unblock_username,
)

contractorsRouter.use("/", contractorAllocationsRouter)
