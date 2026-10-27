/**
 * Org recipients by permission (owner-approved, drafts/notifications-design.md
 * §8): every org-side recipient of an org event holds the permission the
 * event requires. One row per member (a member holding two roles that grant it
 * is listed once), current members only, banned accounts excluded. Resolved
 * at send time, so a role change applies to the next event.
 */
import { getKnex } from "../../clients/database/knex-db.js"
import type { DBContractorRole } from "../../clients/database/db-models.js"
import type { UserRecipient } from "./channels.js"

export type OrgPermission = Extract<
  keyof DBContractorRole,
  | "manage_orders"
  | "manage_market"
  | "manage_invites"
  | "manage_recruiting"
  | "manage_stock"
  | "kick_members"
  | "manage_roles"
>

export async function orgMembersWithPermission(
  contractorId: string,
  permission: OrgPermission,
): Promise<(UserRecipient & { contractorId: string })[]> {
  const rows: { user_id: string }[] = await getKnex()("contractor_member_roles as mr")
    .join("contractor_roles as r", "r.role_id", "mr.role_id")
    .join("contractor_members as m", function () {
      this.on("m.user_id", "=", "mr.user_id").andOn("m.contractor_id", "=", "r.contractor_id")
    })
    .join("accounts as a", "a.user_id", "mr.user_id")
    .where("r.contractor_id", contractorId)
    .where(`r.${permission}`, true)
    .where("a.banned", false)
    .distinct("mr.user_id")
    .orderBy("mr.user_id")
  return rows.map((r) => ({ userId: r.user_id, contractorId }))
}

/** Whether a user holds a permission in an org (same rules as orgMembersWithPermission). */
export async function holdsOrgPermission(
  contractorId: string,
  userId: string,
  permission: OrgPermission,
): Promise<boolean> {
  const row = await getKnex()("contractor_member_roles as mr")
    .join("contractor_roles as r", "r.role_id", "mr.role_id")
    .join("contractor_members as m", function () {
      this.on("m.user_id", "=", "mr.user_id").andOn("m.contractor_id", "=", "r.contractor_id")
    })
    .where({ "r.contractor_id": contractorId, "mr.user_id": userId })
    .where(`r.${permission}`, true)
    .first("mr.user_id")
  return !!row
}
