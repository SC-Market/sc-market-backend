import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"

import * as tokensController from "./controller.js"

import {
  tokens_post_root_spec,
  tokens_get_root_spec,
  tokens_get_tokenId_spec,
  tokens_put_tokenId_spec,
  tokens_delete_tokenId_spec,
  tokens_post_tokenId_extend_spec,
  tokens_get_tokenId_stats_spec,
} from "./openapi.js"

export const tokensRouter = express.Router()

// Create a new API token
tokensRouter.post(
  "/",
  userAuthorized,
  tokens_post_root_spec,
  tokensController.createToken,
)

// List user's tokens
tokensRouter.get(
  "/",
  userAuthorized,
  tokens_get_root_spec,
  tokensController.listTokens,
)

// Get specific token details
tokensRouter.get(
  "/:tokenId",
  userAuthorized,
  tokens_get_tokenId_spec,
  tokensController.getToken,
)

// Update token (scopes, expiration, etc.)
tokensRouter.put(
  "/:tokenId",
  userAuthorized,
  tokens_put_tokenId_spec,
  tokensController.updateToken,
)

// Revoke token
tokensRouter.delete(
  "/:tokenId",
  userAuthorized,
  tokens_delete_tokenId_spec,
  tokensController.revokeToken,
)

// Extend token expiration
tokensRouter.post(
  "/:tokenId/extend",
  userAuthorized,
  tokens_post_tokenId_extend_spec,
  tokensController.extendToken,
)

// Get token usage statistics
tokensRouter.get(
  "/:tokenId/stats",
  userAuthorized,
  tokens_get_tokenId_stats_spec,
  tokensController.getTokenStats,
)
