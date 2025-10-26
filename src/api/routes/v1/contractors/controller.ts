import { RequestHandler } from "express"
import { database } from "../../../../clients/database/knex-db.js"

import { Contractor, User } from "../api-models.js"
import { createErrorResponse, createResponse } from "../util/response.js"
import { authorizeContractor, createContractor } from "./helpers.js"
import { cdn, external_resource_regex } from "../../../../clients/cdn/cdn.js"
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
import { createContractorInviteNotification } from "../util/notifications.js"
import { fetchRSIOrgSCAPI } from "../../../../clients/scapi/scapi.js"
import { authorizeProfile } from "../profiles/helpers.js"
import { convertQuery } from "../recruiting/controller.js"
import { fetchChannel, fetchGuild } from "../util/discord.js"

export const post_auth_link: RequestHandler = async (req, res) => {
  const user = req.user as User

  const spectrum_id = req.body.contractor || ""

  try {
    const cobj = await database.getContractor({ spectrum_id: spectrum_id })
    if (cobj) {
      res.status(409).json(
        createErrorResponse({
          message: "Org is already registered!",
          status: "error",
        }),
      )
      return
    }
  } catch {}

  if (await authorizeContractor(spectrum_id, user)) {
    const contractor = await database.getContractor({ spectrum_id })
    res.json(createResponse(contractorDetails(contractor, user)))
  } else {
    res.status(403).json(
      createErrorResponse({
        message: "Failed to authenticate, code not found",
        status: "error",
      }),
    )
  }
}

export const post_root: RequestHandler = async (req, res) => {
  const user = req.user as User

  const { description, name, identifier, logo, banner } = req.body as {
    description: string
    name: string
    identifier: string
    logo: string
    banner: string
  }

  try {
    const cobj = await database.getContractor({
      spectrum_id: `~${identifier.toUpperCase()}`,
    })
    if (cobj) {
      res.status(409).json(
        createErrorResponse({
          message: "Org is already registered!",
          status: "error",
        }),
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
  })
  res.status(201).json(createResponse({ result: "Success" }))
  return
}

export const get_search_query: RequestHandler = async (req, res, next) => {
  const query = req.params["query"]

  const contractors = await database.searchContractors(query)

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
  const [invite] = await database.getInviteCodes({
    invite_id,
  })

  if (!invite) {
    res.status(404).json(createErrorResponse({ message: "Invalid invite" }))
    return
  }

  const contractor: DBContractor = await database.getContractor({
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
  const [invite] = await database.getInviteCodes({
    invite_id,
  })

  if (!invite) {
    res.status(404).json(createErrorResponse({ message: "Invalid invite" }))
    return
  }

  const contractor: DBContractor = await database.getContractor({
    contractor_id: invite.contractor_id,
  })

  const role = await database.getContractorRoleLegacy(
    user.user_id,
    contractor.contractor_id,
  )

  if (role) {
    res.status(409).json(createErrorResponse({ message: "Already member" }))
    return
  }

  await database.updateInviteCodes(
    {
      invite_id,
      contractor_id: contractor.contractor_id,
    },
    { times_used: invite.times_used + 1 },
  )

  await database.removeContractorInvites(user.user_id, contractor.contractor_id)

  await database.insertContractorMember(
    contractor.contractor_id,
    user.user_id,
    "member",
  )

  await database.insertContractorMemberRole({
    user_id: user.user_id,
    role_id: contractor.default_role,
  })

  res.json(createResponse({ result: "Success" }))
}

export const get_spectrum_id_members_search_query: RequestHandler = async (
  req,
  res,
  next,
) => {
  const query = req.params["query"]

  const users = await database.searchOrgMembers(
    query,
    req.contractor!.contractor_id,
  )

  res.json(
    createResponse(
      await Promise.all(
        users.map(async (user) => {
          const pubProf = await database.getMinimalUser({
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
  const members = await database.getContractorMembersUsernamesAndID({
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

  const contractors = await database.getUserContractors({
    "contractor_members.user_id": user.user_id,
  })

  const unrelated =
    contractors.filter((c) => c.contractor_id === contractor!.contractor_id)
      .length === 0
  if (unrelated) {
    res.status(403).json(
      createErrorResponse({
        message: "You are not authorized to view this data",
      }),
    )
    return
  }

  const customers = await database.getContractorCustomers(
    contractor.contractor_id,
  )
  res.json(
    await Promise.all(
      customers.map(async (customer) => {
        const prof = await database.getMinimalUser({
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

  const reviews = await database.getContractorReviews(contractor.contractor_id)
  res.json(
    createResponse(
      await Promise.all(
        reviews.map(async (review) => {
          return {
            ...review,
            user_author: review.user_author
              ? await database.getMinimalUser({ user_id: review.user_author })
              : null,
            contractor_author: review.contractor_author
              ? await database.getMinimalContractor({
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
    const user = await database.getUser({ username })

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
    console.error("Error checking contractor membership:", error)
    res.status(500).json(
      createErrorResponse({
        message: "Internal server error",
        status: "error",
      }),
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
    const result = await database.getContractorMembersPaginated(
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
    console.error("Error fetching contractor members:", error)
    res.status(500).json(
      createErrorResponse({
        message: "Internal server error",
        status: "error",
      }),
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

  const roles = await database.getContractorRoles({
    contractor_id: contractor.contractor_id,
  })

  await database.insertContractorRole({
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

  const role = await database.getContractorRole({
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
    await database.updateContractorRole(
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

  const role = await database.getContractorRole({
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

  await database.deleteContractorRole({
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
      target = await database.getUser({ username })
    } catch (e) {
      res.status(404).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const role = await database.getContractorRole({
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

    await database.insertContractorMemberRole({
      user_id: target.user_id,
      role_id,
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
      target = await database.getUser({ username })
    } catch (e) {
      res.status(400).json(createErrorResponse({ message: "Invalid user" }))
      return
    }

    const role = await database.getContractorRole({
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

    await database.removeContractorMemberRoles({
      user_id: target.user_id,
      role_id,
    })

    res.json(createErrorResponse({ result: "Success" }))
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
      target = await database.getUser({ username })
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

    await database.removeContractorMember({
      user_id: target.user_id,
      contractor_id: contractor.contractor_id,
    })
    await database.removeUserContractorRoles(
      contractor.contractor_id,
      target.user_id,
    )

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
    return
  }
}

export const put_spectrum_id: RequestHandler = async (req, res, next) => {
  const contractor = req.contractor!

  const {
    description,
    tags,
    avatar_url,
    site_url,
    name,
    banner_url,
    market_order_template,
    locale,
  }: {
    description?: string
    tags?: string[]
    avatar_url?: string
    site_url?: string
    name?: string
    banner_url?: string
    market_order_template?: string
    locale?: string
  } = req.body

  // Do checks first
  if (avatar_url && !avatar_url.match(external_resource_regex)) {
    res.status(400).json(createErrorResponse({ message: "Invalid URL" }))
    return
  }

  if (banner_url && !banner_url.match(external_resource_regex)) {
    res.status(400).json(createErrorResponse({ message: "Invalid URL" }))
    return
  }

  const old_avatar = contractor.avatar
  const old_banner = contractor.banner

  // Then insert
  let avatar_resource = undefined
  if (avatar_url) {
    avatar_resource = await cdn.createExternalResource(
      avatar_url,
      contractor.contractor_id + "_org_avatar",
    )
  }

  let banner_resource = undefined
  if (banner_url) {
    banner_resource = await cdn.createExternalResource(
      banner_url,
      contractor.contractor_id + "_org_banner",
    )
  }

  if (
    description !== undefined ||
    avatar_resource !== undefined ||
    banner_resource !== undefined ||
    name !== undefined ||
    market_order_template !== undefined ||
    locale !== undefined
  ) {
    await database.updateContractor(
      { contractor_id: contractor.contractor_id },
      {
        description: description !== undefined ? description || "" : undefined,
        avatar: avatar_resource ? avatar_resource.resource_id : undefined,
        banner: banner_resource ? banner_resource.resource_id : undefined,
        name: name || undefined,
        market_order_template: market_order_template,
        locale: locale || undefined,
      },
    )
  }

  if (tags && tags.length) {
    await database.setContractorFields(contractor.contractor_id, tags)
  }

  if (avatar_url) {
    await cdn.removeResource(old_avatar)
  }

  if (banner_url) {
    await cdn.removeResource(old_banner)
  }

  res.json(createResponse({ result: "Success" }))
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

  try {
    await createNotificationWebhook(
      name,
      webhook_url,
      actions,
      contractor.contractor_id,
      undefined,
    )
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

  const webhook = await database.getNotificationWebhook({ webhook_id })
  if (webhook?.contractor_id !== contractor.contractor_id) {
    res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
    return
  }

  await database.deleteNotificationWebhook({
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

  const webhooks = await database.getNotificationWebhooks({
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

  await database.createInviteCode({
    max_uses,
    contractor_id: contractor.contractor_id,
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

  const inviteCode = await database.getInviteCode({ invite_id })
  if (inviteCode?.contractor_id !== contractor.contractor_id) {
    res.status(403).json(createErrorResponse({ message: "Unauthorized" }))
    return
  }

  await database.deleteInviteCodes({
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

  const invites = await database.getInviteCodes({
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
      users.push(await database.getUser({ username }))
    } catch {
      res.status(400).json(createErrorResponse({ message: "Invalid user!" }))
      return
    }
  }

  for (const target of users) {
    const role = await database.getContractorRoleLegacy(
      target.user_id,
      contractor.contractor_id,
    )
    if (role) {
      res.status(400).json(createErrorResponse({ message: "Invalid user!" }))
      return
    }
  }

  const invites = await database.insertContractorInvites(
    users.map((u) => ({
      user_id: u.user_id,
      message: message,
      contractor_id: contractor.contractor_id,
    })),
  )

  await createContractorInviteNotification(invites[0])

  res.json(createResponse({ result: "Success" }))
}

export const post_spectrum_id_refetch: RequestHandler = async (req, res) => {
  try {
    const spectrum_id = req.params["spectrum_id"]

    let contractor, data
    try {
      contractor = await database.getContractor({ spectrum_id })
      data = await fetchRSIOrgSCAPI(spectrum_id)
    } catch (e) {
      res
        .status(400)
        .json(createErrorResponse({ message: "Invalid contractor" }))
      return
    }

    const banner_resource = await database.getImageResource({
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

        await database.updateContractor(
          { contractor_id: contractor.contractor_id },
          {
            banner: banner_resource ? banner_resource.resource_id : undefined,
          },
        )

        await cdn.removeResource(old_banner)
      }
    }

    await database.updateContractor(
      { contractor_id: contractor.contractor_id },
      { size: data.data.members },
    )

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    console.error(e)
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

    if (invite_id) {
      // Invite Code
      const invites = await database.getInviteCodes({
        invite_id,
        contractor_id: contractor.contractor_id,
      })

      if (!invites.length) {
        res.status(400).json(createErrorResponse({ message: "Invalid invite" }))
        return
      }

      const role = await database.getContractorRoleLegacy(
        user.user_id,
        contractor.contractor_id,
      )
      if (role) {
        res.status(400).json(createErrorResponse({ message: "Already member" }))
        return
      }

      const codes = await database.updateInviteCodes(
        {
          invite_id,
          contractor_id: contractor.contractor_id,
        },
        { times_used: invites[0].times_used + 1 },
      )

      if (codes[0].times_used >= codes[0].max_uses) {
        await database.deleteInviteCodes({
          invite_id,
          contractor_id: contractor.contractor_id,
        })
      }
    } else {
      // Direct Invite
      const invites = await database.getContractorInvites({
        user_id: user.user_id,
        contractor_id: contractor.contractor_id,
      })

      if (!invites.length) {
        res
          .status(400)
          .json(createErrorResponse({ message: "Invalid contractor" }))
        return
      }
    }

    await database.removeContractorInvites(
      user.user_id,
      contractor.contractor_id,
    )

    await database.insertContractorMember(
      contractor.contractor_id,
      user.user_id,
      "member",
    )

    await database.insertContractorMemberRole({
      user_id: user.user_id,
      role_id: contractor.default_role,
    })

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
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

  const invites = await database.getContractorInvites({
    user_id: user.user_id,
    contractor_id: contractor.contractor_id,
  })

  if (!invites.length) {
    res.status(400).json(createErrorResponse({ message: "Invalid contractor" }))
    return
  }

  await database.removeContractorInvites(user.user_id, contractor.contractor_id)

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
      user = await database.getUser({ username: owner_username })
    } catch (e) {
      user = await database.insertUserRaw({
        discord_id: owner_discord_id,
        username: `user_${owner_discord_id}`,
        display_name: `user_${owner_discord_id}`,
      })
      await authorizeProfile(owner_username, user.user_id, true)
    }

    await authorizeContractor(spectrum_id, user, true)

    res.json(createResponse({ result: "Success" }))
  } catch (e) {
    console.error(e)
    res
      .status(500)
      .json(createErrorResponse({ message: "Internal server error" }))
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
    }

    const searchData = convertQuery(query)

    let contractor: DBContractor[] = []
    try {
      contractor = await database.getAllContractorsPaginated(searchData)
    } catch (e) {
      console.error(e)
    }
    const user = req.user as User
    const counts = await database.getAllContractorsCount(searchData)
    const formatted = await Promise.all(
      contractor.map((c) => contractorDetails(c, user)),
    )

    res.json(createResponse({ total: counts[0].count, items: formatted }))
  } catch (e) {
    console.error(e)
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
    guild = await fetchGuild(contractor.official_server_id)
    avatar = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=240`
  }

  let channel
  if (contractor.discord_thread_channel_id) {
    channel = await fetchChannel(contractor.discord_thread_channel_id)
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
    await database.updateContractor(
      { contractor_id: req.contractor!.contractor_id },
      {
        official_server_id: "1003056231591727264",
        discord_thread_channel_id: "1072580369251041330",
      },
    )
    res.json(createResponse({ result: "Success" }))
  }

export const post_spectrum_id_leave: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  const contractor = req.contractor!
  // TODO: Check not org owner
  const owner_role = await database.getContractorRole({
    contractor_id: contractor.contractor_id,
    priority: 0,
  })
  const roles = await database.getUserContractorRoles({
    role_id: owner_role?.role_id,
    user_id: user.user_id,
  })
  if (roles.length) {
    res.status(400).json(
      createErrorResponse({
        message: "You cannot leave a contractor you own",
      }),
    )
    return
  }

  await database.removeContractorMember({
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
    const blocklist = await database.getUserBlocklist(
      contractor.contractor_id,
      "contractor",
    )

    // Get user details for each blocked user
    const blocklistWithUsers = await Promise.all(
      blocklist.map(async (block) => {
        try {
          const blockedUser = await database.getMinimalUser({
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
    console.error("Error fetching org blocklist:", error)
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
    const userToBlock = await database.getUser({ username })
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
    const isBlocked = await database.isUserBlocked(
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
    await database.blockUser(
      contractor.contractor_id,
      userToBlock.user_id,
      "contractor",
      reason,
    )

    res.json(createResponse({ message: "User blocked successfully" }))
  } catch (error) {
    console.error("Error blocking user for org:", error)
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
      const userToUnblock = await database.getUser({ username })
      if (!userToUnblock) {
        res.status(404).json(createErrorResponse({ message: "User not found" }))
        return
      }

      // Check if user is blocked
      const isBlocked = await database.isUserBlocked(
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
      await database.unblockUser(
        contractor.contractor_id,
        userToUnblock.user_id,
        "contractor",
      )

      res.json(createResponse({ message: "User unblocked successfully" }))
    } catch (error) {
      console.error("Error unblocking user for org:", error)
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
