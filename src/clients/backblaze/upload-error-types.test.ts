/**
 * cdn.uploadFile must reject user-fault failures with a typed
 * ImageUploadUserError (so handlers can return 400 without matching message
 * strings) and everything else with a plain Error (a 500). User faults must
 * not be logged as errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { fileURLToPath } from "node:url"

const h = vi.hoisted(() => {
  process.env.B2_KEY_ID = "test-key"
  process.env.B2_APP_KEY = "test-app-key"
  process.env.AWS_REGION = "us-east-2"
  process.env.IMAGE_LAMBDA_NAME = "test-image-lambda"
  return { send: vi.fn() }
})

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = h.send
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}))

const { cdn } = await import("../cdn/cdn.js")
const { ImageUploadUserError } = await import(
  "../image-lambda/image-upload-error.js"
)
const { ImageModerationError } = await import("../image-lambda/image-lambda.js")
const { default: logger } = await import("../../logger/logger.js")

const anyFile = fileURLToPath(import.meta.url)

function lambdaReturns(body: object) {
  h.send.mockResolvedValue({
    StatusCode: 200,
    Payload: new TextEncoder().encode(JSON.stringify(body)),
  })
}

async function uploadError(mimeType: string): Promise<unknown> {
  return cdn.uploadFile("x", anyFile, mimeType).catch((e: unknown) => e)
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  h.send.mockReset()
  errorSpy = vi.spyOn(logger, "error")
  errorSpy.mockClear()
})

describe("cdn.uploadFile error types", () => {
  it("a bad MIME type is an UNSUPPORTED_MIME ImageUploadUserError", async () => {
    const err = await uploadError("image/gif")
    expect(err).toBeInstanceOf(ImageUploadUserError)
    expect(err).toMatchObject({
      code: "UNSUPPORTED_MIME",
      message:
        "Unsupported MIME type: image/gif. Only PNG, JPG, and WEBP images are allowed.",
    })
  })

  it.each(["VALIDATION_ERROR", "UNSUPPORTED_FORMAT"])(
    "a Lambda %s is an ImageUploadUserError with the Lambda's message",
    async (code) => {
      lambdaReturns({ success: false, error: code, message: "bad image" })
      const err = await uploadError("image/png")
      expect(err).toBeInstanceOf(ImageUploadUserError)
      expect(err).toMatchObject({ code, message: "bad image" })
      expect(errorSpy).not.toHaveBeenCalled()
    },
  )

  it("a Lambda MODERATION_FAILED is an ImageModerationError (an ImageUploadUserError)", async () => {
    lambdaReturns({
      success: false,
      error: "MODERATION_FAILED",
      message: "Image failed moderation checks",
      data: { moderationLabels: ["Violence"], confidence: 91.2 },
    })
    const err = await uploadError("image/png")
    expect(err).toBeInstanceOf(ImageModerationError)
    expect(err).toBeInstanceOf(ImageUploadUserError)
    expect(err).toMatchObject({
      code: "MODERATION_FAILED",
      labels: ["Violence"],
      message: "Image rejected: flagged for Violence (91% confidence)",
    })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("a Lambda system failure is a plain Error and is logged", async () => {
    lambdaReturns({ success: false, error: "PROCESSING_ERROR", message: "B2 down" })
    const err = await uploadError("image/png")
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ImageUploadUserError)
    expect(errorSpy).toHaveBeenCalled()
  })
})
