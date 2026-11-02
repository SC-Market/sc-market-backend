/**
 * "Still selling?" — a one-time Discord DM campaign to inactive sellers with
 * stale listings (owner-approved 2026-11-02). Sent by staff from Admin ›
 * Market, never by a timer.
 *
 * Who: everyone who sells through a shop with publicly listed listings
 * (active, public, not a test shop) that weren't updated in STALE_DAYS, when
 * the seller was last seen more than INACTIVE_DAYS ago. A personal shop's
 * seller is its owner. An org's shops are one seller, contacted through its
 * members holding a role with manage_market or manage_orders; the org counts
 * as last seen when the most recent of them was (an org with any such member
 * active recently is not contacted). Each person gets at most one DM, about
 * all the stale listings of every inactive seller they speak for. Test
 * accounts, deleted, tombstoned and banned accounts are excluded, and only
 * users the bot can reach by Discord DM are kept (discordDmReachableUsers,
 * services/discord/dm-reachability.ts: Discord linked, last DM not refused
 * with 50007, shares a server with the bot or installed the app).
 *
 * What: one DM in the user's language (still-selling-message.ts) with three
 * link buttons. "Keep them live" and "Pause them" open /still-selling/<token>
 * on the site: a signed link for that user and that one action, valid
 * TOKEN_TTL_DAYS (campaign-action-token.ts). The page asks to confirm, then
 * - keep: refreshes each listing as POST /listings/{id}/refresh does
 *   (applyListingRefresh: ranks as fresh again; a paused one is reactivated),
 *   skipping any refreshed in the last KEEP_COOLDOWN_HOURS;
 * - pause: sets the active ones to 'expired' ("Paused" on the site: hidden
 *   from the market, kept for the seller, relisted with one renew).
 * Only listings recorded for the user when the DM was sent, and only those
 * the user may still manage. No reply changes nothing.
 *
 * Safety:
 * - Kill switch KILL_SWITCH_ENV (STILL_SELLING_CAMPAIGN_ENABLED=true): off
 *   by default. Off, nothing is sent; checked before every batch and every DM.
 * - One DM per person per campaign, ever: dm_campaign_recipients' primary
 *   key (campaign, user_id). The row is claimed before the DM goes out and
 *   is never retried, whatever happened.
 * - Throttled: BATCH_SIZE DMs (DM_SPACING_MS apart), then BATCH_PAUSE_MS.
 * - A run sends to at most the count the admin confirmed.
 * - Each DM goes through discordService.trySendDirectMessage, so it is
 *   recorded in discord_dm_attempts (source "campaign:<campaign>").
 */
import type { Knex } from "knex"
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10"
import { getKnex } from "../../clients/database/knex-db.js"
import { env } from "../../config/env.js"
import logger from "../../logger/logger.js"
import { publiclyListedSql } from "../../api/routes/v2/util/listing-visibility.js"
import { canModifyListing } from "../../api/routes/v2/util/listing-permissions.js"
import { discordService } from "../discord/discord.service.js"
import { DM_CLOSED_CODE } from "../discord/dm-attempts.js"
import { discordDmReachableUsers } from "../discord/dm-reachability.js"
import { auditService } from "../audit/audit.service.js"
import { applyListingRefresh } from "../market-v2/listing-refresh.service.js"
import {
  createCampaignActionToken,
  verifyCampaignActionToken,
  type CampaignAction,
} from "./campaign-action-token.js"
import {
  campaignLocale,
  monthsSince,
  renderStillSelling,
  toDiscordMessage,
  type CampaignLocale,
  type RenderedMessage,
} from "./still-selling-message.js"

export const CAMPAIGN = "still_selling_2026_11"
export const KILL_SWITCH_ENV = "STILL_SELLING_CAMPAIGN_ENABLED"
/** A listing is stale when not updated in this many days. */
export const STALE_DAYS = 30
/** A seller is inactive when last seen more than this many days ago. */
export const INACTIVE_DAYS = 30
export const BATCH_SIZE = 10
export const BATCH_PAUSE_MS = 60_000
export const DM_SPACING_MS = 1_000
/** "Keep them live" skips listings refreshed this recently (the refresh cooldown). */
export const KEEP_COOLDOWN_HOURS = 24
/** At most this many listing titles on the landing page. */
export const MAX_LISTED = 20

/** Read on every check: STILL_SELLING_CAMPAIGN_ENABLED=true turns sending on. */
export function campaignEnabled(e: NodeJS.ProcessEnv = process.env): boolean {
  return e[KILL_SWITCH_ENV] === "true"
}

export type ReachableUsersFn = (
  userIds: string[],
  db: Knex,
) => Promise<Set<string>>

export interface Candidate {
  user_id: string
  discord_id: string
  locale: string | null
  listing_ids: string[]
  newest_update: Date
  shop_slugs: string[]
}

/**
 * Everyone the campaign would DM now, before the Discord reachability check
 * (see the module comment), minus anyone already claimed for `campaign`.
 * Exported for tests.
 */
export function candidatesSql(campaign = CAMPAIGN): {
  sql: string
  bindings: Knex.RawBinding[]
} {
  const sql = `
    WITH stale AS (
      SELECT DISTINCT l.listing_id, l.updated_at, s.slug,
             CASE WHEN s.owner_user_id IS NOT NULL THEN 'u:' || s.owner_user_id::text
                  ELSE 'c:' || s.owner_contractor_id::text END AS seller_key,
             s.owner_user_id, s.owner_contractor_id
      FROM listings l
      JOIN shops s ON s.shop_id = l.shop_id
      WHERE ${publiclyListedSql("l")}
        AND s.status = 'active'
        AND (s.owner_user_id IS NOT NULL OR s.owner_contractor_id IS NOT NULL)
        AND l.updated_at < now() - make_interval(days => ?)
        AND NOT EXISTS (
          SELECT 1 FROM contractors c WHERE c.contractor_id = s.owner_contractor_id AND c.is_test
        )
    ),
    sellers AS (
      SELECT DISTINCT seller_key, owner_user_id, owner_contractor_id FROM stale
    ),
    contacts AS (
      SELECT seller_key, owner_user_id AS user_id
      FROM sellers
      WHERE owner_user_id IS NOT NULL
      UNION
      SELECT se.seller_key, cmr.user_id
      FROM sellers se
      JOIN contractor_roles cr
        ON cr.contractor_id = se.owner_contractor_id
       AND (cr.manage_orders = true OR cr.manage_market = true)
      JOIN contractor_member_roles cmr ON cmr.role_id = cr.role_id
      JOIN contractor_members cm
        ON cm.contractor_id = se.owner_contractor_id AND cm.user_id = cmr.user_id
      WHERE se.owner_user_id IS NULL
    ),
    inactive_sellers AS (
      SELECT c.seller_key
      FROM contacts c
      JOIN accounts a ON a.user_id = c.user_id
      GROUP BY c.seller_key
      HAVING MAX(a.last_seen) < now() - make_interval(days => ?)
    )
    SELECT c.user_id,
           dp.provider_id AS discord_id,
           a.locale,
           array_agg(DISTINCT st.listing_id) AS listing_ids,
           MAX(st.updated_at) AS newest_update,
           array_agg(DISTINCT st.slug) AS shop_slugs
    FROM contacts c
    JOIN inactive_sellers i ON i.seller_key = c.seller_key
    JOIN stale st ON st.seller_key = c.seller_key
    JOIN accounts a ON a.user_id = c.user_id
    JOIN LATERAL (
      SELECT p.provider_id FROM account_providers p
      WHERE p.user_id = c.user_id AND p.provider_type = 'discord'
      ORDER BY p.provider_id
      LIMIT 1
    ) dp ON true
    WHERE a.is_test IS NOT TRUE
      AND a.deleted_at IS NULL
      AND a.is_tombstone = false
      AND a.banned IS NOT TRUE
      AND NOT EXISTS (
        SELECT 1 FROM dm_campaign_recipients r
        WHERE r.campaign = ? AND r.user_id = c.user_id
      )
    GROUP BY c.user_id, dp.provider_id, a.locale
    ORDER BY c.user_id
  `
  return { sql, bindings: [STALE_DAYS, INACTIVE_DAYS, campaign] }
}

export interface CampaignDeps {
  db?: Knex
  reachable?: ReachableUsersFn
  send?: (
    discordId: string,
    message: RESTPostAPIChannelMessageJSONBody,
    attempt: { userId: string; source: string },
  ) => Promise<
    { ok: true } | { ok: false; error: string; code?: number; status?: number }
  >
  sleep?: (ms: number) => Promise<void>
  now?: () => Date
  enabled?: () => boolean
  canModify?: (listing: { shop_id: string }, userId: string) => Promise<boolean>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

function resolve(deps: CampaignDeps) {
  return {
    db: deps.db ?? getKnex(),
    reachable:
      deps.reachable ??
      ((ids: string[], db: Knex) => discordDmReachableUsers(ids, db)),
    send:
      deps.send ??
      ((
        discordId: string,
        message: RESTPostAPIChannelMessageJSONBody,
        attempt: { userId: string; source: string },
      ) => discordService.trySendDirectMessage(discordId, message, attempt)),
    sleep: deps.sleep ?? defaultSleep,
    now: deps.now ?? (() => new Date()),
    enabled: deps.enabled ?? (() => campaignEnabled()),
    canModify: deps.canModify ?? canModifyListing,
  }
}

/** Who the campaign would DM now (not yet contacted, DM-reachable). */
export async function eligibleRecipients(
  deps: CampaignDeps = {},
  campaign = CAMPAIGN,
): Promise<Candidate[]> {
  const d = resolve(deps)
  const { sql, bindings } = candidatesSql(campaign)
  const result = await d.db.raw(sql, bindings)
  const rows = ((result?.rows ?? []) as Candidate[]).filter(
    (r) => r.discord_id && r.listing_ids?.length,
  )
  if (!rows.length) return []
  const reachable = await d.reachable(
    rows.map((r) => r.user_id),
    d.db,
  )
  return rows.filter((r) => reachable.has(r.user_id))
}

function frontendUrl(): string {
  return (env.FRONTEND_URL || env.CDN_URL || "https://sc-market.space").replace(
    /\/+$/,
    "",
  )
}

/** The landing page of a button: confirms, then applies the action. */
export function actionPageUrl(token: string): string {
  return `${frontendUrl()}/still-selling/${token}`
}

/** "Manage listings": the shop's listings page when there is one shop, else the shop list. */
export function managePath(shopSlugs: string[]): string {
  const slugs = [...new Set(shopSlugs.filter(Boolean))]
  return slugs.length === 1
    ? `/shop/${encodeURIComponent(slugs[0])}/listings`
    : "/dashboard/shops"
}

/** The rendered DM for one recipient, with their signed links. */
export function messageFor(
  c: Pick<
    Candidate,
    "user_id" | "locale" | "listing_ids" | "newest_update" | "shop_slugs"
  >,
  now = new Date(),
  campaign = CAMPAIGN,
): RenderedMessage {
  const token = (action: CampaignAction) =>
    createCampaignActionToken({ campaign, userId: c.user_id, action }, { now })
  return renderStillSelling({
    locale: campaignLocale(c.locale),
    listings: c.listing_ids.length,
    months: monthsSince(c.newest_update, now),
    keepUrl: actionPageUrl(token("keep")),
    pauseUrl: actionPageUrl(token("pause")),
    manageUrl: `${frontendUrl()}${managePath(c.shop_slugs)}`,
  })
}

/** The dry run's sample: fake numbers and placeholder links, nothing signed. */
export function sampleMessage(locale: CampaignLocale = "en"): RenderedMessage {
  return renderStillSelling({
    locale,
    listings: 3,
    months: 2,
    keepUrl: `${frontendUrl()}/still-selling/<keep-link>`,
    pauseUrl: `${frontendUrl()}/still-selling/<pause-link>`,
    manageUrl: `${frontendUrl()}/shop/example-shop/listings`,
  })
}

export interface CampaignProgress {
  sent: number
  delivered: number
  failed: number
  failed_closed: number
  in_flight: number
  clicked_keep: number
  clicked_pause: number
  kept_listings: number
  paused_listings: number
}

export async function campaignProgress(
  db: Knex = getKnex(),
  campaign = CAMPAIGN,
): Promise<CampaignProgress> {
  const result = await db.raw(
    `
    SELECT COUNT(*)::integer AS sent,
           COUNT(*) FILTER (WHERE status = 'delivered')::integer AS delivered,
           COUNT(*) FILTER (WHERE status = 'failed')::integer AS failed,
           COUNT(*) FILTER (WHERE status = 'failed' AND error_code = ?)::integer AS failed_closed,
           COUNT(*) FILTER (WHERE status = 'sending')::integer AS in_flight,
           COUNT(*) FILTER (WHERE kept_at IS NOT NULL)::integer AS clicked_keep,
           COUNT(*) FILTER (WHERE paused_at IS NOT NULL)::integer AS clicked_pause,
           COALESCE(SUM(kept_count), 0)::integer AS kept_listings,
           COALESCE(SUM(paused_count), 0)::integer AS paused_listings
    FROM dm_campaign_recipients
    WHERE campaign = ?
    `,
    [DM_CLOSED_CODE, campaign],
  )
  const row = (result?.rows?.[0] ?? {}) as Record<string, unknown>
  const n = (k: string) => Number(row[k]) || 0
  return {
    sent: n("sent"),
    delivered: n("delivered"),
    failed: n("failed"),
    failed_closed: n("failed_closed"),
    in_flight: n("in_flight"),
    clicked_keep: n("clicked_keep"),
    clicked_pause: n("clicked_pause"),
    kept_listings: n("kept_listings"),
    paused_listings: n("paused_listings"),
  }
}

/** In-process run state (one run at a time). */
export interface RunState {
  running: boolean
  started_at: string | null
  finished_at: string | null
  /** Why the last run ended: done, limit, disabled, stopped, error. */
  finish_reason: string | null
  /** The most this run may send (the count the admin confirmed). */
  limit: number | null
  sent_this_run: number
}

const state: RunState & { stopRequested: boolean } = {
  running: false,
  started_at: null,
  finished_at: null,
  finish_reason: null,
  limit: null,
  sent_this_run: 0,
  stopRequested: false,
}

export function runState(): RunState {
  const { stopRequested: _s, ...rest } = state
  void _s
  return { ...rest }
}

/** For tests. */
export function resetRunStateForTests(): void {
  Object.assign(state, {
    running: false,
    started_at: null,
    finished_at: null,
    finish_reason: null,
    limit: null,
    sent_this_run: 0,
    stopRequested: false,
  })
}

/**
 * DM one recipient: claim the row (one DM per person per campaign, ever),
 * then send. "skipped" when the row was already claimed (by this or another run).
 */
export async function sendOne(
  c: Candidate,
  deps: CampaignDeps = {},
  campaign = CAMPAIGN,
): Promise<"delivered" | "failed" | "skipped"> {
  const d = resolve(deps)
  const claimed = await d.db.raw(
    `
    INSERT INTO dm_campaign_recipients (campaign, user_id, listing_ids, locale, status)
    VALUES (?, ?, ?::uuid[], ?, 'sending')
    ON CONFLICT (campaign, user_id) DO NOTHING
    RETURNING user_id
    `,
    [campaign, c.user_id, c.listing_ids, campaignLocale(c.locale)],
  )
  if (!claimed?.rows?.length) return "skipped"
  const now = d.now()
  let result: Awaited<ReturnType<ReturnType<typeof resolve>["send"]>>
  try {
    result = await d.send(
      c.discord_id,
      toDiscordMessage(messageFor(c, now, campaign)),
      {
        userId: c.user_id,
        source: `campaign:${campaign}`,
      },
    )
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  await d
    .db("dm_campaign_recipients")
    .where({ campaign, user_id: c.user_id })
    .update(
      result.ok
        ? { status: "delivered", sent_at: now }
        : {
            status: "failed",
            sent_at: now,
            error_code: Number.isInteger(result.code) ? result.code : null,
            http_status: Number.isInteger(result.status) ? result.status : null,
          },
    )
  return result.ok ? "delivered" : "failed"
}

/**
 * The send loop: batches of BATCH_SIZE, recomputed each time (anyone who
 * became active or unreachable meanwhile drops out), until no one is left,
 * `limit` DMs went out, the kill switch is off or a stop was requested.
 */
export async function runCampaign(
  limit: number,
  deps: CampaignDeps = {},
  campaign = CAMPAIGN,
): Promise<RunState> {
  const d = resolve(deps)
  let reason = "done"
  try {
    for (;;) {
      if (!d.enabled()) {
        reason = "disabled"
        break
      }
      if (state.stopRequested) {
        reason = "stopped"
        break
      }
      const remaining = limit - state.sent_this_run
      if (remaining <= 0) {
        reason = "limit"
        break
      }
      const batch = (await eligibleRecipients(deps, campaign)).slice(
        0,
        Math.min(BATCH_SIZE, remaining),
      )
      if (!batch.length) break
      for (const [i, c] of batch.entries()) {
        // Re-checked before every DM: turning the switch off stops at once.
        if (!d.enabled()) {
          reason = "disabled"
          break
        }
        if (state.stopRequested) {
          reason = "stopped"
          break
        }
        const outcome = await sendOne(c, deps, campaign)
        if (outcome !== "skipped") state.sent_this_run++
        if (i < batch.length - 1) await d.sleep(DM_SPACING_MS)
      }
      if (reason !== "done") break
      if (state.sent_this_run >= limit) {
        reason = "limit"
        break
      }
      await d.sleep(BATCH_PAUSE_MS)
    }
  } catch (error) {
    reason = "error"
    logger.error("still selling campaign: run failed", {
      error: error instanceof Error ? error.message : String(error),
    })
  }
  state.running = false
  state.stopRequested = false
  state.finished_at = d.now().toISOString()
  state.finish_reason = reason
  logger.info("still selling campaign: run ended", {
    reason,
    sent_this_run: state.sent_this_run,
    campaign,
  })
  return runState()
}

export type StartResult =
  | { ok: true; state: RunState }
  | {
      ok: false
      reason: "disabled" | "running" | "count_changed" | "nothing_to_send"
      recipients?: number
    }

/**
 * Start a run in the background, capped at the count the admin confirmed.
 * Refused when the kill switch is off, a run is going, or more people are
 * eligible now than the admin saw.
 */
export async function startCampaign(
  expectedRecipients: number,
  deps: CampaignDeps = {},
  campaign = CAMPAIGN,
): Promise<StartResult> {
  const d = resolve(deps)
  if (!d.enabled()) return { ok: false, reason: "disabled" }
  if (state.running) return { ok: false, reason: "running" }
  const recipients = (await eligibleRecipients(deps, campaign)).length
  if (recipients === 0)
    return { ok: false, reason: "nothing_to_send", recipients }
  if (recipients > expectedRecipients)
    return { ok: false, reason: "count_changed", recipients }
  if (state.running) return { ok: false, reason: "running" }
  Object.assign(state, {
    running: true,
    started_at: d.now().toISOString(),
    finished_at: null,
    finish_reason: null,
    limit: expectedRecipients,
    sent_this_run: 0,
    stopRequested: false,
  })
  void runCampaign(expectedRecipients, deps, campaign)
  return { ok: true, state: runState() }
}

/** Ask the running send to stop after the DM in flight. */
export function requestStop(): RunState {
  if (state.running) state.stopRequested = true
  return runState()
}

// ---------------------------------------------------------------------------
// The landing page (/still-selling/<token>): preview, then apply.

export interface ActionListing {
  listing_id: string
  shop_id: string
  title: string
  status: string
  updated_at: Date | string
  expires_at?: Date | string | null
}

export type ActionLookup =
  | { ok: false; reason: "invalid" | "expired" }
  | {
      ok: true
      action: CampaignAction
      userId: string
      campaign: string
      expiresAt: Date
      /** Listings the action would change now. */
      applicable: ActionListing[]
      /** Listings of the DM (that the user may still manage). */
      total: number
      managePath: string
      keptAt: Date | null
      pausedAt: Date | null
    }

function applies(action: CampaignAction, l: ActionListing, now: Date): boolean {
  if (action === "pause") return l.status === "active"
  if (l.status === "expired") return true
  return (
    l.status === "active" &&
    new Date(l.updated_at).getTime() <
      now.getTime() - KEEP_COOLDOWN_HOURS * 3600_000
  )
}

/** What a token's action would do now (the confirmation page). */
export async function lookupAction(
  token: string,
  deps: CampaignDeps = {},
): Promise<ActionLookup> {
  const d = resolve(deps)
  const now = d.now()
  const verified = verifyCampaignActionToken(token, { now })
  if (!verified.ok) return verified
  const { campaign, userId, action, expiresAt } = verified.claim
  const row = await d
    .db("dm_campaign_recipients")
    .where({ campaign, user_id: userId })
    .first("listing_ids", "kept_at", "paused_at")
  if (!row) return { ok: false, reason: "invalid" }
  const ids: string[] = row.listing_ids ?? []
  const listings: (ActionListing & { slug: string })[] = ids.length
    ? await d
        .db("listings as l")
        .join("shops as s", "s.shop_id", "l.shop_id")
        .whereIn("l.listing_id", ids)
        .orderBy("l.title", "asc")
        .select(
          "l.listing_id",
          "l.shop_id",
          "l.title",
          "l.status",
          "l.updated_at",
          "l.expires_at",
          "s.slug",
        )
    : []
  const mine: (ActionListing & { slug: string })[] = []
  for (const l of listings) {
    if (await d.canModify(l, userId)) mine.push(l)
  }
  return {
    ok: true,
    action,
    userId,
    campaign,
    expiresAt,
    applicable: mine.filter((l) => applies(action, l, now)),
    total: mine.length,
    managePath: managePath(mine.map((l) => l.slug)),
    keptAt: row.kept_at ? new Date(row.kept_at) : null,
    pausedAt: row.paused_at ? new Date(row.paused_at) : null,
  }
}

export type ApplyResult =
  | { ok: false; reason: "invalid" | "expired" }
  | {
      ok: true
      action: CampaignAction
      changed: number
      total: number
      managePath: string
    }

/** Apply a token's action (the page's confirm button). */
export async function applyAction(
  token: string,
  deps: CampaignDeps = {},
): Promise<ApplyResult> {
  const d = resolve(deps)
  const found = await lookupAction(token, deps)
  if (!found.ok) return found
  const now = d.now()
  let changed = 0
  if (found.action === "keep") {
    for (const l of found.applicable) {
      await applyListingRefresh(d.db, l, found.userId, now)
      changed++
    }
  } else if (found.applicable.length) {
    const ids = found.applicable.map((l) => l.listing_id)
    changed = await d
      .db("listings")
      .whereIn("listing_id", ids)
      .where("status", "active")
      .update({ status: "expired" })
    void auditService.logBatch(
      ids.map((id) => ({
        entity_type: "listing" as const,
        entity_id: id,
        action: "paused",
        actor_id: found.userId,
        details: { via: `campaign:${found.campaign}` },
      })),
    )
  }
  const at = found.action === "keep" ? "kept_at" : "paused_at"
  const count = found.action === "keep" ? "kept_count" : "paused_count"
  await d
    .db("dm_campaign_recipients")
    .where({ campaign: found.campaign, user_id: found.userId })
    .update({
      [at]: d.db.raw(`COALESCE(${at}, ?)`, [now]),
      [count]: d.db.raw(`COALESCE(${count}, 0) + ?`, [changed]),
    })
  logger.info("still selling campaign: action", {
    action: found.action,
    changed,
    total: found.total,
  })
  return {
    ok: true,
    action: found.action,
    changed,
    total: found.total,
    managePath: found.managePath,
  }
}
