import { describe, expect, it } from "vitest"
import { validateWebhookUrl } from "./validate-webhook-url.js"

describe("validateWebhookUrl", () => {
  it.each([
    "https://discord.com/api/webhooks/123/abc",
    "https://discordapp.com/api/webhooks/123/abc",
    "https://canary.discord.com/api/webhooks/123/abc",
    "https://ptb.discord.com/api/webhooks/123/abc?wait=true",
    "https://discord.com:443/api/webhooks/123/abc", // default port normalises away
  ])("accepts %s", (url) => {
    expect(validateWebhookUrl(url)).toEqual({ valid: true })
  })

  it.each([
    "http://discord.com/api/webhooks/123/abc",
    "https://discord.com.evil.test/api/webhooks/123/abc",
    "https://evil.test/api/webhooks/123/abc",
    "https://discord.com./api/webhooks/123/abc",
    "https://169.254.169.254/api/webhooks/1/x",
    "https://[::1]/api/webhooks/1/x",
    "https://127.0.0.1/api/webhooks/1/x",
    "https://localhost/api/webhooks/1/x",
    "https://discord.com:8443/api/webhooks/123/abc",
    "https://user:pass@discord.com/api/webhooks/123/abc",
    "https://evil.test@discord.com/api/webhooks/123/abc",
    "https://discord.com/api/oauth2/authorize",
    "https://discord.com/api/webhooks",
    "file:///etc/passwd",
    "not a url",
    "",
    42,
    null,
  ])("rejects %s", (url) => {
    expect(validateWebhookUrl(url).valid).toBe(false)
  })
})
