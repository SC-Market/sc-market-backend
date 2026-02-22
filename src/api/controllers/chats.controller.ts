/**
 * Chats Controller
 *
 * TSOA controller for chat management endpoints.
 * This controller handles chat retrieval and message sending.
 *
 * Migration Status: Phase 4 - Authentication-heavy endpoints
 * - GET /api/chats (get user's chats)
 * - GET /api/chats/:chat_id (get chat by ID)
 * - GET /api/chats/orders/:order_id (get chat by order ID)
 * - GET /api/chats/offers/:session_id (get chat by offer session ID)
 * - POST /api/chats/:chat_id/messages (send message)
 * - POST /api/chats (create chat)
 *
 * @tags Chats
 */

import {
  Controller,
  Get,
  Post,
  Path,
  Body,
  Route,
  Response,
  Tags,
  Request,
  Middlewares,
  Security,
} from "tsoa"
import { Request as ExpressRequest } from "express"
import {
  BaseController,
  NotFoundError,
  ValidationErrorClass,
  ForbiddenError,
  ConflictError,
} from "./base.controller.js"
import {
  Chat,
  ChatResponse,
  ChatsListResponse,
  ChatSuccessResponse,
  SendMessagePayload,
  CreateChatPayload,
  ChatParticipant,
} from "../models/chats.models.js"
import {
  ErrorResponse,
  Unauthorized,
  Forbidden,
  NotFound,
  Conflict,
} from "../models/common.models.js"
import {
  tsoaReadRateLimit,
  tsoaWriteRateLimit,
} from "../middleware/tsoa-ratelimit.js"
import * as chatDb from "../routes/v1/chats/database.js"
import * as profileDb from "../routes/v1/profiles/database.js"
import * as contractorDb from "../routes/v1/contractors/database.js"
import * as orderDb from "../routes/v1/orders/database.js"
import * as offerDb from "../routes/v1/offers/database.js"
import { cdn } from "../../clients/cdn/cdn.js"
import { discordService } from "../../services/discord/discord.service.js"
import { notificationService } from "../../services/notifications/notification.service.js"
import { chatServer } from "../../clients/messaging/websocket.js"
import { serializeMessage } from "../routes/v1/chats/serializers.js"
import { eqSet } from "../routes/v1/chats/helpers.js"
import { User } from "../routes/v1/api-models.js"
import { DBChat } from "../../clients/database/db-models.js"

/**
 * Controller for managing chats
 */
@Route("api/chats")
@Tags("Chats")
export class ChatsController extends BaseController {
  /**
   * Get user's chats
   *
   * Retrieves all chats for the authenticated user.
   * Includes the most recent message for each chat.
   *
   * @summary Get user's chats
   * @param request Express request
   * @returns List of user's chats
   */
  @Get("")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getChats(
    @Request() request: ExpressRequest,
  ): Promise<ChatsListResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "chats:read")) {
          throw new ForbiddenError(
            "Insufficient permissions: chats:read scope required",
          )
        }
      }

      const chats = await chatDb.getChatByParticipant(user.user_id)
      const formattedChats = await Promise.all(
        chats.map(async (chat) => {
          const participants = await chatDb.getChatParticipants({
            chat_id: chat!.chat_id,
          })
          const mostRecent = await chatDb.getMostRecentMessage({
            chat_id: chat.chat_id,
          })

          // Get order/offer information and contractor if chat is attached to order or offer
          let chatTitle: string | null = null
          let contractorParticipant: ChatParticipant | null = null

          if (chat.order_id) {
            try {
              const order = await orderDb.getOrder({ order_id: chat.order_id })
              chatTitle = order.title
              if (order.contractor_id) {
                const contractor = await contractorDb.getMinimalContractor({
                  contractor_id: order.contractor_id,
                })
                contractorParticipant = {
                  type: "contractor",
                  name: contractor.name,
                  avatar: contractor.avatar,
                  spectrum_id: contractor.spectrum_id,
                }
              }
            } catch (error) {
              this.logWarning(
                "getChats",
                `Failed to get order for chat: ${chat.order_id}`,
                { error },
              )
            }
          } else if (chat.session_id) {
            try {
              const sessions = await offerDb.getOfferSessions({
                id: chat.session_id,
              })
              const session = sessions[0]
              if (session) {
                try {
                  const mostRecentOffer =
                    await offerDb.getMostRecentOrderOffer(session.id)
                  chatTitle = mostRecentOffer.title
                } catch (error) {
                  this.logWarning(
                    "getChats",
                    `Failed to get most recent offer for session ${session.id}`,
                    { error },
                  )
                }
                if (session.contractor_id) {
                  const contractor = await contractorDb.getMinimalContractor({
                    contractor_id: session.contractor_id,
                  })
                  contractorParticipant = {
                    type: "contractor",
                    name: contractor.name,
                    avatar: contractor.avatar,
                    spectrum_id: contractor.spectrum_id,
                  }
                }
              }
            } catch (error) {
              this.logWarning(
                "getChats",
                `Failed to get offer session for chat: ${chat.session_id}`,
                { error },
              )
            }
          }

          // Get participant info
          const participantInfo = await Promise.all(
            participants.map(async (user_id) => {
              try {
                const u = await profileDb.getUser({ user_id: user_id })
                return {
                  type: "user" as const,
                  username: u.username,
                  avatar: await cdn.getFileLinkResource(u.avatar),
                }
              } catch (error) {
                this.logError(
                  "getChats",
                  `User not found for participant ${user_id} in chat ${chat.chat_id}`,
                  { error },
                )
                return null
              }
            }),
          )

          // Filter out null participants
          const validUserParticipants = participantInfo.filter(
            (p) => p !== null,
          ) as ChatParticipant[]

          // Combine user and contractor participants
          const allParticipants = contractorParticipant
            ? [...validUserParticipants, contractorParticipant]
            : validUserParticipants

          // Get most recent message author
          let messageAuthor: string | null = null
          if (
            mostRecent &&
            mostRecent.author !== null &&
            mostRecent.author !== undefined
          ) {
            try {
              const authorUser = await profileDb.getUser({
                user_id: mostRecent.author,
              })
              messageAuthor = authorUser.username
            } catch (error) {
              this.logError(
                "getChats",
                `Author not found for message ${mostRecent.message_id}, author: ${mostRecent.author}`,
                { error },
              )
              messageAuthor = null
            }
          }

          return {
            chat_id: chat.chat_id,
            participants: allParticipants,
            messages: mostRecent
              ? [
                  {
                    author: messageAuthor,
                    content: mostRecent.content,
                    timestamp: mostRecent.timestamp,
                  },
                ]
              : [],
            order_id: chat.order_id,
            session_id: chat.session_id,
            title: chatTitle,
          }
        }),
      )

      return this.success(formattedChats)
    } catch (error) {
      this.logError("getChats", error)
      this.handleError(error, "getChats")
    }
  }

  /**
   * Get chat by ID
   *
   * Retrieves detailed information about a specific chat.
   * Requires authentication and authorization to view the chat.
   *
   * @summary Get chat by ID
   * @param request Express request
   * @param chat_id Chat ID
   * @returns Chat details
   */
  @Get("{chat_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getChatById(
    @Request() request: ExpressRequest,
    @Path() chat_id: string,
  ): Promise<ChatResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "chats:read")) {
          throw new ForbiddenError(
            "Insufficient permissions: chats:read scope required",
          )
        }
      }

      // Get chat
      let chat: DBChat
      try {
        chat = await chatDb.getChat({ chat_id })
      } catch (error) {
        throw new NotFoundError("Chat not found")
      }

      // Check if user is a participant
      const participants = await chatDb.getChatParticipants({ chat_id })
      if (!participants.includes(user.user_id)) {
        throw new ForbiddenError("You are not authorized to view this chat")
      }

      // Get messages
      const msg_entries = await chatDb.getMessages({ chat_id })
      const messages = await Promise.all(
        msg_entries.map(async (msg) => {
          if (msg.author) {
            const authorUser = await profileDb.getUser({ user_id: msg.author })
            return {
              author: authorUser.username,
              content: msg.content,
              timestamp: msg.timestamp,
            }
          } else {
            return {
              author: null,
              content: msg.content,
              timestamp: msg.timestamp,
            }
          }
        }),
      )

      // Get order/offer information and contractor if chat is attached to order or offer
      let chatTitle: string | null = null
      let contractorParticipant: ChatParticipant | null = null

      if (chat.order_id) {
        try {
          const order = await orderDb.getOrder({ order_id: chat.order_id })
          chatTitle = order.title
          if (order.contractor_id) {
            const contractor = await contractorDb.getMinimalContractor({
              contractor_id: order.contractor_id,
            })
            contractorParticipant = {
              type: "contractor",
              name: contractor.name,
              avatar: contractor.avatar,
              spectrum_id: contractor.spectrum_id,
            }
          }
        } catch (error) {
          this.logWarning(
            "getChatById",
            `Failed to get order for chat: ${chat.order_id}`,
            { error },
          )
        }
      } else if (chat.session_id) {
        try {
          const sessions = await offerDb.getOfferSessions({
            id: chat.session_id,
          })
          const session = sessions[0]
          if (session) {
            try {
              const mostRecentOffer = await offerDb.getMostRecentOrderOffer(
                session.id,
              )
              chatTitle = mostRecentOffer.title
            } catch (error) {
              this.logWarning(
                "getChatById",
                `Failed to get most recent offer for session ${session.id}`,
                { error },
              )
            }
            if (session.contractor_id) {
              const contractor = await contractorDb.getMinimalContractor({
                contractor_id: session.contractor_id,
              })
              contractorParticipant = {
                type: "contractor",
                name: contractor.name,
                avatar: contractor.avatar,
                spectrum_id: contractor.spectrum_id,
              }
            }
          }
        } catch (error) {
          this.logWarning(
            "getChatById",
            `Failed to get offer session for chat: ${chat.session_id}`,
            { error },
          )
        }
      }

      // Get user participants
      const userParticipants = await Promise.all(
        participants.map(async (user_id) => {
          const u = await profileDb.getUser({ user_id: user_id })
          return {
            type: "user" as const,
            username: u.username,
            avatar: await cdn.getFileLinkResource(u.avatar),
          }
        }),
      )

      // Combine user and contractor participants
      const allParticipants = contractorParticipant
        ? [...userParticipants, contractorParticipant]
        : userParticipants

      return this.success({
        chat_id: chat.chat_id,
        participants: allParticipants,
        messages: messages,
        order_id: chat.order_id,
        session_id: chat.session_id,
        title: chatTitle,
      })
    } catch (error) {
      this.logError("getChatById", error, { chat_id })
      this.handleError(error, "getChatById")
    }
  }

  /**
   * Get chat by order ID
   *
   * Retrieves the chat associated with a specific order.
   * Requires authentication and authorization to view the order.
   *
   * @summary Get chat by order ID
   * @param request Express request
   * @param order_id Order ID
   * @returns Chat details
   */
  @Get("orders/{order_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getChatByOrderId(
    @Request() request: ExpressRequest,
    @Path() order_id: string,
  ): Promise<ChatResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "chats:read")) {
          throw new ForbiddenError(
            "Insufficient permissions: chats:read scope required",
          )
        }
      }

      // Get order first to check authorization
      let order
      try {
        order = await orderDb.getOrder({ order_id })
      } catch (error) {
        throw new NotFoundError("Order not found")
      }

      // Check if user is related to order
      const isCustomer = order.customer_id === user.user_id
      const isAssigned = order.assigned_id === user.user_id
      let isContractorMember = false

      if (order.contractor_id) {
        const contractors = await contractorDb.getUserContractors({
          "contractor_members.user_id": user.user_id,
        })
        isContractorMember = contractors.some(
          (c) => c.contractor_id === order.contractor_id,
        )
      }

      if (!isCustomer && !isAssigned && !isContractorMember) {
        throw new ForbiddenError("You are not authorized to view this chat")
      }

      // Get chat
      let chat: DBChat
      try {
        chat = await chatDb.getChat({ order_id })
      } catch (error) {
        throw new NotFoundError("Chat not found for this order")
      }

      // Reuse getChatById logic
      return this.getChatById(request, chat.chat_id)
    } catch (error) {
      this.logError("getChatByOrderId", error, { order_id })
      this.handleError(error, "getChatByOrderId")
    }
  }

  /**
   * Get chat by offer session ID
   *
   * Retrieves the chat associated with a specific offer session.
   * Requires authentication and authorization to view the offer.
   *
   * @summary Get chat by offer session ID
   * @param request Express request
   * @param session_id Offer session ID
   * @returns Chat details
   */
  @Get("offers/{session_id}")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaReadRateLimit)
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async getChatByOfferSessionId(
    @Request() request: ExpressRequest,
    @Path() session_id: string,
  ): Promise<ChatResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "chats:read")) {
          throw new ForbiddenError(
            "Insufficient permissions: chats:read scope required",
          )
        }
      }

      // Get offer session first to check authorization
      let sessions
      try {
        sessions = await offerDb.getOfferSessions({ id: session_id })
      } catch (error) {
        throw new NotFoundError("Offer session not found")
      }

      if (!sessions || sessions.length === 0) {
        throw new NotFoundError("Offer session not found")
      }

      const session = sessions[0]

      // Check if user is related to offer session
      const isCustomer = session.customer_id === user.user_id
      const isAssigned = session.assigned_id === user.user_id
      let isContractorMember = false

      if (session.contractor_id) {
        const contractors = await contractorDb.getUserContractors({
          "contractor_members.user_id": user.user_id,
        })
        isContractorMember = contractors.some(
          (c) => c.contractor_id === session.contractor_id,
        )
      }

      if (!isCustomer && !isAssigned && !isContractorMember) {
        throw new ForbiddenError("You are not authorized to view this chat")
      }

      // Get chat
      let chat: DBChat
      try {
        chat = await chatDb.getChat({ session_id })
      } catch (error) {
        throw new NotFoundError("Chat not found for this offer session")
      }

      // Reuse getChatById logic
      return this.getChatById(request, chat.chat_id)
    } catch (error) {
      this.logError("getChatByOfferSessionId", error, { session_id })
      this.handleError(error, "getChatByOfferSessionId")
    }
  }

  /**
   * Send message
   *
   * Sends a message to a chat.
   * Requires authentication and authorization to participate in the chat.
   *
   * @summary Send message
   * @param request Express request
   * @param chat_id Chat ID
   * @param payload Message content
   * @returns Success response
   */
  @Post("{chat_id}/messages")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<NotFound>(404, "Not Found")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async sendMessage(
    @Request() request: ExpressRequest,
    @Path() chat_id: string,
    @Body() payload: SendMessagePayload,
  ): Promise<ChatSuccessResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "chats:write")) {
          throw new ForbiddenError(
            "Insufficient permissions: chats:write scope required",
          )
        }
      }

      // Validate content
      if (!payload.content || payload.content.trim().length === 0) {
        throw new ValidationErrorClass("Message content is required")
      }

      // Get chat
      let chat: DBChat
      try {
        chat = await chatDb.getChat({ chat_id })
      } catch (error) {
        throw new NotFoundError("Chat not found")
      }

      // Check if user is a participant
      const participants = await chatDb.getChatParticipants({ chat_id })
      if (!participants.includes(user.user_id)) {
        throw new ForbiddenError(
          "You are not authorized to send messages in this chat",
        )
      }

      // Insert message
      const message = await chatDb.insertMessage({
        chat_id: chat.chat_id,
        content: payload.content,
        author: user.user_id,
      })

      // Emit message via WebSocket
      chatServer.emitMessage(await serializeMessage(message))

      // Get order or session for notifications
      let order = null
      let session = null

      if (chat.order_id) {
        try {
          order = await orderDb.getOrder({ order_id: chat.order_id })
        } catch (error) {
          this.logWarning(
            "sendMessage",
            `Failed to get order for notification: ${chat.order_id}`,
            { error },
          )
        }
      }

      if (chat.session_id) {
        try {
          const sessions = await offerDb.getOfferSessions({
            id: chat.session_id,
          })
          session = sessions[0]
        } catch (error) {
          this.logWarning(
            "sendMessage",
            `Failed to get session for notification: ${chat.session_id}`,
            { error },
          )
        }
      }

      // Send Discord notification and create notification
      if (order || session) {
        const target = order || session
        if (target!.thread_id) {
          this.logInfo(
            "sendMessage",
            `Sending user chat message for ${order ? "order" : "session"}: ${target!.thread_id}`,
          )
          await discordService.sendUserChatMessage(
            target!,
            user,
            payload.content,
          )
        }

        if (order) {
          this.logInfo(
            "sendMessage",
            `Creating order message notification for order: ${order.order_id}`,
          )
          await notificationService.createOrderMessageNotification(
            order,
            message,
          )
        }

        if (session) {
          this.logInfo(
            "sendMessage",
            `Creating offer message notification for session: ${session.id}`,
          )
          await notificationService.createOfferMessageNotification(
            session,
            message,
          )
        }
      }

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("sendMessage", error, { chat_id, payload })
      this.handleError(error, "sendMessage")
    }
  }

  /**
   * Create chat
   *
   * Creates a new chat with specified users.
   * If a chat with the same participants already exists, returns success without creating a duplicate.
   *
   * @summary Create chat
   * @param request Express request
   * @param payload Chat creation data
   * @returns Success response
   */
  @Post("")
  @Security("sessionAuth")
  @Security("bearerAuth")
  @Middlewares(tsoaWriteRateLimit)
  @Response<ErrorResponse>(400, "Bad Request")
  @Response<Unauthorized>(401, "Unauthorized")
  @Response<Forbidden>(403, "Forbidden")
  @Response<ErrorResponse>(500, "Internal Server Error")
  public async createChat(
    @Request() request: ExpressRequest,
    @Body() payload: CreateChatPayload,
  ): Promise<ChatSuccessResponse> {
    try {
      const user = this.getUser(request)

      // Check scope for token auth
      if (this.getAuthMethod(request) === "token") {
        if (!this.hasScope(request, "chats:write")) {
          throw new ForbiddenError(
            "Insufficient permissions: chats:write scope required",
          )
        }
      }

      // Validate users
      if (!payload.users || payload.users.length === 0) {
        throw new ValidationErrorClass("At least one user is required")
      }

      // Get other users
      const otherUsers = await Promise.all(
        payload.users.map((username) =>
          profileDb.getUser({ username }).catch(() => null),
        ),
      )

      if (!otherUsers.every(Boolean)) {
        throw new ValidationErrorClass("One or more users not found")
      }

      // Check for blocked users
      const [blockedBy, myBlocklist] = await Promise.all([
        profileDb.getBlockedByUsers(user.user_id),
        profileDb.getUserBlocklist(user.user_id, "user"),
      ])

      const blockedYouUserIds = new Set(
        blockedBy
          .filter((b) => b.blocker_user_id != null)
          .map((b) => b.blocker_user_id!),
      )
      const blockedByMeUserIds = new Set(myBlocklist.map((b) => b.blocked_id))

      const blockedRequestedUser = otherUsers.find(
        (u) =>
          blockedYouUserIds.has(u!.user_id) ||
          blockedByMeUserIds.has(u!.user_id),
      )

      if (blockedRequestedUser) {
        throw new ForbiddenError(
          "Cannot create chat: one or more users are blocked",
        )
      }

      // Always include self in created chats
      const allUserIds = new Set([
        user.user_id,
        ...otherUsers.map((u) => u!.user_id),
      ])

      // Check if chat already exists with same participants
      const chats = await chatDb.getChatByParticipant(user.user_id)

      for (const chat of chats) {
        const participants = await chatDb.getChatParticipants({
          chat_id: chat!.chat_id,
        })
        if (eqSet(new Set(participants), allUserIds)) {
          // Chat already exists
          return this.success({ result: "Success" })
        }
      }

      // Create new chat
      await chatDb.insertChat(Array.from(allUserIds))

      return this.success({ result: "Success" })
    } catch (error) {
      this.logError("createChat", error, { payload })
      this.handleError(error, "createChat")
    }
  }
}
