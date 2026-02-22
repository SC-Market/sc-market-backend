/**
 * WebSocket OpenAPI Extension
 * 
 * This module provides OpenAPI documentation for WebSocket routes.
 * Since TSOA does not support WebSocket routes, we manually add them
 * to the OpenAPI specification using webhooks and custom extensions.
 */

import { OpenAPIV3_1 } from "openapi-types"

/**
 * WebSocket message schema
 */
const WebSocketMessageSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  title: "WebSocketMessage",
  description: "Message sent via WebSocket",
  properties: {
    chat_id: {
      type: "string",
      description: "Chat room identifier",
      example: "550e8400-e29b-41d4-a716-446655440000",
    },
    message_id: {
      type: "string",
      description: "Unique message identifier",
      example: "msg-123456",
    },
    author: {
      type: ["string", "null"],
      description: "User ID of message author (null for system messages)",
      example: "user-123",
    },
    content: {
      type: "string",
      description: "Message content",
      example: "Hello, world!",
    },
    timestamp: {
      type: "number",
      description: "Unix timestamp in milliseconds",
      example: 1640995200000,
    },
    type: {
      type: "string",
      description: "Message type",
      enum: ["text", "system"],
      example: "text",
    },
  },
  required: ["chat_id", "message_id", "content", "timestamp", "type"],
}

/**
 * WebSocket join room request schema
 */
const JoinRoomRequestSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  title: "JoinRoomRequest",
  description: "Request to join a chat room",
  properties: {
    chat_id: {
      type: "string",
      description: "Chat room identifier to join",
      example: "550e8400-e29b-41d4-a716-446655440000",
    },
  },
  required: ["chat_id"],
}

/**
 * WebSocket leave room request schema
 */
const LeaveRoomRequestSchema: OpenAPIV3_1.SchemaObject = {
  type: "object",
  title: "LeaveRoomRequest",
  description: "Request to leave a chat room",
  properties: {
    chat_id: {
      type: "string",
      description: "Chat room identifier to leave",
      example: "550e8400-e29b-41d4-a716-446655440000",
    },
  },
  required: ["chat_id"],
}

/**
 * WebSocket webhooks documentation
 * 
 * Webhooks represent server-to-client events in OpenAPI 3.1
 */
export const websocketWebhooks: OpenAPIV3_1.Document["webhooks"] = {
  serverMessage: {
    post: {
      summary: "New message in chat room",
      description:
        "Emitted when a new message is sent in a chat room the user has joined. " +
        "This is a server-to-client event sent via WebSocket.",
      tags: ["WebSocket"],
      requestBody: {
        description: "Message payload sent from server to client",
        required: true,
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/WebSocketMessage",
            },
          },
        },
      },
      responses: {
        "200": {
          description: "Event received by client (no response expected)",
        },
      },
    },
  },
}

/**
 * WebSocket custom extension
 * 
 * Custom OpenAPI extension to document WebSocket connection details
 * and client-to-server events
 */
export const websocketExtension = {
  "x-websocket": {
    path: "/ws",
    protocol: "socket.io",
    description:
      "Real-time bidirectional communication using Socket.IO. " +
      "Requires session-based authentication.",
    authentication: {
      type: "session",
      description:
        "Session cookie must be sent with WebSocket handshake. " +
        "Connection is rejected if user is not authenticated.",
    },
    connection: {
      url: {
        production: "wss://api.sc-market.space/ws",
        development: "ws://localhost:7000/ws",
      },
      options: {
        withCredentials: true,
        path: "/ws",
      },
    },
    events: {
      "client-to-server": [
        {
          name: "clientJoinRoom",
          description:
            "Request to join a specific chat room. " +
            "Server validates user has permission to view the chat before joining.",
          schema: {
            $ref: "#/components/schemas/JoinRoomRequest",
          },
        },
        {
          name: "clientLeaveRoom",
          description: "Request to leave a specific chat room.",
          schema: {
            $ref: "#/components/schemas/LeaveRoomRequest",
          },
        },
      ],
      "server-to-client": [
        {
          name: "serverMessage",
          description:
            "Emitted when a new message is sent in a chat room the user has joined.",
          schema: {
            $ref: "#/components/schemas/WebSocketMessage",
          },
        },
      ],
    },
    rooms: {
      description:
        "Users are automatically joined to rooms for all chats where they are participants. " +
        "Additional rooms can be joined via clientJoinRoom event.",
      naming: "Room names use the chat ID directly (e.g., chat-123)",
    },
    errorHandling: {
      description:
        "Most errors are handled silently to prevent information leakage. " +
        "Check server logs for detailed error information.",
      errors: [
        {
          type: "Unauthorized",
          description: "Connection rejected if user is not authenticated",
        },
        {
          type: "Session Expired",
          description: "Connection rejected if session is invalid",
        },
        {
          type: "Invalid Chat ID",
          description: "Silent failure (user not joined to room)",
        },
        {
          type: "Permission Denied",
          description: "Silent failure (user not joined to room)",
        },
      ],
    },
  },
}

/**
 * WebSocket schemas to add to OpenAPI components
 */
export const websocketSchemas: Record<string, OpenAPIV3_1.SchemaObject> = {
  WebSocketMessage: WebSocketMessageSchema,
  JoinRoomRequest: JoinRoomRequestSchema,
  LeaveRoomRequest: LeaveRoomRequestSchema,
}

/**
 * Merge WebSocket documentation into OpenAPI spec
 * 
 * @param spec - OpenAPI specification to merge into
 * @returns Updated OpenAPI specification with WebSocket documentation
 */
export function mergeWebSocketDocumentation(
  spec: OpenAPIV3_1.Document,
): OpenAPIV3_1.Document {
  return {
    ...spec,
    // Add WebSocket schemas to components
    components: {
      ...spec.components,
      schemas: {
        ...spec.components?.schemas,
        ...websocketSchemas,
      },
    },
    // Add WebSocket webhooks
    webhooks: {
      ...spec.webhooks,
      ...websocketWebhooks,
    },
    // Add WebSocket custom extension
    ...websocketExtension,
  }
}
