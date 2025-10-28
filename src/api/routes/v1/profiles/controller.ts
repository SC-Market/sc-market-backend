import { RequestHandler } from "express"
import { User as User } from "../api-models.js"
import { database as database } from "../../../../clients/database/knex-db.js"
import { cdn as cdn } from "../../../../clients/cdn/cdn.js"
import { external_resource_regex as external_resource_regex } from "../../../../clients/cdn/cdn.js"
import { AvailabilityBody as AvailabilityBody } from "../../../../clients/database/db-models.js"
import { getUserRating as getUserRating } from "../util/formatting.js"
import { createNotificationWebhook as createNotificationWebhook } from "../util/webhooks.js"
import { fetchChannel as fetchChannel } from "../util/discord.js"
import { fetchGuild as fetchGuild } from "../util/discord.js"
import { authorizeProfile as authorizeProfile } from "./helpers.js"
import { get_sentinel as get_sentinel } from "./helpers.js"
import { syncRSIHandle as syncRSIHandle } from "./helpers.js"
import { serializeDetailedProfile as serializeDetailedProfile } from "./serializers.js"
import { serializePublicProfile as serializePublicProfile } from "./serializers.js"
import { createErrorResponse as createErrorResponse } from "../util/response.js"
import { createResponse as createResponse } from "../util/response.js"
import logger from "../../../../logger/logger.js"

export const profile_post_auth_link: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User
    const username = req.body.username || ""

    const result = await authorizeProfile(username, user.user_id)
    if (result.success) {
      res.json(createResponse(await serializeDetailedProfile(user)))
    } else {
      res.status(402).json(
        createErrorResponse({
          message: result.error,
          status: "error",
        }),
      )
    }
  } catch (e) {
    console.error(e)
  }
}

export const profile_post_auth_sync_handle: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User

    // Check if user is already verified
    if (!user.rsi_confirmed || !user.spectrum_user_id) {
      res.status(400).json(
        createErrorResponse({
          message:
            "User must be already verified with a Spectrum ID to sync handle",
          status: "error",
        }),
      )
      return
    }

    // Sync handle using existing Spectrum ID
    const result = await syncRSIHandle(user.user_id)
    if (result.success) {
      res.json(createResponse(await serializeDetailedProfile(user)))
    } else {
      res.status(402).json(
        createErrorResponse({
          message: result.error,
          status: "error",
        }),
      )
    }
  } catch (e) {
    logger.error("Error during RSI handle sync:", e)
    res.status(500).json(
      createErrorResponse({
        message: "Internal server error during handle sync",
        status: "error",
      }),
    )
  }
}

export const profile_post_auth_unlink: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User

    // Check if user is currently verified
    if (!user.rsi_confirmed || !user.spectrum_user_id) {
      res.status(400).json(
        createErrorResponse({
          message: "User is not currently verified with a Star Citizen account",
          status: "error",
        }),
      )
      return
    }

    // Generate default username from Discord ID
    const defaultUsername = `new_user${user.discord_id}`
    const defaultDisplayName = `new_user${user.discord_id}`

    // Update user to unverified state with default usernames
    await database.updateUser(
      { user_id: user.user_id },
      {
        rsi_confirmed: false,
        spectrum_user_id: null,
        username: defaultUsername,
        display_name: defaultDisplayName,
      },
    )

    logger.info(
      `User ${user.user_id} unlinked Star Citizen account. Reset to default usernames.`,
    )

    res.json(createResponse(await serializeDetailedProfile(user)))
  } catch (e) {
    logger.error("Error during Star Citizen account unlink:", e)
    res.status(500).json(
      createErrorResponse({
        message: "Internal server error during account unlink",
        status: "error",
      }),
    )
  }
}

export const profile_get_auth_ident: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  res.json({ identifier: get_sentinel(user.user_id) })
}

export const profile_get_search_query: RequestHandler = async (
  req,
  res,
  next,
) => {
  const query = req.params["query"]

  // if (query.length < 3) {
  //   res.status(400).json({
  //     error: "Query must be at least 3 characters long",
  //   })
  //   return
  // }

  const users = await database.searchUsers(query)

  res.json(await Promise.all(users.map((u) => serializePublicProfile(u))))
}

export const profile_put_root: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const { locale }: { locale: string } = req.body

    // Update user locale in database
    const updatedUsers = await database.updateUser(
      { user_id: user.user_id },
      { locale },
    )

    if (updatedUsers.length === 0) {
      res.status(500).json(
        createErrorResponse({
          message: "Failed to update user locale",
          status: "error",
        }),
      )
      return
    }

    res.json(
      createResponse({
        message: "Locale updated successfully",
        locale: updatedUsers[0].locale,
      }),
    )
  } catch (error) {
    logger.error("Error updating user locale:", error)
    res.status(500).json(
      createErrorResponse({
        message: "Internal server error",
        status: "error",
      }),
    )
  }
}

export const profile_post_update: RequestHandler = async (req, res, next) => {
  const user = req.user as User

  const {
    about,
    avatar_url,
    banner_url,
    display_name,
    market_order_template,
  }: {
    about?: string
    avatar_url?: string
    banner_url?: string
    display_name?: string
    market_order_template?: string
  } = req.body

  // Do checks first
  if (avatar_url && !avatar_url.match(external_resource_regex)) {
    res.status(400).json({ error: "Invalid URL" })
    return
  }

  if (banner_url && !banner_url.match(external_resource_regex)) {
    res.status(400).json({ error: "Invalid URL" })
    return
  }

  if (display_name && (display_name.length > 30 || display_name.length === 0)) {
    res.status(400).json({ error: "Invalid display name" })
    return
  }

  const old_avatar = user.avatar
  const old_banner = user.banner

  // Then insert
  let avatar_resource = undefined
  if (avatar_url) {
    avatar_resource = await cdn.createExternalResource(
      avatar_url,
      user.user_id + "_avatar",
    )
  }

  let banner_resource = undefined
  if (banner_url) {
    banner_resource = await cdn.createExternalResource(
      banner_url,
      user.user_id + "_banner",
    )
  }

  const newUsers = await database.updateUser(
    { user_id: user.user_id },
    {
      profile_description: about || "",
      banner: banner_resource ? banner_resource.resource_id : undefined,
      avatar: avatar_resource ? avatar_resource.resource_id : undefined,
      display_name: display_name || undefined,
      market_order_template: market_order_template,
    },
  )

  if (avatar_url) {
    await cdn.removeResource(old_avatar)
  }

  if (banner_url) {
    await cdn.removeResource(old_banner)
  }

  res.json({ result: "Success", ...newUsers[0] })
}

export const profile_post_webhook_create: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User

  const {
    webhook_url,
    name,
    actions,
  }: {
    webhook_url: string
    name: string
    actions: string[]
  } = req.body

  // TODO: Check for actual URL
  if (!webhook_url || !name) {
    res.status(400).json({ error: "Invalid arguments" })
    return
  }

  try {
    await createNotificationWebhook(
      name,
      webhook_url,
      actions,
      undefined,
      user.user_id,
    )
  } catch (e) {
    res.status(400).json({ error: "Invalid actions" })
    return
  }
  res.json({ result: "Success" })
}

export const profile_post_webhook_delete: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User

  const {
    webhook_id,
  }: {
    webhook_id: string
  } = req.body

  // Do checks first
  if (!webhook_id) {
    res.status(400).json({ error: "Invalid arguments" })
    return
  }

  const webhook = await database.getNotificationWebhook({ webhook_id })
  if (webhook?.user_id !== user.user_id) {
    res.status(403).json({ error: "Unauthorized" })
    return
  }

  await database.deleteNotificationWebhook({
    webhook_id,
    user_id: user.user_id,
  })
  res.json({ result: "Success" })
}

export const profile_get_webhooks: RequestHandler = async (req, res, next) => {
  const user = req.user as User

  const webhooks = await database.getNotificationWebhooks({
    user_id: user.user_id,
  })
  res.json(webhooks)
}

export const profile_get_allusers: RequestHandler = async (req, res, next) => {
  res.json(await database.getMinimalUsersAdmin({}))
}

export const profile_get_user_username_reviews: RequestHandler = async (
  req,
  res,
  next,
) => {
  const username = req.params["username"]
  let user
  try {
    user = await database.getUser({ username: username }, { noBalance: true })
  } catch (e) {
    res.status(400).json({ error: "Invalid user" })
    return
  }

  const reviews = await database.getUserReviews(user.user_id)
  res.json(
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
  )
}

export const profile_get_user_username: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const requester = req.user as User
    const username = req.params["username"]
    let user
    try {
      user = await database.getUser({ username: username }, { noBalance: true })
    } catch (e) {
      res.status(400).json({ error: "Invalid user" })
      return
    }

    res.json(await serializePublicProfile(user, { discord: !!requester }))
  } catch (e) {
    console.error(e)
    res.status(400).json({ error: "Invalid user" })
    return
  }
}

export const profile_post_settings_update: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User

  const { discord_order_share, discord_public } = req.body

  if (discord_order_share === undefined && discord_public === undefined) {
    res.status(400).json({ error: "Invalid body" })
    return
  }

  await database.updateUserSettings(user.user_id, {
    discord_order_share,
    discord_public,
  })

  res.json({ result: "Success" })
  return
}

export const profile_post_availability_update: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User

    const { contractor, selections } = req.body as AvailabilityBody

    if (contractor != null) {
      let cobj
      try {
        cobj = await database.getContractor({ spectrum_id: contractor })
      } catch {
        res.status(403).json({ error: "Invalid contractor" })
        return
      }

      if (
        !(await database.getMemberRoles(cobj.contractor_id, user.user_id))
          .length
      ) {
        res.status(403).json({ error: "Invalid contractor" })
        return
      }

      await database.updateUserAvailability(
        user.user_id,
        cobj.contractor_id,
        selections,
      )
    } else {
      await database.updateUserAvailability(user.user_id, null, selections)
    }

    res.json({ result: "Success" })
    return
  } catch (e) {
    console.error(e)
  }
}

export const profile_get_availability_contractor_spectrum_id: RequestHandler =
  async (req, res, next) => {
    const user = req.user as User
    const spectrum_id = req.params["spectrum_id"]

    let cobj
    try {
      cobj = await database.getContractor({ spectrum_id })
    } catch {
      res.status(403).json({ error: "Invalid contractor" })
      return
    }

    res.json({
      contractor: spectrum_id,
      selections: await database.getUserAvailability(
        user.user_id,
        cobj.contractor_id,
      ),
    })
    return
  }

export const profile_get_settings_discord: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User
  let guild
  let avatar
  if (user.official_server_id) {
    guild = await fetchGuild(user.official_server_id)
    avatar = `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.webp?size=240`
  }

  let channel
  if (user.discord_thread_channel_id) {
    channel = await fetchChannel(user.discord_thread_channel_id)
  }

  res.json({
    guild_avatar: avatar,
    guild_name: guild?.name,
    channel_name: channel?.name,
    official_server_id: user.official_server_id,
    discord_thread_channel_id: user.discord_thread_channel_id,
  })
  return
}

export const profile_post_settings_discord_use_official: RequestHandler =
  async (req, res, next) => {
    const user = req.user as User
    await database.updateUser(
      { user_id: user.user_id },
      {
        official_server_id: "1003056231591727264",
        discord_thread_channel_id: "1072580369251041330",
      },
    )
    res.json({ result: "Success" })
    return
  }

export const profile_get_availability: RequestHandler = async (
  req,
  res,
  next,
) => {
  const user = req.user as User

  res.json({
    contractor: null,
    selections: await database.getUserAvailability(user.user_id, null),
  })
  return
}

export const profile_get_root: RequestHandler = async (req, res, next) => {
  try {
    const { discord_access_token, discord_refresh_token, ...user } =
      req.user as User

    const contractors = await database.getUserContractorRoles({
      user_id: user.user_id,
    })
    const discord_profile = await database.discord_profile_cache.fetch(
      user.user_id,
    )

    res.json({
      ...user,
      balance: +user.balance!,
      contractors: await Promise.all(
        (() => {
          // Group contractors by spectrum_id to collect all roles with details
          const contractorMap = new Map()

          contractors.forEach((s) => {
            if (!contractorMap.has(s.spectrum_id)) {
              contractorMap.set(s.spectrum_id, {
                spectrum_id: s.spectrum_id,
                name: s.name,
                roles: [],
                role_details: [], // Array of {role_id, role_name, position}
              })
            }
            contractorMap.get(s.spectrum_id).roles.push(s.role_id)
            contractorMap.get(s.spectrum_id).role_details.push({
              role_id: s.role_id,
              role_name: s.role,
              position: s.position,
            })
          })

          return Array.from(contractorMap.values())
        })().map(async (contractor) => ({
          ...contractor,
          ...(await database.getMinimalContractor({
            spectrum_id: contractor.spectrum_id,
          })),
        })),
      ),
      avatar: await cdn.getFileLinkResource(user.avatar),
      banner: await cdn.getFileLinkResource(user.banner),
      // notifications: await database.getCompleteNotificationsByUser(user.user_id),
      settings: await database.getUserSettings(user.user_id),
      rating: await getUserRating(user.user_id),
      discord_profile: {
        username: discord_profile?.username,
        discriminator: discord_profile?.discriminator,
        id: discord_profile?.id,
      },
      market_order_template: user.market_order_template,
    })
  } catch (e) {
    logger.error("Error fetching user profile:", e)
    res.status(500)
    return
  }
}

export const profile_get_my_data: RequestHandler = async (req, res) => {
  const user = req.user as User
  res.set({ "Content-Disposition": 'attachment; filename="data.txt"' })
  let content = ""
  content += `RSI Handle: ${user.username}\n`
  content += `Discord ID: ${user.discord_id}\n`
  content += `Display Name: ${user.display_name}\n`
  content += `Profile Description: ${user.profile_description}\n`
  content += `Avatar URL: ${await cdn.getFileLinkResource(user.avatar)}\n`
  content += `Banner URL: ${await cdn.getFileLinkResource(user.banner)}\n`
  content += `Linked Discord Server ID: ${user.official_server_id}\n`
  content += `Linked Discord Thread ID: ${user.discord_thread_channel_id}\n\n`
  content += "Contractors:\n"

  content += "Orders:\n"
  const orders = await database.getOrders({
    customer_id: user.user_id,
  })
  orders.push(
    ...(await database.getOrders({
      assigned_id: user.user_id,
    })),
  )

  for (const order of orders) {
    content += `${order.title} - ${order.timestamp}:\n`
    content += `Rush: ${order.rush}\n`
    content += `Departure: ${order.departure}\n`
    content += `Destination: ${order.destination}\n`
    content += `Kind: ${order.kind}\n`
    content += `Cost: ${order.cost}\n`
    content += `Collateral: ${order.collateral}\n`
    content += `Description: ${order.description}\n`
    content += `Status: ${order.status}\n`
    content += `Payment Type: ${order.payment_type}\n`
    content += `Discord Thread: ${order.thread_id}\n`
  }

  const contractors = await database.getUserContractorRoles({
    user_id: user.user_id,
  })
  for (const role_details of contractors) {
    content += `${role_details.spectrum_id}: ${role_details.role}\n`
    if (role_details.role === "owner") {
      const contractor = await database.getContractor({
        spectrum_id: role_details.spectrum_id,
      })
      content += `Spectrum ID: ${contractor.spectrum_id}\n`
      content += `Name: ${contractor.name}\n`
      content += `Name: ${contractor.description}\n`
      content += `Avatar URL: ${await cdn.getFileLinkResource(
        contractor.avatar,
      )}\n`
      content += `Banner URL: ${await cdn.getFileLinkResource(
        contractor.banner,
      )}\n`
      content += `Size: ${contractor.size}\n`
      content += `Linked Discord Server ID: ${contractor.official_server_id}\n`
      content += `Linked Discord Thread ID: ${contractor.discord_thread_channel_id}\n`
      const fields = await database.getContractorFields({
        "contractors.contractor_id": contractor.contractor_id,
      })
      content += `Fields: ${fields.map((f) => f.field).join(", ")}\n`
      content += `Roles:\n\n`

      const roles = await database.getContractorRoles({
        contractor_id: contractor.contractor_id,
      })
      for (const role of roles) {
        content += `${role.name}\n`
        content += `Position ${role.position}\n`
        content += `Manage Roles ${role.manage_roles}\n`
        content += `Manage Orders ${role.manage_orders}\n`
        content += `Kick Members ${role.kick_members}\n`
        content += `Manage Invites ${role.manage_invites}\n`
        content += `Manage Org Details ${role.manage_org_details}\n`
        content += `Manage Stock ${role.manage_stock}\n`
        content += `Manage Market ${role.manage_market}\n`
        content += `Manage Recruiting ${role.manage_recruiting}\n`
        content += `Manage Webhooks ${role.manage_webhooks}\n\n`
      }

      content += "Orders:\n\n"
      const orders = await database.getOrders({
        contractor_id: contractor.contractor_id,
      })

      for (const order of orders) {
        content += `${order.title} - ${order.timestamp}:\n`
        content += `Rush: ${order.rush}\n`
        content += `Departure: ${order.departure}\n`
        content += `Destination: ${order.destination}\n`
        content += `Kind: ${order.kind}\n`
        content += `Cost: ${order.cost}\n`
        content += `Collateral: ${order.collateral}\n`
        content += `Description: ${order.description}\n`
        content += `Status: ${order.status}\n`
        content += `Payment Type: ${order.payment_type}\n`
        content += `Discord Thread: ${order.thread_id}\n\n`
      }

      content += "Reviews:\n\n"
      const reviews = await database.getOrderReviews({
        contractor_author: contractor.contractor_id,
      })
      for (const review of reviews) {
        content += `${review.order_id}: ${review.rating}/5 \`${review.content}\` at ${review.timestamp} as ${review.role}\n`
      }
      content += "\n"
    }
  }

  content += "Messages:\n\n"
  const messages = await database.getMessages({ author: user.user_id })
  for (const message of messages) {
    content += `${message.message_id}: \`${message.content}\` in ${message.chat_id} at ${message.timestamp}\n`
  }
  content += "\n"

  content += "Comments:\n\n"
  const comments = await database.getComments({ author: user.user_id })
  for (const comment of comments) {
    content += `${comment.comment_id}: \`${comment.content}\` at ${comment.timestamp}\n`
  }
  content += "\n"

  content += "Reviews:\n\n"
  const reviews = await database.getOrderReviews({
    user_author: user.user_id,
  })
  for (const review of reviews) {
    content += `${review.order_id}: ${review.rating}/5 \`${review.content}\` at ${review.timestamp} as ${review.role}\n`
  }
  content += "\n"

  res.json(content)
}

export const profile_get_blocklist: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const blocklist = await database.getUserBlocklist(user.user_id, "user")

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
    console.error("Error fetching user blocklist:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to fetch blocklist" }))
  }
}

export const profile_post_blocklist_block: RequestHandler = async (
  req,
  res,
) => {
  try {
    const user = req.user as User
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

    // Prevent self-blocking
    if (user.user_id === userToBlock.user_id) {
      res
        .status(400)
        .json(createErrorResponse({ message: "You cannot block yourself" }))
      return
    }

    // Check if already blocked
    const isBlocked = await database.isUserBlocked(
      user.user_id,
      userToBlock.user_id,
      "user",
    )
    if (isBlocked) {
      res
        .status(400)
        .json(createErrorResponse({ message: "User is already blocked" }))
      return
    }

    // Block the user
    await database.blockUser(user.user_id, userToBlock.user_id, "user", reason)

    res.json(createResponse({ message: "User blocked successfully" }))
  } catch (error) {
    console.error("Error blocking user:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to block user" }))
  }
}

export const profile_delete_blocklist_unblock_username: RequestHandler = async (
  req,
  res,
) => {
  try {
    const user = req.user as User
    const { username } = req.params

    // Get the user to unblock
    const userToUnblock = await database.getUser({ username })
    if (!userToUnblock) {
      res.status(404).json(createErrorResponse({ message: "User not found" }))
      return
    }

    // Check if user is blocked
    const isBlocked = await database.isUserBlocked(
      user.user_id,
      userToUnblock.user_id,
      "user",
    )
    if (!isBlocked) {
      res
        .status(404)
        .json(createErrorResponse({ message: "User is not blocked" }))
      return
    }

    // Unblock the user
    await database.unblockUser(user.user_id, userToUnblock.user_id, "user")

    res.json(createResponse({ message: "User unblocked successfully" }))
  } catch (error) {
    console.error("Error unblocking user:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to unblock user" }))
  }
}

export interface AccountSettingsBody {
  discord_order_share?: boolean
  discord_public?: boolean
}
