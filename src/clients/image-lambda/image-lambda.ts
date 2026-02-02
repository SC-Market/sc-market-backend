import { env } from "../../config/env.js"
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda"
import logger from "../../logger/logger.js"

export interface ImageLambdaResponse {
  success: boolean
  message: string
  data?: {
    filename: string
    backblazeUrl: string
    originalFormat: string
    finalFormat: string
    moderationResult: {
      isAppropriate: boolean
      confidence: number
    }
  }
  error?: string
}

// API Gateway response wrapper
interface ApiGatewayResponse {
  statusCode: number
  headers: Record<string, string>
  body: string
}

export class ImageLambdaClient {
  private static lambdaClient: LambdaClient | null = null
  private static functionName: string | null = null

  private static initialize() {
    if (this.lambdaClient) return

    if (!env.AWS_REGION) {
      throw new Error("AWS_REGION environment variable is required")
    }
    if (!env.IMAGE_LAMBDA_NAME) {
      throw new Error("IMAGE_LAMBDA_NAME environment variable is required")
    }

    this.lambdaClient = new LambdaClient({
      region: env.AWS_REGION,
      credentials: {
        accessKeyId: env.BACKEND_ACCESS_KEY_ID!,
        secretAccessKey: env.BACKEND_SECRET_ACCESS_KEY!,
      },
    })

    this.functionName = env.IMAGE_LAMBDA_NAME
  }

  /**
   * Upload an image to the image lambda for processing and moderation
   * @param imageBuffer - The image buffer to process
   * @param filename - The filename for the image
   * @param contentType - The MIME type of the image
   * @returns Promise<ImageLambdaResponse> - The response from the lambda
   */
  static async uploadImage(
    imageBuffer: Buffer,
    filename: string,
    contentType: string,
  ): Promise<ImageLambdaResponse> {
    this.initialize()

    // Convert image to base64
    const base64Image = imageBuffer.toString("base64")

    const payload = {
      imageData: base64Image,
      filename: filename,
      contentType: contentType,
    }

    logger.debug("Sending payload to image lambda", {
      filename,
      contentType,
      imageSize: imageBuffer.length,
      base64Length: base64Image.length,
      payloadKeys: Object.keys(payload),
    })

    try {
      // Create the invoke command
      const command = new InvokeCommand({
        FunctionName: this.functionName!,
        Payload: JSON.stringify(payload),
        InvocationType: "RequestResponse", // Synchronous invocation
      })

      // Invoke the lambda function
      const response = await this.lambdaClient!.send(command)

      logger.debug("Lambda response received", {
        statusCode: response.StatusCode,
        functionError: response.FunctionError,
        logResult: response.LogResult,
        executedVersion: response.ExecutedVersion,
      })

      // Check if the lambda execution was successful
      if (response.StatusCode !== 200) {
        throw new Error(
          `Lambda invocation failed with status: ${response.StatusCode}`,
        )
      }

      if (response.FunctionError) {
        throw new Error(`Lambda function error: ${response.FunctionError}`)
      }

      // Parse the response payload
      if (!response.Payload) {
        throw new Error("Lambda response has no payload")
      }

      const responseText = new TextDecoder().decode(response.Payload)
      logger.debug("Raw Lambda response payload:", { responseText })

      let responseData: ImageLambdaResponse | ApiGatewayResponse
      try {
        responseData = JSON.parse(responseText)
        logger.debug("Parsed response data:", { responseData })
      } catch (parseError) {
        throw new Error(`Failed to parse response as JSON: ${responseText}`)
      }

      // Handle API Gateway response wrapper
      if ("statusCode" in responseData && "body" in responseData) {
        logger.debug("Detected API Gateway response wrapper:", {
          statusCode: responseData.statusCode,
          headers: responseData.headers,
          bodyLength: responseData.body.length,
        })

        // This is an API Gateway response, extract the actual body
        const apiGatewayResponse = responseData as ApiGatewayResponse
        try {
          const actualBody = JSON.parse(apiGatewayResponse.body)
          logger.debug("Extracted actual response body:", { actualBody })
          responseData = actualBody
        } catch (parseError) {
          throw new Error(
            `Failed to parse API Gateway body: ${apiGatewayResponse.body}`,
          )
        }
      } else {
        logger.debug("Direct Lambda response (no API Gateway wrapper)")
      }

      // Now responseData should be ImageLambdaResponse
      const finalResponse = responseData as ImageLambdaResponse
      logger.debug("Final processed response:", { finalResponse })

      // Check if the request was successful
      if (finalResponse.success) {
        logger.debug("Image upload successful:", finalResponse)
        return finalResponse
      } else {
        // Handle error cases
        const errorMessage = finalResponse.message || "Upload failed"

        // Determine if this is a user-fault error or system error
        const isUserFault =
          finalResponse.error &&
          [
            "MODERATION_FAILED",
            "VALIDATION_ERROR",
            "UNSUPPORTED_FORMAT",
          ].includes(finalResponse.error)

        if (isUserFault) {
          logger.debug("Image upload failed due to user input:", {
            error: finalResponse.error,
            message: finalResponse.message,
            data: finalResponse.data,
          })
        } else {
          logger.error("Image upload failed due to system error:", {
            error: finalResponse.error,
            message: finalResponse.message,
            data: finalResponse.data,
          })
        }

        throw new Error(errorMessage)
      }
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Lambda invocation failed: ${error}`)
    }
  }

  /**
   * Check if the image lambda is available and responding
   * @returns Promise<boolean> - True if the lambda is available
   */
  static async isAvailable(): Promise<boolean> {
    this.initialize()

    try {
      const command = new InvokeCommand({
        FunctionName: this.functionName!,
        Payload: JSON.stringify({ test: "health_check" }),
        InvocationType: "RequestResponse",
      })

      const response = await this.lambdaClient!.send(command)
      return response.StatusCode === 200 && !response.FunctionError
    } catch (error) {
      logger.warn("Image lambda health check failed:", error)
      return false
    }
  }
}
