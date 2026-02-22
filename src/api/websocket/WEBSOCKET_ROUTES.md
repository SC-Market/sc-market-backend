# WebSocket Routes Documentation

## Overview

This document describes the WebSocket routes used in the SC Market backend. WebSocket routes are implemented using Socket.IO and are separate from the TSOA-managed REST API routes.

**Important**: WebSocket routes are NOT managed by TSOA. They use Socket.IO for real-time bidirectional communication and require separate documentation and testing.

## Connection Details

### Endpoint
- **Path**: `/ws`
- **Protocol**: Socket.IO (WebSocket with fallback to HTTP long-polling)
- **Authentication**: Required (session-based)

### Connection URL
```
Production: wss://api.sc-market.space/ws
Development: ws://localhost:7000/ws
```

## Authentication

WebSocket connections require authentication via Express session middleware. The authentication flow:

1. Client establishes HTTP session via login
2. Session cookie is sent with WebSocket handshake
3. Server validates session during handshake
4. Connection is rejected if user is not authenticated

**Implementation**: See `src/server.ts` lines 450-470 for authentication middleware setup.

## Events

### Server → Client Events

#### `serverMessage`
Emitted when a new message is sent in a chat room.

**Payload**:
```typescript
{
  chat_id: string          // Chat room identifier
  message_id: string       // Unique message identifier
  author: string | null    // User ID of message author (null for system messages)
  content: string          // Message content
  timestamp: number        // Unix timestamp (milliseconds)
  type: string            // Message type (e.g., "text", "system")
}
```

**Example**:
```typescript
socket.on('serverMessage', (message) => {
  console.log('New message:', message)
})
```

### Client → Server Events

#### `clientJoinRoom`
Request to join a specific chat room. Server validates user has permission to view the chat before joining.

**Payload**:
```typescript
{
  chat_id: string  // Chat room identifier to join
}
```

**Example**:
```typescript
socket.emit('clientJoinRoom', { chat_id: 'chat-123' })
```

**Validation**:
- User must have permission to view the chat (checked via `can_view_chat` middleware)
- If validation fails, user is not added to the room (silent failure)

#### `clientLeaveRoom`
Request to leave a specific chat room.

**Payload**:
```typescript
{
  chat_id: string  // Chat room identifier to leave
}
```

**Example**:
```typescript
socket.emit('clientLeaveRoom', { chat_id: 'chat-123' })
```

## Connection Lifecycle

### 1. Connection Established
When a client connects:
1. Server retrieves all chats where user is a participant
2. User is automatically joined to all their chat rooms
3. Connection is ready to send/receive messages

**Implementation**: See `src/clients/messaging/websocket.ts` lines 13-25

### 2. Active Connection
During an active connection:
- Client can join additional rooms via `clientJoinRoom`
- Client can leave rooms via `clientLeaveRoom`
- Server emits `serverMessage` events to all users in a room when messages are sent

### 3. Disconnection
When a client disconnects:
- Socket.IO automatically removes user from all rooms
- No cleanup required on client side

## Room Management

### Automatic Room Joining
Users are automatically joined to rooms for:
- All chats where they are a participant (on connection)

### Manual Room Joining
Users can manually join rooms via `clientJoinRoom` if:
- They have permission to view the chat
- The chat exists

### Room Naming Convention
Room names use the chat ID directly:
```
Room name = chat_id (e.g., "550e8400-e29b-41d4-a716-446655440000")
```

## Error Handling

### Connection Errors
- **Unauthorized**: Connection rejected if user is not authenticated
- **Session Expired**: Connection rejected if session is invalid

### Event Errors
- **Invalid Chat ID**: Silent failure (user not joined to room)
- **Permission Denied**: Silent failure (user not joined to room)
- **Database Errors**: Logged but not propagated to client

**Note**: Most errors are handled silently to prevent information leakage. Check server logs for detailed error information.

## Security Considerations

### Authentication
- All connections require valid session authentication
- Session validation occurs during handshake (before connection is established)
- No anonymous connections allowed

### Authorization
- Users can only join rooms for chats they have permission to view
- Permission is checked via `can_view_chat` middleware
- Unauthorized join attempts are silently ignored

### Rate Limiting
- WebSocket connections are NOT rate limited by the standard rate limiting middleware
- Consider implementing connection-level rate limiting if abuse occurs

## Implementation Files

### Core Files
- `src/server.ts` - WebSocket server initialization and authentication
- `src/clients/messaging/websocket.ts` - WebSocket event handlers and room management

### Related Files
- `src/api/routes/v1/chats/database.ts` - Chat database operations
- `src/api/routes/v1/chats/middleware.ts` - Chat permission validation

## Testing

### Manual Testing
1. Authenticate via REST API
2. Connect to WebSocket endpoint with session cookie
3. Emit `clientJoinRoom` with valid chat ID
4. Send message via REST API
5. Verify `serverMessage` event is received

### Automated Testing
See `src/api/controllers/websocket.property.test.ts` for property-based tests validating:
- Connection behavior parity with legacy system
- Message handling consistency
- Room management correctness

## Migration Notes

### TSOA Compatibility
WebSocket routes are NOT compatible with TSOA because:
- TSOA generates REST API routes only
- WebSocket requires bidirectional communication
- Socket.IO uses different middleware patterns

### Parallel Operation
During TSOA migration:
- WebSocket routes remain unchanged
- No conflicts with TSOA-generated routes (different protocols)
- Documentation is maintained separately

### Future Considerations
- Consider migrating to a dedicated WebSocket service
- Implement connection pooling for scalability
- Add connection-level rate limiting
- Implement reconnection logic with exponential backoff

## OpenAPI Specification

WebSocket routes cannot be fully represented in OpenAPI 3.1 specification. However, they are documented in the OpenAPI spec as follows:

### Webhook Documentation
WebSocket events are documented as webhooks in the OpenAPI spec:

```yaml
webhooks:
  serverMessage:
    post:
      summary: New message in chat room
      description: Emitted when a new message is sent in a chat room the user has joined
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                chat_id:
                  type: string
                message_id:
                  type: string
                author:
                  type: string
                  nullable: true
                content:
                  type: string
                timestamp:
                  type: number
                type:
                  type: string
```

### Custom Extension
WebSocket connection details are documented using OpenAPI extension:

```yaml
x-websocket:
  path: /ws
  protocol: socket.io
  authentication: session
  events:
    - name: clientJoinRoom
      direction: client-to-server
    - name: clientLeaveRoom
      direction: client-to-server
    - name: serverMessage
      direction: server-to-client
```

## Client Implementation Example

### JavaScript/TypeScript
```typescript
import { io } from 'socket.io-client'

// Connect with session cookie
const socket = io('https://api.sc-market.space', {
  path: '/ws',
  withCredentials: true
})

// Handle connection
socket.on('connect', () => {
  console.log('Connected to WebSocket')
  
  // Join a chat room
  socket.emit('clientJoinRoom', { chat_id: 'chat-123' })
})

// Handle messages
socket.on('serverMessage', (message) => {
  console.log('New message:', message)
})

// Handle disconnection
socket.on('disconnect', () => {
  console.log('Disconnected from WebSocket')
})
```

## Monitoring and Logging

### Connection Metrics
- Total active connections
- Connections per user
- Connection duration
- Reconnection rate

### Event Metrics
- Messages sent/received per room
- Join/leave events per room
- Failed join attempts (permission denied)

### Error Logging
All WebSocket errors are logged with context:
```typescript
logger.debug(`Failed to join chat room ${chatInfo.chat_id}: ${error}`)
logger.debug(`Failed to get chats for user ${user_id}: ${error}`)
```

## Troubleshooting

### Connection Refused
- Verify user is authenticated
- Check session cookie is being sent
- Verify CORS settings allow credentials

### Messages Not Received
- Verify user has joined the room
- Check user has permission to view chat
- Verify message is being emitted to correct room

### Performance Issues
- Check number of active connections
- Monitor message throughput per room
- Consider implementing connection pooling
