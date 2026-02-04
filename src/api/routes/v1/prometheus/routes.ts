import express from "express"
import { adminAuthorized, requireScopes } from "../../../middleware/auth.js"
import { criticalRateLimit } from "../../../middleware/enhanced-ratelimiting.js"
import {
  prometheus_query,
  prometheus_query_range,
  prometheus_label_values,
  prometheus_series,
} from "./controller.js"

export const prometheusRouter = express.Router()

// Prometheus query API endpoints
// All Prometheus endpoints require admin authentication and admin:stats scope
prometheusRouter.get(
  "/query",
  adminAuthorized,
  requireScopes("admin:stats", "admin"),
  criticalRateLimit,
  prometheus_query,
)
prometheusRouter.get(
  "/query_range",
  adminAuthorized,
  requireScopes("admin:stats", "admin"),
  criticalRateLimit,
  prometheus_query_range,
)
prometheusRouter.post(
  "/query_range",
  adminAuthorized,
  requireScopes("admin:stats", "admin"),
  criticalRateLimit,
  prometheus_query_range,
)
prometheusRouter.get(
  "/label/:label_name/values",
  adminAuthorized,
  requireScopes("admin:stats", "admin"),
  criticalRateLimit,
  prometheus_label_values,
)
prometheusRouter.get(
  "/series",
  adminAuthorized,
  requireScopes("admin:stats", "admin"),
  criticalRateLimit,
  prometheus_series,
)
