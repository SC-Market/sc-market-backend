import { database } from "../../clients/database/knex-db.js"
import {
  DBContractor,
  DBOrder,
  DBOfferSession,
} from "../../clients/database/db-models.js"
import logger from "../../logger/logger.js"
import { auditLogService } from "../audit-log/audit-log.service.js"
import { cancelOrderMarketItems } from "../../api/routes/v1/orders/helpers.js"

export interface ArchiveContractorOptions {
  contractor: DBContractor
  actorId: string
  reason?: string | null
}

export interface ArchiveContractorResult {
  alreadyArchived: boolean
  archivedAt?: Date
  archivedLabel?: string
  memberCountRemoved?: number
}

const ARCHIVE_LABEL_PREFIX = "[ARCHIVED"

export async function archiveContractor({
  contractor,
  actorId,
  reason,
}: ArchiveContractorOptions): Promise<ArchiveContractorResult> {
  if (contractor.archived) {
    return { alreadyArchived: true }
  }

  const now = new Date()
  const archiveDate = now.toISOString().slice(0, 10)
  const archivedLabel = `${ARCHIVE_LABEL_PREFIX} ${archiveDate}] ${contractor.name}`

  const inviteAction = await database.getNotificationActionByName(
    "contractor_invite",
  )

  let memberCountRemoved = 0
  let orderIds: string[] = []
  let listingIds: string[] = []
  let offerSessionIds: string[] = []

  await database.knex.transaction(async (trx) => {
    const currentContractor = await trx<DBContractor>("contractors")
      .where({ contractor_id: contractor.contractor_id })
      .forUpdate()
      .first()

    if (!currentContractor) {
      throw new Error("Contractor not found")
    }

    if (currentContractor.archived) {
      throw new Error("Contractor already archived")
    }

    const members = await trx("contractor_members")
      .where({ contractor_id: contractor.contractor_id })
      .select("user_id")
    memberCountRemoved = members.length

    // Remove role assignments first to satisfy FK constraints
    await trx("contractor_member_roles")
      .whereIn(
        "role_id",
        trx("contractor_roles")
          .where({ contractor_id: contractor.contractor_id })
          .select("role_id"),
      )
      .delete()

    await trx("contractor_members")
      .where({ contractor_id: contractor.contractor_id })
      .delete()

    const invites = await trx("contractor_invites")
      .where({ contractor_id: contractor.contractor_id })
      .delete()
      .returning("invite_id")

    if (invites.length) {
      await trx("notification_object")
        .whereIn(
          "entity_id",
          invites.map((invite) => invite.invite_id),
        )
        .andWhere("action_type_id", inviteAction.action_type_id)
        .delete()
    }

    await trx("contractor_invite_codes")
      .where({ contractor_id: contractor.contractor_id })
      .delete()

    const openOrders = await trx<DBOrder>("orders")
      .where({ contractor_id: contractor.contractor_id })
      .whereIn("status", ["not-started", "in-progress"])
      .select("order_id")
    orderIds = openOrders.map((order) => order.order_id)

    const listings = await trx("market_listings")
      .where({ contractor_seller_id: contractor.contractor_id })
      .whereNot("status", "archived")
      .select("listing_id")
    listingIds = listings.map((listing) => listing.listing_id)

    // Get open offer sessions for this contractor
    const openOfferSessions = await trx<DBOfferSession>("offer_sessions")
      .where({ contractor_id: contractor.contractor_id })
      .where("status", "active")
      .select("id")
    offerSessionIds = openOfferSessions.map((session) => session.id)

    // Change spectrum_id to ~ARCHIVE~{ORIGINALID} format
    const originalSpectrumId = currentContractor.spectrum_id
    const archivedSpectrumId = `~ARCHIVE~${originalSpectrumId.replace(/^~/, "")}`

    await trx("contractors")
      .where({ contractor_id: contractor.contractor_id })
      .update({
        archived: true,
        name: archivedLabel,
        spectrum_id: archivedSpectrumId,
      })

    await trx("contractor_archive_details")
      .insert({
        contractor_id: contractor.contractor_id,
        archived_at: now,
        archived_by: actorId,
        archived_label: archivedLabel,
        original_name: currentContractor.name,
        reason: reason ?? null,
        member_count_removed: memberCountRemoved,
      })
      .onConflict("contractor_id")
      .merge({
        archived_at: now,
        archived_by: actorId,
        archived_label: archivedLabel,
        reason: reason ?? null,
        member_count_removed: memberCountRemoved,
      })
  })

  // Cancel open orders and release inventory
  for (const orderId of orderIds) {
    try {
      const order = await database.getOrder({ order_id: orderId })
      if (order.status !== "cancelled") {
        await database.updateOrder(order.order_id, { status: "cancelled" })
        await cancelOrderMarketItems(order)
      }
    } catch (error) {
      logger.error("Failed to cancel order during contractor archive", {
        orderId,
        error,
      })
    }
  }

  // Archive related market listings
  for (const listingId of listingIds) {
    try {
      await database.updateMarketListing(listingId, {
        status: "archived",
        internal: true,
      })
    } catch (error) {
      logger.error("Failed to archive market listing", { listingId, error })
    }
  }

  // Reject all open offers for this contractor
  for (const sessionId of offerSessionIds) {
    try {
      // Reject all active offers in the session
      await database.knex("order_offers")
        .where({ session_id: sessionId })
        .where("status", "active")
        .update({ status: "rejected" })

      // Mark the offer session as rejected
      await database.updateOfferSession(sessionId, { status: "rejected" })
    } catch (error) {
      logger.error("Failed to reject offer session during contractor archive", {
        sessionId,
        error,
      })
    }
  }

  // Deactivate all services for this contractor
  try {
    await database.knex("services")
      .where({ contractor_id: contractor.contractor_id })
      .where("status", "active")
      .update({ status: "inactive" })
  } catch (error) {
    logger.error("Failed to deactivate services during contractor archive", {
      contractorId: contractor.contractor_id,
      error,
    })
  }

  await auditLogService.record({
    action: "org.archived",
    actorId,
    subjectType: "contractor",
    subjectId: contractor.contractor_id,
    metadata: {
      archivedAt: now.toISOString(),
      archivedLabel,
      memberCountRemoved,
      reason: reason ?? null,
    },
  })

  logger.info("Contractor archived", {
    contractorId: contractor.contractor_id,
    archivedLabel,
  })

  return {
    alreadyArchived: false,
    archivedAt: now,
    archivedLabel,
    memberCountRemoved,
  }
}
