import { RequestHandler } from "express"
import { database } from "../../../../clients/database/knex-db.js"
import * as notificationDb from "../notifications/database.js"
import * as profileDb from "../profiles/database.js"
import * as contractorDb from "../contractors/database.js"

import { Contractor, User } from "../api-models.js"
import {
  createErrorResponse,
  createResponse,
  createNotFoundErrorResponse,
  createForbiddenErrorResponse,
  createConflictErrorResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { authorizeContractor, createContractor } from "./helpers.js"
import { cdn, external_resource_regex } from "../../../../clients/cdn/cdn.js"
import { randomUUID } from "node:crypto"
import fs from "node:fs"
import logger from "../../../../logger/logger.js"
import {
  DBContractor,
  DBContractorMemberRole,
} from "../../../../clients/database/db-models.js"
import { contractorDetails } from "../util/formatting.js"
import {
  can_manage_role,
  get_min_position,
  is_member,
  outranks,
} from "../util/permissions.js"
import { createNotificationWebhook } from "../util/webhooks.js"
import { notificationService } from "../../../../services/notifications/notification.service.js"
import { fetchRSIOrgSCAPI } from "../../../../clients/scapi/scapi.js"
import { authorizeProfile } from "../profiles/helpers.js"
import { convertQuery } from "../recruiting/controller.js"
import { discordService } from "../../../../services/discord/discord.service.js"
import { archiveContractor } from "../../../../services/contractors/archive-contractor.service.js"
import { MinimalUser } from "../../../../clients/database/db-models.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"
import { withTransaction } from "../../../../clients/database/transaction.js"
import {
  validateLanguageCodes,
  getLanguageName,
} from "../../../../constants/languages.js"

export const post_auth_link: RequestHandler = async (req, res) => {
  const user = req.user as User

  const spectrum_id = req.body.contractor || ""

  try {
    const cobj = await contractorDb.getContractor({ spectrum_id: spectrum_id })
    if (cobj) {
      res.status(409).json(
        createConflictErrorResponse("Org is already registered!")
      )
      return
    }
  } catch {}

  if (await authorizeContractor(spectrum_id, user)) {
    const contractor = await contractorDb.getContractor({ spectrum_id })
    res.json(createResponse(contractorDetails(contractor, user)))
  } else {
    res.status(403).json(
      createForbiddenErrorResponse("Failed to authenticate, code not found")
    )
  }
}

export const post_root: RequestHandler = async (req, res) => {
  const user = req.user as User

  const { description, name, identifier, logo, banner, language_codes } =
    req.body as {
      description: string
      name: string
      identifier: string
      logo: string
      banner: string
      language_codes?: string[]
    }

  try {
    const cobj = await contractorDb.getContractor({
      spectrum_id: `~${identifier.toUpperCase()}`,
    })
    if (cobj) {
      res.status(409).json(
        createConflictErrorResponse("Org is already registered!")
      )
      return
    }
  } catch {}

  await createContractor({
    description: description.trim(),
    name,
    spectrum_id: `~${identifier.toUpperCase()}`,
    owner_id: user.user_id,
    logo,
    banner,
    member_count: 1,
    locale: user.locale,
    language_codes: language_codes || ["en"], // Default to English if not provided
  })
  res.status(201).json(createResponse({ result: "Success" }))
  return
}

export const delete_spectrum_id: RequestHandler = async (req, res) => {
  const contractor = req.contractor!
  const user = req.user as User

  if (!contractor) {
    res
      .status(404)
      .json(createNotFoundErrorResponse("Organization not found"))
    return
  }

  if (contractor.archived) {
    res.status(204).send()
    return
  }

  if (user.role !== "admin") {
    const roles = await contractorDb.getMemberRoles(
      contractor.contractor_id,
      user.user_id,
    )
    const isOwner = roles.some((role) => role.role_id === contractor.owner_role)
    if (!isOwner) {
      res.status(403).json(
        createErrorResponse({
          message: "Only organization owners can archive this contractor",
        }),
      )
      return
    }
  }

  try {
    const result = await archiveContractor({
      contractor,
      actorId: user.user_id,
      reason: req.body?.reason,
    })

    if (!result.alreadyArchived) {
      req.contractor = {
        ...contractor,
        archived: true,
        name: result.archivedLabel ?? contractor.name,
      }
    }

    res.status(204).send()
  } catch (error) {
    logger.error("Failed to archive contractor", {
      contractorId: contractor.contractor_id,
      error,
    })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to archive organization"
      )
    )
  }
}

export const get_spectrum_id_audit_logs: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const contractor = req.contractor!
    const page = Math.max(1, parseInt(req.query.page as string) || 1)
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(req.query.page_size as string) || 20),
    )
    const action = req.query.action as string | undefined
    const actorId = req.query.actor_id as string | undefined
    const startDate = req.query.start_date as string | undefined
    const endDate = req.query.end_date as string | undefined

    // Build query - automatically filter by this contractor
    // Include events where:
    // 1. Subject is the contractor itself (subject_type = "contractor" AND subject_id = contractor_id)
    // 2. OR metadata contains contractor_id matching this contractor (for member, role, invite, etc. events)
    let query = database.knex("audit_logs").where((builder) => {
      builder
        .where((subBuilder) => {
          subBuilder
            .where("subject_type", "contractor")
            .where("subject_id", contractor.contractor_id)
        })
        .orWhere((subBuilder) => {
          // Check if metadata JSON contains contractor_id matching this contractor
          subBuilder.whereRaw("metadata->>'contractor_id' = ?", [
            contractor.contractor_id,
          ])
        })
    })

    // Apply additional filters
    if (action) {
      query = query.where("action", action)
    }
    if (actorId) {
      query = query.where("actor_id", actorId)
    }
    if (startDate) {
      query = query.where("created_at", ">=", startDate)
    }
    if (endDate) {
      query = query.where("created_at", "<=", endDate)
    }

    // Get total count
    const countQuery = query.clone().clearSelect().count("* as count").first()
    const totalResult = await countQuery
    const total = totalResult ? parseInt(totalResult.count as string) : 0

    // Apply pagination and ordering
    const offset = (page - 1) * pageSize
    const logs = await query
      .select("audit_logs.*")
      .orderBy("created_at", "desc")
      .limit(pageSize)
      .offset(offset)

    // Fetch actor information for logs that have actor_id
    const actorIds = logs
      .map((log) => log.actor_id)
      .filter((id): id is string => id !== null)
    const actorsMap = new Map<string, MinimalUser>()

    if (actorIds.length > 0) {
      const actors = await Promise.all(
        actorIds.map(async (id) => {
          try {
            const user = await profileDb.getMinimalUser({ user_id: id })
            return { id, user }
          } catch {
            return null
          }
        }),
      )

      actors.forEach((result) => {
        if (result) {
          actorsMap.set(result.id, result.user)
        }
      })
    }

    // Format response
    const items = logs.map((log) => ({
      audit_log_id: log.audit_log_id,
      action: log.action,
      actor_id: log.actor_id,
      actor: log.actor_id ? actorsMap.get(log.actor_id) || null : null,
      subject_type: log.subject_type,
      subject_id: log.subject_id,
      metadata: log.metadata,
      created_at: log.created_at,
    }))

    res.json(
      createResponse({
        items,
        total,
        page,
        page_size: pageSize,
      }),
    )
  } catch (error) {
    logger.error("Error fetching contractor audit logs", { error })
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to fetch audit logs" }))
  }
  return
}

export const get_search_query: RequestHandler = async (req, res, next) => {
  const query = req.params["query"]

  // Parse language_codes from query params if provided
  const language_codes = req.query.language_codes
    ? (req.query.language_codes as string)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined

  const contractors = await contractorDb.searchContractors(
    query,
    language_codes,
  )

  res.json(
    createResponse(
      await Promise.all(
        contractors.map(async (contractor) => {
          return {
            spectrum_id: contractor.spectrum_id,
            name: contractor.name,
            avatar: await cdn.getFileLinkResource(contractor.avatar),
          }
        }),
      ),
    ),
  )
}

export const get_invites_invite_id: RequestHandler = async (req, res, next) => {
  const { invite_id } = req.params

  // Invite Code
  const [invite] = await contractorDb.getInviteCodes({
    invite_id,
  })

  if (!invite) {
    res.status(404).json(createNotFoundErrorResponse("Invalid invite"))
    return
  }

  const contractor: DBContractor = await contractorDb.getContractor({
    contractor_id: invite.contractor_id,
  })

  res.json(createResponse({ spectrum_id: contractor.spectrum_id }))
}

export const post_invites_invite_id_accept: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User

  const { invite_id } = req.params

  // Invite Code
  const [invite] = await contractorDb.getInviteCodes({
    invite_id,
  })

  if (!invite) {
    res.status(404).json(createNotFoundErrorResponse("Invalid invite"))
    return
  }

  const contractor: DBContractor = await contractorDb.getContractor({
    contractor_id: invite.contractor_id,
  })

  if (contractor.archived) {
    res.status(409).json(
      createErrorResponse({
        message: "Organization has been archived",
        status: "error",
      }),
    )
    return
  }

  const role = await contractorDb.getContractorRoleLegacy(
    user.user_id,
    contractor.contractor_id,
  )

  if (role) {
    res.status(409).json(createConflictErrorResponse("Already member"))
    return
  }

  await contractorDb.updateInviteCodes(
    {
      invite_id,
      contractor_id: contractor.contractor_id,
    },
    { times_used: invite.times_used + 1 },
  )

  await contractorDb.removeContractorInvites(
    user.user_id,
    contractor.contractor_id,
  )

  await contractorDb.insertContractorMember(
    contractor.contractor_id,
    user.user_id,
    "member",
  )

  await contractorDb.insertContractorMemberRole({
    user_id: user.user_id,
    role_id: contractor.default_role,
  })

  // Log invite acceptance and member addition
  await auditLogService.record({
    action: "invite.accepted",
    actorId: user.user_id,
    subjectType: "contractor_invite",
    subjectId: invite_id,
    metadata: {
      contractor_id: contractor.contractor_id,
      spectrum_id: contractor.spectrum_id,
      invite_id,
    },
  })

  await auditLogService.record({
    action: "member.added",
    actorId: user.user_id,
    subjectType: "contractor_member",
    subjectId: user.user_id,
    metadata: {
      contractor_id: contractor.contractor_id,
      spectrum_id: contractor.spectrum_id,
      method: "invite_code",
      invite_id,
    },
  })

  res.json(createResponse({ result: "Success" }))
}

export const get_spectrum_id_members_search_query: RequestHandler = async (
  req,
  res,
  next,
) => {
  const query = req.params["query"]

  const users = await contractorDb.searchOrgMembers(
    query,
    req.contractor!.contractor_id,
  )

  res.json(
    createResponse(
      await Promise.all(
        users.map(async (user) => {
          const pubProf = await profileDb.getMinimalUser({
            user_id: user.user_id,
          })

          return { ...pubProf, role: user.role }
        }),
      ),
    ),
  )
}

export const get_spectrum_id_members_csv: RequestHandler = async (
  req,
  res,
  next,
) => {
  const members = await contractorDb.getContractorMembersUsernamesAndID({
    "contractor_members.contractor_id": req.contractor!.contractor_id,
  })

  res
    .setHeader("Content-Type", "application/csv")
    .set(
      "Content-Disposition",
      `attachment; filename="${req.contractor!.spectrum_id}_members.csv"`,
    )
    .json(members.map((m) => m.username).join("\n"))
}

export const get_spectrum_id_customers: RequestHandler = async (req, res) => {
  const user = req.user as User
  const contractor: Contractor = req.contractor!

  const contractors = await contractorDb.getUserContractors({
    "contractor_members.user_id": user.user_id,
  })

  const unrelated =
    contractors.filter((c) => c.contractor_id === contractor!.contractor_id)
      .length === 0
  if (unrelated) {
    res.status(403).json(
      createForbiddenErrorResponse("You are not authorized to view this data")
    )
    return
  }

  const customers = await contractorDb.getContractorCustomers(
    contractor.contractor_id,
  )
  res.json(
    await Promise.all(
      customers.map(async (customer) => {
        const prof = await profileDb.getMinimalUser({
          user_id: customer.user_id,
        })
        return {
          ...prof,
          spent: customer.spent,
        }
      }),
    ),
  )
}

export const get_spectrum_id_reviews: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor: Contractor = req.contractor!

  const reviews = await contractorDb.getContractorReviews(
    contractor.contractor_id,
  )
  res.json(
    createResponse(
      await Promise.all(
        reviews.map(async (review) => {
          return {
            ...review,
            user_author: review.user_author
              ? await profileDb.getMinimalUser({ user_id: review.user_author })
              : null,
            contractor_author: review.contractor_author
              ? await contractorDb.getMinimalContractor({
                  contractor_id: review.contractor_author,
                })
              : null,
          }
        }),
      ),
    ),
  )
}

export const get_spectrum_id: RequestHandler = async (req, res, next) => {
  const user = req.user as User

  res.json(createResponse(await contractorDetails(req.contractor!, user)))
}

export const get_spectrum_id_members_username: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!
  const username = req.params.username

  try {
    // Get user by username
    const user = await profileDb.getUser({ username })

    // Check if user is a member using the contractor_member_roles table
    const memberRoles = await database
      .knex("contractor_member_roles")
      .join(
        "contractor_roles",
        "contractor_member_roles.role_id",
        "contractor_roles.role_id",
      )
      .where("contractor_roles.contractor_id", contractor.contractor_id)
      .where("contractor_member_roles.user_id", user.user_id)
      .select("contractor_roles.role_id")

    const is_member = memberRoles.length > 0
    const roles = memberRoles.map((r) => r.role_id)

    res.json(
      createResponse({
        is_member,
        user_id: user.user_id,
        username: user.username,
        roles,
      }),
    )
  } catch (error) {
    logger.error("Error checking contractor membership", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Internal server error"
      )
    )
  }
}

export const get_spectrum_id_members: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const page = parseInt(req.query.page as string) || 0
  const page_size = Math.min(parseInt(req.query.page_size as string) || 50, 100)
  const search = (req.query.search as string) || ""
  const sort = (req.query.sort as string) || "username"
  const role_filter = (req.query.role_filter as string) || ""

  try {
    const result = await contractorDb.getContractorMembersPaginated(
      contractor.contractor_id,
      {
        page,
        page_size,
        search,
        sort,
        role_filter,
      },
    )

    res.json(
      createResponse({
        total: result.total,
        page,
        page_size,
        members: result.members,
      }),
    )
  } catch (error) {
    logger.error("Error fetching contractor members", { error })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Internal server error"
      )
    )
  }
}

export const post_spectrum_id_roles: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const {
    manage_roles,
    manage_orders,
    kick_members,
    manage_invites,
    manage_org_details,
    manage_stock,
    manage_market,
    manage_webhooks,
    manage_recruiting,
    manage_blocklist,
    name,
  }: {
    manage_roles: boolean
    manage_orders: boolean
    kick_members: boolean
    manage_invites: boolean
    manage_org_details: boolean
    manage_stock: boolean
    manage_market: boolean
    manage_webhooks: boolean
    manage_recruiting: boolean
    manage_blocklist: boolean
    name: string
  } = req.body

  const roles = await contractorDb.getContractorRoles({
    contractor_id: contractor.contractor_id,
  })

  const user = req.user as User
  const newRoles = await contractorDb.insertContractorRole({
    contractor_id: contractor.contractor_id,
    manage_roles: manage_roles,
    manage_orders: manage_orders,
    kick_members: kick_members,
    manage_invites: manage_invites,
    manage_org_details: manage_org_details,
    manage_stock: manage_stock,
    manage_market: manage_market,
    manage_webhooks: manage_webhooks,
    manage_recruiting: manage_recruiting,
    manage_blocklist: manage_blocklist,
    position: Math.max(...roles.map((r) => r.position)) + 1,
    name: name,
  })
  const newRole = newRoles[0]

  // Log role creation
  await auditLogService.record({
    action: "role.created",
    actorId: user.user_id,
    subjectType: "contractor_role",
    subjectId: newRole.role_id,
    metadata: {
      contractor_id: contractor.contractor_id,
      spectrum_id: contractor.spectrum_id,
      name,
      position: newRole.position,
      permissions: {
        manage_roles,
        manage_orders,
        kick_members,
        manage_invites,
        manage_org_details,
        manage_stock,
        manage_market,
        manage_webhooks,
        manage_recruiting,
        manage_blocklist,
      },
    },
  })

  res.json(createResponse({ result: "Success" }))
}

export const put_spectrum_id_roles_role_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const role_id = req.params["role_id"]
  const user = req.user as User
  const contractor = req.contractor!

  const {
    manage_roles,
    manage_orders,
    kick_members,
    manage_invites,
    manage_org_details,
    manage_stock,
    manage_market,
    manage_webhooks,
    manage_recruiting,
    manage_blocklist,
    name,
    position,
  }: {
    manage_roles: boolean
    manage_orders: boolean
    kick_members: boolean
    manage_invites: boolean
    manage_org_details: boolean
    manage_stock: boolean
    manage_market: boolean
    manage_webhooks: boolean
    manage_recruiting: boolean
    manage_blocklist: boolean
    name: string
    position: number
  } = req.body

  const role = await contractorDb.getContractorRole({
    role_id,
    contractor_id: contractor.contractor_id,
  })

  if (!role) {
    res.status(404).json(createErrorResponse({ message: "Invalid role." }))
    return
  }

  if (await can_manage_role(contractor.contractor_id, role_id, user.user_id)) {
    if (
      (await get_min_position(contractor.contractor_id, user.user_id)) >=
      position
    ) {
      return
    }

    const oldRole = { ...role }
    await contractorDb.updateContractorRole(
      { contractor_id: contractor.contractor_id, role_id },
      {
        contractor_id: contractor.contractor_id,
        manage_roles: manage_roles,
        manage_orders: manage_orders,
        kick_members: kick_members,
        manage_invites: manage_invites,
        manage_org_details: manage_org_details,
        manage_stock: manage_stock,
        manage_market: manage_market,
        manage_webhooks: manage_webhooks,
        manage_recruiting: manage_recruiting,
        manage_blocklist: manage_blocklist,
        name: name,
        position: position,
      },
    )

    // Log role update
    const changes: Record<string, unknown> = {}
    if (name !== oldRole.name) changes.name = { old: oldRole.name, new: name }
    if (position !== oldRole.position)
      changes.position = { old: oldRole.position, new: position }
    const permissionChanges: Record<string, unknown> = {}
    if (manage_roles !== oldRole.manage_roles)
      permissionChanges.manage_roles = {
        old: oldRole.manage_roles,
        new: manage_roles,
      }
    if (manage_orders !== oldRole.manage_orders)
      permissionChanges.manage_orders = {
        old: oldRole.manage_orders,
        new: manage_orders,
      }
    if (kick_members !== oldRole.kick_members)
      permissionChanges.kick_members = {
        old: oldRole.kick_members,
        new: kick_members,
      }
    if (manage_invites !== oldRole.manage_invites)
      permissionChanges.manage_invites = {
        old: oldRole.manage_invites,
        new: manage_invites,
      }
    if (manage_org_details !== oldRole.manage_org_details)
      permissionChanges.manage_org_details = {
        old: oldRole.manage_org_details,
        new: manage_org_details,
      }
    if (manage_stock !== oldRole.manage_stock)
      permissionChanges.manage_stock = {
        old: oldRole.manage_stock,
        new: manage_stock,
      }
    if (manage_market !== oldRole.manage_market)
      permissionChanges.manage_market = {
        old: oldRole.manage_market,
        new: manage_market,
      }
    if (manage_webhooks !== oldRole.manage_webhooks)
      permissionChanges.manage_webhooks = {
        old: oldRole.manage_webhooks,
        new: manage_webhooks,
      }
    if (manage_recruiting !== oldRole.manage_recruiting)
      permissionChanges.manage_recruiting = {
        old: oldRole.manage_recruiting,
        new: manage_recruiting,
      }
    if (manage_blocklist !== oldRole.manage_blocklist)
      permissionChanges.manage_blocklist = {
        old: oldRole.manage_blocklist,
        new: manage_blocklist,
      }
    if (Object.keys(permissionChanges).length > 0)
      changes.permissions = permissionChanges

    if (Object.keys(changes).length > 0) {
      await auditLogService.record({
        action: "role.updated",
        actorId: user.user_id,
        subjectType: "contractor_role",
        subjectId: role_id,
        metadata: {
          contractor_id: contractor.contractor_id,
          spectrum_id: contractor.spectrum_id,
          ...changes,
        },
      })
    }

    res.json(createResponse({ result: "Success" }))
  } else {
    res.status(403).json(createErrorResponse({ message: "No permissions." }))
    return
  }
}

export const delete_spectrum_id_roles_role_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const role_id = req.params["role_id"]
  const user = req.user as User
  const contractor = req.contractor!

  const role = await contractorDb.getContractorRole({
    role_id,
    contractor_id: contractor.contractor_id,
  })

  if (!role) {
    res.status(400).json(createErrorResponse({ message: "Invalid role." }))
    return
  }

  if (
    !(await can_manage_role(contractor.contractor_id, role_id, user.user_id))
  ) {
    res.status(400).json(createErrorResponse({ message: "No permissions." }))
    return
  }

  if (role_id === contractor.default_role) {
    res
      .status(403)
      .json(createErrorResponse({ message: "This role cannot be removed." }))
    return
  }

  // Log role deletion before deleting
  await auditLogService.record({
    action: "role.deleted",
    actorId: user.user_id,
    subjectType: "contractor_role",
    subjectId: role_id,
    metadata: {
      contractor_id: contractor.contractor_id,
      spectrum_id: contractor.spectrum_id,
      role_name: role.name,
      position: role.position,
    },
  })

  await contractorDb.deleteContractorRole({
    role_id,
    contractor_id: contractor.contractor_id,
  })

  res.status(204).json(createResponse({ result: "Success" }))
}

export const post_spectrum_id_roles_role_id_members_username: RequestHandler =
  async (req, res, next) => {
    const user = req.user as User
    const contractor = req.contractor!

    const { username, role_id } = req.params

    // Do checks first
    let target
    try {
      target = await profileDb.getUser({ username })
    } catch (e) {
      res.status(404).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const role = await contractorDb.getContractorRole({
      role_id,
      contractor_id: contractor.contractor_id,
    })
    const target_is_member = await is_member(
      contractor.contractor_id,
      target.user_id,
    )
    if (!target_is_member) {
      res.status(404).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    if (!role) {
      res.status(404).json(createErrorResponse({ message: "Invalid role" }))
      return
    }

    const outranked = await outranks(
      contractor.contractor_id,
      target.user_id,
      user.user_id,
    )

    if (outranked) {
      // You are outranked or equal
      res.status(403).json(createErrorResponse({ message: "No permissions" }))
      return
    }

    // Wrap role assignment and audit log in a transaction
    await withTransaction(async (trx) => {
      await contractorDb.insertContractorMemberRole(
        {
          user_id: target.user_id,
          role_id,
        },
        trx,
      )

      // Log role assignment (within transaction for atomicity)
      await auditLogService.record(
        {
          action: "member.role_assigned",
          actorId: user.user_id,
          subjectType: "contractor_member",
          subjectId: target.user_id,
          metadata: {
            contractor_id: contractor.contractor_id,
            spectrum_id: contractor.spectrum_id,
            target_username: target.username,
            role_id,
            role_name: role.name,
          },
        },
        trx,
      )
    })

    res.json(createResponse({ result: "Success" }))
  }

export const delete_spectrum_id_roles_role_id_members_username: RequestHandler =
  async (req, res, next) => {
    const user = req.user as User
    const contractor = req.contractor!
    const { username, role_id } = req.params

    // Do checks first
    let target
    try {
      target = await profileDb.getUser({ username })
    } catch (e) {
      res.status(400).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const role = await contractorDb.getContractorRole({
      role_id,
      contractor_id: contractor.contractor_id,
    })
    const target_is_member = await is_member(
      contractor.contractor_id,
      target.user_id,
    )
    if (!target_is_member) {
      res.status(400).json(createErrorResponse({ message: "Invalid user." }))
      return
    }

    if (!role) {
      res.status(400).json(createErrorResponse({ message: "Invalid role." }))
      return
    }

    const outranked = await outranks(
      contractor.contractor_id,
      target.user_id,
      user.user_id,
    )

    if (outranked) {
      // You are outranked or equal
      res.status(403).json(createErrorResponse({ message: "No permissions." }))
      return
    }

    if (role_id === contractor.default_role) {
      res
        .status(403)
        .json(createErrorResponse({ message: "This role cannot be removed." }))
      return
    }

    // Wrap role removal and audit log in a transaction
    await withTransaction(async (trx) => {
      await contractorDb.removeContractorMemberRoles(
        {
          user_id: target.user_id,
          role_id,
        },
        trx,
      )

      // Log role removal (within transaction for atomicity)
      await auditLogService.record(
        {
          action: "member.role_removed",
          actorId: user.user_id,
          subjectType: "contractor_member",
          subjectId: target.user_id,
          metadata: {
            contractor_id: contractor.contractor_id,
            spectrum_id: contractor.spectrum_id,
            target_username: target.username,
            role_id,
            role_name: role.name,
          },
        },
        trx,
      )
    })

    res.json(createResponse({ result: "Success" }))
  }

export const post_spectrum_id_transfer_ownership: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const contractor = req.contractor!

  const { username } = req.body as { username: string }

  if (!username || typeof username !== "string") {
    res
      .status(400)
      .json(createErrorResponse({ message: "Username is required" }))
    return
  }

  // Verify requester is the current owner
  if (user.role !== "admin") {
    const roles = await contractorDb.getMemberRoles(
      contractor.contractor_id,
      user.user_id,
    )
    const isOwner = roles.some((role) => role.role_id === contractor.owner_role)
    if (!isOwner) {
      res.status(403).json(
        createErrorResponse({
          message: "Only organization owners can transfer ownership",
        }),
      )
      return
    }
  }

  // Get the target user
  let target
  try {
    target = await profileDb.getUser({ username })
  } catch (e) {
    res.status(404).json(createErrorResponse({ message: "User not found" }))
    return
  }

  // Verify target is not the same as current owner
  if (target.user_id === user.user_id) {
    res.status(400).json(
      createErrorResponse({
        message: "Cannot transfer ownership to yourself",
      }),
    )
    return
  }

  // Verify target is a member of the organization
  const target_is_member = await is_member(
    contractor.contractor_id,
    target.user_id,
  )
  if (!target_is_member) {
    res.status(400).json(
      createErrorResponse({
        message: "Target user must be a member of the organization",
      }),
    )
    return
  }

  // Verify owner_role exists
  if (!contractor.owner_role) {
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Organization owner role not found"
      )
    )
    return
  }

  // Perform the transfer in a transaction
  try {
    await withTransaction(
      async (trx) => {
        // Remove owner role from old owner
        await trx<DBContractorMemberRole>("contractor_member_roles")
          .where({
            user_id: user.user_id,
            role_id: contractor.owner_role,
          })
          .delete()

        // Add owner role to new owner (check if they already have it to avoid duplicate)
        const existingOwnerRole = await trx<DBContractorMemberRole>(
          "contractor_member_roles",
        )
          .where({
            user_id: target.user_id,
            role_id: contractor.owner_role,
          })
          .first()

        if (!existingOwnerRole) {
          await trx<DBContractorMemberRole>("contractor_member_roles").insert({
            user_id: target.user_id,
            role_id: contractor.owner_role,
          })
        }

        // Log the ownership transfer (within transaction for atomicity)
        await auditLogService.record(
          {
            action: "org.ownership_transferred",
            actorId: user.user_id,
            subjectType: "contractor",
            subjectId: contractor.contractor_id,
            metadata: {
              contractor_id: contractor.contractor_id,
              spectrum_id: contractor.spectrum_id,
              old_owner_username: user.username,
              old_owner_user_id: user.user_id,
              new_owner_username: target.username,
              new_owner_user_id: target.user_id,
            },
          },
          trx,
        )
      },
      {
        isolationLevel: "SERIALIZABLE", // Use highest isolation for ownership transfers
      },
    )

    res.json(
      createResponse({
        result: "Success",
        message: `Ownership transferred to ${target.username}`,
      }),
    )
  } catch (error) {
    logger.error("Error transferring ownership", {
      error: error instanceof Error ? error.message : String(error),
      contractor_id: contractor.contractor_id,
      old_owner_id: user.user_id,
      new_owner_id: target.user_id,
    })
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to transfer ownership"
      )
    )
  }
}

export const delete_spectrum_id_members_username: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User
    const contractor = req.contractor!

    const { username } = req.params

    // Do checks first
    let target
    try {
      target = await profileDb.getUser({ username })
    } catch (e) {
      res.status(400).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const target_is_member = await is_member(
      contractor.contractor_id,
      target.user_id,
    )
    if (!target_is_member) {
      res.status(400).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const outranked = await outranks(
      contractor.contractor_id,
      target.user_id,
      user.user_id,
    )

    if (outranked) {
      // You are outranked or equal
      res.status(403).json(createErrorResponse({ message: "No permissions" }))
      return
    }

    await contractorDb.removeContractorMember({
      user_id: target.user_id,
      contractor_id: contractor.contractor_id,
    })
    await contractorDb.removeUserContractorRoles(
      contractor.contractor_id,
      target.user_id,
    )

    // Log member removal
    await auditLogService.record({
      action: "member.removed",
      actorId: user.user_id,
      subjectType: "contractor_member",
      subjectId: target.user_id,
      metadata: {
        contractor_id: contractor.contractor_id,
        spectrum_id: contractor.spectrum_id,
        target_username: target.username,
        target_user_id: target.user_id,
      },
    })

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    logger.error("Error in contractor operation", { error: e })
    res.status(500).json(
      createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Internal server error")
    )
    return
  }
}

export const put_spectrum_id: RequestHandler = async (req, res, next) => {
  const contractor = req.contractor!

  // Reject if URL parameters are provided
  if (req.body.avatar_url || req.body.banner_url) {
    res.status(400).json(
      createErrorResponse({
        error: "Invalid parameters",
        message:
          "avatar_url and banner_url are no longer supported. Use /avatar and /banner upload endpoints instead.",
      }),
    )
    return
  }

  const {
    description,
    tags,
    site_url,
    name,
    market_order_template,
    locale,
  }: {
    description?: string
    tags?: string[]
    site_url?: string
    name?: string
    market_order_template?: string
    locale?: string
  } = req.body

  const user = req.user as User
  const changes: Record<string, unknown> = {}

  // Update only non-image fields
  if (
    description !== undefined ||
    name !== undefined ||
    market_order_template !== undefined ||
    locale !== undefined
  ) {
    const oldContractor = await contractorDb.getContractor({
      contractor_id: contractor.contractor_id,
    })

    await contractorDb.updateContractor(
      { contractor_id: contractor.contractor_id },
      {
        description: description !== undefined ? description || "" : undefined,
        name: name || undefined,
        market_order_template: market_order_template,
        locale: locale || undefined,
      },
    )

    // Track what changed
    if (
      description !== undefined &&
      description !== oldContractor.description
    ) {
      changes.description = { old: oldContractor.description, new: description }
    }
    if (name !== undefined && name !== oldContractor.name) {
      changes.name = { old: oldContractor.name, new: name }
    }
    if (
      market_order_template !== undefined &&
      market_order_template !== oldContractor.market_order_template
    ) {
      changes.market_order_template = {
        old: oldContractor.market_order_template,
        new: market_order_template,
      }
    }
    if (locale !== undefined && locale !== oldContractor.locale) {
      changes.locale = { old: oldContractor.locale, new: locale }
    }
  }

  // Handle tags separately
  if (tags && tags.length) {
    const oldTags = contractor.fields || []
    await contractorDb.setContractorFields(contractor.contractor_id, tags)
    if (JSON.stringify(oldTags.sort()) !== JSON.stringify(tags.sort())) {
      changes.tags = { old: oldTags, new: tags }
    }
  }

  // Log organization update if there were changes
  if (Object.keys(changes).length > 0) {
    await auditLogService.record({
      action: "org.updated",
      actorId: user.user_id,
      subjectType: "contractor",
      subjectId: contractor.contractor_id,
      metadata: {
        ...changes,
        contractor_id: contractor.contractor_id,
        spectrum_id: contractor.spectrum_id,
      },
    })
  }

  res.json(createResponse({ result: "Success" }))
}

export const contractors_post_spectrum_id_avatar: RequestHandler = async (
  req,
  res,
) => {
  try {
    const contractor = req.contractor!
    const user = req.user as User
    const file = req.file as Express.Multer.File

    if (!file) {
      res
        .status(400)
        .json(createErrorResponse({ error: "No avatar file provided" }))
      return
    }

    // Validate file size (1MB limit for avatars)
    if (file.size > 1 * 1000 * 1000) {
      res.status(400).json(
        createErrorResponse({
          error: "File too large",
          message: "Avatar must be less than 1MB",
        }),
      )
      return
    }

    const old_avatar = contractor.avatar

    // Upload to CDN (includes moderation)
    const fileExtension = file.mimetype.split("/")[1] || "png"
    const resource = await cdn.uploadFile(
      `${contractor.contractor_id}_org_avatar_${randomUUID()}.${fileExtension}`,
      file.path,
      file.mimetype,
    )

    // Update contractor record
    await contractorDb.updateContractor(
      { contractor_id: contractor.contractor_id },
      { avatar: resource.resource_id },
    )

    // Delete old avatar (best effort - don't fail request if deletion fails)
    if (old_avatar) {
      try {
        await cdn.removeResource(old_avatar)
      } catch (deleteError: any) {
        // Check for foreign key constraint violations - these are expected
        // if the resource is still referenced elsewhere (e.g., accounts table)
        const isForeignKeyError =
          deleteError?.message?.includes("foreign key") ||
          deleteError?.code === "23503" ||
          deleteError?.constraint?.includes("fkey")

        if (isForeignKeyError) {
          logger.debug(
            "Old organization avatar resource still referenced elsewhere, skipping deletion:",
            {
              resource_id: old_avatar,
              contractor_id: contractor.contractor_id,
            },
          )
        } else {
          logger.warn("Failed to delete old organization avatar resource:", {
            resource_id: old_avatar,
            contractor_id: contractor.contractor_id,
            error: deleteError?.message || deleteError,
          })
        }
        // Continue even if deletion fails - new resource is already active
      }
    }

    // Get CDN URL for response
    const avatarUrl = await cdn.getFileLinkResource(resource.resource_id)

    res.json(
      createResponse({
        result: "Avatar uploaded successfully",
        resource_id: resource.resource_id,
        url: avatarUrl,
      }),
    )
  } catch (error) {
    // Handle moderation failures
    if (error instanceof Error) {
      if (error.message.includes("Image failed moderation checks")) {
        logger.debug("Organization avatar upload failed content moderation:", {
          error: error.message,
        })
        res.status(400).json(
          createErrorResponse({
            error: "Content Moderation Failed",
            message: "Avatar failed content moderation checks",
            details:
              "The avatar image contains inappropriate content and cannot be uploaded.",
          }),
        )
        return
      }

      if (
        error.message.includes("Missing required fields") ||
        error.message.includes("VALIDATION_ERROR") ||
        error.message.includes("UNSUPPORTED_FORMAT")
      ) {
        logger.debug("Organization avatar upload failed validation:", {
          error: error.message,
        })
        res.status(400).json(
          createErrorResponse({
            error: "Validation Failed",
            message: `Avatar failed validation: ${error.message}`,
            details: "Please check the file format and try again.",
          }),
        )
        return
      }

      if (error.message.includes("Unsupported MIME type")) {
        logger.debug("Organization avatar has unsupported format:", {
          error: error.message,
        })
        res.status(400).json(
          createErrorResponse({
            error: "Unsupported File Type",
            message:
              "Avatar has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.",
            details: "Please ensure the avatar is in a supported format.",
          }),
        )
        return
      }
    }

    // Log unexpected server errors as error level
    logger.error("Failed to upload organization avatar:", error)
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to upload avatar. Please try again."
      )
    )
  } finally {
    // Clean up temp file
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path)
      } catch (cleanupError) {
        logger.error("Failed to cleanup temp file:", cleanupError)
      }
    }
  }
}

export const contractors_post_spectrum_id_banner: RequestHandler = async (
  req,
  res,
) => {
  try {
    const contractor = req.contractor!
    const user = req.user as User
    const file = req.file as Express.Multer.File

    if (!file) {
      res
        .status(400)
        .json(createErrorResponse({ error: "No banner file provided" }))
      return
    }

    // Validate file size (2.5MB limit for banners)
    if (file.size > 2.5 * 1000 * 1000) {
      res.status(400).json(
        createErrorResponse({
          error: "File too large",
          message: "Banner must be less than 2.5MB",
        }),
      )
      return
    }

    const old_banner = contractor.banner

    // Upload to CDN (includes moderation)
    const fileExtension = file.mimetype.split("/")[1] || "png"
    const resource = await cdn.uploadFile(
      `${contractor.contractor_id}_org_banner_${randomUUID()}.${fileExtension}`,
      file.path,
      file.mimetype,
    )

    // Update contractor record
    await contractorDb.updateContractor(
      { contractor_id: contractor.contractor_id },
      { banner: resource.resource_id },
    )

    // Delete old banner (best effort - don't fail request if deletion fails)
    if (old_banner) {
      try {
        await cdn.removeResource(old_banner)
      } catch (deleteError: any) {
        // Check for foreign key constraint violations - these are expected
        // if the resource is still referenced elsewhere (e.g., accounts table)
        const isForeignKeyError =
          deleteError?.message?.includes("foreign key") ||
          deleteError?.code === "23503" ||
          deleteError?.constraint?.includes("fkey")

        if (isForeignKeyError) {
          logger.debug(
            "Old organization banner resource still referenced elsewhere, skipping deletion:",
            {
              resource_id: old_banner,
              contractor_id: contractor.contractor_id,
            },
          )
        } else {
          logger.warn("Failed to delete old organization banner resource:", {
            resource_id: old_banner,
            contractor_id: contractor.contractor_id,
            error: deleteError?.message || deleteError,
          })
        }
        // Continue even if deletion fails - new resource is already active
      }
    }

    // Get CDN URL for response
    const bannerUrl = await cdn.getFileLinkResource(resource.resource_id)

    res.json(
      createResponse({
        result: "Banner uploaded successfully",
        resource_id: resource.resource_id,
        url: bannerUrl,
      }),
    )
  } catch (error) {
    // Handle moderation failures
    if (error instanceof Error) {
      if (error.message.includes("Image failed moderation checks")) {
        logger.debug("Organization banner upload failed content moderation:", {
          error: error.message,
        })
        res.status(400).json(
          createErrorResponse({
            error: "Content Moderation Failed",
            message: "Banner failed content moderation checks",
            details:
              "The banner image contains inappropriate content and cannot be uploaded.",
          }),
        )
        return
      }

      if (
        error.message.includes("Missing required fields") ||
        error.message.includes("VALIDATION_ERROR") ||
        error.message.includes("UNSUPPORTED_FORMAT")
      ) {
        logger.debug("Organization banner upload failed validation:", {
          error: error.message,
        })
        res.status(400).json(
          createErrorResponse({
            error: "Validation Failed",
            message: `Banner failed validation: ${error.message}`,
            details: "Please check the file format and try again.",
          }),
        )
        return
      }

      if (error.message.includes("Unsupported MIME type")) {
        logger.debug("Organization banner has unsupported format:", {
          error: error.message,
        })
        res.status(400).json(
          createErrorResponse({
            error: "Unsupported File Type",
            message:
              "Banner has an unsupported file type. Only PNG, JPG, and WEBP images are allowed.",
            details: "Please ensure the banner is in a supported format.",
          }),
        )
        return
      }
    }

    // Log unexpected server errors as error level
    logger.error("Failed to upload organization banner:", error)
    res.status(500).json(
      createErrorResponse(
        ErrorCode.INTERNAL_SERVER_ERROR,
        "Failed to upload banner. Please try again."
      )
    )
  } finally {
    // Clean up temp file
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path)
      } catch (cleanupError) {
        logger.error("Failed to cleanup temp file:", cleanupError)
      }
    }
  }
}

export const post_spectrum_id_webhooks: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const {
    webhook_url,
    name,
    actions,
  }: {
    webhook_url: string
    name: string
    actions: string[]
  } = req.body

  // Do checks first
  if (!webhook_url || !name) {
    res.status(400).json(createErrorResponse({ message: "Invalid arguments" }))
    return
  }

  const user = req.user as User
  try {
    const webhook = await createNotificationWebhook(
      name,
      webhook_url,
      actions,
      contractor.contractor_id,
      undefined,
    )

    // Log webhook creation
    await auditLogService.record({
      action: "settings.updated",
      actorId: user.user_id,
      subjectType: "notification_webhook",
      subjectId: webhook.webhook_id,
      metadata: {
        contractor_id: contractor.contractor_id,
        spectrum_id: contractor.spectrum_id,
        setting_type: "webhook_created",
        webhook_name: name,
        actions,
      },
    })
  } catch (e) {
    res.status(400).json(createErrorResponse({ message: "Invalid actions" }))
    return
  }

  res.json(createResponse({ result: "Success" }))
}

export const delete_spectrum_id_webhooks_webhook_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const { webhook_id } = req.params

  const user = req.user as User
  const webhook = await notificationDb.getNotificationWebhook({ webhook_id })
  if (!webhook || webhook.contractor_id !== contractor.contractor_id) {
    res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
    return
  }

  // Log webhook deletion before deleting
  await auditLogService.record({
    action: "settings.updated",
    actorId: user.user_id,
    subjectType: "notification_webhook",
    subjectId: webhook_id,
    metadata: {
      contractor_id: contractor.contractor_id,
      spectrum_id: contractor.spectrum_id,
      setting_type: "webhook_deleted",
      webhook_name: webhook.name,
    },
  })

  await notificationDb.deleteNotificationWebhook({
    webhook_id,
    contractor_id: contractor.contractor_id,
  })

  res.json(createResponse({ result: "Success" }))
}

export const get_spectrum_id_webhooks: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const webhooks = await notificationDb.getNotificationWebhooks({
    contractor_id: contractor.contractor_id,
  })
  res.json(createResponse(webhooks))
}

export const post_spectrum_id_invites: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const {
    max_uses,
  }: {
    max_uses: number
  } = req.body

  // Do checks first
  if (!Number.isSafeInteger(max_uses)) {
    res.status(400).json(createErrorResponse({ message: "Invalid arguments" }))
    return
  }

  const user = req.user as User
  const inviteCodes = await contractorDb.createInviteCode({
    max_uses,
    contractor_id: contractor.contractor_id,
  })
  const inviteCode = inviteCodes[0]

  // Log invite creation
  await auditLogService.record({
    action: "invite.created",
    actorId: user.user_id,
    subjectType: "contractor_invite",
    subjectId: inviteCode.invite_id,
    metadata: {
      contractor_id: contractor.contractor_id,
      spectrum_id: contractor.spectrum_id,
      max_uses,
    },
  })

  res.json(createResponse({ result: "Success" }))
}

export const delete_spectrum_id_invites_invite_id: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const { invite_id } = req.params

  // Do checks first
  if (!invite_id) {
    res.status(400).json(createErrorResponse({ message: "Invalid arguments" }))
    return
  }

  const user = req.user as User
  const inviteCode = await contractorDb.getInviteCode({ invite_id })
  if (!inviteCode || inviteCode.contractor_id !== contractor.contractor_id) {
    res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
    return
  }

  // Log invite deletion before deleting
  await auditLogService.record({
    action: "invite.deleted",
    actorId: user.user_id,
    subjectType: "contractor_invite",
    subjectId: invite_id,
    metadata: {
      contractor_id: contractor.contractor_id,
      spectrum_id: contractor.spectrum_id,
      max_uses: inviteCode.max_uses,
      times_used: inviteCode.times_used,
    },
  })

  await contractorDb.deleteInviteCodes({
    invite_id,
    contractor_id: contractor.contractor_id,
  })
  res.json(createResponse({ result: "Success" }))
}

export const get_spectrum_id_invites: RequestHandler = async (
  req,
  res,
  next,
) => {
  const contractor = req.contractor!

  const invites = await contractorDb.getInviteCodes({
    contractor_id: contractor.contractor_id,
  })
  res.json(createResponse(invites))
}

export const post_spectrum_id_members: RequestHandler = async (req, res) => {
  const contractor = req.contractor!

  const {
    usernames,
    message,
  }: {
    usernames: string[]
    message: string
  } = req.body

  // Do checks first
  const users = []
  for (const username of usernames) {
    try {
      users.push(await profileDb.getUser({ username }))
    } catch {
      res.status(400).json(createErrorResponse({ message: "Invalid user!" }))
      return
    }
  }

  for (const target of users) {
    const role = await contractorDb.getContractorRoleLegacy(
      target.user_id,
      contractor.contractor_id,
    )
    if (role) {
      res.status(400).json(createErrorResponse({ message: "Invalid user!" }))
      return
    }
  }

  const user = req.user as User
  const invites = await contractorDb.insertContractorInvites(
    users.map((u) => ({
      user_id: u.user_id,
      message: message,
      contractor_id: contractor.contractor_id,
    })),
  )

  // Log direct invites sent
  for (const invite of invites) {
    await auditLogService.record({
      action: "invite.created",
      actorId: user.user_id,
      subjectType: "contractor_invite",
      subjectId: invite.invite_id,
      metadata: {
        contractor_id: contractor.contractor_id,
        spectrum_id: contractor.spectrum_id,
        target_user_id: invite.user_id,
        method: "direct",
        message,
      },
    })
  }

  await notificationService.createContractorInviteNotification(invites[0])

  res.json(createResponse({ result: "Success" }))
}

export const post_spectrum_id_refetch: RequestHandler = async (req, res) => {
  try {
    const spectrum_id = req.params["spectrum_id"]

    let contractor, data
    try {
      contractor = await contractorDb.getContractor({ spectrum_id })
      data = await fetchRSIOrgSCAPI(spectrum_id)
    } catch (e) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid contractor" }))
      return
    }

    const banner_resource = await contractorDb.getImageResource({
      resource_id: contractor.banner,
    })
    if (banner_resource.filename === "default_profile_banner.png") {
      const old_banner = contractor.banner

      let banner_resource = undefined
      if (data.data.banner) {
        banner_resource = await cdn.createExternalResource(
          data.data.banner,
          contractor.contractor_id + "_org_banner",
        )

        await contractorDb.updateContractor(
          { contractor_id: contractor.contractor_id },
          {
            banner: banner_resource ? banner_resource.resource_id : undefined,
          },
        )

        await cdn.removeResource(old_banner)
      }
    }

    await contractorDb.updateContractor(
      { contractor_id: contractor.contractor_id },
      { size: data.data.members },
    )

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    logger.error("Error in contractor operation", { error: e })
  }
}

export const post_spectrum_id_accept: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User

    const { invite_id }: { invite_id?: string } = req.body

    const contractor = req.contractor!
    let acceptedInviteId: string | undefined

    if (contractor.archived) {
      res.status(409).json(
        createConflictErrorResponse("Organization has been archived")
      )
      return
    }

    if (invite_id) {
      // Invite Code
      const invites = await contractorDb.getInviteCodes({
        invite_id,
        contractor_id: contractor.contractor_id,
      })

      if (!invites.length) {
        res.status(400).json(createErrorResponse({ message: "Invalid invite" }))
        return
      }

      const role = await contractorDb.getContractorRoleLegacy(
        user.user_id,
        contractor.contractor_id,
      )
      if (role) {
        res.status(400).json(createErrorResponse({ message: "Already member" }))
        return
      }

      const codes = await contractorDb.updateInviteCodes(
        {
          invite_id,
          contractor_id: contractor.contractor_id,
        },
        { times_used: invites[0].times_used + 1 },
      )

      if (codes[0].times_used >= codes[0].max_uses) {
        await contractorDb.deleteInviteCodes({
          invite_id,
          contractor_id: contractor.contractor_id,
        })
      }

      acceptedInviteId = invite_id
    } else {
      // Direct Invite
      const invites = await contractorDb.getContractorInvites({
        user_id: user.user_id,
        contractor_id: contractor.contractor_id,
      })

      if (!invites.length) {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid contractor" }))
        return
      }

      // Store invite_id before removal for audit log
      acceptedInviteId = invites[0].invite_id
    }

    // Wrap all contractor acceptance operations in a transaction
    await withTransaction(async (trx) => {
      // Remove invite
      await contractorDb.removeContractorInvites(
        user.user_id,
        contractor.contractor_id,
        trx,
      )

      // Add member
      await contractorDb.insertContractorMember(
        contractor.contractor_id,
        user.user_id,
        "member",
        trx,
      )

      // Assign default role
      await contractorDb.insertContractorMemberRole(
        {
          user_id: user.user_id,
          role_id: contractor.default_role,
        },
        trx,
      )

      // Log direct invite acceptance and member addition (within transaction)
      if (acceptedInviteId) {
        await auditLogService.record(
          {
            action: "invite.accepted",
            actorId: user.user_id,
            subjectType: "contractor_invite",
            subjectId: acceptedInviteId,
            metadata: {
              contractor_id: contractor.contractor_id,
              spectrum_id: contractor.spectrum_id,
              invite_id: acceptedInviteId,
              method: invite_id ? "invite_code" : "direct",
            },
          },
          trx,
        )
      }

      await auditLogService.record(
        {
          action: "member.added",
          actorId: user.user_id,
          subjectType: "contractor_member",
          subjectId: user.user_id,
          metadata: {
            contractor_id: contractor.contractor_id,
            spectrum_id: contractor.spectrum_id,
            method: invite_id ? "invite_code" : "direct_invite",
            invite_id: acceptedInviteId,
          },
        },
        trx,
      )
    })

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    logger.error("Error in contractor operation", { error: e })
    res.status(500).json(
      createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Internal server error")
    )
    return
  }
}

export const post_spectrum_id_decline: RequestHandler = async (
  req,
  res,
  next,
) => {
  const spectrum_id = req.params["spectrum_id"]
  const user = req.user as User

  const contractor = req.contractor!

  const invites = await contractorDb.getContractorInvites({
    user_id: user.user_id,
    contractor_id: contractor.contractor_id,
  })

  if (!invites.length) {
    res.status(400).json(createErrorResponse({ message: "Invalid contractor" }))
    return
  }

  await contractorDb.removeContractorInvites(
    user.user_id,
    contractor.contractor_id,
  )

  res.json({ result: "Success" })
}

export const post_admin_express_verify: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const { owner_username, owner_discord_id, spectrum_id } = req.body as {
      spectrum_id: string
      owner_username: string
      owner_discord_id: string
    }

    let user
    try {
      user = await profileDb.getUser({ username: owner_username })
    } catch (e) {
      user = await profileDb.insertUserRaw({
        discord_id: owner_discord_id,
        username: `user_${owner_discord_id}`,
        display_name: `user_${owner_discord_id}`,
      })
      await authorizeProfile(owner_username, user.user_id, true)
    }

    await authorizeContractor(spectrum_id, user, true)

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    logger.error("Error in contractor operation", { error: e })
    res.status(500).json(
      createErrorResponse(ErrorCode.INTERNAL_SERVER_ERROR, "Internal server error")
    )
    return
  }
}

export const get_root: RequestHandler = async (req, res, next) => {
  try {
    const query = req.query as {
      index?: string
      reverseSort: string
      sorting: string
      query: string
      fields: string
      rating: string
      pageSize: string
      language_codes?: string
    }

    const searchData = convertQuery(query)

    let contractor: DBContractor[] = []
    try {
      contractor = await contractorDb.getAllContractorsPaginated(searchData)
    } catch (e) {
      logger.error("Error fetching contractors", { error: e })
    }
    const user = req.user as User
    const counts = await contractorDb.getAllContractorsCount(searchData)
    const formatted = await Promise.all(
      contractor.map((c) => contractorDetails(c, user)),
    )

    res.json(createResponse({ total: counts[0].count, items: formatted }))
  } catch (e) {
    logger.error("Error in get_root", { error: e })
  }
}

export const get_spectrum_id_settings_discord: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const spectrum_id = req.params["spectrum_id"]

  const contractor = req.contractor!

  let guild
  let avatar
  if (contractor.official_server_id) {
    guild = await discordService.fetchGuild(contractor.official_server_id)
    avatar = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=240`
  }

  let channel
  if (contractor.discord_thread_channel_id) {
    channel = await discordService.fetchChannel(
      contractor.discord_thread_channel_id,
    )
  }

  res.json(
    createResponse({
      guild_avatar: avatar,
      guild_name: guild?.name,
      channel_name: channel?.name,
      official_server_id: contractor.official_server_id,
      discord_thread_channel_id: contractor.discord_thread_channel_id,
    }),
  )
}

export const post_spectrum_id_settings_discord_use_official: RequestHandler =
  async (req, res, next) => {
    const user = req.user as User
    const contractor = req.contractor!
    const oldContractor = await contractorDb.getContractor({
      contractor_id: contractor.contractor_id,
    })

    await contractorDb.updateContractor(
      { contractor_id: contractor.contractor_id },
      {
        official_server_id: "1003056231591727264",
        discord_thread_channel_id: "1072580369251041330",
      },
    )

    // Log Discord linking
    await auditLogService.record({
      action: "discord.linked",
      actorId: user.user_id,
      subjectType: "contractor",
      subjectId: contractor.contractor_id,
      metadata: {
        contractor_id: contractor.contractor_id,
        spectrum_id: contractor.spectrum_id,
        official_server_id: "1003056231591727264",
        discord_thread_channel_id: "1072580369251041330",
        previous_official_server_id: oldContractor.official_server_id || null,
        previous_discord_thread_channel_id:
          oldContractor.discord_thread_channel_id || null,
      },
    })

    res.json(createResponse({ result: "Success" }))
  }

export const post_spectrum_id_leave: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const contractor = req.contractor!
  // Prevent owners from leaving their own contractor
  const ownerRoleId = contractor.owner_role
  if (ownerRoleId) {
    const ownerRoles = await contractorDb.getUserContractorRoles({
      "contractor_member_roles.role_id": ownerRoleId,
      "contractor_member_roles.user_id": user.user_id,
    })
    if (ownerRoles.length) {
      res.status(400).json(
        createErrorResponse({
          message: "You cannot leave a contractor you own",
        }),
      )
      return
    }
  }

  await contractorDb.removeContractorMember({
    user_id: user.user_id,
    contractor_id: contractor.contractor_id,
  })
  await database
    .knex<DBContractorMemberRole>("contractor_member_roles")
    .where({
      user_id: user.user_id,
    })
    .andWhere(
      database.knex.raw(
        "role_id = ANY(?)",
        database
          .knex("contractor_roles")
          .where({ contractor_id: contractor.contractor_id })
          .select("role_id"),
      ),
    )
    .delete()

  res.json(createResponse({ result: "Success" }))
}

export const get_spectrum_id_blocklist: RequestHandler = async (req, res) => {
  try {
    const contractor = req.contractor as DBContractor
    const blocklist = await profileDb.getUserBlocklist(
      contractor.contractor_id,
      "contractor",
    )

    // Get user details for each blocked user
    const blocklistWithUsers = await Promise.all(
      blocklist.map(async (block) => {
        try {
          const blockedUser = await profileDb.getMinimalUser({
            user_id: block.blocked_id,
          })
          return {
            id: block.id,
            blocked_username: blockedUser.username,
            created_at: block.created_at,
            reason: block.reason,
            blocked_user: blockedUser,
          }
        } catch {
          return {
            id: block.id,
            blocked_username: null,
            created_at: block.created_at,
            reason: block.reason,
            blocked_user: null,
          }
        }
      }),
    )

    res.json(createResponse(blocklistWithUsers))
  } catch (error) {
    logger.error("Error fetching org blocklist", { error })
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to fetch blocklist" }))
  }
}

export const post_spectrum_id_blocklist_block: RequestHandler = async (
  req,
  res,
) => {
  try {
    const contractor = req.contractor as DBContractor
    const { username, reason } = req.body

    if (!username) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Username is required" }))
      return
    }

    // Get the user to block
    const userToBlock = await profileDb.getUser({ username })
    if (!userToBlock) {
      res.status(404).json(createErrorResponse({ message: "User not found" }))
      return
    }

    // Prevent self-blocking (organization can block the user who is managing the org)
    const user = req.user as User
    if (user.user_id === userToBlock.user_id) {
      res
        .status(400)
        .json(createErrorResponse({ message: "You cannot block yourself" }))
      return
    }

    // Check if already blocked
    const isBlocked = await profileDb.isUserBlocked(
      contractor.contractor_id,
      userToBlock.user_id,
      "contractor",
    )
    if (isBlocked) {
      res
        .status(400)
        .json(createErrorResponse({ message: "User is already blocked" }))
      return
    }

    // Block the user
    await profileDb.blockUser(
      contractor.contractor_id,
      userToBlock.user_id,
      "contractor",
      reason,
    )

    res.json(createResponse({ message: "User blocked successfully" }))
  } catch (error) {
    logger.error("Error blocking user for org", { error })
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to block user" }))
  }
}

export const delete_spectrum_id_blocklist_unblock_username: RequestHandler =
  async (req, res) => {
    try {
      const contractor = req.contractor as DBContractor
      const { username } = req.params

      // Get the user to unblock
      const userToUnblock = await profileDb.getUser({ username })
      if (!userToUnblock) {
        res.status(404).json(createErrorResponse({ message: "User not found" }))
        return
      }

      // Check if user is blocked
      const isBlocked = await profileDb.isUserBlocked(
        contractor.contractor_id,
        userToUnblock.user_id,
        "contractor",
      )
      if (!isBlocked) {
        res
          .status(404)
          .json(createErrorResponse({ message: "User is not blocked" }))
        return
      }

      // Unblock the user
      await profileDb.unblockUser(
        contractor.contractor_id,
        userToUnblock.user_id,
        "contractor",
      )

      res.json(createResponse({ message: "User unblocked successfully" }))
    } catch (error) {
      logger.error("Error unblocking user for org", { error })
      res
        .status(500)
        .json(createErrorResponse({ message: "Failed to unblock user" }))
    }
  }

export const VALID_ORG_TAGS = [
  "combat",
  "freight",
  "refuel",
  "repair",
  "mining",
  "transport",
  "exploration",
  "escort",
  "salvage",
  "refining",
  "construction",
  "social",
  "roleplay",
  "medical",
  "intelligence",
]

/**
 * Get contractor's supported languages
 */
export const get_spectrum_id_languages: RequestHandler = async (req, res) => {
  try {
    const contractor = req.contractor as Contractor
    const languageCodes = await contractorDb.getContractorLanguages(
      contractor.contractor_id,
    )

    const languages = languageCodes.map((code) => ({
      code,
      name: getLanguageName(code) || code,
    }))

    res.json(createResponse({ languages }))
  } catch (error) {
    logger.error("Error getting contractor languages:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to get languages" }))
  }
}

/**
 * Set contractor's supported languages
 * Requires manage_org_details permission
 */
export const put_spectrum_id_languages: RequestHandler = async (req, res) => {
  try {
    const contractor = req.contractor as Contractor
    const { language_codes } = req.body

    if (!Array.isArray(language_codes)) {
      res.status(400).json(
        createErrorResponse({
          message: "language_codes must be an array",
        }),
      )
      return
    }

    // Validate language codes
    const validation = validateLanguageCodes(language_codes)
    if (!validation.valid) {
      res.status(400).json(
        createErrorResponse({
          message: `Invalid language codes: ${validation.invalid.join(", ")}`,
        }),
      )
      return
    }

    // Set languages
    await contractorDb.setContractorLanguages(
      contractor.contractor_id,
      language_codes,
    )

    // Return updated languages
    const updatedCodes = await contractorDb.getContractorLanguages(
      contractor.contractor_id,
    )
    const languages = updatedCodes.map((code) => ({
      code,
      name: getLanguageName(code) || code,
    }))

    res.json(createResponse({ languages }))
  } catch (error) {
    logger.error("Error setting contractor languages:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to set languages" }))
  }
}
