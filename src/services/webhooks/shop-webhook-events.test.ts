/**
 * Shop webhook events that never fired:
 * - Order Created only fired for offers and unassigned orders, so an order
 *   created already assigned (e.g. to a personal shop's owner) sent nothing.
 * - Order Assigned and Order Review were never sent to shop webhooks.
 */
import { describe, it, expect, beforeEach, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../clients/cdn/cdn.js", () => ({
  cdn: { getFileLinkResource: vi.fn() },
  external_resource_regex: /^$/,
}))
vi.mock("../../clients/database/knex-db.js", () => ({
  database: { knex: vi.fn() },
  getKnex: vi.fn(),
}))
vi.mock("../../api/routes/v1/notifications/database.js", () => ({
  getNotificationWebhooksByAction: vi.fn(),
  getNotificationActionByName: vi.fn(async () => ({ action_type_id: 1 })),
  insertNotificationObjects: vi.fn(async () => [{ notification_object_id: "n1" }]),
  insertNotificationChange: vi.fn(),
  insertNotifications: vi.fn(),
}))
vi.mock("../../api/routes/v1/profiles/database.js", () => ({
  getMinimalUser: vi.fn(async ({ user_id }: { user_id: string }) => ({
    username: user_id,
    display_name: `Name ${user_id}`,
    avatar: "",
  })),
}))
vi.mock("../../api/routes/v1/orders/database.js", () => ({
  getOrder: vi.fn(),
}))
vi.mock("../push-notifications/push-notification.service.js", () => ({
  pushNotificationService: { sendPushNotification: vi.fn() },
}))
vi.mock("../email/email.service.js", () => ({
  emailService: { sendNotificationEmail: vi.fn() },
}))

const notificationDb = await import("../../api/routes/v1/notifications/database.js")
const orderDb = await import("../../api/routes/v1/orders/database.js")
const webhookUtil = await import("../../api/routes/v1/util/webhooks.js")
const { notificationService } = await import("../notifications/notification.service.js")

const fetchMock = vi.fn(async () => ({ ok: true, status: 204, text: async () => "" }))
vi.stubGlobal("fetch", fetchMock)

const order = {
  order_id: "o1",
  shop_id: "shop-1",
  customer_id: "buyer",
  assigned_id: "seller",
  contractor_id: null,
  title: "10 SCU Quantainium",
  description: "",
  cost: "1000",
  kind: "Delivery",
  rush: false,
  collateral: 0,
  timestamp: new Date("2026-10-25T00:00:00Z"),
} as never

/** Shop webhook "W-<shop>-<action>", user webhook "W-<user>-<action>". */
function routeWebhooks() {
  ;(notificationDb.getNotificationWebhooksByAction as Mock).mockImplementation(
    async (where: Record<string, string>, action: string) => {
      const owner =
        where["notification_webhooks.shop_id"] ??
        where.shop_id ??
        where["notification_webhooks.user_id"]
      if (!owner) return []
      return [
        {
          webhook_id: `W-${owner}-${action}`,
          webhook_url: `https://discord.com/api/webhooks/1/${owner}-${action}`,
        },
      ]
    },
  )
}

function postedTo(): string[] {
  return fetchMock.mock.calls.map((c) => String((c as unknown[])[0]).split("/").pop()!)
}

describe("shop webhook events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeWebhooks()
  })

  it("Order Created fires for an order that is already assigned", async () => {
    await notificationService.createOrderNotification(order)
    expect(postedTo()).toContain("shop-1-order_create")
    // ...and, since it's created assigned, so does Order Assigned
    expect(postedTo()).toContain("shop-1-order_assigned")
  })

  it("assigning an order sends Order Assigned", async () => {
    await notificationService.createOrderAssignedNotification(order)
    expect(postedTo().sort()).toEqual(["seller-order_assigned", "shop-1-order_assigned"])
  })

  it("the site-wide Public Order Created feed only gets open public orders", async () => {
    const publicOrder = { ...(order as object), shop_id: null } as never
    await webhookUtil.sendOrderWebhooks(publicOrder)
    expect(notificationDb.getNotificationWebhooksByAction).not.toHaveBeenCalledWith(
      {},
      "public_order_create",
    )

    vi.clearAllMocks()
    await webhookUtil.sendOrderWebhooks({ ...(publicOrder as object), assigned_id: null } as never)
    expect(notificationDb.getNotificationWebhooksByAction).toHaveBeenCalledWith(
      {},
      "public_order_create",
    )
  })

  it("Order Assigned goes to the shop's webhooks and the assignee's", async () => {
    await webhookUtil.sendOrderAssignedWebhooks(order)
    expect(postedTo().sort()).toEqual(["seller-order_assigned", "shop-1-order_assigned"])
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body)
    expect(body.username).toBe("SC Market - Order Assigned")
    expect(body.allowed_mentions).toEqual({ parse: [] })
  })

  it("Order Review goes to the shop's webhooks", async () => {
    ;(orderDb.getOrder as Mock).mockResolvedValue(order)
    await notificationService.createOrderReviewNotification({
      review_id: "r1",
      order_id: "o1",
      user_author: "buyer",
      contractor_author: null,
      content: "Fast delivery",
      rating: 5,
      role: "customer",
      timestamp: new Date("2026-10-25T00:00:00Z"),
    } as never)
    expect(postedTo()).toContain("shop-1-order_review")
    const call = fetchMock.mock.calls.find((c) =>
      String((c as unknown[])[0]).endsWith("shop-1-order_review"),
    ) as unknown as [string, { body: string }]
    const body = JSON.parse(call[1].body)
    expect(body.embeds[0].fields[1]).toEqual({ name: "Buyer's review", value: "Fast delivery" })
  })
})
