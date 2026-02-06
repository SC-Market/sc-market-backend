import express from "express"
import {
  writeRateLimit,
  readRateLimit,
} from "../../../middleware/enhanced-ratelimiting.js"

import {
  userAuthorized,
  requireRecruitingWrite,
} from "../../../middleware/auth.js"

import {
  contractorRecruiting,
  valid_recruiting_post,
  valid_recruiting_post_by_contractor,
} from "./middleware.js"

import {
  get_contractors_spectrum_id_posts,
  get_posts,
  get_posts_post_id,
  get_posts_post_id_comments,
  post_posts,
  post_posts_post_id_comment,
  post_posts_post_id_upvote,
  put_posts_post_id,
} from "./controller.js"

import {
  get_contractors_spectrum_id_posts_spec,
  get_posts_post_id_comments_spec,
  get_posts_post_id_spec,
  get_posts_spec,
  post_posts_spec,
} from "./openapi.js"

export const recruitingRouter = express.Router()

recruitingRouter.get("/posts", get_posts_spec, readRateLimit, get_posts)

recruitingRouter.post(
  "/posts",
  contractorRecruiting,
  requireRecruitingWrite,
  post_posts_spec,
  writeRateLimit,
  post_posts,
)

// TODO: Update doesn't need an ID we can just fetch default

recruitingRouter.get(
  "/posts/:post_id",
  valid_recruiting_post,
  get_posts_post_id_spec,
  readRateLimit,
  get_posts_post_id,
)

recruitingRouter.get(
  "/posts/:post_id/comments",
  valid_recruiting_post,
  get_posts_post_id_comments_spec,
  readRateLimit,
  get_posts_post_id_comments,
)

recruitingRouter.put(
  "/posts/:post_id",
  userAuthorized,
  requireRecruitingWrite,
  writeRateLimit,
  put_posts_post_id,
)

recruitingRouter.post(
  "/posts/:post_id/upvote",
  userAuthorized,
  requireRecruitingWrite,
  writeRateLimit,
  post_posts_post_id_upvote,
)

recruitingRouter.post(
  "/posts/:post_id/comment",
  userAuthorized,
  requireRecruitingWrite,
  writeRateLimit,
  post_posts_post_id_comment,
)

recruitingRouter.get(
  "/contractors/:spectrum_id/posts",
  valid_recruiting_post_by_contractor,
  get_contractors_spectrum_id_posts_spec,
  readRateLimit,
  get_contractors_spectrum_id_posts,
)
