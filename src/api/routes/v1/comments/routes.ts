import express from "express"
import { requireCommentsWrite, verifiedUser } from "../../../middleware/auth.js"
import { writeRateLimit } from "../../../middleware/enhanced-ratelimiting.js"

import {
  post_comment_id_reply,
  post_comment_id_delete,
  post_comment_id_update,
  post_comment_id_upvote,
  post_comment_id_downvote,
} from "./controller.js"

import {
  post_comment_id_reply_spec,
  post_comment_id_delete_spec,
  post_comment_id_update_spec,
  post_comment_id_upvote_spec,
  post_comment_id_downvote_spec,
} from "./openapi.js"

export const commentRouter = express.Router()

// TODO: Use verifiedUser everywhere

commentRouter.post(
  "/:comment_id/reply",
  verifiedUser,
  post_comment_id_reply_spec,
  writeRateLimit,
  requireCommentsWrite,
  post_comment_id_reply,
)

commentRouter.post(
  "/:comment_id/delete",
  verifiedUser,
  post_comment_id_delete_spec,
  writeRateLimit,
  post_comment_id_delete,
)

commentRouter.post(
  "/:comment_id/update",
  verifiedUser,
  post_comment_id_update_spec,
  writeRateLimit,
  post_comment_id_update,
)

commentRouter.post(
  "/:comment_id/upvote",
  verifiedUser,
  post_comment_id_upvote_spec,
  writeRateLimit,
  post_comment_id_upvote,
)

commentRouter.post(
  "/:comment_id/downvote",
  verifiedUser,
  post_comment_id_downvote_spec,
  writeRateLimit,
  post_comment_id_downvote,
)
