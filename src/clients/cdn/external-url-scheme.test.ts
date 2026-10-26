/** Image URLs were checked by host only, so http: (and other schemes) passed. */
import { describe, it, expect, vi } from "vitest"

// cdn.ts instantiates the Backblaze client on import.
vi.hoisted(() => {
  process.env.B2_KEY_ID ||= "test"
  process.env.B2_APP_KEY ||= "test"
})

const { isAllowedExternalImageUrl } = await import("./cdn.js")

describe("isAllowedExternalImageUrl", () => {
  it("accepts https on an allowed host", () => {
    expect(isAllowedExternalImageUrl("https://i.imgur.com/a.png")).toBe(true)
  })
  it.each([
    "http://i.imgur.com/a.png",
    "ftp://i.imgur.com/a.png",
    "https://evil.example/a.png",
    "not a url",
  ])("rejects %s", (u) => {
    expect(isAllowedExternalImageUrl(u)).toBe(false)
  })
})
