import { RequestHandler } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { formatComment } from "../util/formatting.js"
import { User } from "../api-models.js"

export const post_comment_id_reply: RequestHandler = async function (req, res) {
  const comment_id = req.params["comment_id"]
  const comment = await database.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res.status(400).json({ message: "Invalid comment" })
    return
  }

  const {
    content,
  }: {
    content: string
  } = req.body

  const comments = await database.insertComment({
    author: user.user_id,
    content,
    reply_to: comment.comment_id,
  })

  res.json(await formatComment(comments[0]))
}

export const post_comment_id_delete: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await database.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res.status(400).json({ message: "Invalid comment" })
    return
  }

  if (comment.author !== user.user_id && user.role !== "admin") {
    res.status(400).json({ message: "No permissions" })
    return
  }

  await database.updateComments({ comment_id }, { deleted: true })
  res.json({ message: "Success" })
}

export const post_comment_id_update: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await database.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res.status(400).json({ message: "Invalid comment" })
    return
  }

  if (comment.author !== user.user_id && user.role !== "admin") {
    res.status(400).json({ message: "No permissions" })
    return
  }

  const {
    content,
  }: {
    content: string
  } = req.body

  if (!content) {
    res.status(400).json({ message: "Invalid argument" })
    return
  }

  await database.updateComments({ comment_id }, { content })
  res.json({ message: "Success" })
}

export const post_comment_id_upvote: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await database.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res.status(400).json({ message: "Invalid comment" })
    return
  }

  const vote = await database.getCommentVote({
    actor_id: user.user_id,
    comment_id,
  })
  await database.removeCommentVote({ actor_id: user.user_id, comment_id })
  if (!vote || !vote.upvote) {
    await database.addCommentVote({
      actor_id: user.user_id,
      comment_id,
      upvote: true,
    })
  }

  res.json({ message: "Success" })
}

export const post_comment_id_downvote: RequestHandler = async function (
  req,
  res,
) {
  const comment_id = req.params["comment_id"]
  const comment = await database.getComment({ comment_id })
  const user = req.user as User

  if (!comment) {
    res.status(400).json({ message: "Invalid comment" })
    return
  }

  const vote = await database.getCommentVote({
    actor_id: user.user_id,
    comment_id,
  })
  await database.removeCommentVote({ actor_id: user.user_id, comment_id })
  if (!vote || vote.upvote) {
    await database.addCommentVote({
      actor_id: user.user_id,
      comment_id,
      upvote: false,
    })
  }

  res.json({ message: "Success" })
}
