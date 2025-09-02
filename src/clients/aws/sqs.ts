import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs"
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts"
import { env } from "../../config/env.js"
import { checkSQSConfiguration } from "./sqs-config.js"
import logger from "../../logger/logger.js"

// Function to get temporary credentials by assuming the IAM role
async function getTemporaryCredentials() {
  const config = checkSQSConfiguration()

  if (!config.hasCredentials) {
    throw new Error(
      "SQS credentials not configured. Missing: " +
        config.missingConfig.join(", "),
    )
  }

  const stsClient = new STSClient({
    region: env.AWS_REGION || "us-east-2",
    credentials: {
      accessKeyId: env.BACKEND_ACCESS_KEY_ID || "",
      secretAccessKey: env.BACKEND_SECRET_ACCESS_KEY || "",
    },
  })

  try {
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: env.BACKEND_ROLE_ARN || "",
      RoleSessionName: "sqs-backend-service",
      DurationSeconds: 3600, // 1 hour
    })

    const response = await stsClient.send(assumeRoleCommand)

    return {
      accessKeyId: response.Credentials!.AccessKeyId!,
      secretAccessKey: response.Credentials!.SecretAccessKey!,
      sessionToken: response.Credentials!.SessionToken!,
    }
  } catch (error) {
    logger.error("Failed to assume role:", error)
    throw error
  }
}

// Create SQS client with role assumption
export async function createSQSClient() {
  const credentials = await getTemporaryCredentials()

  return new SQSClient({
    region: env.AWS_REGION || "us-east-2",
    credentials,
  })
}

export async function sendMessage(queueUrl: string, messageBody: any) {
  const config = checkSQSConfiguration()

  if (!config.isConfigured) {
    logger.warn("SQS not configured - skipping message send", {
      queueUrl,
      messageType: messageBody?.type,
      missingConfig: config.missingConfig,
    })
    return { MessageId: "disabled", $metadata: { httpStatusCode: 200 } }
  }

  try {
    const sqsClient = await createSQSClient()
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(messageBody),
    })

    return sqsClient.send(command)
  } catch (error) {
    logger.error("Failed to send SQS message:", error)
    throw error
  }
}

export async function receiveMessage(
  queueUrl: string,
  maxMessages: number = 10,
) {
  const config = checkSQSConfiguration()

  if (!config.isConfigured) {
    logger.debug("SQS not configured - skipping message receive", {
      queueUrl,
      missingConfig: config.missingConfig,
    })
    return { Messages: [], $metadata: { httpStatusCode: 200 } }
  }

  try {
    const sqsClient = await createSQSClient()
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 20, // Long polling
    })

    return sqsClient.send(command)
  } catch (error) {
    logger.error("Failed to receive SQS messages:", error)
    throw error
  }
}

export async function deleteMessage(queueUrl: string, receiptHandle: string) {
  const config = checkSQSConfiguration()

  if (!config.isConfigured) {
    logger.debug("SQS not configured - skipping message delete", {
      queueUrl,
      receiptHandle: receiptHandle.substring(0, 20) + "...",
      missingConfig: config.missingConfig,
    })
    return { $metadata: { httpStatusCode: 200 } }
  }

  try {
    const sqsClient = await createSQSClient()
    const command = new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })

    return sqsClient.send(command)
  } catch (error) {
    logger.error("Failed to delete SQS message:", error)
    throw error
  }
}
