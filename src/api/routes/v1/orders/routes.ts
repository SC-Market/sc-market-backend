import express from "express"
import {
  userAuthorized,
  requireOrdersRead,
  requireOrdersWrite,
} from "../../../middleware/auth.js"
import {
  post_order_review,
  requestReviewRevision,
  updateOrderReview,
} from "./reviews.js"
import { getUserOrderDataController } from "./user-data.js"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import { related_to_order } from "./middleware.js"
import { validate_optional_username } from "../profiles/middleware.js"
import {
  validate_optional_spectrum_id,
  org_authorized,
} from "../contractors/middleware.js"
import orderSettingsRouter from "./order-settings.js"
import { allocationRouter } from "../market/stock-lots.routes.js"
import {
  accept_contractor_applicant,
  accept_user_applicant,
  apply_to_order,
  get_contractor_order_data,
  get_order_metrics,
  search_orders,
  update_order,
  post_root,
  get_order_id,
  post_order_id_thread,
} from "./controller.js"

import {
  post_root_spec,
  get_search_spec,
  get_contractor_spectrum_id_metrics_spec,
  get_contractor_spectrum_id_data_spec,
  get_user_data_spec,
  post_order_id_review_spec,
  post_order_id_reviews_review_id_request_revision_spec,
  put_order_id_reviews_review_id_spec,
  put_order_id_spec,
  post_order_id_applicants_spec,
  post_order_id_applicants_contractors_spectrum_id_spec,
  post_order_id_applicants_users_username_spec,
  get_order_id_spec,
  post_order_id_thread_spec,
} from "./openapi.js"

export const ordersRouter = express.Router()

// Mount order settings routes
ordersRouter.use("/", orderSettingsRouter)

// Mount allocation routes
ordersRouter.use("/", allocationRouter)

ordersRouter.post(
  "/",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  post_root_spec,
  post_root,
)

ordersRouter.get(
  "/search",
  userAuthorized,
  requireOrdersRead,
  readRateLimit,
  get_search_spec,
  validate_optional_username("customer"),
  validate_optional_username("assigned"),
  validate_optional_spectrum_id("contractor"),
  search_orders,
)

ordersRouter.get(
  "/contractor/:spectrum_id/metrics",
  userAuthorized,
  requireOrdersRead,
  readRateLimit,
  get_contractor_spectrum_id_metrics_spec,
  get_order_metrics,
)

ordersRouter.get(
  "/contractor/:spectrum_id/data",
  userAuthorized,
  requireOrdersRead,
  readRateLimit,
  get_contractor_spectrum_id_data_spec,
  org_authorized,
  get_contractor_order_data,
)

ordersRouter.get(
  "/user/data",
  userAuthorized,
  requireOrdersRead,
  readRateLimit,
  get_user_data_spec,
  getUserOrderDataController,
)

ordersRouter.post(
  "/:order_id/review",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  post_order_id_review_spec,
  post_order_review,
)

ordersRouter.post(
  "/:order_id/reviews/:review_id/request-revision",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  post_order_id_reviews_review_id_request_revision_spec,
  requestReviewRevision,
)

ordersRouter.put(
  "/:order_id/reviews/:review_id",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  put_order_id_reviews_review_id_spec,
  updateOrderReview,
)

ordersRouter.put(
  "/:order_id",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  put_order_id_spec,
  related_to_order,
  update_order,
)

ordersRouter.post(
  "/:order_id/applicants",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  post_order_id_applicants_spec,
  apply_to_order,
)

ordersRouter.post(
  "/:order_id/applicants/contractors/:spectrum_id",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  related_to_order,
  post_order_id_applicants_contractors_spectrum_id_spec,
  accept_contractor_applicant,
) // TODO

ordersRouter.post(
  "/:order_id/applicants/users/:username",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  post_order_id_applicants_users_username_spec,
  related_to_order,
  accept_user_applicant,
)

ordersRouter.get(
  "/:order_id",
  userAuthorized,
  requireOrdersRead,
  readRateLimit,
  get_order_id_spec,
  get_order_id,
)

ordersRouter.post(
  "/:order_id/thread",
  userAuthorized,
  requireOrdersWrite,
  writeRateLimit,
  post_order_id_thread_spec,
  related_to_order,
  post_order_id_thread,
)
