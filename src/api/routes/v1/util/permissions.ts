import {
  DBContractorRole,
  DBOrder,
} from "../../../../clients/database/db-models.js"
import { database } from "../../../../clients/database/knex-db.js"
import {
  currentRequest,
  currentRequestUser,
} from "../../../util/request-context.js"
import {
  tokenAllowsOrg,
  tokenOrgScope,
} from "../../v2/middleware/token-org-access.js"
import * as contractorDb from "../contractors/database.js"
import { isSiteAdmin } from "../../../util/site-role.js"

/**
 * The site-admin short-circuit applies only to the user making the current
 * request, with that request's effective role (populateUser masks it on
 * custom-domain origins). It used to re-read the role from the DB, which
 * bypassed the masking. Outside a request (background tasks, the Discord bot's
 * discord_app) and for users other than the requester there is no admin
 * short-circuit; org roles decide.
 */
function isActingSiteAdmin(user_id: string): boolean {
  const requester = currentRequestUser()
  return !!requester && requester.user_id === user_id && isSiteAdmin(requester)
}

/**
 * An API token restricted to some orgs (its contractor_ids) acts for no other
 * org. For the requester of a token request, has_permission and is_member
 * answer false for orgs outside the token's grant, so every org check behaves
 * as if the user weren't in that org: writes are refused and lists leave the
 * org's private data out. A backstop for the explicit checks
 * (requireContractorAccess, tokenMayUseOrg, v2 tokenRequestGuard); sessions,
 * full/admin tokens, other users and code outside a request are unaffected.
 */
function tokenExcludesOrg(contractor_id: string, user_id: string): boolean {
  const req = currentRequest()
  const requester = req?.user as { user_id?: string } | undefined
  if (!req || !requester || requester.user_id !== user_id) return false
  return !tokenAllowsOrg(tokenOrgScope(req.__tokenInfo), contractor_id)
}

export async function has_permission(
  contractor_id: string,
  user_id: string,
  permission_name: keyof DBContractorRole,
) {
  if (tokenExcludesOrg(contractor_id, user_id)) return false
  if (isActingSiteAdmin(user_id)) {
    return true
  }

  const user_roles = await contractorDb.getMemberRoles(contractor_id, user_id)

  for (const role of user_roles) {
    if (role[permission_name]) {
      return true
    }
  }

  return false
}

/**
 * Whether the user is a member of the org, as a fact, ignoring the request's
 * API-token grant. For checks that are not the requester acting for the org
 * (e.g. "is this customer on the seller side?", which must not become false
 * just because the customer's token wasn't granted the org).
 */
export async function isOrgMemberIgnoringToken(contractor_id: string, user_id: string) {
  const members = await contractorDb.getContractorMembers({
    contractor_id,
    user_id,
  })
  return !!members.length
}

export async function is_member(contractor_id: string, user_id: string) {
  if (tokenExcludesOrg(contractor_id, user_id)) return false
  // let roles = await database.getContractorRoles({contractor_id})
  const members = await contractorDb.getContractorMembers({
    contractor_id,
    user_id,
  })

  return !!members.length
}

export async function outranks(
  contractor_id: string,
  lower_id: string,
  higher_id: string,
) {
  // let roles = await database.getContractorRoles({contractor_id})
  const lower_roles = await contractorDb.getMemberRoles(contractor_id, lower_id)
  const higher_roles = await contractorDb.getMemberRoles(
    contractor_id,
    higher_id,
  )

  const low_min = Math.min(
    ...lower_roles.map((r: DBContractorRole) => r.position),
  )
  const high_min = Math.min(
    ...higher_roles.map((r: DBContractorRole) => r.position),
  )

  return low_min < high_min
}

export async function can_manage_role(
  contractor_id: string,
  role_id: string,
  user_id: string,
) {
  // let roles = await database.getContractorRoles({contractor_id})
  const user_roles = await contractorDb.getMemberRoles(contractor_id, user_id)
  const role = await contractorDb.getContractorRole({ contractor_id, role_id })

  const user_min = Math.min(
    ...user_roles.map((r: DBContractorRole) => r.position),
  )

  return user_min < role!.position
}

export async function get_min_position(contractor_id: string, user_id: string) {
  const user_roles = await contractorDb.getMemberRoles(contractor_id, user_id)

  const user_min = Math.min(
    ...user_roles.map((r: DBContractorRole) => r.position),
  )

  return user_min
}

/**
 * Block removing this role from yourself when it would violate org rules:
 * - Cannot drop your highest-priority role (lowest position).
 * - If that role lacks manage_roles, cannot drop the lowest-position role among
 *   your assignments that still has manage_roles.
 */
export function self_member_role_removal_forbidden(
  memberRoles: DBContractorRole[],
  roleIdToRemove: string,
): boolean {
  if (memberRoles.length === 0) return true
  const removing = memberRoles.find((r) => r.role_id === roleIdToRemove)
  if (!removing) return false

  const sorted = [...memberRoles].sort((a, b) => a.position - b.position)
  const top = sorted[0]!
  if (removing.role_id === top.role_id) return true

  if (!top.manage_roles) {
    const manageCarrier = sorted.find((r) => r.manage_roles)
    if (manageCarrier?.role_id === roleIdToRemove) return true
  }

  return false
}

/** Every grantable org role permission flag. */
export const ORG_ROLE_PERMISSIONS = [
  "manage_roles",
  "manage_orders",
  "kick_members",
  "manage_invites",
  "manage_org_details",
  "manage_stock",
  "manage_market",
  "manage_recruiting",
  "manage_webhooks",
  "manage_blocklist",
  "claim_orders",
  "manage_theme",
] as const satisfies readonly (keyof DBContractorRole)[]

/**
 * Permissions in `granted` that none of the actor's roles hold.
 *
 * Someone with manage_roles may only hand out permissions they have
 * themselves, whether by creating/editing a role or by assigning one
 * (including to themselves). Otherwise manage_roles alone escalates to every
 * permission in the org. Callers exempt site admins.
 */
export function permissionsBeyond(
  actorRoles: DBContractorRole[],
  granted: Partial<Record<keyof DBContractorRole, unknown>>,
): string[] {
  return ORG_ROLE_PERMISSIONS.filter(
    (p) => !!granted[p] && !actorRoles.some((r) => r[p]),
  )
}
