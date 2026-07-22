import { getKnex } from "../../clients/database/knex-db.js"
import { has_permission, is_member } from "../../api/routes/v1/util/permissions.js"
import * as contractorDb from "../../api/routes/v1/contractors/database.js"
import {
  canManageShop,
  canViewShopPrivate,
  getShopById,
} from "../shops/shop-permissions.service.js"
import {
  BusinessLogicError,
  NotFoundError,
} from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"

export type DashboardOwnerType = "user" | "org" | "shop"

/**
 * A DashboardConfig is stored/returned as an opaque JSON blob. Shape is validated
 * and versioned on the frontend; the backend only persists and size-guards it.
 */
export type DashboardConfig = Record<string, unknown>

export interface DashboardLayout {
  owner_type: DashboardOwnerType
  owner_id: string
  config: DashboardConfig
  updated_by: string
  updated_at: string
}

// Mirror of the DB CHECK constraint so we return a clean 400 instead of a
// constraint violation. 256 KB is far above any realistic dashboard.
const MAX_CONFIG_BYTES = 262144

const OWNER_TYPES: DashboardOwnerType[] = ["user", "org", "shop"]

function assertValidOwnerType(
  ownerType: string,
): asserts ownerType is DashboardOwnerType {
  if (!OWNER_TYPES.includes(ownerType as DashboardOwnerType)) {
    throw new BusinessLogicError(
      ErrorCode.VALIDATION_ERROR,
      `Invalid owner_type: ${ownerType}`,
    )
  }
}

/**
 * Resolve access to a dashboard owner. Throws NotFoundError if the owner does not
 * exist and FORBIDDEN if the user lacks the requested access level.
 *
 * For `org` owners, owner_id is the org's spectrum_id (the identifier the frontend
 * uses); it is resolved to the internal contractor_id before permission checks.
 */
async function assertAccess(
  ownerType: DashboardOwnerType,
  ownerId: string,
  userId: string,
  mode: "view" | "edit",
): Promise<void> {
  if (ownerType === "user") {
    // Personal dashboards are private to their owner.
    if (ownerId !== userId) {
      throw new BusinessLogicError(
        ErrorCode.FORBIDDEN,
        "You do not have access to this dashboard",
      )
    }
    return
  }

  if (ownerType === "org") {
    const contractor = await contractorDb.getContractorSafe({
      spectrum_id: ownerId,
    })
    if (!contractor) {
      throw new NotFoundError("Organization", ownerId)
    }
    const allowed =
      mode === "edit"
        ? await has_permission(
            contractor.contractor_id,
            userId,
            "manage_org_details",
          )
        : await is_member(contractor.contractor_id, userId)
    if (!allowed) {
      throw new BusinessLogicError(
        ErrorCode.FORBIDDEN,
        mode === "edit"
          ? "You do not have permission to edit this organization's dashboard"
          : "You do not have access to this organization's dashboard",
      )
    }
    return
  }

  // shop
  const shop = await getShopById(ownerId)
  if (!shop) {
    throw new NotFoundError("Shop", ownerId)
  }
  const allowed =
    mode === "edit"
      ? await canManageShop(shop, userId)
      : await canViewShopPrivate(shop, userId)
  if (!allowed) {
    throw new BusinessLogicError(
      ErrorCode.FORBIDDEN,
      mode === "edit"
        ? "You do not have permission to edit this shop's dashboard"
        : "You do not have access to this shop's dashboard",
    )
  }
}

/**
 * Read a dashboard layout for an owner. Returns null if no layout has been saved
 * yet (the frontend then renders an empty/default dashboard).
 */
export async function getLayout(
  ownerType: string,
  ownerId: string,
  userId: string,
): Promise<DashboardLayout | null> {
  assertValidOwnerType(ownerType)
  await assertAccess(ownerType, ownerId, userId, "view")

  const knex = getKnex()
  const row = await knex("dashboard_layouts")
    .where({ owner_type: ownerType, owner_id: ownerId })
    .first()

  if (!row) return null

  return {
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    config: row.config,
    updated_by: row.updated_by,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  }
}

/**
 * Upsert a dashboard layout for an owner. Requires edit access.
 */
export async function saveLayout(
  ownerType: string,
  ownerId: string,
  config: DashboardConfig,
  userId: string,
): Promise<DashboardLayout> {
  assertValidOwnerType(ownerType)
  await assertAccess(ownerType, ownerId, userId, "edit")

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new BusinessLogicError(
      ErrorCode.VALIDATION_ERROR,
      "config must be a JSON object",
    )
  }
  if (Buffer.byteLength(JSON.stringify(config), "utf8") >= MAX_CONFIG_BYTES) {
    throw new BusinessLogicError(
      ErrorCode.VALIDATION_ERROR,
      "Dashboard config exceeds the maximum allowed size",
    )
  }

  const knex = getKnex()
  const [row] = await knex("dashboard_layouts")
    .insert({
      owner_type: ownerType,
      owner_id: ownerId,
      config: JSON.stringify(config),
      updated_by: userId,
      updated_at: knex.fn.now(),
    })
    .onConflict(["owner_type", "owner_id"])
    .merge(["config", "updated_by", "updated_at"])
    .returning("*")

  return {
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    config: row.config,
    updated_by: row.updated_by,
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  }
}
