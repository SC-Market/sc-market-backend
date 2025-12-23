/**
 * Mock external services for testing
 * These functions help mock AWS, Discord, and other external services
 */

/**
 * Mock AWS S3 client
 */
export function mockS3Client() {
  return {
    putObject: async () => ({
      ETag: "mock-etag",
    }),
    getObject: async () => ({
      Body: {
        transformToString: async () => "mock-content",
      },
    }),
    deleteObject: async () => ({}),
  }
}

/**
 * Mock AWS SQS client
 */
export function mockSQSClient() {
  return {
    sendMessage: async () => ({
      MessageId: "mock-message-id",
    }),
    receiveMessage: async () => ({
      Messages: [],
    }),
  }
}

/**
 * Mock AWS Lambda client
 */
export function mockLambdaClient() {
  return {
    invoke: async () => ({
      StatusCode: 200,
      Payload: JSON.stringify({ success: true }),
    }),
  }
}

/**
 * Mock Discord API
 */
export function mockDiscordAPI() {
  return {
    getUser: async (userId: string) => ({
      id: userId,
      username: "testuser",
      discriminator: "0000",
      avatar: null,
    }),
    getGuildMember: async (guildId: string, userId: string) => ({
      user: {
        id: userId,
        username: "testuser",
      },
      roles: [],
    }),
  }
}

/**
 * Mock WebSocket connections
 */
export function mockWebSocket() {
  return {
    emit: () => {},
    on: () => {},
    off: () => {},
    disconnect: () => {},
  }
}

/**
 * Setup all mocks
 */
export function setupMocks() {
  // You can use vi.mock() from Vitest here
  // Example:
  // vi.mock('@aws-sdk/client-s3', () => ({
  //   S3Client: vi.fn(() => mockS3Client()),
  // }))
}
