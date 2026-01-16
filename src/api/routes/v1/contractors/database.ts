/**
 * Contractor-related database operations.
 * This module contains all database queries specific to contractors, contractor members, roles, invites, and related functionality.
 */

import { getKnex, database } from "../../../../clients/database/knex-db.js"
import { getNotificationActionByName } from "../notifications/database.js"
import { getContractorTransactions as getContractorTransactionsFromTransactions } from "../transactions/database.js"
import { RecruitingSearchQuery } from "../recruiting/controller.js"
import {
  DBContractor,
  DBContractorMember,
  DBContractorMemberRole,
  DBContractorRole,
  DBContractorInvite,
  DBContractorInviteCode,
  DBContractorArchiveDetails,
  DBImageResource,
  DBReview,
  DBUser,
  DBMarketListing,
  DBTransaction,
  DBNotificationObject,
  MinimalContractor,
} from "../../../../clients/database/db-models.js"
import { cdn } from "../../../../clients/cdn/cdn.js"
import { getContractorRating } from "../util/formatting.js"
import { getMinimalUser } from "../profiles/database.js"

/**
 * Get a Knex query builder instance.
 * This is a helper function to access the connection pool.
 */
const knex = () => getKnex()

/**
 * Insert a new contractor.
 */
export async function insertContractor(
  details: Partial<DBContractor>,
): Promise<DBContractor> {
  return (
    await knex()<DBContractor>("contractors").insert(details).returning("*")
  )[0]
}

/**
 * @deprecated Use `insertContractorMemberRole` instead
 */
export async function insertContractorMember(
  contractor_id: string,
  user_id: string,
  role: string,
  trx?: any,
): Promise<DBContractorMember> {
  if (trx) {
    const result = await trx("contractor_members")
      .insert({ contractor_id, user_id, role })
      .returning("*")
    return result[0]
  }
  return (
    await knex()<DBContractorMember>("contractor_members")
      .insert({ contractor_id, user_id, role })
      .returning("*")
  )[0]
}

/**
 * @deprecated
 */
export async function updateContractorMember(
  where: any,
  value: any,
): Promise<DBContractorMember[]> {
  return knex()<DBContractorMember>("contractor_members")
    .update(value)
    .where(where)
    .returning("*")
}

/**
 * @deprecated
 */
export async function removeContractorMember(
  where: Partial<DBContractorMember>,
): Promise<DBContractorMember[]> {
  return knex()<DBContractorMember>("contractor_members")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Remove all contractor roles for a user in a contractor.
 */
export async function removeUserContractorRoles(
  contractor_id: string,
  user_id: string,
): Promise<DBContractorMemberRole[]> {
  return knex()<DBContractorMemberRole>("contractor_member_roles")
    .where({ user_id: user_id })
    .andWhere({
      role_id: knex().raw(
        "ANY(?)",
        knex()("contractor_roles").where({ contractor_id }).select("role_id"),
      ),
    })
    .delete()
    .returning("*")
}

/**
 * Increment contractor balance.
 */
export async function incrementContractorBalance(
  contractor_id: string,
  amount: number,
  trx?: any,
): Promise<void> {
  const query = trx ? trx("contractors") : knex()("contractors")
  await query
    .where({ contractor_id: contractor_id })
    .increment("balance", amount)
}

/**
 * Decrement contractor balance.
 */
export async function decrementContractorBalance(
  contractor_id: string,
  amount: number,
  trx?: any,
): Promise<void> {
  const query = trx ? trx("contractors") : knex()("contractors")
  await query
    .where({ contractor_id: contractor_id })
    .decrement("balance", amount)
}

/**
 * Get contractor by where clause.
 * @throws Error if contractor not found
 */
export async function getContractor(where: any): Promise<DBContractor> {
  const contractor = await knex()<DBContractor>("contractors")
    .where(where)
    .first()

  if (!contractor) {
    throw new Error("Invalid contractor!")
  }

  return contractor
}

/**
 * Get contractor by where clause (safe, returns undefined if not found).
 */
export async function getContractorSafe(
  where: any,
): Promise<DBContractor | undefined | null> {
  const contractor = await knex()<DBContractor>("contractors")
    .where(where)
    .first()

  return contractor
}

/**
 * Get contractors by IDs.
 */
export async function getContractorsByIds(
  contractorIds: string[],
): Promise<DBContractor[]> {
  if (!contractorIds.length) {
    return []
  }

  return knex()<DBContractor>("contractors").whereIn(
    "contractor_id",
    contractorIds,
  )
}

/**
 * Get minimal contractor information.
 */
export async function getMinimalContractor(
  where: any,
): Promise<MinimalContractor> {
  const contractor = await knex()<DBContractor>("contractors")
    .where(where)
    .first()

  if (!contractor) {
    throw new Error("Invalid contractor!")
  }

  return {
    spectrum_id: contractor.spectrum_id,
    avatar: (await cdn.getFileLinkResource(contractor.avatar))!,
    name: contractor.name,
    rating: await getContractorRating(contractor.contractor_id),
    badges: await getContractorBadges(contractor.contractor_id),
  }
}

/**
 * Get contractor listings by where clause.
 */
export async function getContractorListings(
  where: any,
): Promise<DBContractor[]> {
  return knex()<DBContractor>("contractors").where(where).select()
}

/**
 * Insert contractor invites.
 */
export async function insertContractorInvites(
  values: any[],
): Promise<DBContractorInvite[]> {
  return knex()<DBContractorInvite>("contractor_invites")
    .insert(values)
    .returning("*")
}

/**
 * Remove contractor invites and associated notification objects.
 */
export async function removeContractorInvites(
  user_id: string,
  contractor_id: string,
  trx?: any,
) {
  const query = trx
    ? trx("contractor_invites")
    : knex()<DBContractorInvite>("contractor_invites")
  const invites = await query
    .where({ user_id, contractor_id })
    .delete()
    .returning("*")

  const action = await getNotificationActionByName("contractor_invite")
  for (const invite of invites) {
    await knex()<DBNotificationObject>("notification_object")
      .where({
        entity_id: invite.invite_id,
        action_type_id: action.action_type_id,
      })
      .delete()
  }
}

/**
 * Remove notification object by where clause.
 */
export async function removeNotificationObject(where: any) {
  return knex()<DBNotificationObject>("notification_object")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Get contractor invites by where clause.
 */
export async function getContractorInvites(
  where: any,
): Promise<DBContractorInvite[]> {
  return knex()<DBContractorInvite>("contractor_invites").where(where).select()
}

/**
 * Get contractor invite by where clause.
 */
export async function getContractorInvite(
  where: any,
): Promise<DBContractorInvite | undefined | null> {
  return knex()<DBContractorInvite>("contractor_invites").where(where).first()
}

/**
 * Get invite codes by where clause.
 */
export async function getInviteCodes(
  where: any,
): Promise<DBContractorInviteCode[]> {
  return knex()<DBContractorInviteCode>("contractor_invite_codes")
    .where(where)
    .select("*")
}

/**
 * Update invite codes by where clause.
 */
export async function updateInviteCodes(
  where: any,
  body: any,
): Promise<DBContractorInviteCode[]> {
  return knex()<DBContractorInviteCode>("contractor_invite_codes")
    .where(where)
    .update(body)
    .returning("*")
}

/**
 * Delete invite codes by where clause.
 */
export async function deleteInviteCodes(
  where: any,
): Promise<DBContractorInviteCode[]> {
  return knex()<DBContractorInviteCode>("contractor_invite_codes")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Get invite code by where clause.
 */
export async function getInviteCode(
  where: any,
): Promise<DBContractorInviteCode | null> {
  return knex()<DBContractorInviteCode>("contractor_invite_codes")
    .where(where)
    .first("*")
}

/**
 * Create invite code.
 */
export async function createInviteCode(
  body: Partial<DBContractorInviteCode>,
): Promise<DBContractorInviteCode[]> {
  return knex()<DBContractorInviteCode>("contractor_invite_codes")
    .insert(body)
    .returning("*")
}

/**
 * Remove all contractor invites for a contractor.
 */
export async function removeAllContractorInvites(
  contractor_id: string,
): Promise<DBContractorInvite[]> {
  const invites = await knex()<DBContractorInvite>("contractor_invites")
    .where({ contractor_id })
    .delete()
    .returning("*")

  if (!invites.length) {
    return invites
  }

  const action = await getNotificationActionByName("contractor_invite")

  await knex()<DBNotificationObject>("notification_object")
    .whereIn(
      "entity_id",
      invites.map((invite) => invite.invite_id),
    )
    .andWhere("action_type_id", action.action_type_id)
    .delete()

  return invites
}

/**
 * Upsert contractor archive details.
 */
export async function upsertContractorArchiveDetails(
  values: Partial<DBContractorArchiveDetails>,
): Promise<DBContractorArchiveDetails[]> {
  return knex()<DBContractorArchiveDetails>("contractor_archive_details")
    .insert(values)
    .onConflict("contractor_id")
    .merge(values)
    .returning("*")
}

/**
 * Get contractor archive details.
 */
export async function getContractorArchiveDetails(
  where: Partial<DBContractorArchiveDetails>,
) {
  return knex()<DBContractorArchiveDetails>("contractor_archive_details")
    .where(where)
    .first()
}

/**
 * Get image resource by where clause.
 * @throws Error if resource not found
 */
export async function getImageResource(where: any): Promise<DBImageResource> {
  const resource = await knex()<DBImageResource>("image_resources")
    .where(where)
    .first()

  if (!resource) {
    throw new Error("Invalid resource!")
  }

  return resource
}

/**
 * Insert image resource.
 */
export async function insertImageResource(
  values: any,
): Promise<DBImageResource> {
  const resources = await knex()<DBImageResource>("image_resources")
    .insert(values)
    .returning("*")
  return resources[0]
}

/**
 * Get image resources by where clause.
 */
export async function getImageResources(
  where: any,
): Promise<DBImageResource[]> {
  return knex()<DBImageResource>("image_resources").where(where).select()
}

/**
 * Remove image resource by where clause.
 */
export async function removeImageResource(
  where: any,
): Promise<DBImageResource[]> {
  return knex()<DBImageResource>("image_resources")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Get user contractors (contractors a user is a member of).
 */
export async function getUserContractors(where: any): Promise<DBContractor[]> {
  return knex()<DBContractor>("contractor_members")
    .join(
      "contractors",
      "contractors.contractor_id",
      "=",
      "contractor_members.contractor_id",
    )
    .where(where)
    .select("contractors.*")
}

/**
 * Get user organizations with basic info (for notification preferences).
 * Returns contractor_id and name, ordered alphabetically by name.
 * @param userId - User ID
 * @returns Array of organizations with contractor_id and name
 */
export async function getUserOrganizationsForPreferences(
  userId: string,
): Promise<Array<{ contractor_id: string; name: string }>> {
  return knex()<{ contractor_id: string; name: string }>(
    "contractor_member_roles",
  )
    .join(
      "contractor_roles",
      "contractor_member_roles.role_id",
      "=",
      "contractor_roles.role_id",
    )
    .join(
      "contractors",
      "contractor_roles.contractor_id",
      "=",
      "contractors.contractor_id",
    )
    .where("contractor_member_roles.user_id", userId)
    .where("contractors.archived", false)
    .select("contractors.contractor_id", "contractors.name")
    .distinct()
    .orderBy("contractors.name", "asc")
}

/**
 * Check if user is a member of a contractor/organization.
 * @param userId - User ID
 * @param contractorId - Contractor ID
 * @returns True if user is a member, false otherwise
 */
export async function isUserContractorMember(
  userId: string,
  contractorId: string,
): Promise<boolean> {
  const result = await knex()("contractor_member_roles")
    .join(
      "contractor_roles",
      "contractor_member_roles.role_id",
      "=",
      "contractor_roles.role_id",
    )
    .where("contractor_member_roles.user_id", userId)
    .where("contractor_roles.contractor_id", contractorId)
    .first()

  return !!result
}

/**
 * Get user contractor roles.
 */
export async function getUserContractorRoles(where: any): Promise<
  {
    spectrum_id: string
    role: string
    role_id: string
    name: string
    position: number
  }[]
> {
  // Use contractor_member_roles to get all roles for the user
  return knex()<{
    spectrum_id: string
    role: string
    role_id: string
    name: string
    position: number
  }>("contractor_member_roles")
    .join(
      "contractor_roles",
      "contractor_member_roles.role_id",
      "=",
      "contractor_roles.role_id",
    )
    .join(
      "contractors",
      "contractor_roles.contractor_id",
      "=",
      "contractors.contractor_id",
    )
    .where(where)
    .select(
      "contractors.spectrum_id",
      "contractor_roles.name as role",
      "contractor_roles.role_id",
      "contractor_roles.position",
      "contractors.name",
    )
}

/**
 * Get contractor members usernames.
 */
export async function getContractorMembersUsernames(where: any): Promise<
  {
    username: string
    role: string
  }[]
> {
  return knex()<{
    username: string
    role: string
  }>("contractor_members")
    .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
    .where(where)
    .select("accounts.username", "contractor_members.role")
}

/**
 * Get contractor members usernames and IDs.
 */
export async function getContractorMembersUsernamesAndID(where: any): Promise<
  {
    username: string
    role: string
    user_id: string
  }[]
> {
  return knex()<{
    username: string
    role: string
    user_id: string
  }>("contractor_members")
    .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
    .where(where)
    .select("accounts.username", "contractor_members.role", "accounts.user_id")
}

/**
 * Get contractor members by where clause.
 */
export async function getContractorMembers(
  where: any,
): Promise<DBContractorMember[]> {
  return knex()<DBContractorMember>("contractor_members")
    .where(where)
    .select("*")
}

/**
 * Get contractor members with pagination.
 */
export async function getContractorMembersPaginated(
  contractor_id: string,
  options: {
    page: number
    page_size: number
    search?: string
    sort?: string
    role_filter?: string
  },
): Promise<{ members: any[]; total: number }> {
  const { page, page_size, search, sort = "username", role_filter } = options

  // Build base query using contractor_member_roles for multiple roles support
  let query = knex()("contractor_member_roles")
    .join(
      "contractor_roles",
      "contractor_member_roles.role_id",
      "contractor_roles.role_id",
    )
    .join("accounts", "contractor_member_roles.user_id", "accounts.user_id")
    .where("contractor_roles.contractor_id", contractor_id)
    .select(
      "contractor_member_roles.user_id",
      "contractor_roles.role_id",
      "contractor_roles.name as role_name",
      "accounts.username",
      "accounts.avatar",
    )

  // Add search filter
  if (search) {
    query = query.where("accounts.username", "ilike", `%${search}%`)
  }

  // Add role filter (using role_id)
  if (role_filter) {
    query = query.where("contractor_roles.role_id", role_filter)
  }

  // Get total count (separate query to avoid GROUP BY issues)
  const countQuery = knex()("contractor_member_roles")
    .join(
      "contractor_roles",
      "contractor_member_roles.role_id",
      "contractor_roles.role_id",
    )
    .join("accounts", "contractor_member_roles.user_id", "accounts.user_id")
    .where("contractor_roles.contractor_id", contractor_id)

  if (search) {
    countQuery.where("accounts.username", "ilike", `%${search}%`)
  }

  if (role_filter) {
    countQuery.where("contractor_roles.role_id", role_filter)
  }

  const countResult = await countQuery.countDistinct(
    "contractor_member_roles.user_id as total",
  )
  const total = parseInt(countResult[0].total as string)

  // Add sorting
  switch (sort) {
    case "username":
      query = query.orderBy("accounts.username", "asc")
      break
    case "role":
      query = query.orderBy("contractor_roles.position", "asc")
      break
    default:
      query = query.orderBy("accounts.username", "asc")
  }

  // Add pagination
  query = query.limit(page_size).offset(page * page_size)

  // Execute query to get filtered members
  const filteredMembers = await query

  // Get all roles for each filtered member (regardless of filter)
  const memberIds = [...new Set(filteredMembers.map((m: any) => m.user_id))]
  const allRolesQuery = knex()("contractor_member_roles")
    .join(
      "contractor_roles",
      "contractor_member_roles.role_id",
      "contractor_roles.role_id",
    )
    .join("accounts", "contractor_member_roles.user_id", "accounts.user_id")
    .where("contractor_roles.contractor_id", contractor_id)
    .whereIn("contractor_member_roles.user_id", memberIds)
    .select(
      "contractor_member_roles.user_id",
      "contractor_roles.role_id",
      "accounts.username",
      "accounts.avatar",
    )

  const allRoles = await allRolesQuery

  // Group roles by user to handle multiple roles per member
  const membersMap = new Map()
  allRoles.forEach((member: any) => {
    if (!membersMap.has(member.user_id)) {
      membersMap.set(member.user_id, {
        user_id: member.user_id,
        username: member.username,
        roles: [],
      })
    }
    membersMap.get(member.user_id).roles.push(member.role_id)
  })

  // Convert to array format and enrich with minimal user data
  const membersWithRoles = await Promise.all(
    Array.from(membersMap.values()).map(async (member: any) => {
      const minimalUser = await getMinimalUser({
        user_id: member.user_id,
      })
      return {
        ...minimalUser,
        roles: member.roles,
      }
    }),
  )

  return {
    members: membersWithRoles,
    total,
  }
}

/**
 * Get contractor member roles by where clause.
 */
export async function getContractorMemberRoles(
  where: any,
): Promise<DBContractorMemberRole[]> {
  return knex()<DBContractorMemberRole>("contractor_member_roles")
    .where(where)
    .select("*")
}

/**
 * Get members with matching role.
 */
export async function getMembersWithMatchingRole(
  contractor_id: string,
  subquery: any,
): Promise<DBContractorMemberRole[]> {
  return knex()<DBContractorMemberRole>("contractor_member_roles")
    .whereExists(
      knex()("contractor_roles")
        .whereRaw("contractor_member_roles.role_id = contractor_roles.role_id")
        .andWhere(subquery)
        .andWhere("contractor_id", contractor_id),
    )
    .select("contractor_member_roles.*")
}

/**
 * Get contractor customers (users who have placed orders with this contractor).
 */
export async function getContractorCustomers(contractor_id: string): Promise<
  (DBUser & {
    spent: number
  })[]
> {
  return knex()<DBUser & { spent: number }>("accounts")
    .join("orders", "accounts.user_id", "=", "orders.customer_id")
    .where({ "orders.contractor_id": contractor_id })
    .groupBy("accounts.user_id")
    .select("accounts.*", knex().raw("SUM(orders.cost) as spent"))
}

/**
 * Get contractor reviews.
 */
export async function getContractorReviews(
  contractor_id: string,
): Promise<DBReview[]> {
  return knex()<DBReview>("order_reviews")
    .join("orders", "orders.order_id", "=", "order_reviews.order_id")
    .where({ "orders.contractor_id": contractor_id, role: "customer" })
    .select("order_reviews.*")
    .orderBy("order_reviews.timestamp", "desc")
}

/**
 * @deprecated
 */
export async function getContractorRoleLegacy(
  user_id: string,
  contractor_id: string,
): Promise<
  | {
      username: string
      role: string
    }
  | null
  | undefined
> {
  return knex()<{
    username: string
    role: string
  }>("contractor_members")
    .join(
      "contractors",
      "contractors.contractor_id",
      "=",
      "contractor_members.contractor_id",
    )
    .join("accounts", "contractor_members.user_id", "=", "accounts.user_id")
    .where({
      "contractors.contractor_id": contractor_id,
      "accounts.user_id": user_id,
    })
    .first("accounts.username", "contractor_members.role")
}

/**
 * Get contractor roles by where clause.
 */
export async function getContractorRoles(
  where: any,
): Promise<DBContractorRole[]> {
  return knex()<DBContractorRole>("contractor_roles").where(where).select()
}

/**
 * Get contractor roles (public fields only).
 */
export async function getContractorRolesPublic(
  where: any,
): Promise<DBContractorRole[]> {
  return knex()<DBContractorRole>("contractor_roles")
    .where(where)
    .select("role_id", "name", "contractor_id", "position")
}

/**
 * Get contractor role by where clause.
 */
export async function getContractorRole(
  where: any,
): Promise<DBContractorRole | null | undefined> {
  return knex()<DBContractorRole>("contractor_roles").where(where).first()
}

/**
 * Insert contractor member role.
 */
export async function insertContractorMemberRole(
  values: any,
  trx?: any,
): Promise<DBContractorMemberRole[]> {
  if (trx) {
    return trx("contractor_member_roles").insert(values).returning("*")
  }
  return knex()<DBContractorMemberRole>("contractor_member_roles")
    .insert(values)
    .returning("*")
}

/**
 * Insert contractor role.
 */
export async function insertContractorRole(
  values: any,
): Promise<DBContractorRole[]> {
  return knex()<DBContractorRole>("contractor_roles")
    .insert(values)
    .returning("*")
}

/**
 * Update contractor role.
 */
export async function updateContractorRole(
  where: any,
  values: any,
): Promise<DBContractorRole[]> {
  return knex()<DBContractorRole>("contractor_roles")
    .where(where)
    .update(values)
    .returning("*")
}

/**
 * Delete contractor role.
 */
export async function deleteContractorRole(
  where: any,
): Promise<DBContractorRole[]> {
  return knex()<DBContractorRole>("contractor_roles")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Remove contractor member roles.
 */
export async function removeContractorMemberRoles(
  where: Partial<DBContractorMemberRole>,
  trx?: any,
): Promise<DBContractorMemberRole[]> {
  if (trx) {
    return trx("contractor_member_roles").where(where).delete().returning("*")
  }
  return knex()<DBContractorMemberRole>("contractor_member_roles")
    .where(where)
    .delete()
    .returning("*")
}

/**
 * Get member roles for a user in a contractor.
 */
export async function getMemberRoles(
  contractor_id: string,
  user_id: string,
): Promise<DBContractorRole[]> {
  return knex()<DBContractorRole>("contractor_roles")
    .join(
      "contractor_member_roles",
      "contractor_member_roles.role_id",
      "=",
      "contractor_roles.role_id",
    )
    .where({
      "contractor_roles.contractor_id": contractor_id,
      "contractor_member_roles.user_id": user_id,
    })
    .select("contractor_roles.*")
}

/**
 * Check if user is contractor admin.
 */
export async function isContractorAdmin(
  user_id: string,
  contractor_id: string,
): Promise<boolean> {
  return ["admin", "owner"].includes(
    (await getContractorRoleLegacy(user_id, contractor_id))?.role || "",
  )
}

/**
 * Check if user is contractor owner.
 */
export async function isContractorOwner(
  user_id: string,
  contractor_id: string,
): Promise<boolean> {
  return ["owner"].includes(
    (await getContractorRoleLegacy(user_id, contractor_id))?.role || "",
  )
}

/**
 * Get contractor fields by where clause.
 */
export async function getContractorFields(where: any): Promise<
  {
    field: string
    contractor_id: string
  }[]
> {
  return knex()<{
    field: string
    contractor_id: string
  }>("contractor_fields")
    .join(
      "contractors",
      "contractors.contractor_id",
      "=",
      "contractor_fields.contractor_id",
    )
    .where(where)
    .select("contractor_fields.*")
}

/**
 * Set contractor fields.
 */
export async function setContractorFields(
  contractor_id: string,
  fields: string[],
): Promise<
  {
    field: string
    contractor_id: string
  }[]
> {
  await knex()<{
    field: string
    contractor_id: string
  }>("contractor_fields")
    .where({ contractor_id })
    .delete()

  return knex()<{
    field: string
    contractor_id: string
  }>("contractor_fields")
    .insert(fields.map((f) => ({ field: f, contractor_id })))
    .returning("*")
}

/**
 * Update contractor by where clause.
 */
export async function updateContractor(
  where: any,
  values: Partial<DBContractor>,
) {
  return knex()<DBContractor>("contractors")
    .where(where)
    .update(values)
    .returning("*")
}

/**
 * Get contractor transactions (both sent and received).
 */
export async function getContractorTransactions(contractor_id: string) {
  return getContractorTransactionsFromTransactions(contractor_id)
}

/**
 * Get contractor market listings.
 */
export async function getContractorMarketListings(
  where: any,
): Promise<DBMarketListing[]> {
  return knex()<DBMarketListing>("market_listings")
    .join(
      "contractors",
      "contractors.contractor_id",
      "=",
      "market_listings.contractor_seller_id",
    )
    .where(where)
    .select("market_listings.*")
}

/**
 * Get contractor count by where clause.
 */
/**
 * Get all contractors paginated (for recruiting search).
 */
export async function getAllContractorsPaginated(
  searchQuery: RecruitingSearchQuery,
): Promise<DBContractor[]> {
  const knexInstance = knex()
  let query = knex()<DBContractor>("contractors").where(
    "contractors.archived",
    false,
  )

  switch (searchQuery.sorting) {
    case "name":
      query = query.orderBy(
        "contractors.name",
        searchQuery.reverseSort ? "asc" : "desc",
      )
      break
    case "date":
      query = query.orderBy(
        "contractors.created_at",
        searchQuery.reverseSort ? "asc" : "desc",
      )
      break
    case "rating":
      query = query.orderBy(
        // @ts-ignore
        knex().raw("get_total_rating(null, contractors.contractor_id)"),
        searchQuery.reverseSort ? "asc" : "desc",
      )
      break
    case "members":
      query = query.orderBy("size", searchQuery.reverseSort ? "asc" : "desc")
      break
    default:
      return []
  }

  if (searchQuery.rating) {
    query = query.where(
      knexInstance.raw("get_average_rating(null, contractors.contractor_id)"),
      ">=",
      searchQuery.rating,
    )
  }

  if (searchQuery.fields.length) {
    query = query.where(
      knexInstance.raw(
        "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = contractors.contractor_id))",
      ),
      "@>",
      searchQuery.fields,
    )
  }

  if (searchQuery.query) {
    query = query.where(function () {
      this.where("description", "ILIKE", "%" + searchQuery.query + "%")
        .orWhere("name", "ILIKE", "%" + searchQuery.query + "%")
        .orWhere("spectrum_id", "ILIKE", "%" + searchQuery.query + "%")
    })
  }

  // Language filtering: filter by contractor's supported languages (OR logic)
  if (searchQuery.language_codes && searchQuery.language_codes.length > 0) {
    // Build array expression using knex().raw() with safe parameter binding
    // Create placeholders for each language code and bind them as parameters
    const placeholders = searchQuery.language_codes.map(() => "?").join(",")
    const languageArrayRaw = knex().raw(
      "ARRAY[" + placeholders + "]::text[]",
      searchQuery.language_codes,
    )
    query = query.andWhereRaw(
      knex().raw("COALESCE(supported_languages, ARRAY['en']) && ?", [
        languageArrayRaw,
      ]),
    )
  }

  return query
    .limit(searchQuery.pageSize)
    .offset(searchQuery.pageSize * searchQuery.index)
    .select()
}

/**
 * Get all contractors count (for recruiting search).
 */
export async function getAllContractorsCount(
  searchQuery: RecruitingSearchQuery,
): Promise<{ count: number }[]> {
  const knexInstance = knex()
  let query = knex()<DBContractor>("contractors").where(
    "contractors.archived",
    false,
  )

  if (searchQuery.rating) {
    query = query.where(
      knexInstance.raw("get_average_rating(null, orders.contractor_id)"),
      ">=",
      searchQuery.rating,
    )
  }

  if (searchQuery.fields.length) {
    query = query.where(
      knexInstance.raw(
        "(SELECT ARRAY(SELECT field FROM contractor_fields WHERE contractor_fields.contractor_id = contractors.contractor_id))",
      ),
      "@>",
      searchQuery.fields,
    )
  }

  if (searchQuery.query) {
    query = query.where(function () {
      this.where("description", "ILIKE", "%" + searchQuery.query + "%")
        .orWhere("name", "ILIKE", "%" + searchQuery.query + "%")
        .orWhere("spectrum_id", "ILIKE", "%" + searchQuery.query + "%")
    })
  }

  // Language filtering: filter by contractor's supported languages (OR logic)
  if (searchQuery.language_codes && searchQuery.language_codes.length > 0) {
    // Build array expression using knex().raw() with safe parameter binding
    // Create placeholders for each language code and bind them as parameters
    const placeholders = searchQuery.language_codes.map(() => "?").join(",")
    const languageArrayRaw = knex().raw(
      "ARRAY[" + placeholders + "]::text[]",
      searchQuery.language_codes,
    )
    query = query.andWhereRaw(
      knex().raw("COALESCE(supported_languages, ARRAY['en']) && ?", [
        languageArrayRaw,
      ]),
    )
  }

  return query.count()
}

export async function getContractorCount(where: any) {
  return knex()<{
    count: number
  }>("contractors")
    .where(where)
    .count()
}

/**
 * Get contractor response stats for responsive badge.
 */
export async function getContractorResponseStats(
  contractor_id: string,
): Promise<{
  total_assignments: number
  responded_within_24h: number
  response_rate: number
}> {
  const stats = await knex()("order_response_times")
    .where("assigned_contractor_id", contractor_id)
    .select(
      knex().raw("COUNT(*) as total_assignments"),
      knex().raw(
        "COUNT(CASE WHEN response_time_minutes <= 1440 THEN 1 END) as responded_within_24h",
      ),
    )
    .first()

  const total = parseInt(stats.total_assignments) || 0
  const within24h = parseInt(stats.responded_within_24h) || 0

  return {
    total_assignments: total,
    responded_within_24h: within24h,
    response_rate: total > 0 ? (within24h / total) * 100 : 0,
  }
}

/**
 * Get contractor badges.
 */
/**
 * Get badges for multiple entities (users and contractors).
 */
export async function getBadgesForEntities(
  entities: Array<{ user_id?: string; contractor_id?: string }>,
): Promise<Map<string, { badge_ids: string[]; metadata: any }>> {
  const badgeMap = new Map<string, { badge_ids: string[]; metadata: any }>()

  if (entities.length === 0) {
    return badgeMap
  }

  // Build query for all entities
  const userIds = entities.filter((e) => e.user_id).map((e) => e.user_id!)
  const contractorIds = entities
    .filter((e) => e.contractor_id)
    .map((e) => e.contractor_id!)

  const badges = await knex()("user_badges_materialized")
    .where((builder) => {
      if (userIds.length > 0) {
        builder.orWhereIn("user_id", userIds)
      }
      if (contractorIds.length > 0) {
        builder.orWhereIn("contractor_id", contractorIds)
      }
    })
    .select("*")

  for (const badge of badges) {
    const key = badge.user_id || badge.contractor_id
    if (key) {
      badgeMap.set(key, {
        badge_ids: badge.badge_ids || [],
        metadata: badge.badge_metadata || {},
      })
    }
  }

  return badgeMap
}

export async function getContractorBadges(contractor_id: string): Promise<{
  badge_ids: string[]
  metadata: any
} | null> {
  const badge = await knex()("user_badges_materialized")
    .where("contractor_id", contractor_id)
    .where("entity_type", "contractor")
    .first()

  if (!badge) {
    return null
  }

  return {
    badge_ids: badge.badge_ids || [],
    metadata: badge.badge_metadata || {},
  }
}

/**
 * Search contractors by spectrum_id or name.
 */
export async function searchContractors(
  query: string,
  language_codes?: string[],
): Promise<DBContractor[]> {
  let dbQuery = knex()<DBContractor>("contractors")
    .where({ archived: false })
    .andWhere((qb) => {
      qb.where("spectrum_id", "ilike", `%${query}%`).orWhere(
        "name",
        "ilike",
        `%${query}%`,
      )
    })

  // Language filtering: filter by contractor's supported languages (OR logic)
  if (language_codes && language_codes.length > 0) {
    // Build array expression using knex().raw() with safe parameter binding
    // Create placeholders for each language code and bind them as parameters
    const placeholders = language_codes.map(() => "?").join(",")
    const languageArrayRaw = knex().raw(
      "ARRAY[" + placeholders + "]::text[]",
      language_codes,
    )
    dbQuery = dbQuery.andWhereRaw(
      knex().raw("COALESCE(supported_languages, ARRAY['en']) && ?", [
        languageArrayRaw,
      ]),
    )
  }

  return dbQuery.select()
}

/**
 * Search organization members (contractor members) by username or display name.
 * @deprecated Use contractor-specific search methods instead.
 */
export async function searchOrgMembers(
  query: string,
  contractor_id: string,
): Promise<
  (DBUser & {
    role: "admin" | "owner" | "member"
  })[]
> {
  return knex()<
    DBUser & {
      role: "admin" | "owner" | "member"
    }
  >("accounts")
    .join(
      "contractor_members",
      "accounts.user_id",
      "=",
      "contractor_members.user_id",
    )
    .where("contractor_members.contractor_id", contractor_id)
    .where("username", "ilike", `%${query}%`)
    .or.where("display_name", "ilike", `%${query}%`)
    .select("accounts.*", "contractor_members.role")
}

/**
 * Get contractor's supported languages.
 * Returns array of language codes, defaults to ['en'] if none specified.
 */
export async function getContractorLanguages(
  contractor_id: string,
): Promise<string[]> {
  const contractor = await knex()<DBContractor>("contractors")
    .where({ contractor_id })
    .select("supported_languages")
    .first()

  if (
    !contractor ||
    !contractor.supported_languages ||
    contractor.supported_languages.length === 0
  ) {
    return ["en"] // Default to English
  }

  return contractor.supported_languages
}

/**
 * Set contractor's supported languages.
 * Stores as PostgreSQL array. English is default but not required.
 */
export async function setContractorLanguages(
  contractor_id: string,
  language_codes: string[],
): Promise<void> {
  // Deduplicate
  const uniqueCodes = [...new Set(language_codes)]

  await knex()<DBContractor>("contractors")
    .where({ contractor_id })
    .update({ supported_languages: uniqueCodes })
}
