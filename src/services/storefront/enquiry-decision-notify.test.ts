/**
 * Storefront enquiry replies (enquiry-notify.ts notifySubmitterOfDecision):
 * when staff accept (status completed) or decline an enquiry, the person who
 * sent it is told through notify() with a dedicated event and their Personal
 * preferences. Other statuses, note-only edits and deleted senders notify
 * nobody; each decision goes out once. notify() is mocked; the database is
 * the shared mock (test-utils/mock-knex-db.ts), and the admin endpoint is
 * driven with the enquiry service mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

vi.mock("../../clients/database/knex-db.js", async () =>
  (await import("../../test-utils/mock-knex-db.js")).mockKnexDb(),
)
vi.mock("../notify/dispatcher.js", () => ({
  notify: vi.fn(async () => ({
    planned: [],
    delivered: [{}],
    failed: [],
    duplicate: [],
  })),
}))
vi.mock("./enquiries.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  updateEnquiryAsAdmin: vi.fn(),
}))

const { notify } = await import("../notify/dispatcher.js")
const { notifySubmitterOfDecision, enquiryManageUrl } =
  await import("./enquiry-notify.js")
const enquiries = await import("./enquiries.js")
const { CATALOG, CATEGORIES } = await import("../notify/catalog.js")
const { emailDefaultFor } = await import("../notify/catalog.js")
const { unsubscribeScopeFor } = await import("../email/unsubscribe-token.js")
const { AdminStorefrontEnquiriesController } =
  await import("../../api/routes/v2/admin/AdminStorefrontEnquiriesController.js")

const ENQUIRY_ID = "11111111-2222-4333-8444-555555555555"
const enquiry = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    enquiry_id: ENQUIRY_ID,
    target_type: "org",
    target: "TESTORG",
    target_name: "Test Org",
    requested_subdomain: "testorg",
    message: "",
    contact_method: "discord",
    status: "completed",
    submitted_by_username: "alice",
    submitted_by_user_id: "alice-id",
    created_at: "2026-11-01T00:00:00.000Z",
    updated_at: "2026-11-01T00:00:00.000Z",
    is_test: false,
    discord_username: null,
    discord_id: null,
    staff_note: "internal only",
    handled_by_username: "staff",
    ...over,
  }) as never

beforeEach(() => vi.clearAllMocks())

describe("the events", () => {
  it("are their own category, personal, not mandatory, on every channel", () => {
    expect(CATEGORIES.storefront).toEqual({
      orgScoped: false,
      mandatory: false,
      emailMandatory: false,
    })
    for (const key of [
      "storefront.enquiry_accepted",
      "storefront.enquiry_declined",
    ] as const) {
      expect(CATALOG[key]).toMatchObject({
        category: "storefront",
        channels: ["in_app", "push", "email", "discord_dm"],
        defaults: { in_app: true, push: true, email: true, discord_dm: false },
      })
    }
    expect(CATALOG["storefront.enquiry_accepted"].legacyAction).toBe(
      "storefront_enquiry_accepted",
    )
    expect(CATALOG["storefront.enquiry_declined"].legacyAction).toBe(
      "storefront_enquiry_declined",
    )
  })

  it("send email by default, but it respects opt-outs and the unsubscribe link", () => {
    expect(emailDefaultFor("storefront_enquiry_accepted")).toEqual({
      mandatory: false,
      defaultOn: true,
    })
    expect(unsubscribeScopeFor("storefront_enquiry_declined")).toEqual({
      kind: "category",
      category: "storefront",
    })
  })
})

describe("notifySubmitterOfDecision", () => {
  it("accepted (completed): the sender, on their Personal preferences, once per decision", async () => {
    const result = await notifySubmitterOfDecision(enquiry(), "staff-id")
    expect(result).toEqual({ notified: 1 })
    expect(notify).toHaveBeenCalledTimes(1)
    const [event, recipients, opts] = (notify as Mock).mock.calls[0]
    expect(event).toBe("storefront.enquiry_accepted")
    expect(recipients).toEqual([{ userId: "alice-id", contractorId: null }])
    expect(opts).toMatchObject({
      entityId: ENQUIRY_ID,
      actorId: "staff-id",
      dedupeKey: `${ENQUIRY_ID}:completed`,
    })
    expect(opts.messages.push.title).toBe("Storefront enquiry accepted")
    expect(opts.messages.push.body).toContain("testorg.sc-market.space")
    expect(opts.messages.push.data.url).toMatch(
      /\/org\/TESTORG\/manage\/storefront$/,
    )
    expect(opts.messages.email.data.enquiry).toMatchObject({
      enquiry_id: ENQUIRY_ID,
      target_name: "Test Org",
      requested_subdomain: "testorg",
      status: "completed",
    })
  })

  it("never puts the staff note in what the sender gets", async () => {
    await notifySubmitterOfDecision(enquiry({ status: "declined" }), "staff-id")
    expect(JSON.stringify((notify as Mock).mock.calls[0][2])).not.toContain(
      "internal only",
    )
  })

  it("declined: its own event, linking a shop's enquiry to the shop's settings", async () => {
    await notifySubmitterOfDecision(
      enquiry({ status: "declined", target_type: "shop", target: "my-shop" }),
      "staff-id",
    )
    const [event, , opts] = (notify as Mock).mock.calls[0]
    expect(event).toBe("storefront.enquiry_declined")
    expect(opts.dedupeKey).toBe(`${ENQUIRY_ID}:declined`)
    expect(opts.messages.push.title).toBe("Storefront enquiry declined")
    expect(opts.messages.push.data.url).toMatch(/\/shop\/my-shop\/settings$/)
  })

  it.each(["open", "in_progress"])(
    "status %s notifies nobody",
    async (status) => {
      expect(
        await notifySubmitterOfDecision(enquiry({ status }), "staff-id"),
      ).toEqual({ notified: 0 })
      expect(notify).not.toHaveBeenCalled()
    },
  )

  it("a deleted sender (no user id) notifies nobody", async () => {
    expect(
      await notifySubmitterOfDecision(
        enquiry({ submitted_by_user_id: null }),
        "staff-id",
      ),
    ).toEqual({ notified: 0 })
    expect(notify).not.toHaveBeenCalled()
  })

  it("never throws when the dispatcher does", async () => {
    ;(notify as Mock).mockRejectedValueOnce(new Error("boom"))
    await expect(
      notifySubmitterOfDecision(enquiry(), "staff-id"),
    ).resolves.toEqual({ notified: 0 })
  })

  it("encodes the handle in the link", () => {
    expect(enquiryManageUrl({ target_type: "shop", target: "a b" })).toMatch(
      /\/shop\/a%20b\/settings$/,
    )
  })
})

describe("PATCH /admin/storefront-enquiries/{id}", () => {
  const request = { user: { user_id: "staff-id", role: "admin" } } as never

  it("a status change to declined notifies the sender with the updated enquiry", async () => {
    ;(enquiries.updateEnquiryAsAdmin as Mock).mockResolvedValue(
      enquiry({ status: "declined" }),
    )
    await new AdminStorefrontEnquiriesController().updateStorefrontEnquiry(
      request,
      ENQUIRY_ID,
      { status: "declined" },
    )
    expect(enquiries.updateEnquiryAsAdmin).toHaveBeenCalledWith(
      ENQUIRY_ID,
      { status: "declined", staff_note: undefined },
      "staff-id",
    )
    expect(notify).toHaveBeenCalledWith(
      "storefront.enquiry_declined",
      [{ userId: "alice-id", contractorId: null }],
      expect.anything(),
    )
  })

  it("a note-only edit notifies nobody, even on a decided enquiry", async () => {
    ;(enquiries.updateEnquiryAsAdmin as Mock).mockResolvedValue(
      enquiry({ status: "completed" }),
    )
    await new AdminStorefrontEnquiriesController().updateStorefrontEnquiry(
      request,
      ENQUIRY_ID,
      { staff_note: "called them" },
    )
    expect(notify).not.toHaveBeenCalled()
  })

  it("moving to in progress notifies nobody", async () => {
    ;(enquiries.updateEnquiryAsAdmin as Mock).mockResolvedValue(
      enquiry({ status: "in_progress" }),
    )
    await new AdminStorefrontEnquiriesController().updateStorefrontEnquiry(
      request,
      ENQUIRY_ID,
      { status: "in_progress" },
    )
    expect(notify).not.toHaveBeenCalled()
  })
})
