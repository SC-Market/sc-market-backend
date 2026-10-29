import {
  canViewTestEntity,
  isTestUser,
  rejectTestUser,
} from "../../../../services/test-accounts/isolation.js"
import { RequestHandler } from "express"
import { User as User } from "../api-models.js"
import {
  database as database,
  getKnex,
} from "../../../../clients/database/knex-db.js"
import * as profileDb from "./database.js"
import * as contractorDb from "../contractors/database.js"
import * as notificationDb from "../notifications/database.js"
import { cdn as cdn } from "../../../../clients/cdn/cdn.js"
import { AvailabilityBody as AvailabilityBody } from "../../../../clients/database/db-models.js"
import { getUserRating as getUserRating } from "../util/formatting.js"
import { createNotificationWebhook as createNotificationWebhook } from "../util/webhooks.js"
import { validateWebhookUrl } from "../../../util/validate-webhook-url.js"
import {
  getThreadChannel,
  setThreadChannel,
} from "../../../../services/discord/channel-setups.js"
import {
  OFFICIAL_THREAD_CHANNEL,
  describeThreadChannel,
} from "../../../../services/discord/site-settings.js"
import { authorizeProfile as authorizeProfile } from "./helpers.js"
import { get_sentinel as get_sentinel } from "./helpers.js"
import { syncRSIHandle as syncRSIHandle } from "./helpers.js"
import { serializeDetailedProfile as serializeDetailedProfile } from "./serializers.js"
import { serializePublicProfile as serializePublicProfile } from "./serializers.js"
import {
  createErrorResponse,
  createNotFoundErrorResponse,
  createResponse,
} from "../util/response.js"
import { ErrorCode } from "../util/error-codes.js"
import { randomUUID as randomUUID } from "node:crypto"
import fs from "node:fs"
import logger from "../../../../logger/logger.js"
import { renameToPlaceholder } from "../../../../services/accounts/identity-links.js"
import { ImageUploadUserError } from "../../../../clients/image-lambda/image-upload-error.js"
import { sendImageUploadUserError } from "../util/image-upload-errors.js"
import { writeUserDataExport } from "../../../../services/data-export/user-data-export.js"
import {
  SUPPORTED_LANGUAGES,
  validateLanguageCodes,
  getLanguageName,
} from "../../../../constants/languages.js"

export const profile_post_auth_link: RequestHandler = async (req, res) => {
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
    logger.error("Error in profile operation", { error: e })
  }
}

export const profile_post_auth_sync_handle: RequestHandler = async (
  req,
  res,
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

export const profile_post_auth_unlink: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User

    // Check if user is currently verified
    if (!user.rsi_confirmed) {
      res.status(400).json(
        createErrorResponse({
          message: "User is not currently verified with a Star Citizen account",
          status: "error",
        }),
      )
      return
    }

    // Check if Citizen ID is linked - if so, disallow unlinking
    // Citizen ID is the authoritative source for RSI details when linked
    const providers = await profileDb.getUserProviders(user.user_id)
    const hasCitizenID = providers.some((p) => p.provider_type === "citizenid")

    if (hasCitizenID) {
      res.status(400).json(
        createErrorResponse({
          message:
            "Cannot unlink Star Citizen account while Citizen ID is linked. Citizen ID is the authoritative source for RSI details. Please unlink Citizen ID first if you wish to unlink your Star Citizen account.",
          status: "error",
        }),
      )
      return
    }

    // Unverified state with a free placeholder username (user_<8 hex>):
    // the old new_user<discord id> name could already be taken and 500ed.
    await getKnex().transaction(async (trx) => {
      await profileDb.updateUser(
        { user_id: user.user_id },
        { rsi_confirmed: false, spectrum_user_id: null },
        trx,
      )
      await renameToPlaceholder(trx, user.user_id, (name) => ({ display_name: name }))
    })

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

export const profile_get_auth_ident: RequestHandler = async (req, res) => {
  const user = req.user as User
  res.json({ identifier: get_sentinel(user.user_id) })
}

export const profile_get_search_query: RequestHandler = async (req, res) => {
  const query = req.params["query"]

  // if (query.length < 3) {
  //   res.status(400).json({
  //     error: "Query must be at least 3 characters long",
  //   })
  //   return
  // }

  const users = await profileDb.searchUsers(query, isTestUser(req.user))

  res.json(await Promise.all(users.map((u) => serializePublicProfile(u))))
}

export const profile_put_root: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const { locale }: { locale: string } = req.body

    // Update user locale in database
    const updatedUsers = await profileDb.updateUser(
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

  // Reject if URL parameters are provided
  if (req.body.avatar_url || req.body.banner_url) {
    res
      .status(400)
      .json(
        createErrorResponse(
          ErrorCode.VALIDATION_ERROR,
          "avatar_url and banner_url are no longer supported. Use /avatar and /banner upload endpoints instead.",
        ),
      )
    return
  }

  const {
    about,
    display_name,
    market_order_template,
  }: {
    about?: string
    display_name?: string
    market_order_template?: string
  } = req.body

  if (display_name && (display_name.length > 30 || display_name.length === 0)) {
    res
      .status(400)
      .json(
        createErrorResponse(ErrorCode.VALIDATION_ERROR, "Invalid display name"),
      )
    return
  }

  // Update only non-image fields
  const newUsers = await profileDb.updateUser(
    { user_id: user.user_id },
    {
      profile_description: about || "",
      display_name: display_name || undefined,
      market_order_template: market_order_template,
    },
  )

  res.json({ result: "Success", ...newUsers[0] })
}

export const profile_post_avatar: RequestHandler = async (req, res) => {
  try {
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

    const old_avatar = user.avatar

    // Upload to CDN (includes moderation)
    const fileExtension = file.mimetype.split("/")[1] || "png"
    const resource = await cdn.uploadFile(
      `${user.user_id}_avatar_${randomUUID()}.${fileExtension}`,
      file.path,
      file.mimetype,
    )

    // Update user record
    await profileDb.updateUser(
      { user_id: user.user_id },
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
            "Old avatar resource still referenced elsewhere, skipping deletion:",
            {
              resource_id: old_avatar,
              user_id: user.user_id,
            },
          )
        } else {
          logger.warn("Failed to delete old avatar resource:", {
            resource_id: old_avatar,
            user_id: user.user_id,
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
    if (error instanceof ImageUploadUserError) {
      sendImageUploadUserError(res, error, "avatar")
      return
    }

    // Log unexpected server errors as error level
    logger.error("Failed to upload avatar:", error)
    res.status(500).json(
      createErrorResponse({
        error: "Upload Failed",
        message: "Failed to upload avatar. Please try again.",
      }),
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

export const profile_post_banner: RequestHandler = async (req, res) => {
  try {
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

    const old_banner = user.banner

    // Upload to CDN (includes moderation)
    const fileExtension = file.mimetype.split("/")[1] || "png"
    const resource = await cdn.uploadFile(
      `${user.user_id}_banner_${randomUUID()}.${fileExtension}`,
      file.path,
      file.mimetype,
    )

    // Update user record
    await profileDb.updateUser(
      { user_id: user.user_id },
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
            "Old banner resource still referenced elsewhere, skipping deletion:",
            {
              resource_id: old_banner,
              user_id: user.user_id,
            },
          )
        } else {
          logger.warn("Failed to delete old banner resource:", {
            resource_id: old_banner,
            user_id: user.user_id,
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
    if (error instanceof ImageUploadUserError) {
      sendImageUploadUserError(res, error, "banner")
      return
    }

    // Log unexpected server errors as error level
    logger.error("Failed to upload banner:", error)
    res.status(500).json(
      createErrorResponse({
        error: "Upload Failed",
        message: "Failed to upload banner. Please try again.",
      }),
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

export const profile_post_webhook_create: RequestHandler = async (req, res) => {
  const user = req.user as User
  if (rejectTestUser(res, user, "Test accounts cannot use webhooks")) return

  const {
    webhook_url,
    name,
    actions,
  }: {
    webhook_url: string
    name: string
    actions: string[]
  } = req.body

  if (!webhook_url || !name) {
    res.status(400).json({ error: "Invalid arguments" })
    return
  }

  const webhookValidation = validateWebhookUrl(webhook_url)
  if (!webhookValidation.valid) {
    res.status(400).json({ error: webhookValidation.reason })
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

export const profile_post_webhook_delete: RequestHandler = async (req, res) => {
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

  const webhook = await notificationDb.getNotificationWebhook({ webhook_id })
  if (webhook?.user_id !== user.user_id) {
    res.status(403).json({ error: "Unauthorized" })
    return
  }

  await notificationDb.deleteNotificationWebhook({
    webhook_id,
    user_id: user.user_id,
  })
  res.json({ result: "Success" })
}

export const profile_get_webhooks: RequestHandler = async (req, res, next) => {
  const user = req.user as User

  const webhooks = await notificationDb.getNotificationWebhooks({
    user_id: user.user_id,
  })
  res.json(webhooks)
}

export const profile_get_user_username_reviews: RequestHandler = async (
  req,
  res,
) => {
  const username = req.params["username"]
  let user
  try {
    user = await profileDb.getUser({ username: username }, { noBalance: true })
  } catch (e) {
    res.status(400).json({ error: "Invalid user" })
    return
  }

  const reviews = await profileDb.getUserReviews(user.user_id)
  res.json(
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
  )
}

export const profile_get_user_username: RequestHandler = async (req, res) => {
  try {
    const requester = req.user as User
    const username = req.params["username"]
    const user = await profileDb.findUser(
      { username: username },
      { noBalance: true },
    )
    // Test accounts' profiles: test accounts and admins only.
    if (!user || (user.is_test && !canViewTestEntity(requester))) {
      res.status(404).json(createNotFoundErrorResponse("User", username))
      return
    }

    res.json(await serializePublicProfile(user, { discord: !!requester }))
  } catch (e) {
    logger.error("Error fetching user profile", { error: e })
    res
      .status(500)
      .json(
        createErrorResponse(
          ErrorCode.INTERNAL_SERVER_ERROR,
          "Internal server error",
        ),
      )
    return
  }
}

export const profile_post_settings_update: RequestHandler = async (
  req,
  res,
) => {
  const user = req.user as User

  const { discord_order_share, discord_public } = req.body

  if (discord_order_share === undefined && discord_public === undefined) {
    res.status(400).json({ error: "Invalid body" })
    return
  }

  await profileDb.updateUserSettings(user.user_id, {
    discord_order_share,
    discord_public,
  })

  res.json({ result: "Success" })
  return
}

export const profile_post_availability_update: RequestHandler = async (
  req,
  res,
) => {
  try {
    const user = req.user as User

    const { contractor, selections } = req.body as AvailabilityBody

    if (contractor != null) {
      let cobj
      try {
        cobj = await contractorDb.getContractor({ spectrum_id: contractor })
      } catch {
        res.status(403).json({ error: "Invalid contractor" })
        return
      }

      if (
        !(await contractorDb.getMemberRoles(cobj.contractor_id, user.user_id))
          .length
      ) {
        res.status(403).json({ error: "Invalid contractor" })
        return
      }

      await profileDb.updateUserAvailability(
        user.user_id,
        cobj.contractor_id,
        selections,
      )
    } else {
      await profileDb.updateUserAvailability(user.user_id, null, selections)
    }

    res.json({ result: "Success" })
    return
  } catch (e) {
    logger.error("Error in profile operation", { error: e })
  }
}

export const profile_get_availability_contractor_spectrum_id: RequestHandler =
  async (req, res, next) => {
    const user = req.user as User
    const spectrum_id = req.params["spectrum_id"]

    let cobj
    try {
      cobj = await contractorDb.getContractor({ spectrum_id })
    } catch {
      res.status(403).json({ error: "Invalid contractor" })
      return
    }

    res.json({
      contractor: spectrum_id,
      selections: await profileDb.getUserAvailability(
        user.user_id,
        cobj.contractor_id,
      ),
    })
    return
  }

export const profile_get_settings_discord: RequestHandler = async (
  req,
  res,
) => {
  const user = req.user as User
  res.json(
    await describeThreadChannel(
      await getThreadChannel({ owner_type: "user", owner_id: user.user_id }),
    ),
  )
  return
}

export const profile_post_settings_discord_use_official: RequestHandler =
  async (req, res, next) => {
    const user = req.user as User
    await setThreadChannel(
      { owner_type: "user", owner_id: user.user_id },
      OFFICIAL_THREAD_CHANNEL,
      null,
    )
    res.json({ result: "Success" })
    return
  }

export const profile_get_availability: RequestHandler = async (req, res) => {
  const user = req.user as User

  res.json({
    contractor: null,
    selections: await profileDb.getUserAvailability(user.user_id, null),
  })
  return
}

export const profile_get_root: RequestHandler = async (req, res, next) => {
  try {
    const { discord_access_token, discord_refresh_token, ...user } =
      req.user as User

    const contractors = await contractorDb.getUserContractorRoles({
      user_id: user.user_id,
    })

    // Get all providers
    const providers = await profileDb.getUserProviders(user.user_id)

    // Get Discord profile if Discord provider exists
    const discordProvider = providers.find((p) => p.provider_type === "discord")
    let discord_profile = null
    if (discordProvider) {
      discord_profile = await database.discord_profile_cache.fetch(user.user_id)
    }

    res.json({
      ...user,
      // Present only for a site admin whose role is held back on this request
      // (two-factor not set up / not verified, or a custom-domain origin), so
      // the frontend can prompt instead of hiding admin features silently.
      ...(req.adminLocked && { admin_locked: req.adminLocked }),
      balance: +user.balance!,
      contractors: await (async () => {
        // Group contractors by spectrum_id to collect all roles with details
        const contractorMap = new Map()

        contractors.forEach(
          (s: {
            spectrum_id: string
            role: string
            role_id: string
            name: string
            position: number
          }) => {
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
          },
        )

        const contractorList = Array.from(contractorMap.values())
        return Promise.all(
          contractorList.map(async (contractor) => ({
            ...contractor,
            ...(await contractorDb.getMinimalContractor({
              spectrum_id: contractor.spectrum_id,
            })),
          })),
        )
      })(),
      avatar: await cdn.getFileLinkResource(user.avatar),
      banner: await cdn.getFileLinkResource(user.banner),
      // notifications: await database.getCompleteNotificationsByUser(user.user_id),
      settings: await profileDb.getUserSettings(user.user_id),
      rating: await getUserRating(user.user_id),
      badges: await profileDb.getUserBadges(user.user_id),
      discord_profile: discord_profile
        ? {
            username: discord_profile?.username,
            discriminator: discord_profile?.discriminator,
            id: discord_profile?.id,
          }
        : null,
      providers: providers.map((p) => ({
        type: p.provider_type,
        is_primary: p.is_primary,
        linked_at: p.linked_at,
        last_used_at: p.last_used_at,
      })),
      market_order_template: user.market_order_template,
      onboarding_completed_at: user.onboarding_completed_at ?? null,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Get all linked accounts/providers
 */
export const profile_get_links: RequestHandler = async (req, res, next) => {
  try {
    const user = req.user as User
    const providers = await profileDb.getUserProviders(user.user_id)

    res.json(
      createResponse({
        providers: providers.map((p) => ({
          provider_type: p.provider_type,
          provider_id: p.provider_id,
          is_primary: p.is_primary,
          linked_at: p.linked_at,
          last_used_at: p.last_used_at,
        })),
      }),
    )
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/v1/profile/organizations
 * Get list of organizations user is a member of (for notification preferences)
 */
export const profile_get_organizations: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User
    const organizations = await contractorDb.getUserOrganizationsForPreferences(
      user.user_id,
    )

    res.json(
      createResponse({
        organizations: organizations.map((org) => ({
          contractor_id: org.contractor_id,
          name: org.name,
        })),
      }),
    )
  } catch (error) {
    logger.error("Failed to get user organizations", {
      error,
      user_id: (req.user as User).user_id,
    })
    next(error)
  }
}

/**
 * Unlink a provider
 */
export const profile_delete_links_provider_type: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User
    const { provider_type } = req.params

    await profileDb.unlinkProvider(user.user_id, provider_type)

    res.json(createResponse({ success: true }))
  } catch (error: any) {
    if (error.message?.includes("only primary")) {
      res.status(400).json(
        createErrorResponse({
          message: error.message,
          status: "error",
        }),
      )
    } else {
      next(error)
    }
  }
}

/**
 * Set primary provider
 */
export const profile_put_links_provider_type_primary: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const user = req.user as User
    const { provider_type } = req.params

    await profileDb.setPrimaryProvider(user.user_id, provider_type)

    res.json(createResponse({ success: true }))
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/profile/my_data: the user's personal-data export, streamed as one
 * JSON file. Contents: src/services/data-export/user-data-export.ts.
 */
export const profile_get_my_data: RequestHandler = async (req, res) => {
  const user = req.user as User
  const date = new Date().toISOString().slice(0, 10)
  res.status(200).set({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="sc-market-data-${date}.json"`,
    "Cache-Control": "no-store",
  })
  const closed = () => new Error("Client closed the connection")
  const sink = {
    write: (chunk: string) =>
      new Promise<void>((resolve, reject) => {
        if (res.destroyed) return reject(closed())
        if (res.write(chunk)) return resolve()
        const onDrain = () => {
          res.off("close", onClose)
          resolve()
        }
        const onClose = () => {
          res.off("drain", onDrain)
          reject(closed())
        }
        res.once("drain", onDrain)
        res.once("close", onClose)
      }),
  }
  try {
    await writeUserDataExport(user.user_id, sink, {
      knex: getKnex(),
      resolveImage: (id) => cdn.getFileLinkResource(id ?? undefined),
    })
    res.end()
  } catch (error) {
    logger.error("Data export failed", { error, user_id: user.user_id })
    // Headers (and maybe part of the body) are already sent: cut the
    // response so the client sees a failed download, not a truncated file.
    res.destroy(error instanceof Error ? error : undefined)
  }
}

export const profile_get_blocklist: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const blocklist = await profileDb.getUserBlocklist(user.user_id, "user")

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
    logger.error("Error fetching user blocklist", { error })
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
    const userToBlock = await profileDb.getUser({ username })
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
    const isBlocked = await profileDb.isUserBlocked(
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
    await profileDb.blockUser(user.user_id, userToBlock.user_id, "user", reason)

    res.json(createResponse({ message: "User blocked successfully" }))
  } catch (error) {
    logger.error("Error blocking user", { error })
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
    const userToUnblock = await profileDb.getUser({ username })
    if (!userToUnblock) {
      res.status(404).json(createErrorResponse({ message: "User not found" }))
      return
    }

    // Check if user is blocked
    const isBlocked = await profileDb.isUserBlocked(
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
    await profileDb.unblockUser(user.user_id, userToUnblock.user_id, "user")

    res.json(createResponse({ message: "User unblocked successfully" }))
  } catch (error) {
    logger.error("Error unblocking user", { error })
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to unblock user" }))
  }
}

export interface AccountSettingsBody {
  discord_order_share?: boolean
  discord_public?: boolean
}

/**
 * Get current user's supported languages
 */
export const profile_get_languages: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
    const languageCodes = await profileDb.getUserLanguages(user.user_id)

    const languages = languageCodes.map((code) => ({
      code,
      name: getLanguageName(code) || code,
    }))

    res.json(createResponse({ languages }))
  } catch (error) {
    logger.error("Error getting user languages:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to get languages" }))
  }
}

/**
 * Set current user's supported languages
 */
export const profile_put_languages: RequestHandler = async (req, res) => {
  try {
    const user = req.user as User
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
    await profileDb.setUserLanguages(user.user_id, language_codes)

    // Return updated languages
    const updatedCodes = await profileDb.getUserLanguages(user.user_id)
    const languages = updatedCodes.map((code) => ({
      code,
      name: getLanguageName(code) || code,
    }))

    res.json(createResponse({ languages }))
  } catch (error) {
    logger.error("Error setting user languages:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to set languages" }))
  }
}

export const profile_patch_in_game_status: RequestHandler = async (
  req,
  res,
) => {
  try {
    const user = req.user as User
    const { in_game } = req.body

    if (typeof in_game !== "boolean") {
      return res
        .status(400)
        .json(createErrorResponse({ message: "in_game must be boolean" }))
    }

    const knex = database.knex
    await knex("accounts")
      .where({ user_id: user.user_id })
      .update({
        in_game,
        last_seen: knex.fn.now(),
      })

    res.json(createResponse({ in_game }))
  } catch (error) {
    logger.error("Error updating in-game status:", error)
    res
      .status(500)
      .json(createErrorResponse({ message: "Failed to update in-game status" }))
  }
}
