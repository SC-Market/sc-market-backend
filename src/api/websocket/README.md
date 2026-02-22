# WebSocket Integration

This directory contains WebSocket-related documentation and utilities for the SC Market backend.

## Overview

WebSocket routes are implemented using Socket.IO and are separate from the TSOA-managed REST API routes. This separation is necessary because:

1. TSOA only supports REST API routes (HTTP methods: GET, POST, PUT, DELETE, etc.)
2. WebSocket requires bidirectional communication not supported by REST
3. Socket.IO uses different middleware patterns than Express

## Directory Structure

```
websocket/
├── README.md                    # This file
├── WEBSOCKET_ROUTES.md          # Detailed WebSocket route documentation
├── openapi-extension.ts         # OpenAPI documentation for WebSocket routes
└── spec-merger.ts               # Utility to merge WebSocket docs into OpenAPI spec
```

## Files

### WEBSOCKET_ROUTES.md
Comprehensive documentation of all WebSocket routes, including:
- Connection details and authentication
- Event definitions (client-to-server and server-to-client)
- Connection lifecycle
- Room management
- Error handling
- Security considerations
- Client implementation examples

### openapi-extension.ts
OpenAPI 3.1 documentation for WebSocket routes using:
- **Webhooks**: Document server-to-client events
- **Custom Extension**: Document connection details and client-to-server events
- **Schemas**: Define message and request schemas

### spec-merger.ts
Utility functions to merge WebSocket documentation into the OpenAPI specification:
- `mergeLegacySpecWithWebSocket()`: Merge WebSocket docs into legacy spec
- `getCompleteOpenAPISpec()`: Get complete spec with WebSocket documentation

## Usage

### Accessing Documentation

WebSocket routes are documented in the OpenAPI specification at:
- **OpenAPI JSON**: `GET /openapi.json`
- **Documentation UI**: `GET /docs`

The documentation includes:
1. **Webhooks section**: Server-to-client events (e.g., `serverMessage`)
2. **Custom extension**: Connection details and client-to-server events
3. **Schemas**: Message and request schemas

### Implementing WebSocket Routes

WebSocket routes are implemented in `src/clients/messaging/websocket.ts`. To add new routes:

1. Add event handler in `WebsocketMessagingServer.initialize()`
2. Document the event in `WEBSOCKET_ROUTES.md`
3. Add schema to `openapi-extension.ts`
4. Update webhooks or custom extension as needed

Example:
```typescript
// In websocket.ts
socket.on("newEvent", async (data) => {
  // Handle event
})

// In openapi-extension.ts
export const websocketWebhooks = {
  newEvent: {
    post: {
      summary: "New event description",
      // ... rest of webhook definition
    }
  }
}
```

### Testing WebSocket Routes

WebSocket routes should be tested separately from REST API routes:

1. **Manual Testing**: Use Socket.IO client to connect and test events
2. **Property-Based Testing**: See `src/api/controllers/websocket.property.test.ts`
3. **Integration Testing**: Test WebSocket + REST API interactions

## Migration Notes

### TSOA Migration
During the TSOA migration:
- WebSocket routes remain unchanged
- No conflicts with TSOA-generated routes (different protocols)
- Documentation is maintained separately
- Testing is separate from TSOA property tests

### Parallel Operation
WebSocket routes operate in parallel with both legacy and TSOA REST routes:
- Same authentication system (session-based)
- Same database layer
- Same error logging
- Different transport protocol

### Future Considerations
1. **Dedicated WebSocket Service**: Consider moving WebSocket to separate service
2. **Connection Pooling**: Implement for better scalability
3. **Rate Limiting**: Add connection-level rate limiting
4. **Reconnection Logic**: Implement exponential backoff on client

## OpenAPI 3.1 WebSocket Support

OpenAPI 3.1 provides limited support for WebSocket documentation:

### Webhooks
Used to document server-to-client events:
```yaml
webhooks:
  serverMessage:
    post:
      summary: New message in chat room
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/WebSocketMessage'
```

### Custom Extensions
Used to document connection details and client-to-server events:
```yaml
x-websocket:
  path: /ws
  protocol: socket.io
  events:
    client-to-server:
      - name: clientJoinRoom
        schema:
          $ref: '#/components/schemas/JoinRoomRequest'
```

### Limitations
- No standard way to document bidirectional communication
- Webhooks are designed for HTTP callbacks, not WebSocket events
- Custom extensions are not validated by OpenAPI tools
- Some documentation tools may not display custom extensions

## Security

### Authentication
- All WebSocket connections require session authentication
- Session validation occurs during handshake
- No anonymous connections allowed

### Authorization
- Users can only join rooms for chats they have permission to view
- Permission checked via `can_view_chat` middleware
- Unauthorized attempts are silently ignored

### Rate Limiting
- WebSocket connections are NOT rate limited by standard middleware
- Consider implementing connection-level rate limiting if needed

## Monitoring

### Metrics to Track
- Total active connections
- Connections per user
- Connection duration
- Messages sent/received per room
- Failed join attempts

### Logging
All WebSocket errors are logged with context:
```typescript
logger.debug(`Failed to join chat room ${chatInfo.chat_id}: ${error}`)
```

## Troubleshooting

### Common Issues

**Connection Refused**
- Verify user is authenticated
- Check session cookie is being sent
- Verify CORS settings allow credentials

**Messages Not Received**
- Verify user has joined the room
- Check user has permission to view chat
- Verify message is being emitted to correct room

**Performance Issues**
- Check number of active connections
- Monitor message throughput per room
- Consider implementing connection pooling

## References

- [Socket.IO Documentation](https://socket.io/docs/v4/)
- [OpenAPI 3.1 Webhooks](https://spec.openapis.org/oas/v3.1.0#webhook-object)
- [OpenAPI Extensions](https://spec.openapis.org/oas/v3.1.0#specification-extensions)
