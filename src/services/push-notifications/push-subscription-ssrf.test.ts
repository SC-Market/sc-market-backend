/**
 * Push subscriptions accepted any endpoint URL, so the server's push sender
 * could be pointed at arbitrary (internal) hosts, and an endpoint could be
 * attached to a second account.
 */

import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
}))
vi.mock("./push-notification.database.js", () => ({
  insertPushSubscription: vi.fn(async () => [{ subscription_id: "sub1" }]),
  getOtherUsersWithEndpoint: vi.fn(async () => []),
}))

const db = await import("./push-notification.database.js")
const { pushNotificationService, PushSubscriptionRejectedError } =
  await import("./push-notification.service.js")
const { isAllowedPushEndpoint } = await import("./push-endpoint.js")

const keys = { p256dh: "k", auth: "a" }

beforeEach(() => vi.clearAllMocks())

describe("isAllowedPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/abc",
    "https://db5p.notify.windows.com/w/?token=abc",
  ])("accepts %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(true))

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost:5432/",
    "https://fcm.googleapis.com.evil.example/x",
    "https://fcm.googleapis.com:8443/x",
    "gopher://fcm.googleapis.com/x",
  ])("rejects %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(false))
})

describe("createSubscription", () => {
  it("rejects a non push-service endpoint without saving it", async () => {
    await expect(
      pushNotificationService.createSubscription("u1", {
        endpoint: "https://10.0.0.5/internal",
        keys,
      }),
    ).rejects.toBeInstanceOf(PushSubscriptionRejectedError)
    expect(db.insertPushSubscription).not.toHaveBeenCalled()
  })

  it("refuses an endpoint already registered to another user", async () => {
    ;(db.getOtherUsersWithEndpoint as Mock).mockResolvedValueOnce(["someone-else"])
    await expect(
      pushNotificationService.createSubscription("u1", {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys,
      }),
    ).rejects.toMatchObject({ status: 409 })
    expect(db.insertPushSubscription).not.toHaveBeenCalled()
  })

  it("saves a valid endpoint", async () => {
    await expect(
      pushNotificationService.createSubscription("u1", {
        endpoint: "https://fcm.googleapis.com/fcm/send/abc",
        keys,
      }),
    ).resolves.toBe("sub1")
  })
})
