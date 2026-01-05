/**
 * AWS SES client for sending emails
 */

import {
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
} from "@aws-sdk/client-ses"
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"

/**
 * Get temporary credentials by assuming the IAM role
 */
async function getTemporaryCredentials() {
  if (!env.BACKEND_ACCESS_KEY_ID || !env.BACKEND_SECRET_ACCESS_KEY) {
    throw new Error(
      "SES credentials not configured. Missing BACKEND_ACCESS_KEY_ID or BACKEND_SECRET_ACCESS_KEY",
    )
  }

  const stsClient = new STSClient({
    region: env.AWS_REGION || "us-east-2",
    credentials: {
      accessKeyId: env.BACKEND_ACCESS_KEY_ID,
      secretAccessKey: env.BACKEND_SECRET_ACCESS_KEY,
    },
  })

  try {
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: env.BACKEND_ROLE_ARN || "",
      RoleSessionName: "ses-backend-service",
      DurationSeconds: 3600, // 1 hour
    })

    const response = await stsClient.send(assumeRoleCommand)

    return {
      accessKeyId: response.Credentials!.AccessKeyId!,
      secretAccessKey: response.Credentials!.SecretAccessKey!,
      sessionToken: response.Credentials!.SessionToken!,
    }
  } catch (error) {
    logger.error("Failed to assume role for SES:", error)
    throw error
  }
}

/**
 * Create SES client with role assumption
 */
export async function createSESClient() {
  const credentials = await getTemporaryCredentials()
  const region = env.AWS_SES_REGION || env.AWS_REGION || "us-east-1"

  return new SESClient({
    region: region,
    credentials,
  })
}

/**
 * Send email via AWS SES
 */
export async function sendEmailViaSES(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
  fromEmail?: string,
  replyTo?: string,
): Promise<string> {
  const sesClient = await createSESClient()
  const from = fromEmail || env.EMAIL_FROM_ADDRESS

  if (!from) {
    throw new Error("EMAIL_FROM_ADDRESS not configured")
  }

  const command = new SendEmailCommand({
    Source: env.EMAIL_FROM_NAME ? `${env.EMAIL_FROM_NAME} <${from}>` : from,
    Destination: {
      ToAddresses: [to],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: "UTF-8",
      },
      Body: {
        Html: {
          Data: htmlBody,
          Charset: "UTF-8",
        },
        Text: {
          Data: textBody,
          Charset: "UTF-8",
        },
      },
    },
    ReplyToAddresses: replyTo
      ? [replyTo]
      : env.EMAIL_REPLY_TO
        ? [env.EMAIL_REPLY_TO]
        : undefined,
  })

  try {
    const response = await sesClient.send(command)
    return response.MessageId || ""
  } catch (error) {
    logger.error("Failed to send email via SES:", error)
    throw error
  }
}
