import { DBChat, DBMessage } from "../database/db-models.js"

import { deserialize as deserializeBSON } from "bson"
import { MessageBody, User } from "../../api/routes/v1/api-models.js"
import enableWS from "express-ws"
import { RawData, WebSocket } from "ws"
import { database } from "../database/knex-db.js"
import { cdn } from "../cdn/cdn.js"
import { is_related_to_order } from "../../api/routes/v1/orders/helpers.js"
import { sendUserChatMessage } from "../../api/routes/v1/util/discord.js"
import { createOrderMessageNotification } from "../../api/routes/v1/util/notifications.js"

// Observer Pattern
export interface MessagingPublisher {
  subscribe(target: MessagingSubscriber): void
  unsubscribe(target: MessagingSubscriber): void
  subscribeChat(chat_id: string, target: MessagingSubscriber): void
  unsubscribeChat(chat_id: string, target: MessagingSubscriber): void
}

export interface MessagingSubscriber {
  user: User

  receive(event: MessagingEvent): void
}

export class MessagingHandler {
  server: MessagingServer | null = null

  register(app: enableWS.Application) {
    this.server = new WebsocketServer(this, app)
  }

  async createMessage(
    body: MessageBody,
    options?: { fromDiscord?: boolean; systemMessage?: boolean },
  ): Promise<DBMessage> {
    if (!options) {
      options = {}
    }
    // Get the chat from the DB
    // Insert the message into the DB
    // Notify subscribers of the event
    if (!this.server) {
      throw Error("App has not been registered")
    }

    if (!body.content.length) {
      throw Error("Invalid content length!")
    }

    const chat = await database.getChat({ chat_id: body.chat_id })

    if (chat == null) {
      throw new Error("Invalid chat!")
    }

    const participants = await database.getChatParticipants({
      chat_id: chat!.chat_id,
    })

    let order = undefined
    if (chat.order_id) {
      order = await database.getOrder({ order_id: chat.order_id })
    }

    let author
    if (body.author) {
      author = await database.getUser({ user_id: body.author })
    }

    if (
      body.author &&
      author &&
      !(order && (await is_related_to_order(order, author))) &&
      !participants.includes(body.author)
    ) {
      throw Error("Not authorized")
    }

    const message = await database.insertMessage({
      content: body.content,
      author: body.author,
      chat_id: body.chat_id,
    })
    // for (let attachment of message.attachments) {
    //     // TODO: Do something with the attachments, insert them into the thing
    //     attachment.url = await cdn.upload(attachment.url)
    // }

    if (!options.fromDiscord) {
      if (order) {
        if (order.thread_id) {
          await sendUserChatMessage(order, author!, message.content)
        }
      }
    }

    if (!options.systemMessage && order) {
      await createOrderMessageNotification(order, message)
    }

    const event: MessagingEvent = {
      event: "create",
      chat: chat!,
      message: {
        ...message,
        author: {
          username: author!.username,
          avatar: await cdn.getFileLink(author!.avatar),
        },
      },
    }

    this.server.sendMessage(event)

    return message
  }

  async editMessage(message: DBMessage): Promise<void> {
    if (!this.server) {
      throw Error("App has not been registered")
    }

    const chat = await database.getChat({ chat_id: message.chat_id })

    if (chat == null) {
      throw new Error("Invalid chat!")
    }

    await database.updateMessage({ message_id: message.message_id }, message)
    const author = await database.getUser({ user_id: message.author })

    this.server.sendMessage({
      event: "create",
      chat: chat!,
      message: {
        ...message,
        author: {
          username: author!.username,
          avatar: await cdn.getFileLink(author!.avatar),
        },
      },
    })
  }

  async deleteMessage(message_id: string): Promise<void> {
    if (!this.server) {
      throw Error("App has not been registered")
    }

    const message = await database.getMessage({ message_id: message_id })
    const chat = await database.getChat({ chat_id: message!.chat_id })

    if (chat == null) {
      throw new Error("Invalid chat!")
    }

    await database.deleteMessage({ message_id: message_id })

    this.server.sendMessage({
      event: "delete",
      chat: chat!,
      message: {
        ...message!,
        author: {
          username: "placeholder",
          avatar: "placeholder",
        },
      },
    })
  }
}

export interface MessagingEvent {
  event: "create" | "edit" | "delete"
  message: {
    author: {
      username: string
      avatar: string
    }
    chat_id: string
    timestamp: Date
    content: string
    attachments: string[]
    message_id: string
  }
  chat: DBChat
}

type WebsocketMessage =
  | WebsocketMessageEvent
  | WebsocketSubscribeEvent
  | WebsocketUnsubscribeEvent

type WebsocketMessageEvent = {
  event: "send_message"
  content: string
  chat_id: string
}

type WebsocketSubscribeEvent = {
  event: "subscribe"
  chat_id: string
}

type WebsocketUnsubscribeEvent = {
  event: "unsubscribe"
  chat_id: string
}

interface Command {
  // Implements Command pattern
  execute(): Promise<void>
}

export class CreateMessageCommand implements Command {
  options: MessageBody
  handler: MessagingHandler

  constructor(handler: MessagingHandler, options: MessageBody) {
    this.handler = handler
    this.options = options
  }

  async execute() {
    await this.handler.createMessage(this.options)
  }
}

export class EditMessageCommand implements Command {
  options: DBMessage
  handler: MessagingHandler

  constructor(handler: MessagingHandler, options: DBMessage) {
    this.handler = handler
    this.options = options
  }

  async execute() {
    await this.handler.editMessage(this.options)
  }
}

export class DeleteMessageCommand implements Command {
  options: string
  handler: MessagingHandler

  constructor(handler: MessagingHandler, options: string) {
    this.handler = handler
    this.options = options
  }

  async execute() {
    await this.handler.deleteMessage(this.options)
  }
}

class WebsocketConnection implements MessagingSubscriber {
  ws!: WebSocket

  pingTimeout!: NodeJS.Timeout
  user: User
  handler!: MessagingHandler

  constructor(handler: MessagingHandler, ws: WebSocket, user: User) {
    this.ws = ws
    // this.pingTimeout = setTimeout(() => {
    //     ws.terminate();
    // }, 30000 + 1000);

    this.user = user
    this.handler = handler

    ws.on("message", async (message) => this.onMessageReceived(message))

    ws.send(JSON.stringify({ event: "welcome" }))
  }

  heartbeat() {
    clearTimeout(this.pingTimeout)

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    this.pingTimeout = setTimeout(() => {
      this.ws.terminate()
    }, 30000 + 1000)
  }

  async onMessageReceived(message: RawData | string): Promise<void> {
    try {
      if (
        !(message instanceof Buffer) &&
        !(message instanceof ArrayBuffer) &&
        !(typeof message === "string")
      ) {
        throw new TypeError(`Cannot handle type ${typeof message}`)
      }

      let content: WebsocketMessage
      if (typeof message === "string") {
        content = JSON.parse(message) as WebsocketMessage
      } else {
        content = deserializeBSON(new Uint8Array(message)) as WebsocketMessage
      }

      switch (content.event) {
        case "send_message": {
          break
        }
        case "subscribe": {
          break
        }
        case "unsubscribe": {
          break
        }
      }
    } catch (e) {
      console.error(e)
      this.ws.terminate()
    }
  }

  receive(event: MessagingEvent) {
    this.ws.send(
      JSON.stringify({
        message: event.message,
        chat_id: event.chat.chat_id,
        event: event.event,
      }),
    )
  }
}

interface MessagingServer {
  sendMessage(event: MessagingEvent): void
}

class WebsocketServer implements MessagingPublisher {
  app!: enableWS.Application
  subscribed!: MessagingSubscriber[]
  chatSubscriptions!: Map<string, MessagingSubscriber[]>
  handler: MessagingHandler

  constructor(handler: MessagingHandler, app: enableWS.Application) {
    this.subscribed = []
    this.handler = handler
    this.app = app

    console.log("register WS endpoint")

    this.app.ws("/ws", (ws: WebSocket, req) => {
      if (req.user) {
        const sub = new WebsocketConnection(this.handler, ws, req.user as User)
        this.subscribe(sub)
      } else {
        ws.terminate()
      }
    })
  }

  async sendMessage(event: MessagingEvent): Promise<void> {
    console.log(this.subscribed)
    const participants = await database.getChatParticipants({
      chat_id: event.chat!.chat_id,
    })
    this.subscribed.forEach((conn) => {
      if (conn.user && participants.includes(conn.user.user_id)) {
        conn.receive(event)
      }
    })
  }

  subscribe(target: MessagingSubscriber) {
    this.subscribed.push(target)
  }

  subscribeChat(chat_id: string, target: MessagingSubscriber): void {
    // TODO: Verify they have perms to see the chat
    let subs = this.chatSubscriptions.get(chat_id)
    if (!subs) {
      subs = []
      this.chatSubscriptions.set(chat_id, subs)
    }

    subs.push(target)
  }

  unsubscribe(target: MessagingSubscriber): void {
    this.subscribed.splice(this.subscribed.indexOf(target), 1)
  }

  unsubscribeChat(chat_id: string, target: MessagingSubscriber): void {
    const subs = this.chatSubscriptions.get(chat_id)
    if (subs) {
      const index = subs.indexOf(target)
      if (index > -1) {
        subs.splice(index, 1)
        if (!subs.length) {
          this.chatSubscriptions.delete(chat_id)
        }
      }
    }
  }
}

export const messagingHandler = new MessagingHandler()
