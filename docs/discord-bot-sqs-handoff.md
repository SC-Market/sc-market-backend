# Discord Bot SQS Integration Handoff Document

## Overview

This document outlines the changes made to the backend to send Discord bot interactions via SQS queues instead of direct HTTP calls. The Discord bot team needs to implement queue consumers to process these messages and respond appropriately.

## Architecture Changes

### Before (Synchronous HTTP)

```
Backend → HTTP POST → Discord Bot → Immediate Response
```

### After (Asynchronous SQS)

```
Backend → SQS Message → Discord Bot → Process Queue → SQS Response → Backend
```

## SQS Queue Details

### Input Queue: `DISCORD_QUEUE_URL`

- **Purpose**: Messages from backend to Discord bot
- **Message Format**: JSON with `type`, `payload`, and `metadata` fields
- **Processing**: Discord bot should consume this queue and process messages

### Output Queue: `BACKEND_QUEUE_URL`

- **Purpose**: Responses from Discord bot back to backend
- **Message Format**: JSON with status updates and results
- **Usage**: Backend will consume this queue for status updates

## Message Types and Payloads

### 1. Thread Creation (`type: "create_thread"`)

**When Sent**: When a new order or offer session is created

**Message Structure**:

```json
{
  "type": "create_thread",
  "payload": {
    "server_id": "123456789012345678",
    "channel_id": "123456789012345678",
    "members": ["user1_discord_id", "user2_discord_id"],
    "order": {
      // Full order/offer session object
      "order_id": "uuid-here",
      "customer_id": "uuid-here",
      "assigned_id": "uuid-here",
      // ... other fields
    },
    "customer_discord_id": "customer_discord_id_here"
  },
  "metadata": {
    "order_id": "uuid-here",
    "entity_type": "order" | "offer_session",
    "created_at": "2024-01-01T00:00:00.000Z",
    "retry_count": 0
  }
}
```

**Expected Discord Bot Action**:

1. Create a new thread in the specified channel
2. Add the specified members to the thread
3. Send initial welcome message
4. Send response to `BACKEND_QUEUE_URL` with thread details

**Response Message to Backend**:

```json
{
  "type": "thread_created",
  "payload": {
    "thread_id": "123456789012345678",
    "invite_code": "invite_code_here",
    "success": true
  },
  "metadata": {
    "discord_message_id": "message_id_here",
    "created_at": "2024-01-01T00:00:00.000Z",
    "original_order_id": "uuid-here"
  }
}
```

## Discord Bot Implementation Requirements

### 1. Queue Consumer Setup

The Discord bot needs to:

- Set up an SQS consumer for `DISCORD_QUEUE_URL`
- Process messages in batches (recommend 10 messages per batch)
- Handle long polling (20 seconds) for efficiency
- Implement proper error handling and retry logic

### 2. Message Processing

For each message type:

- Parse the JSON payload
- Validate required fields
- Execute the Discord API operations
- Send response to `BACKEND_QUEUE_URL`
- Handle errors gracefully

### 3. Error Handling

- **Discord API Errors**: Log and send error response to backend
- **Invalid Messages**: Move to dead letter queue after 3 retries
- **Rate Limiting**: Implement exponential backoff
- **Partial Failures**: Send partial success responses

### 4. Response Queue Management

- Send all responses to `BACKEND_QUEUE_URL`
- Include original message metadata for correlation
- Use consistent message format for all responses
- Handle response queue failures gracefully

## Environment Variables Required

The Discord bot needs these environment variables:

```bash
# SQS Configuration
DISCORD_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/ACCOUNT/DiscordQueuesStack-discord-queue
BACKEND_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/ACCOUNT/DiscordQueuesStack-backend-queue

# AWS Credentials (for SQS access)
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Discord Bot Token
DISCORD_BOT_TOKEN=your_bot_token
```

## Testing and Validation

### 1. Backend Testing ✅ COMPLETED

- **Test 1**: Orders without Discord configuration fail gracefully ✅
- **Test 2**: Orders with Discord configuration queue successfully ✅
- **Validation**: Backend no longer waits for Discord bot responses ✅
- **SQS Integration**: Messages are properly queued ✅

### 2. Message Validation

- Test with various order/offer session configurations
- Verify all required fields are present
- Test error scenarios (missing Discord IDs, invalid channels)

### 3. Discord API Integration

- Verify thread creation works in test servers
- Test member addition and permissions
- Validate invite code generation

### 4. Queue Integration

- Test message consumption from `DISCORD_QUEUE_URL`
- Verify responses are sent to `BACKEND_QUEUE_URL`
- Test error handling and retry logic

## Migration Timeline

### Phase 1: Infrastructure ✅ COMPLETED

- SQS queues deployed
- Backend credentials configured
- Basic SQS client working
- SQS client with role assumption working

### Phase 2: Thread Creation ✅ COMPLETED

- Backend modified to queue thread creation
- `createThread()` function now uses SQS instead of HTTP
- `createOfferThread()` function updated for queue-based approach
- **Discord bot needs to implement queue consumer**
- **Test end-to-end thread creation flow**

### Phase 3: Message Processing Infrastructure

- Backend queue consumer for responses
- Error handling and retry logic
- Monitoring and alerting

### Phase 4: Additional Endpoints

- Status updates
- User assignments
- Chat message forwarding

## Next Steps for Discord Bot Team

1. **Immediate (This Week)**:
   - Set up SQS consumer for `DISCORD_QUEUE_URL`
   - Implement `create_thread` message handler
   - Test thread creation end-to-end

2. **Short Term (Next Week)**:
   - Add response queue integration
   - Implement error handling and retries
   - Add monitoring and logging

3. **Medium Term (Following Weeks)**:
   - Implement additional message types
   - Add comprehensive testing
   - Performance optimization

## Questions and Clarifications

If you need clarification on any part of this document:

- **Backend Changes**: Check the migration plan in `docs/discord-sqs-migration-plan.md`
- **SQS Configuration**: Review the CDK stack in `../sc-market-cdk/`
- **Message Formats**: See the TypeScript interfaces in `src/types/discord-queue.ts`

## Support and Contact

- **Backend Team**: Available for questions about message formats and queue setup
- **Infrastructure Team**: Available for SQS configuration and AWS setup
- **Documentation**: All changes are documented in this repository

---

**Last Updated**: January 2024
**Version**: 1.0
**Status**: Phase 2 Implementation
