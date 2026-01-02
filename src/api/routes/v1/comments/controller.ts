import { RequestHandler } from "express"
import * as commentDb from "./database.js"
import { formatComment } from "../util/formatting.js"
import { User } from "../api-models.js"
import {
  createErrorResponse,
  createResponse,
  createForbiddenErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"

export const post_comment_id_reply: RequestHandler = async function (req, res) {
  const comment_id = req.params["comment_id"]
  const comment = await commentDb.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid comment"))
    return
  }

  const {
    content,
  }: {
    content: string
  } = req.body

  const comments = await commentDb.insertComment({
    author: user.user_id,
    content,
    reply_to: comment.comment_id,
  })

  res.json(createResponse(await formatComment(comments[0])))
}

export const post_comment_id_delete: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await commentDb.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid comment"))
    return
  }

  if (comment.author !== user.user_id && user.role !== "admin") {
    res.status(403).json(createForbiddenErrorResponse("No permissions"))
    return
  }

  await commentDb.updateComments({ comment_id }, { deleted: true })
  res.json(createResponse({ message: "Success" }))
}

export const post_comment_id_update: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await commentDb.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid comment"))
    return
  }

  if (comment.author !== user.user_id && user.role !== "admin") {
    res.status(403).json(createForbiddenErrorResponse("No permissions"))
    return
  }

  const {
    content,
  }: {
    content: string
  } = req.body

  if (!content) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid argument"))
    return
  }

  await commentDb.updateComments({ comment_id }, { content })
  res.json(createResponse({ message: "Success" }))
}

export const post_comment_id_upvote: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await commentDb.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid comment"))
    return
  }

  const vote = await commentDb.getCommentVote({
    actor_id: user.user_id,
    comment_id,
  })
  await commentDb.removeCommentVote({ actor_id: user.user_id, comment_id })
  if (!vote || !vote.upvote) {
    await commentDb.addCommentVote({
      actor_id: user.user_id,
      comment_id,
      upvote: true,
    })
  }

  res.json(createResponse({ message: "Success" }))
}

export const post_comment_id_downvote: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await commentDb.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res
      .status(400)
      .json(createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid comment"))
    return
  }

  const vote = await commentDb.getCommentVote({
    actor_id: user.user_id,
    comment_id,
  })
  await commentDb.removeCommentVote({ actor_id: user.user_id, comment_id })
  if (!vote || vote.upvote) {
    await commentDb.addCommentVote({
      actor_id: user.user_id,
      comment_id,
      upvote: false,
    })
  }

  res.json(createResponse({ message: "Success" }))
}
