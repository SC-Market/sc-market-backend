/**
 * Outbound webhook sends (v1/util/webhooks.ts sendWebhook):
 * - redirects are never followed (redirect: "manual"); a 3xx is a failure;
 * - the allowlisted host must resolve only to public addresses at send time,
 *   and the connection is pinned to them (DNS is asked once; the request goes
 *   out through a pinned undici dispatcher);
 * - an error body is read only up to 1 KB.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const lookup = vi.fn()
vi.mock("node:dns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns")>()
  return {
    ...actual,
    default: { ...actual, promises: { ...actual.promises, lookup } },
  }
})
vi.mock(
  "../../../../services/test-accounts/isolation.js",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    actingAsTestAccount: () => false,
  }),
)
vi.mock("../../../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
}))
vi.mock("../../../../logger/logger.js", () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))

const fetchMock = vi.hoisted(() => vi.fn())
vi.mock("undici", async (importOriginal) => ({
  ...(await importOriginal<typeof import("undici")>()),
  fetch: fetchMock,
}))

const { sendWebhookBody } = await import("./webhooks.js")
const { Agent } = await import("undici")

const webhook = {
  webhook_id: "w1",
  webhook_url: "https://discord.com/api/webhooks/1/abc",
} as never

describe("webhook send hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lookup.mockResolvedValue([{ address: "162.159.135.232", family: 4 }])
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  })

  it("sends with redirect: manual through a pinned dispatcher, resolving DNS once", async () => {
    await sendWebhookBody({ content: "hi" }, webhook)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(webhook.webhook_url)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      method: "post",
      redirect: "manual",
    })
    expect(fetchMock.mock.calls[0][1].dispatcher).toBeInstanceOf(Agent)
    expect(lookup).toHaveBeenCalledTimes(1)
  })

  it.each([301, 302, 307, 308])(
    "treats a %s redirect as a failure",
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response(null, {
          status,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
      )
      await expect(sendWebhookBody({ content: "hi" }, webhook)).rejects.toThrow(
        /redirect/,
      )
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it("refuses to send when the host resolves to a private or metadata address", async () => {
    for (const address of ["169.254.169.254", "10.0.0.7", "127.0.0.1"]) {
      lookup.mockResolvedValueOnce([
        { address: "162.159.135.232", family: 4 },
        { address, family: 4 },
      ])
      await expect(sendWebhookBody({ content: "hi" }, webhook)).rejects.toThrow(
        /non-public/,
      )
    }
    lookup.mockResolvedValueOnce([{ address: "::ffff:7f00:1", family: 6 }])
    await expect(sendWebhookBody({ content: "hi" }, webhook)).rejects.toThrow(
      /non-public/,
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("never sends to a non-allowlisted URL", async () => {
    await sendWebhookBody({ content: "hi" }, {
      webhook_id: "w2",
      webhook_url: "https://169.254.169.254/api/webhooks/1/x",
    } as never)
    expect(lookup).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reads at most 1 KB of an error body", async () => {
    fetchMock.mockResolvedValue(
      new Response("x".repeat(50_000), { status: 400 }),
    )
    const err = await sendWebhookBody({ content: "hi" }, webhook).catch(
      (e: Error) => e,
    )
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/status 400/)
    expect((err as Error).message.length).toBeLessThan(1200)
  })
})
