/**
 * Refreshing (renewing) a listing: the one write behind POST
 * /listings/{id}/refresh and the "Still selling?" campaign's "Keep them live"
 * link (services/dm-campaigns/still-selling.service.ts).
 *
 * A refresh bumps updated_at (the listing ranks as fresh again), starts a new
 * listing month while listing expiry is on (renewalColumns), reactivates a
 * paused ('expired') listing, closes its open expiry notices when it was a
 * renewal (markRenewed) and writes the audit entry. The caller checks
 * permission and the refresh cooldown.
 */
import type { Knex } from "knex"
import {
  NOTICE_DAYS_BEFORE,
  markRenewed,
  renewalColumns,
} from "../listing-expiry/listing-expiry.service.js"
import { auditService } from "../audit/audit.service.js"

/** Statuses a refresh applies to (an expired one is paused and gets reactivated). */
export const REFRESHABLE_STATUSES = ["active", "inactive", "expired"] as const

export interface RefreshableListing {
  listing_id: string
  status: string
  expires_at?: Date | string | null
}

/**
 * A renewal (never subject to the cooldown): the listing is paused, or it
 * expires within the "Still selling?" notice window.
 */
export function isRenewal(
  listing: RefreshableListing,
  now = new Date(),
): boolean {
  if (listing.status === "expired") return true
  return (
    !!listing.expires_at &&
    new Date(listing.expires_at).getTime() <=
      now.getTime() + NOTICE_DAYS_BEFORE * 24 * 60 * 60 * 1000
  )
}

/** Refresh one listing (see the module comment). */
export async function applyListingRefresh(
  db: Knex,
  listing: RefreshableListing,
  actorId: string,
  now = new Date(),
): Promise<{ renewal: boolean; reactivated: boolean }> {
  const paused = listing.status === "expired"
  const renewal = isRenewal(listing, now)
  await db("listings")
    .where({ listing_id: listing.listing_id })
    .update({
      updated_at: now,
      ...renewalColumns(db),
      ...(paused ? { status: "active" } : {}),
    })
  if (renewal) await markRenewed(db, [listing.listing_id], paused)
  auditService.log({
    entity_type: "listing",
    entity_id: listing.listing_id,
    action: "refreshed",
    actor_id: actorId,
  })
  return { renewal, reactivated: paused }
}
