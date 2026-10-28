import type { Knex } from "knex"
import { getKnex } from "../../clients/database/knex-db.js"
import { DBUser } from "../../clients/database/db-models.js"
import { BusinessLogicError } from "../../api/routes/v1/util/errors.js"
import { ErrorCode } from "../../api/routes/v1/util/error-codes.js"
import logger from "../../logger/logger.js"
import { deleteOwner } from "../discord/channel-setups.js"

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

    // Archive user's shops
    await trx("shops")
      .where("owner_user_id", userId)
      .where("status", "active")
      .update({ status: "archived", updated_at: trx.fn.now() })

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

/**
 * Postgres error classes that retrying the same tombstone can't fix: data
 * exceptions (22), integrity constraint violations (23, e.g. a unique
 * violation) and syntax/undefined objects (42). Anything else (connection
 * loss, serialization failure, lock or statement timeout) is retried on the
 * next run.
 */
function isPermanentDbError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === "string" && /^(22|23|42)/.test(code)
}

export async function processExpiredDeletions(): Promise<number> {
  const knex = getKnex()

  // Accounts that failed permanently are recorded in
  // account_tombstone_failures and skipped until that row is deleted (after
  // fixing the cause). Without this a broken account failed every hour forever.
  const expired = await knex<DBUser>("accounts as a")
    .whereNotNull("a.deleted_at")
    .where("a.is_tombstone", false)
    .where("a.deletion_scheduled_at", "<=", new Date())
    .whereNotExists(
      knex("account_tombstone_failures as f").whereRaw("f.user_id = a.user_id"),
    )
    .select("a.user_id")

  let count = 0
  for (const { user_id } of expired) {
    try {
      await convertToTombstone(user_id)
      count++
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      if (!isPermanentDbError(err)) {
        logger.error("Failed to convert account to tombstone; will retry", {
          user_id,
          error,
        })
        continue
      }
      logger.error(
        "Failed to convert account to tombstone; not retrying until its account_tombstone_failures row is deleted",
        { user_id, error },
      )
      try {
        await knex("account_tombstone_failures")
          .insert({ user_id, error, failed_at: knex.fn.now() })
          .onConflict("user_id")
          .merge()
      } catch (recordErr) {
        logger.error("Failed to record tombstone failure", {
          user_id,
          error: recordErr instanceof Error ? recordErr.message : String(recordErr),
        })
      }
    }
  }

  return count
}

async function convertToTombstone(userId: string): Promise<void> {
  const knex = getKnex()

  await knex.transaction(async (trx) => {
    // Delete private data from all related tables.
    // Each runs in its own savepoint: some tables may not exist in all
    // environments, and in Postgres a failed statement aborts the whole
    // transaction unless it is rolled back to a savepoint.
    const deletes: [string, (db: Knex.Transaction) => Promise<unknown>][] = [
      ["refresh_tokens", (db) => db("refresh_tokens").where("user_id", userId).delete()],
      ["api_tokens", (db) => db("api_tokens").where("user_id", userId).delete()],
      ["account_providers", (db) => db("account_providers").where("user_id", userId).delete()],
      ["account_integrations", (db) => db("account_integrations").where("user_id", userId).delete()],
      ["user_preferences", (db) => db("user_preferences").where("user_id", userId).delete()],
      ["user_blueprint_inventory", (db) => db("user_blueprint_inventory").where("user_id", userId).delete()],
      ["wishlists", (db) => db("wishlists").where("user_id", userId).delete()],
      ["mission_completions", (db) => db("mission_completions").where("user_id", userId).delete()],
      ["mission_ratings", (db) => db("mission_ratings").where("user_id", userId).delete()],
      ["crafting_history", (db) => db("crafting_history").where("user_id", userId).delete()],
      ["cart_items_v2", (db) => db("cart_items_v2").where("user_id", userId).delete()],
      ["watchlist_items", (db) => db("watchlist_items").where("user_id", userId).delete()],
      ["push_subscriptions", (db) => db("push_subscriptions").where("user_id", userId).delete()],
      ["push_notification_preferences", (db) => db("push_notification_preferences").where("user_id", userId).delete()],
      ["email_notification_preferences", (db) => db("email_notification_preferences").where("user_id", userId).delete()],
      ["notification_channel_preferences", (db) => db("notification_channel_preferences").where("user_id", userId).delete()],
      ["notification_channel_org_preferences", (db) => db("notification_channel_org_preferences").where("user_id", userId).delete()],
      ["notification_org_mutes", (db) => db("notification_org_mutes").where("user_id", userId).delete()],
      ["user_emails", (db) => db("user_emails").where("user_id", userId).delete()],
      ["notification_webhooks", (db) => db("notification_webhooks").where("user_id", userId).delete()],
      ["notification", (db) => db("notification").where("notifier_id", userId).delete()],
      ["notification_change", (db) => db("notification_change").where("actor_id", userId).delete()],
      ["ships", (db) => db("ships").where("owner", userId).delete()],
      ["user_contractor_settings", (db) => db("user_contractor_settings").where("user_id", userId).delete()],
      ["services", (db) => db("services").where("user_id", userId).delete()],
      ["market_buy_orders", (db) => db("market_buy_orders").where("buyer_id", userId).delete()],
      ["blocklist", (db) => db("blocklist").where(function () { this.where("blocker_user_id", userId).orWhere("blocked_id", userId) }).delete()],
      ["chat_participants", (db) => db("chat_participants").where("user_id", userId).delete()],
      ["listing_views", (db) => db("listing_views").where("viewer_id", userId).delete()],
      ["listing_views_v2", (db) => db("listing_views_v2").where("viewer_id", userId).delete()],
      ["contractor_members", (db) => db("contractor_members").where("user_id", userId).delete()],
      ["contractor_member_roles", (db) => db("contractor_member_roles").where("user_id", userId).delete()],
      ["user_availability", (db) => db("user_availability").where("user_id", userId).delete()],
      ["account_settings", (db) => db("account_settings").where("user_id", userId).delete()],
    ]

    for (const [table, fn] of deletes) {
      try {
        await trx.transaction((sp) => fn(sp))
      } catch (err) {
        logger.warn(`Tombstone cleanup: failed to delete from ${table}`, { user_id: userId, error: err instanceof Error ? err.message : String(err) })
      }
    }

    // Expire any remaining V2 listings
    await trx("listings")
      .where("seller_id", userId)
      .where("seller_type", "user")
      .whereIn("status", ["active", "inactive"])
      .update({ status: "expired" })

    // Stop order threads and alerts for this account in Discord
    await deleteOwner({ owner_type: "user", owner_id: userId }, trx)

    // Wipe PII on the account row (keep the row for FK integrity)
    const tombstoneUsername = `[deleted_${userId.replace(/-/g, "").slice(0, 8)}]`
    await trx("accounts")
      .where("user_id", userId)
      .update({
        username: tombstoneUsername,
        display_name: "Deleted User",
        profile_description: "",
        avatar: "5226c767-0599-419b-ae71-a7303c441db0", // default avatar resource
        banner: "0008300c-fc6a-4e4e-9488-7d696f00e8b2", // default banner resource
        // NULL, never a shared placeholder: accounts_discord_id_unique allows
        // any number of NULLs, but a constant (it was 0) collides from the
        // second tombstone on. The Discord identity is released, not moved.
        discord_id: null,
        discord_access_token: "",
        discord_refresh_token: "",
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
