import express from "express"
import { database } from "../../../../clients/database/knex-db.js"
import { User } from "../api-models.js"
import { formatComment } from "../util/formatting.js"
import { verifiedUser } from "../../../middleware/auth.js"
import { rate_limit } from "../../../middleware/ratelimiting.js"

export const commentRouter = express.Router()
// TODO: Use verifiedUser everywhere

commentRouter.post(
  "/:comment_id/reply",
  rate_limit(15),
  verifiedUser,
  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      return res.status(400).send({ message: "Invalid comment" })
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
  },
)

commentRouter.post(
  "/:comment_id/delete",
  verifiedUser,
  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      return res.status(400).send({ message: "Invalid comment" })
    }

    if (comment.author !== user.user_id && user.role !== "admin") {
      return res.status(400).send({ message: "No permissions" })
    }

    await database.updateComments({ comment_id }, { deleted: true })
    res.json({ message: "Success" })
  },
)

commentRouter.post(
  "/:comment_id/update",
  rate_limit(15),
  verifiedUser,
  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      return res.status(400).send({ message: "Invalid comment" })
    }

    if (comment.author !== user.user_id && user.role !== "admin") {
      return res.status(400).send({ message: "No permissions" })
    }

    const {
      content,
    }: {
      content: string
    } = req.body

    if (!content) {
      return res.status(400).send({ message: "Invalid argument" })
    }

    await database.updateComments({ comment_id }, { content })
    res.json({ message: "Success" })
  },
)

commentRouter.post(
  "/:comment_id/upvote",
  rate_limit(1),
  verifiedUser,
  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      return res.status(400).send({ message: "Invalid comment" })
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
  },
)

commentRouter.post(
  "/:comment_id/downvote",
  rate_limit(1),
  verifiedUser,
  async function (req, res) {
    const comment_id = req.params["comment_id"]
    const comment = await database.getComment({ comment_id })
    const user = req.user as User

    if (!comment) {
      return res.status(400).send({ message: "Invalid comment" })
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
  },
)
