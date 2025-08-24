# Spectrum API Client

A TypeScript client for interacting with the Roberts Space Industries (RSI) Spectrum API, based on the Python implementation from `spectrum.py-main`.

## Features

- **Fetch users by RSI handle**: Get a user's Spectrum user ID from their RSI handle (nickname)
- **Fetch users by member ID**: Get detailed information about a Spectrum member
- **Batch operations**: Look up multiple handles at once
- **Error handling**: Comprehensive error handling with custom error types
- **Logging**: Integrated with the project's logging system
- **Type safety**: Full TypeScript support with comprehensive type definitions

## Installation

The client is already included in the project. Make sure you have the required environment variables set:

```bash
# Add to your .env file
RSI_TOKEN=your_rsi_token_here
RSI_DEVICE_ID=your_device_id_here
```

## Quick Start

### Basic Usage

```typescript
import { getSpectrumUserId } from "../../clients/spectrum/index.js"

// Get a user's Spectrum ID from their RSI handle
const spectrumId = await getSpectrumUserId("Khuzdul")
if (spectrumId) {
  console.log(`User found with Spectrum ID: ${spectrumId}`)
} else {
  console.log("User not found")
}
```

### Using the Client Instance

```typescript
import { SpectrumAPIClient } from "../../clients/spectrum/index.js"

// Create a client instance
const client = new SpectrumAPIClient("your-rsi-token", "your-device-id")

// Fetch member by handle
const member = await client.fetchMemberByHandle("Khuzdul")

// Get just the user ID
const userId = await client.getSpectrumUserId("Khuzdul")
```

### Using Utility Functions

```typescript
import {
  getSpectrumUserIdByHandle,
  batchGetSpectrumUserIds,
  validateSpectrumHandle,
} from "../../api/routes/v1/util/spectrum.js"

// Get user ID with enhanced error handling
const userId = await getSpectrumUserIdByHandle("Khuzdul")

// Validate if a handle exists
const isValid = await validateSpectrumHandle("Khuzdul")

// Batch lookup multiple handles
const results = await batchGetSpectrumUserIds(["Khuzdul", "Nobody", "TestUser"])
// Returns: { "Khuzdul": "12345", "Nobody": "67890", "TestUser": null }
```

## API Reference

### Core Client Methods

#### `SpectrumAPIClient`

- **`constructor(rsiToken?: string, deviceId?: string)`**: Create a new client instance
- **`fetchMemberByHandle(handle: string)`**: Fetch member information by RSI handle
- **`fetchMemberById(memberId: string)`**: Fetch member information by member ID
- **`getSpectrumUserId(handle: string)`**: Get just the user ID from a handle

#### Convenience Functions

- **`getSpectrumUserId(handle: string)`**: Get user ID using the default client
- **`fetchSpectrumMemberByHandle(handle: string)`**: Fetch member info using the default client
- **`fetchSpectrumMemberById(memberId: string)`**: Fetch member info by ID using the default client

#### Utility Functions

- **`getSpectrumUserIdByHandle(handle: string)`**: Enhanced version with better error handling
- **`getSpectrumMemberInfo(handle: string)`**: Get detailed member information
- **`batchGetSpectrumUserIds(handles: string[])`**: Batch lookup multiple handles
- **`validateSpectrumHandle(handle: string)`**: Check if a handle exists

### Response Types

#### `SpectrumMemberResponse`

```typescript
interface SpectrumMemberResponse {
  success: boolean
  data: {
    id: string // The Spectrum user ID
    nickname: string // RSI handle
    display_name: string // Display name
    avatar?: string // Profile avatar URL
    status?: string // User status
    joined_at?: string // When they joined
    last_seen?: string // Last seen timestamp
    reputation?: number // Reputation score
    post_count?: number // Number of posts
    thread_count?: number // Number of threads
    like_count?: number // Number of likes received
    // ... community information fields
  }
  message?: string // Error message if success is false
  code?: string // Error code if success is false
}
```

#### `SpectrumAPIError`

```typescript
class SpectrumAPIError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number
  )
}
```

## Error Handling

The client provides comprehensive error handling:

```typescript
import { SpectrumAPIError } from "../../clients/spectrum/index.js"

try {
  const userId = await getSpectrumUserId("Khuzdul")
  // Handle success
} catch (error) {
  if (error instanceof SpectrumAPIError) {
    console.error(`Spectrum API error: ${error.message}`)
    console.error(`Error code: ${error.code}`)
    console.error(`HTTP status: ${error.statusCode}`)
  } else {
    console.error(`Unexpected error: ${error}`)
  }
}
```

## Rate Limiting

The client includes built-in rate limiting for batch operations:

- Batch operations add a 100ms delay between requests
- This helps prevent overwhelming the Spectrum API
- Individual requests are not rate-limited

## Logging

All operations are logged using the project's logger:

- **Debug level**: API requests, responses, and successful operations
- **Error level**: Network errors and unexpected failures
- **Info level**: Not used (keeps logs clean)

## Examples

See `example-usage.ts` for comprehensive examples of all functionality.

## Environment Variables

| Variable        | Description                   | Required             |
| --------------- | ----------------------------- | -------------------- |
| `RSI_TOKEN`     | Your RSI authentication token | No (but recommended) |
| `RSI_DEVICE_ID` | Your RSI device ID            | No (but recommended) |

## Notes

- The client mimics the Python implementation's behavior
- All API calls are made to `https://robertsspaceindustries.com`
- The client uses the same headers and cookies as the Python version
- Error responses are logged at debug level to avoid cluttering logs
- The client gracefully handles missing or invalid responses

## Troubleshooting

### Common Issues

1. **"User not found" errors**: The RSI handle may not exist or may be misspelled
2. **Network errors**: Check your internet connection and RSI's availability
3. **Authentication errors**: Ensure your `RSI_TOKEN` and `RSI_DEVICE_ID` are correct

### Debug Mode

Enable debug logging to see detailed API request/response information:

```typescript
// The client automatically logs at debug level
// Check your logger configuration to ensure debug logs are visible
```
