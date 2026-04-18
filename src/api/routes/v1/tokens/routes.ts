import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import * as tokensController from "./controller.js"

import {
  tokens_post_root_spec,
  tokens_get_root_spec,
  tokens_get_tokenId_spec,
  tokens_put_tokenId_spec,
  tokens_delete_tokenId_spec,
  tokens_post_tokenId_extend_spec,
  tokens_get_tokenId_stats_spec,
  tokens_get_scopes_spec,
} from "./openapi.js"

export const tokensRouter = express.Router()

// Token management endpoints require session/JWT auth only (no token self-management)
const sessionOnly: express.RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith("Bearer scm_")) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "API tokens cannot manage other tokens. Use session auth." } })
    return
  }
  next()
}

// Get available scopes for current user (must be before /:tokenId)
tokensRouter.get(
  "/scopes",
  sessionOnly,
  userAuthorized,
  tokens_get_scopes_spec,
  readRateLimit,
  tokensController.getAvailableScopes,
)

// Create a new API token
tokensRouter.post(
  "/",
  sessionOnly,
  userAuthorized,
  tokens_post_root_spec,
  writeRateLimit,
  tokensController.createToken,
)

// List user's tokens
tokensRouter.get(
  "/",
  sessionOnly,
  userAuthorized,
  tokens_get_root_spec,
  readRateLimit,
  tokensController.listTokens,
)

// Get specific token details
tokensRouter.get(
  "/:tokenId",
  sessionOnly,
  userAuthorized,
  tokens_get_tokenId_spec,
  readRateLimit,
  tokensController.getToken,
)

// Update token (scopes, expiration, etc.)
tokensRouter.put(
  "/:tokenId",
  sessionOnly,
  userAuthorized,
  tokens_put_tokenId_spec,
  writeRateLimit,
  tokensController.updateToken,
)

// Revoke token
tokensRouter.delete(
  "/:tokenId",
  sessionOnly,
  userAuthorized,
  tokens_delete_tokenId_spec,
  writeRateLimit,
  tokensController.revokeToken,
)

// Extend token expiration
tokensRouter.post(
  "/:tokenId/extend",
  sessionOnly,
  userAuthorized,
  tokens_post_tokenId_extend_spec,
  writeRateLimit,
  tokensController.extendToken,
)

// Get token usage statistics
tokensRouter.get(
  "/:tokenId/stats",
  sessionOnly,
  userAuthorized,
  tokens_get_tokenId_stats_spec,
  readRateLimit,
  tokensController.getTokenStats,
)
