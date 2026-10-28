/**
 * POST /api/v2/images/upload: user-fault image failures must be a
 * ValidationError (400), not a rethrow (500). The handler matched
 * "Unsupported"/"UNSUPPORTED" in the message, so a Lambda VALIDATION_ERROR
 * (or a format message without that word) became a 500. System failures must
 * still propagate.
 *
 * Runs the real BackBlazeCDN + ImageLambdaClient with the AWS Lambda SDK
 * mocked, so the errors are the ones production throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import type { Request } from "express"

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

const { ImagesV2Controller } = await import("./ImagesV2Controller.js")
const { ValidationError } = await import("../../v1/util/errors.js")
const { ImageLambdaClient } = await import(
  "../../../../clients/image-lambda/image-lambda.js"
)

function lambdaReturns(body: object) {
  h.send.mockResolvedValue({
    StatusCode: 200,
    Payload: new TextEncoder().encode(JSON.stringify(body)),
  })
}

async function upload(mimetype = "image/png"): Promise<unknown> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v2-image-upload-"))
  const filePath = path.join(dir, "upload")
  fs.writeFileSync(filePath, "not really an image")
  const req = {
    user: { user_id: "u-1" },
    file: { path: filePath, mimetype, originalname: "a.png", size: 19 },
  } as unknown as Request
  try {
    return await new ImagesV2Controller(req)
      .uploadImage(req)
      .catch((e: unknown) => e)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

beforeEach(() => {
  h.send.mockReset()
  vi.spyOn(
    ImageLambdaClient as unknown as { sleep: () => Promise<void> },
    "sleep",
  ).mockResolvedValue(undefined)
})

describe("ImagesV2Controller.uploadImage user-fault errors", () => {
  it("a moderation rejection with labels is a ValidationError", async () => {
    lambdaReturns({
      success: false,
      error: "MODERATION_FAILED",
      message: "Image failed moderation checks",
      data: { moderationLabels: ["Violence"], confidence: 91.2 },
    })
    const err = await upload()
    expect(err).toBeInstanceOf(ValidationError)
    expect(err).toMatchObject({
      message: "Image failed moderation",
      validationErrors: [
        { field: "photo", message: "Rejected for: Violence (91% confidence)" },
      ],
    })
  })

  it("a Lambda VALIDATION_ERROR is a ValidationError", async () => {
    lambdaReturns({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Image exceeds the 4MB limit",
    })
    const err = await upload()
    expect(err).toBeInstanceOf(ValidationError)
    expect(err).toMatchObject({
      message: "Image failed validation",
      validationErrors: [
        { field: "photo", message: "Image exceeds the 4MB limit" },
      ],
    })
  })

  it("a Lambda UNSUPPORTED_FORMAT is a ValidationError", async () => {
    lambdaReturns({
      success: false,
      error: "UNSUPPORTED_FORMAT",
      message: "Could not decode image",
    })
    const err = await upload()
    expect(err).toBeInstanceOf(ValidationError)
    expect(err).toMatchObject({
      message: "Unsupported image format",
      validationErrors: [{ field: "photo", message: "Could not decode image" }],
    })
  })

  it("an unsupported MIME type is a ValidationError", async () => {
    const err = await upload("image/gif")
    expect(err).toBeInstanceOf(ValidationError)
    expect(err).toMatchObject({
      message: "Unsupported image format",
      validationErrors: [
        {
          field: "photo",
          message:
            "Unsupported MIME type: image/gif. Only PNG, JPG, and WEBP images are allowed.",
        },
      ],
    })
  })
})

describe("ImagesV2Controller.uploadImage system errors", () => {
  it("a Lambda function error propagates (500)", async () => {
    h.send.mockResolvedValue({ StatusCode: 200, FunctionError: "Unhandled" })
    const err = await upload()
    expect(err).not.toBeInstanceOf(ValidationError)
    expect((err as Error).message).toBe("Lambda function error: Unhandled")
  })
})
