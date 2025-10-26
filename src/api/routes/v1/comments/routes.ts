import express from "express"
import { requireCommentsWrite, verifiedUser } from "../../../middleware/auth.js"
import { rate_limit } from "../../../middleware/ratelimiting.js"

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
  rate_limit(15),
  requireCommentsWrite,
  post_comment_id_reply,
)

commentRouter.post(
  "/:comment_id/delete",
  verifiedUser,
  post_comment_id_delete_spec,
  post_comment_id_delete,
)

commentRouter.post(
  "/:comment_id/update",
  verifiedUser,
  post_comment_id_update_spec,
  rate_limit(15),
  post_comment_id_update,
)

commentRouter.post(
  "/:comment_id/upvote",
  verifiedUser,
  post_comment_id_upvote_spec,
  rate_limit(1),
  post_comment_id_upvote,
)

commentRouter.post(
  "/:comment_id/downvote",
  verifiedUser,
  post_comment_id_downvote_spec,
  rate_limit(1),
  post_comment_id_downvote,
)
