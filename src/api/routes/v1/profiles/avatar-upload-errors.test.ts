/**
 * Image uploads that fail because of the user's file (moderation, the image
 * Lambda's validation / format checks, MIME type, multer limits) must be a 400
 * (413 for multer's size limit), not a 500. The handlers used to pick the
 * status by matching message strings, and the Lambda's real messages (e.g.
 * "Image rejected: flagged for ...") didn't match, so they became 500s and
 * reached Bugsnag. Only real system failures may be a 500 + logger.error.
 *
 * Runs the real BackBlazeCDN + ImageLambdaClient with the AWS Lambda SDK
 * mocked, so the errors are the ones production throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import express from "express"
import request from "supertest"

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

const { profile_post_avatar } = await import("./controller.js")
const { singlePhotoUpload, removeUploadsWhenDone } = await import(
  "../util/upload.js"
)
const { errorHandler } = await import("../../../middleware/error-handler.js")
const { ImageLambdaClient } = await import(
  "../../../../clients/image-lambda/image-lambda.js"
)
const { default: logger } = await import("../../../../logger/logger.js")

/** A Lambda invocation that returned `body` as its payload. */
function lambdaReturns(body: object) {
  h.send.mockResolvedValue({
    StatusCode: 200,
    Payload: new TextEncoder().encode(JSON.stringify(body)),
  })
}

function app() {
  const a = express()
  a.use((req, _res, next) => {
    req.user = { user_id: "u-1", avatar: null } as unknown as Express.User
    next()
  })
  a.post(
    "/avatar",
    removeUploadsWhenDone,
    singlePhotoUpload.single("avatar"),
    profile_post_avatar,
  )
  a.use(errorHandler)
  return a
}

function postAvatar(
  contentType = "image/png",
  bytes = Buffer.from("not really a png"),
) {
  return request(app())
    .post("/avatar")
    .attach("avatar", bytes, { filename: "a.png", contentType })
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  h.send.mockReset()
  errorSpy = vi.spyOn(logger, "error")
  errorSpy.mockClear()
  // System-error retries back off with real sleeps; skip them.
  vi.spyOn(
    ImageLambdaClient as unknown as { sleep: () => Promise<void> },
    "sleep",
  ).mockResolvedValue(undefined)
})

describe("POST /avatar user-fault image errors", () => {
  it("moderation rejection with labels is a 400", async () => {
    lambdaReturns({
      success: false,
      error: "MODERATION_FAILED",
      message: "Image failed moderation checks",
      data: { moderationLabels: ["Explicit Nudity"], confidence: 97.4 },
    })
    const res = await postAvatar()
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe(
      "Avatar failed content moderation checks",
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("a Lambda VALIDATION_ERROR is a 400 with the Lambda's message", async () => {
    lambdaReturns({
      success: false,
      error: "VALIDATION_ERROR",
      message: "Image exceeds the 4MB limit",
    })
    const res = await postAvatar()
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe(
      "Avatar failed validation: Image exceeds the 4MB limit",
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("a Lambda UNSUPPORTED_FORMAT is a 400 with the Lambda's message", async () => {
    lambdaReturns({
      success: false,
      error: "UNSUPPORTED_FORMAT",
      message: "Could not decode image",
    })
    const res = await postAvatar()
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe(
      "Avatar failed validation: Could not decode image",
    )
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("an unsupported MIME type is a 400 and never calls the Lambda", async () => {
    const res = await postAvatar("image/gif")
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe(
      "Avatar has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.",
    )
    expect(h.send).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it("multer's file size limit is a 413, not a 500", async () => {
    const res = await postAvatar("image/png", Buffer.alloc(5 * 1000 * 1000 + 1))
    expect(res.status).toBe(413)
    expect(res.body.error.message).toBe(
      "File too large. Please upload a smaller file and try again.",
    )
    expect(h.send).not.toHaveBeenCalled()
  })

  it("an unexpected multer field is a 400, not a 500", async () => {
    const res = await request(app())
      .post("/avatar")
      .attach("banner", Buffer.from("x"), {
        filename: "a.png",
        contentType: "image/png",
      })
    expect(res.status).toBe(400)
    expect(res.body.error.message).toBe("Unexpected file field in upload.")
  })
})

describe("POST /avatar system errors", () => {
  it("a Lambda function error stays a 500 and is logged as an error", async () => {
    h.send.mockResolvedValue({ StatusCode: 200, FunctionError: "Unhandled" })
    const res = await postAvatar()
    expect(res.status).toBe(500)
    expect(res.body.error.message).toBe(
      "Failed to upload avatar. Please try again.",
    )
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to upload avatar:",
      expect.any(Error),
    )
  })
})
