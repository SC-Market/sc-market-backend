import {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from "@aws-sdk/client-sqs"
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts"
import { env } from "../../config/env.js"

// Function to get temporary credentials by assuming the IAM role
async function getTemporaryCredentials() {
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
    console.error("Failed to assume role:", error)
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
  const sqsClient = await createSQSClient()
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(messageBody),
  })

  return sqsClient.send(command)
}

export async function receiveMessage(
  queueUrl: string,
  maxMessages: number = 10,
) {
  const sqsClient = await createSQSClient()
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 20, // Long polling
  })

  return sqsClient.send(command)
}

export async function deleteMessage(queueUrl: string, receiptHandle: string) {
  const sqsClient = await createSQSClient()
  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  })

  return sqsClient.send(command)
}
