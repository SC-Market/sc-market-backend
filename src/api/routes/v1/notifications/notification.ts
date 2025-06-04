import express from "express"
import { userAuthorized } from "../../../middleware/auth.js"
import { User } from "../api-models.js"
import { database } from "../../../../clients/database/knex-db.js"

export const notificationRouter = express.Router()

notificationRouter.post("/update", userAuthorized, async (req, res, next) => {
  const user = req.user as User

  const values = req.body as { read: boolean; notification_id: string }[]

  for (const { notification_id, read } of values) {
    if (!notification_id || !read) {
      res.status(400).json({ error: "Invalid formatting" })
      return
    }

    const notifications = await database.getNotifications({
      notifier_id: user.user_id,
      notification_id,
    })

    if (!notifications.length) {
      res.status(400).json({ error: "Invalid notification" })
      return
    }

    await database.updateNotifications(
      { notifier_id: user.user_id, notification_id },
      { read: read },
    )
  }

  res.json({ status: "Success" })
})

notificationRouter.post("/delete", userAuthorized, async (req, res, next) => {
  const user = req.user as User
  const values = req.body as string[]
  for (const notification_id of values) {
    const notifications = await database.getNotifications({
      notifier_id: user.user_id,
      notification_id,
    })

    if (!notification_id) {
      res.status(400).json({ error: "Invalid formatting" })
      return
    }

    if (!notifications.length) {
      res.status(400).json({ error: "Invalid notification" })
      return
    }

    await database.deleteNotifications({
      notifier_id: user.user_id,
      notification_id,
    })
  }

  res.json({ status: "Success" })
})
notificationRouter.get("", userAuthorized, async (req, res, next) => {
  const user = req.user as User

  res.json(await database.getCompleteNotificationsByUser(user.user_id))
})
