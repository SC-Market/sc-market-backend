import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs"
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

// Cached STS credentials and SQS client
let cachedClient: SQSClient | null = null
let credentialsExpireAt = 0

// Reuse STS client (stateless, no credentials to expire)
let stsClient: STSClient | null = null

function getSTSClient(): STSClient {
  if (!stsClient) {
    if (!env.BACKEND_ACCESS_KEY_ID || !env.BACKEND_SECRET_ACCESS_KEY || !env.BACKEND_ROLE_ARN) {
      const missing = []
      if (!env.BACKEND_ACCESS_KEY_ID) missing.push("BACKEND_ACCESS_KEY_ID")
      if (!env.BACKEND_SECRET_ACCESS_KEY) missing.push("BACKEND_SECRET_ACCESS_KEY")
      if (!env.BACKEND_ROLE_ARN) missing.push("BACKEND_ROLE_ARN")
      throw new Error("AWS credentials not configured. Missing: " + missing.join(", "))
    }
    stsClient = new STSClient({
      region: env.AWS_REGION || "us-east-2",
      credentials: {
        accessKeyId: env.BACKEND_ACCESS_KEY_ID,
        secretAccessKey: env.BACKEND_SECRET_ACCESS_KEY,
      },
    })
  }
  return stsClient
}

async function getSQSClient(): Promise<SQSClient> {
  // Refresh 5 minutes before expiry
  if (cachedClient && Date.now() < credentialsExpireAt - 5 * 60 * 1000) {
    return cachedClient
  }

  const response = await getSTSClient().send(new AssumeRoleCommand({
    RoleArn: env.BACKEND_ROLE_ARN || "",
    RoleSessionName: "sqs-backend-service",
    DurationSeconds: 3600,
  }))

  cachedClient = new SQSClient({
    region: env.AWS_REGION || "us-east-2",
    credentials: {
      accessKeyId: response.Credentials!.AccessKeyId!,
      secretAccessKey: response.Credentials!.SecretAccessKey!,
      sessionToken: response.Credentials!.SessionToken!,
    },
  })
  credentialsExpireAt = response.Credentials!.Expiration!.getTime()

  return cachedClient
}

// Keep the old export name for backward compatibility
export const createSQSClient = getSQSClient

export async function sendMessage(queueUrl: string, messageBody: any) {
  try {
    const client = await getSQSClient()
    return client.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
    }))
  } catch (error) {
    logger.error("Failed to send SQS message:", error)
    throw error
  }
}

export async function receiveMessage(queueUrl: string, maxMessages: number = 10) {
  try {
    const client = await getSQSClient()
    return client.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20,
    }))
  } catch (error) {
    logger.error("Failed to receive SQS messages:", error)
    throw error
  }
}

export async function deleteMessage(queueUrl: string, receiptHandle: string) {
  try {
    const client = await getSQSClient()
    return client.send(new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    }))
  } catch (error) {
    logger.error("Failed to delete SQS message:", error)
    throw error
  }
}
