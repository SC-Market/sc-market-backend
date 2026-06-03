import { getKnex } from "../../clients/database/knex-db.js"
import { DBUser } from "../../clients/database/db-models.js"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import logger from "../../logger/logger.js"

export interface DeletionBlocker {
  type: string
  detail: string
}

export interface DeletionPreCheckResult {
  canDelete: boolean
  blockers: DeletionBlocker[]
}

export interface DeletionStatusResult {
  pending: boolean
  scheduledAt?: Date
  isTombstone: boolean
}

const GRACE_PERIOD_DAYS = 30

export async function preCheckDeletion(
  userId: string,
): Promise<DeletionPreCheckResult> {
  const knex = getKnex()
  const blockers: DeletionBlocker[] = []

  // Check positive balance
  const account = await knex<DBUser>("accounts")
    .where("user_id", userId)
    .first("balance")
  if (account && parseFloat(account.balance) > 0) {
    blockers.push({
      type: "positive_balance",
      detail: `Account has a balance of ${account.balance} aUEC. Please withdraw or transfer before deleting.`,
    })
  }

  // Check in-progress orders
  const activeOrders = await knex("orders")
    .where(function () {
      this.where("customer_id", userId).orWhere("assigned_id", userId)
    })
    .whereIn("status", ["in-progress", "not-started"])
    .count("* as count")
    .first()
  if (activeOrders && Number(activeOrders.count) > 0) {
    blockers.push({
      type: "active_orders",
      detail: `You have ${activeOrders.count} active order(s). Please complete or cancel them first.`,
    })
  }

  // Check sole org ownership
  const userOrgRoles = await knex("contractor_member_roles as cmr")
    .join("contractor_roles as cr", "cmr.role_id", "cr.role_id")
    .where("cmr.user_id", userId)
    .where("cr.name", "owner")
    .select("cr.contractor_id")

  for (const { contractor_id } of userOrgRoles) {
    const otherOwners = await knex("contractor_member_roles as cmr")
      .join("contractor_roles as cr", "cmr.role_id", "cr.role_id")
      .where("cr.contractor_id", contractor_id)
      .where("cr.name", "owner")
      .whereNot("cmr.user_id", userId)
      .count("* as count")
      .first()

    if (!otherOwners || Number(otherOwners.count) === 0) {
      const org = await knex("contractors")
        .where("contractor_id", contractor_id)
        .first("name")
      blockers.push({
        type: "sole_org_owner",
        detail: `You are the sole owner of "${org?.name || contractor_id}". Transfer ownership before deleting.`,
      })
    }
  }

  return { canDelete: blockers.length === 0, blockers }
}

export async function requestDeletion(
  userId: string,
  reason?: string,
): Promise<{ scheduledAt: Date }> {
  const knex = getKnex()

  // Verify not already pending or tombstoned
  const account = await knex<DBUser>("accounts")
    .where("user_id", userId)
    .first("deleted_at", "is_tombstone")
  if (!account) {
    throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Account not found")
  }
  if (account.is_tombstone) {
    throw new BusinessLogicError(
      ErrorCode.CONFLICT,
      "Account has already been deleted",
    )
  }
  if (account.deleted_at) {
    throw new BusinessLogicError(
      ErrorCode.CONFLICT,
      "Account deletion is already pending",
    )
  }

  // Run pre-checks
  const preCheck = await preCheckDeletion(userId)
  if (!preCheck.canDelete) {
    throw new BusinessLogicError(
      ErrorCode.CONFLICT,
      "Cannot delete account due to unresolved issues",
      { blockers: preCheck.blockers },
    )
  }

  const now = new Date()
  const scheduledAt = new Date(
    now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  )

  await knex.transaction(async (trx) => {
    // Mark account for deletion
    await trx("accounts").where("user_id", userId).update({
      deleted_at: now,
      deletion_scheduled_at: scheduledAt,
      deletion_reason: reason || null,
    })

    // Cancel active buy orders (V2)
    await trx("buy_orders_v2")
      .where("buyer_id", userId)
      .where("status", "active")
      .update({ status: "cancelled" })

    // Expire active V2 listings
    await trx("listings")
      .where("seller_id", userId)
      .where("seller_type", "user")
      .where("status", "active")
      .update({ status: "expired" })

    // Expire active V1 listings
    await trx("market_listings")
      .where("user_seller_id", userId)
      .where("status", "active")
      .update({ status: "inactive" })

    // Revoke all refresh tokens (logs out all sessions)
    await trx("refresh_tokens").where("user_id", userId).delete()

    // Revoke all API tokens
    await trx("api_tokens")
      .where("user_id", userId)
      .whereNull("revoked_at")
      .update({ revoked_at: now })
  })

  logger.info("Account deletion requested", {
    user_id: userId,
    scheduled_at: scheduledAt.toISOString(),
  })

  return { scheduledAt }
}

export async function cancelDeletion(userId: string): Promise<void> {
  const knex = getKnex()

  const account = await knex<DBUser>("accounts")
    .where("user_id", userId)
    .first("deleted_at", "is_tombstone")
  if (!account) {
    throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Account not found")
  }
  if (account.is_tombstone) {
    throw new BusinessLogicError(
      ErrorCode.CONFLICT,
      "Account has already been permanently deleted and cannot be restored",
    )
  }
  if (!account.deleted_at) {
    throw new BusinessLogicError(
      ErrorCode.CONFLICT,
      "No pending deletion to cancel",
    )
  }

  await knex("accounts").where("user_id", userId).update({
    deleted_at: null,
    deletion_scheduled_at: null,
    deletion_reason: null,
  })

  logger.info("Account deletion cancelled", { user_id: userId })
}

export async function getDeletionStatus(
  userId: string,
): Promise<DeletionStatusResult> {
  const knex = getKnex()

  const account = await knex<DBUser>("accounts")
    .where("user_id", userId)
    .first("deleted_at", "deletion_scheduled_at", "is_tombstone")
  if (!account) {
    throw new BusinessLogicError(ErrorCode.NOT_FOUND, "Account not found")
  }

  return {
    pending: account.deleted_at !== null && !account.is_tombstone,
    scheduledAt: account.deletion_scheduled_at || undefined,
    isTombstone: account.is_tombstone,
  }
}

export async function processExpiredDeletions(): Promise<number> {
  const knex = getKnex()

  const expired = await knex<DBUser>("accounts")
    .whereNotNull("deleted_at")
    .where("is_tombstone", false)
    .where("deletion_scheduled_at", "<=", new Date())
    .select("user_id")

  let count = 0
  for (const { user_id } of expired) {
    try {
      await convertToTombstone(user_id)
      count++
    } catch (err) {
      logger.error("Failed to convert account to tombstone", {
        user_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return count
}

async function convertToTombstone(userId: string): Promise<void> {
  const knex = getKnex()

  await knex.transaction(async (trx) => {
    // Delete private data from all related tables
    await Promise.all([
      trx("refresh_tokens").where("user_id", userId).delete(),
      trx("api_tokens").where("user_id", userId).delete(),
      trx("account_providers").where("user_id", userId).delete(),
      trx("account_integrations").where("user_id", userId).delete(),
      trx("user_preferences").where("user_id", userId).delete(),
      trx("user_blueprint_inventory").where("user_id", userId).delete(),
      trx("wishlists").where("user_id", userId).delete(),
      trx("mission_completions").where("user_id", userId).delete(),
      trx("mission_ratings").where("user_id", userId).delete(),
      trx("crafting_history").where("user_id", userId).delete(),
      trx("cart_items_v2").where("user_id", userId).delete(),
      trx("watchlist_items").where("user_id", userId).delete(),
      trx("push_subscriptions").where("user_id", userId).delete(),
      trx("push_notification_preferences").where("user_id", userId).delete(),
      trx("notification_webhooks").where("user_id", userId).delete(),
      trx("notification").where("notifier_id", userId).delete(),
      trx("notification_change").where("actor_id", userId).delete(),
      trx("ships").where("owner", userId).delete(),
      trx("user_contractor_settings").where("user_id", userId).delete(),
      trx("services").where("user_id", userId).delete(),
      trx("market_buy_orders").where("buyer_id", userId).delete(),
      trx("blocklist")
        .where("blocker_user_id", userId)
        .orWhere("blocked_id", userId)
        .delete(),
      trx("chat_participants").where("user_id", userId).delete(),
      trx("listing_views").where("viewer_id", userId).delete(),
      trx("listing_views_v2").where("viewer_id", userId).delete(),
      trx("contractor_members").where("user_id", userId).delete(),
      trx("contractor_member_roles").where("user_id", userId).delete(),
    ])

    // Expire any remaining V2 listings
    await trx("listings")
      .where("seller_id", userId)
      .where("seller_type", "user")
      .whereIn("status", ["active", "inactive"])
      .update({ status: "expired" })

    // Wipe PII on the account row (keep the row for FK integrity)
    await trx("accounts")
      .where("user_id", userId)
      .update({
        username: knex.raw(
          "'[deleted_' || substr(user_id::text, 1, 8) || ']'",
        ),
        display_name: "Deleted User",
        profile_description: "",
        avatar: "",
        banner: "",
        discord_id: null,
        discord_access_token: null,
        discord_refresh_token: null,
        spectrum_user_id: null,
        official_server_id: null,
        discord_thread_channel_id: null,
        market_order_template: "",
        balance: "0",
        rsi_confirmed: false,
        locale: "en",
        supported_languages: null,
        is_tombstone: true,
      })
  })

  logger.info("Account converted to tombstone", { user_id: userId })
}
