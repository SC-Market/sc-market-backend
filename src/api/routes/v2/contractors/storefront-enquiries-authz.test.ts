/**
 * POST/GET /storefront-enquiries: who may enquire for an org or a shop, the
 * input rules, one open enquiry per target, and that a test org's enquiry
 * notifies nobody. Named without "Controller" so the vitest exclusion for
 * DB-backed v2 controller tests does not skip it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"

const h = vi.hoisted(() => ({
  rows: {} as Record<string, unknown>,
}))

vi.mock("../../../../clients/database/knex-db.js", () => {
  const knex: any = (table: string) => ({
    where: () => ({ first: async () => h.rows[table] }),
  })
  return { getKnex: () => knex }
})
vi.mock("../../v1/util/permissions.js", () => ({ has_permission: vi.fn(), is_member: vi.fn() }))
vi.mock("../../../../services/shops/shop-permissions.service.js", () => ({
  canManageShop: vi.fn(),
  getShopById: vi.fn(),
}))
vi.mock("../../../../services/storefront/enquiries.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../services/storefront/enquiries.js")>()
  return { ...original, createEnquiry: vi.fn(), latestEnquiry: vi.fn(), subdomainTaken: vi.fn() }
})
vi.mock("../../../../services/storefront/enquiry-notify.js", () => ({ notifyAdminsOfEnquiry: vi.fn() }))

const { StorefrontEnquiriesV2Controller } = await import("./StorefrontEnquiriesV2Controller.js")
const { has_permission } = await import("../../v1/util/permissions.js")
const { canManageShop, getShopById } = await import("../../../../services/shops/shop-permissions.service.js")
const enquiries = await import("../../../../services/storefront/enquiries.js")
const { notifyAdminsOfEnquiry } = await import("../../../../services/storefront/enquiry-notify.js")

const USER = { user_id: "u1", role: "user" }
const ORG = { contractor_id: "c1", spectrum_id: "TESTORG", name: "Test Org", archived: false, is_test: false }
const SHOP_ID = "6f1c2b0e-8a7d-4c3b-9e2f-1a2b3c4d5e6f"
const ENQUIRY = {
  enquiry_id: "e1",
  target_type: "org",
  target: "TESTORG",
  requested_subdomain: "testorg",
  message: "",
  contact_method: "site_message",
  status: "open",
  submitted_by_username: "u",
  created_at: "2026-11-01T00:00:00.000Z",
  updated_at: "2026-11-01T00:00:00.000Z",
}

function controller() {
  return new StorefrontEnquiriesV2Controller({ user: USER } as any)
}
const body = (over: Record<string, unknown> = {}) =>
  ({
    target_type: "org",
    target_id: "TESTORG",
    requested_subdomain: "testorg",
    message: "We'd like a branded storefront",
    contact_method: "site_message",
    ...over,
  }) as any

async function status(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return "ok"
  } catch (e: any) {
    return e.code ?? e.name ?? String(e)
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.rows = { contractors: ORG, account_providers: undefined }
  ;(enquiries.subdomainTaken as Mock).mockResolvedValue(false)
  ;(enquiries.createEnquiry as Mock).mockResolvedValue(ENQUIRY)
  ;(enquiries.latestEnquiry as Mock).mockResolvedValue(ENQUIRY)
})

describe("POST /storefront-enquiries", () => {
  it("needs Manage Org Details for an org", async () => {
    ;(has_permission as Mock).mockResolvedValue(false)
    expect(await status(controller().createStorefrontEnquiry(body(), { user: USER } as any))).toBe("FORBIDDEN")
    expect(has_permission).toHaveBeenCalledWith("c1", "u1", "manage_org_details")
    expect(enquiries.createEnquiry).not.toHaveBeenCalled()
  })

  it("stores it and notifies the admins", async () => {
    ;(has_permission as Mock).mockResolvedValue(true)
    const res = await controller().createStorefrontEnquiry(body(), { user: USER } as any)
    expect(res.enquiry).toEqual(ENQUIRY)
    expect(enquiries.createEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ type: "org", id: "c1", is_test: false }),
      { requested_subdomain: "testorg", message: "We'd like a branded storefront", contact_method: "site_message" },
      "u1",
    )
    expect(notifyAdminsOfEnquiry).toHaveBeenCalledWith(ENQUIRY, expect.objectContaining({ id: "c1" }), "u1")
  })

  it("rejects a bad subdomain, a taken one and an over-long message", async () => {
    ;(has_permission as Mock).mockResolvedValue(true)
    expect(await status(controller().createStorefrontEnquiry(body({ requested_subdomain: "api" }), { user: USER } as any))).toBe("ValidationError")
    expect(await status(controller().createStorefrontEnquiry(body({ requested_subdomain: "a.b" }), { user: USER } as any))).toBe("ValidationError")
    expect(await status(controller().createStorefrontEnquiry(body({ message: "x".repeat(1001) }), { user: USER } as any))).toBe("ValidationError")
    ;(enquiries.subdomainTaken as Mock).mockResolvedValue(true)
    expect(await status(controller().createStorefrontEnquiry(body(), { user: USER } as any))).toBe("ValidationError")
    expect(enquiries.createEnquiry).not.toHaveBeenCalled()
  })

  it("Discord contact needs a linked Discord account", async () => {
    ;(has_permission as Mock).mockResolvedValue(true)
    expect(await status(controller().createStorefrontEnquiry(body({ contact_method: "discord" }), { user: USER } as any))).toBe("ValidationError")
    h.rows.account_providers = { provider_id: "123" }
    expect(await status(controller().createStorefrontEnquiry(body({ contact_method: "discord" }), { user: USER } as any))).toBe("ok")
  })

  it("one open enquiry per target: 409", async () => {
    ;(has_permission as Mock).mockResolvedValue(true)
    ;(enquiries.createEnquiry as Mock).mockRejectedValue(new enquiries.OpenEnquiryExistsError(ENQUIRY as any))
    expect(await status(controller().createStorefrontEnquiry(body(), { user: USER } as any))).toBe("CONFLICT")
    expect(notifyAdminsOfEnquiry).not.toHaveBeenCalled()
  })

  it("a shop needs its managers; a test shop is marked as test", async () => {
    ;(getShopById as Mock).mockResolvedValue({
      shop_id: SHOP_ID, slug: "s", name: "S", status: "active", owner_user_id: "u2", owner_contractor_id: null, is_test: true,
    })
    ;(canManageShop as Mock).mockResolvedValue(false)
    const shopBody = body({ target_type: "shop", target_id: SHOP_ID })
    expect(await status(controller().createStorefrontEnquiry(shopBody, { user: USER } as any))).toBe("FORBIDDEN")
    ;(canManageShop as Mock).mockResolvedValue(true)
    expect(await status(controller().createStorefrontEnquiry(shopBody, { user: USER } as any))).toBe("ok")
    expect(enquiries.createEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({ type: "shop", id: SHOP_ID, is_test: true }),
      expect.anything(),
      "u1",
    )
  })

  it("unknown or archived targets are 404", async () => {
    h.rows.contractors = { ...ORG, archived: true }
    expect(await status(controller().createStorefrontEnquiry(body(), { user: USER } as any))).toBe("NotFoundError")
    expect(await status(controller().createStorefrontEnquiry(body({ target_type: "shop", target_id: "nope" }), { user: USER } as any))).toBe("NotFoundError")
  })
})

describe("GET /storefront-enquiries", () => {
  it("only for those who may enquire", async () => {
    ;(has_permission as Mock).mockResolvedValue(false)
    expect(await status(controller().getStorefrontEnquiry("org", "TESTORG", { user: USER } as any))).toBe("FORBIDDEN")
    ;(has_permission as Mock).mockResolvedValue(true)
    expect(await controller().getStorefrontEnquiry("org", "TESTORG", { user: USER } as any)).toEqual({ enquiry: ENQUIRY })
  })
})
