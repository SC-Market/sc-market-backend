import Envoy from "@envoy-js/express"
import { MessageBody, User } from "../../api/routes/v1/api-models.js"
import { Server as htserver } from "http"

class EnvoyManager {
  httpServer!: htserver
  envoy!: Envoy<
    User | { user_id: null },
    { chat_id: string },
    MessageBody & { author: string | null }
  >
  subscribers!: Map<string, Set<string>>

  constructor() {
    this.subscribers = new Map()
  }

  register(server: htserver, origins: string[]) {
    this.httpServer = server
    this.envoy = new Envoy(
      {
        userKey: "user_id" as const,
        serverOptions: {
          path: "/ws",
          cors: {
            credentials: true,
            origin: origins,
          },
        },
      },
      server,
    )

    this.envoy.deserializeUser((req, res, next) => {
      // Retrieve a User object from database given an ID
      // @ts-ignore
      return req.user as User
    })

    this.envoy.deserializeMessage((socket, partialMessage) => {
      return partialMessage
    })

    this.envoy.joinRoom((room, user) => {
      if (!user.user_id) {
        return
      }

      let subs = this.subscribers.get(room.chat_id)
      if (!subs) {
        subs = new Set()
        this.subscribers.set(room.chat_id, subs)
      }

      subs.add(user.user_id)
    })

    this.envoy.leaveRoom((room, user) => {
      if (!user.user_id) {
        return
      }

      const subs = this.subscribers.get(room.chat_id)
      if (subs) {
        if (subs.has(user.user_id)) {
          subs.delete(user.user_id)
          if (!subs.size) {
            this.subscribers.delete(user.user_id)
          }
        }
      }
    })

    this.envoy.getUsersInRoom((message) => {
      const subs = this.subscribers.get(message.chat_id)
      return Array.from(subs || []).map((s) => ({ user_id: s }) as User)
    })
  }

  initialize() {
    this.envoy.initialize()
  }
}

export const envoyManager = new EnvoyManager()
