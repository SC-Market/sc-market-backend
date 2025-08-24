import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { env } from '../../config/env.js'

// Create SQS client with SQS-specific credentials
export const sqsClient = new SQSClient({
  region: env.AWS_REGION || 'us-east-2',
  credentials: {
    accessKeyId: env.SQS_ACCESS_KEY_ID || '',
    secretAccessKey: env.SQS_SECRET_ACCESS_KEY || '',
  },
})

export async function sendMessage(queueUrl: string, messageBody: any) {
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(messageBody),
  })

  return sqsClient.send(command)
}

export async function receiveMessage(queueUrl: string, maxMessages: number = 10) {
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 20, // Long polling
  })

  return sqsClient.send(command)
}

export async function deleteMessage(queueUrl: string, receiptHandle: string) {
  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  })

  return sqsClient.send(command)
}
