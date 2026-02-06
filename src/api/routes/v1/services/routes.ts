import express from "express"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"
import {
  userAuthorized,
  requireServicesRead,
  requireServicesWrite,
} from "../../../middleware/auth.js"

import { valid_contractor } from "../contractors/middleware.js"
import { multiplePhotoUpload } from "../util/upload.js"

import {
  services_post_root,
  services_get_user_username,
  services_get_public,
  services_get_contractor_spectrum_id,
  services_put_service_id,
  services_get_service_id,
  services_post_service_id_photos,
  services_post_service_id_view,
  services_get_seller_analytics,
} from "./controller.js"

import {
  services_post_root_spec,
  services_get_user_username_spec,
  services_get_public_spec,
  services_get_contractor_spectrum_id_spec,
  services_put_service_id_spec,
  services_get_service_id_spec,
  services_post_service_id_photos_spec,
  services_post_service_id_view_spec,
  services_get_seller_analytics_spec,
} from "./openapi.js"

export const servicesRouter = express.Router()

servicesRouter.post(
  "",
  userAuthorized,
  requireServicesWrite,
  writeRateLimit,
  services_post_root_spec,
  services_post_root,
)

servicesRouter.get(
  "/user/:username",
  services_get_user_username_spec,
  readRateLimit,
  services_get_user_username,
)

servicesRouter.get(
  "/public",
  services_get_public_spec,
  readRateLimit,
  services_get_public,
)

servicesRouter.get(
  "/contractor/:spectrum_id",
  userAuthorized,
  requireServicesRead,
  services_get_contractor_spectrum_id_spec,
  valid_contractor,
  readRateLimit,
  services_get_contractor_spectrum_id,
)

servicesRouter.put(
  "/:service_id",
  userAuthorized,
  requireServicesWrite,
  services_put_service_id_spec,
  writeRateLimit,
  services_put_service_id,
)

servicesRouter.get(
  "/:service_id",
  services_get_service_id_spec,
  readRateLimit,
  services_get_service_id,
)

// Upload photos for a service (multipart/form-data)
servicesRouter.post(
  "/:service_id/photos",
  userAuthorized,
  requireServicesWrite,
  multiplePhotoUpload.array("photos", 5),
  services_post_service_id_photos_spec,
  writeRateLimit,
  services_post_service_id_photos,
)

// Track a view on a service
servicesRouter.post(
  "/:service_id/view",
  services_post_service_id_view_spec,
  writeRateLimit,
  services_post_service_id_view,
)

// Get view analytics for a seller's services
servicesRouter.get(
  "/seller/analytics",
  userAuthorized,
  requireServicesRead,
  services_get_seller_analytics_spec,
  readRateLimit,
  services_get_seller_analytics,
)
