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
 * services/discord/dm-reachability.ts: Discord linked, last DM not a standing
 * refusal (50007; or 50278 with no later install or shared server), shares a server with the bot or
 * installed the app). Anyone who turned Market Discord DMs off in Settings -> Notifications, or muted the
 * org they would be contacted for, is skipped (MARKET_DM_ACTIONS; owner
 * decision 2026-11-02).
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
import { DM_REFUSAL_CODES } from "../discord/dm-attempts.js"
import { discordDmReachableUsers } from "../discord/dm-reachability.js"
import { CATALOG, type EventDefinition } from "../notify/catalog.js"
import { auditService } from "../audit/audit.service.js"
import { applyListingRefresh } from "../market-v2/listing-refresh.service.js"
import {
  createCampaignActionToken,
  tokenId,
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

export const MAX_RECIPIENTS_ENV = "STILL_SELLING_MAX_RECIPIENTS"
export const DEFAULT_MAX_RECIPIENTS = 150

/**
 * Hard cap on the number of people (STILL_SELLING_MAX_RECIPIENTS, default
 * 150): when more are eligible, Send is refused even with the switch on.
 */
export function maxRecipients(e: NodeJS.ProcessEnv = process.env): number {
  const raw = e[MAX_RECIPIENTS_ENV]
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_RECIPIENTS
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_MAX_RECIPIENTS
}

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
  display_name?: string | null
  listing_ids: string[]
  /** listing id -> its updated_at (for the dry run's age buckets). */
  listing_updated?: Record<string, string | Date>
  /** The sellers ('u:<user>' / 'c:<org>') the person is contacted for. */
  seller_keys?: string[]
  newest_update: Date
  /** The shop slug of each listing (repeats: one per listing). */
  shop_slugs: string[]
}

/**
 * A listing that is live on the market right now, the only kind that can
 * make anyone eligible or count in "N listings": status 'active' (not
 * inactive, sold, expired = paused, or cancelled = archived), visibility
 * public, not a test shop's, with listed stock (a listed lot with
 * quantity_total > 0). V2 listings only; V1 market_listings and orders are
 * not read. Exported for tests.
 */
export function liveListingSql(alias: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(alias))
    throw new Error(`Invalid alias: ${alias}`)
  return `${publiclyListedSql(alias)}
        AND EXISTS (
          SELECT 1 FROM listing_items li
          JOIN listing_item_lots lil ON lil.item_id = li.item_id
          WHERE li.listing_id = ${alias}.listing_id
            AND lil.listed = true
            AND lil.quantity_total > 0
        )`
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
      WHERE ${liveListingSql("l")}
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
           a.display_name,
           array_agg(DISTINCT st.listing_id) AS listing_ids,
           jsonb_object_agg(st.listing_id::text, st.updated_at) AS listing_updated,
           array_agg(DISTINCT c.seller_key) AS seller_keys,
           MAX(st.updated_at) AS newest_update,
           -- One slug per listing (not DISTINCT): managePath links the shop
           -- with the most of them.
           array_agg(st.slug ORDER BY st.slug) AS shop_slugs
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
      -- Turned Market Discord DMs off (Settings -> Notifications), for the
      -- scope they are contacted in: the org's row for an org seller, else
      -- the Personal row (notify()'s rule, services/notify/preferences.ts).
      -- Only an explicit "off" counts; no row is not an opt-out.
      AND NOT EXISTS (
        SELECT 1 FROM notification_actions na
        WHERE na.action IN (${MARKET_DM_ACTIONS.map(() => "?").join(", ")})
          AND COALESCE(
            (SELECT o.enabled FROM notification_channel_org_preferences o
             WHERE o.user_id = c.user_id AND o.action_type_id = na.action_type_id
               AND o.channel = 'discord' AND c.seller_key = 'c:' || o.contractor_id::text
             LIMIT 1),
            (SELECT p.enabled FROM notification_channel_preferences p
             WHERE p.user_id = c.user_id AND p.action_type_id = na.action_type_id
               AND p.channel = 'discord'
             LIMIT 1),
            true
          ) = false
      )
      -- Muted the org they are contacted for (a mute silences its Discord DMs).
      AND NOT EXISTS (
        SELECT 1 FROM notification_org_mutes m
        WHERE m.user_id = c.user_id AND c.seller_key = 'c:' || m.contractor_id::text
          AND (m.muted_until IS NULL OR m.muted_until > now())
      )
    GROUP BY c.user_id, dp.provider_id, a.locale, a.display_name
    ORDER BY c.user_id
  `
  return { sql, bindings: [STALE_DAYS, INACTIVE_DAYS, campaign, ...MARKET_DM_ACTIONS] }
}

/**
 * The Market category's events with a Discord DM (catalog.ts: new bids, the
 * listing-expiry "Still selling?" notice, the wipe message). Owner decision (2026-11-02): the
 * campaign skips anyone who turned Discord DMs off for them, in the dry-run
 * count and the send (both read candidatesSql). The admin's "Send test DM to
 * me" does not read it.
 */
export const MARKET_DM_ACTIONS: readonly string[] = (Object.values(CATALOG) as EventDefinition[])
  .filter((def) => def.category === "market" && def.channels.includes("discord_dm"))
  .map((def) => def.legacyAction)

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
  maxRecipients?: () => number
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
    maxRecipients: deps.maxRecipients ?? (() => maxRecipients()),
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

/**
 * "Manage listings": the Listings page of the shop the listings are in.
 * `shopSlugs` has one entry per listing; with several shops it's the shop
 * with the most of them (ties: the first slug alphabetically). The shop
 * list only when there is no shop at all (no listings).
 */
export function managePath(shopSlugs: string[]): string {
  const counts = new Map<string, number>()
  for (const slug of shopSlugs) {
    if (slug) counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [slug, n] of counts) {
    const top = best === null ? 0 : counts.get(best)!
    if (n > top || (n === top && best !== null && slug < best)) best = slug
  }
  return best === null
    ? "/dashboard/shops"
    : `/shop/${encodeURIComponent(best)}/listings`
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
           COUNT(*) FILTER (WHERE status = 'failed' AND error_code = ANY(?::int[]))::integer AS failed_closed,
           COUNT(*) FILTER (WHERE status = 'sending')::integer AS in_flight,
           COUNT(*) FILTER (WHERE kept_at IS NOT NULL)::integer AS clicked_keep,
           COUNT(*) FILTER (WHERE paused_at IS NOT NULL)::integer AS clicked_pause,
           COALESCE(SUM(kept_count), 0)::integer AS kept_listings,
           COALESCE(SUM(paused_count), 0)::integer AS paused_listings
    FROM dm_campaign_recipients
    WHERE campaign = ?
    `,
    [[...DM_REFUSAL_CODES], campaign],
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
      reason:
        | "disabled"
        | "running"
        | "count_changed"
        | "nothing_to_send"
        | "over_cap"
      cap?: number
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
  const cap = d.maxRecipients()
  if (recipients > cap)
    return { ok: false, reason: "over_cap", recipients, cap }
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

export interface DryRunSummary {
  recipients: number
  /** Distinct sellers (users, orgs) behind them. */
  sellers: number
  listings: number
  /** Their listings by days since last update: 30-60, 60-90, 90+. */
  listing_age: { days_30_60: number; days_60_90: number; days_90_plus: number }
  cap: number
  over_cap: boolean
  /** The 10 people with the most listings: display name and count only. */
  top: { display_name: string; listings: number }[]
}

/** The dry run's numbers from the eligible recipients (pure; exported for tests). */
export function summarize(
  people: Candidate[],
  cap: number,
  now = new Date(),
): DryRunSummary {
  const updated = new Map<string, number>()
  for (const p of people) {
    for (const id of p.listing_ids) {
      const at = p.listing_updated?.[id]
      updated.set(
        id,
        at ? new Date(at).getTime() : new Date(p.newest_update).getTime(),
      )
    }
  }
  const age = { days_30_60: 0, days_60_90: 0, days_90_plus: 0 }
  for (const t of updated.values()) {
    const days = (now.getTime() - t) / 86_400_000
    if (days >= 90) age.days_90_plus++
    else if (days >= 60) age.days_60_90++
    else age.days_30_60++
  }
  const sellers = new Set(people.flatMap((p) => p.seller_keys ?? []))
  const top = [...people]
    .sort(
      (a, b) =>
        b.listing_ids.length - a.listing_ids.length ||
        a.user_id.localeCompare(b.user_id),
    )
    .slice(0, 10)
    .map((p) => ({
      display_name: p.display_name || "(no display name)",
      listings: p.listing_ids.length,
    }))
  return {
    recipients: people.length,
    sellers: sellers.size,
    listings: updated.size,
    listing_age: age,
    cap,
    over_cap: people.length > cap,
    top,
  }
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
      /** A test link: nothing is changed, feedback is stored as a test. */
      test: boolean
      /** Listings the action would change now. */
      applicable: ActionListing[]
      /** Listings of the DM (that the user may still manage). */
      total: number
      managePath: string
      keptAt: Date | null
      pausedAt: Date | null
      /** Feedback was already submitted from this link. */
      feedbackSubmitted: boolean
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

type SlugListing = ActionListing & { slug: string }

/** Sample listings a test link shows (it never reads or changes real ones). */
function sampleListings(now: Date): SlugListing[] {
  const old = new Date(now.getTime() - 61 * 86_400_000)
  return [1, 2, 3].map((i) => ({
    listing_id: `sample-${i}`,
    shop_id: "sample",
    title: `Example listing ${i}`,
    status: "active",
    updated_at: old,
    expires_at: null,
    slug: "",
  }))
}

async function feedbackSubmitted(db: Knex, token: string): Promise<boolean> {
  const row = await db("dm_campaign_feedback")
    .where({ token_id: tokenId(token) })
    .first("feedback_id")
  return !!row
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
  const { campaign, userId, action, expiresAt, test } = verified.claim
  if (test) {
    // A test link never reads or writes dm_campaign_recipients, and never
    // changes a listing: it shows sample listings. It only reads which shops
    // the user sells in, so "Manage listings" opens the same shop as the
    // test DM's button (sendTestDm).
    const listings = sampleListings(now)
    const real = await testListingsFor(d.db, userId, now)
    return {
      ok: true,
      action,
      userId,
      campaign,
      expiresAt,
      test: true,
      applicable: listings.filter((l) => applies(action, l, now)),
      total: listings.length,
      managePath: managePath(real.map((l) => l.slug)),
      keptAt: null,
      pausedAt: null,
      feedbackSubmitted: await feedbackSubmitted(d.db, token),
    }
  }
  const row = await d
    .db("dm_campaign_recipients")
    .where({ campaign, user_id: userId })
    .first("listing_ids", "kept_at", "paused_at")
  if (!row) return { ok: false, reason: "invalid" }
  const ids: string[] = row.listing_ids ?? []
  const listings: SlugListing[] = ids.length
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
  const mine: SlugListing[] = []
  for (const l of listings) {
    if (await d.canModify(l, userId)) mine.push(l)
  }
  return {
    ok: true,
    action,
    userId,
    campaign,
    expiresAt,
    test: false,
    applicable: mine.filter((l) => applies(action, l, now)),
    total: mine.length,
    managePath: managePath(mine.map((l) => l.slug)),
    keptAt: row.kept_at ? new Date(row.kept_at) : null,
    pausedAt: row.paused_at ? new Date(row.paused_at) : null,
    feedbackSubmitted: await feedbackSubmitted(d.db, token),
  }
}

export type ApplyResult =
  | { ok: false; reason: "invalid" | "expired" }
  | {
      ok: true
      action: CampaignAction
      /** Listings changed now; for a test link, how many would have been (none were). */
      changed: number
      total: number
      managePath: string
      test: boolean
    }

/** Apply a token's action (the page's confirm button). A test link changes nothing. */
export async function applyAction(
  token: string,
  deps: CampaignDeps = {},
): Promise<ApplyResult> {
  const d = resolve(deps)
  const found = await lookupAction(token, deps)
  if (!found.ok) return found
  if (found.test) {
    return {
      ok: true,
      action: found.action,
      changed: found.applicable.length,
      total: found.total,
      managePath: found.managePath,
      test: true,
    }
  }
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
    test: false,
  }
}

// ---------------------------------------------------------------------------
// "Send test DM to me" (Admin › Market; owner-approved 2026-11-02): the real
// campaign DM, to the requesting admin only. Separate from the campaign send
// path (startCampaign / runCampaign), which keeps its kill switch, cap and
// recipient rows unchanged.

/** discord_dm_attempts source of test DMs. */
export const TEST_SOURCE = "campaign:still-selling:test"
/** At most this many test DMs per admin per hour. */
export const TEST_DMS_PER_HOUR = 5

type TestListing = {
  listing_id: string
  updated_at: Date | string
  slug: string
}

/**
 * The live listings the user sells (their own shops, and org shops where
 * they hold manage_market or manage_orders): the stale ones if any, else all.
 * Read only, for the test DM's numbers. Exported for tests.
 */
export async function testListingsFor(
  db: Knex,
  userId: string,
  now = new Date(),
): Promise<TestListing[]> {
  const result = await db.raw(
    `
    SELECT l.listing_id, l.updated_at, s.slug
    FROM listings l
    JOIN shops s ON s.shop_id = l.shop_id
    WHERE ${liveListingSql("l")}
      AND s.status = 'active'
      AND (
        s.owner_user_id = ?
        OR EXISTS (
          SELECT 1 FROM contractor_roles cr
          JOIN contractor_member_roles cmr ON cmr.role_id = cr.role_id
          JOIN contractor_members cm
            ON cm.contractor_id = cr.contractor_id AND cm.user_id = cmr.user_id
          WHERE cr.contractor_id = s.owner_contractor_id
            AND cmr.user_id = ?
            AND (cr.manage_orders = true OR cr.manage_market = true)
        )
      )
    LIMIT 500
    `,
    [userId, userId],
  )
  const rows = (result?.rows ?? []) as TestListing[]
  const cutoff = now.getTime() - STALE_DAYS * 86_400_000
  const stale = rows.filter((r) => new Date(r.updated_at).getTime() < cutoff)
  return stale.length ? stale : rows
}

export type TestSendResult =
  | {
      ok: true
      /** The admin sells nothing live: sample numbers were used. */
      sample: boolean
      message: RenderedMessage
    }
  | {
      ok: false
      reason: "no_discord" | "rate_limited" | "failed"
      error?: string
    }

/**
 * Send the campaign DM to `userId`, the requesting admin, and no one else:
 * the same rendering, language and buttons, with test links (they change
 * nothing) and a "Test message" footer. Works with the kill switch off
 * because its only possible recipient is the caller. Never reads or writes
 * dm_campaign_recipients.
 */
export async function sendTestDm(
  userId: string,
  opts: { locale?: string | null } = {},
  deps: CampaignDeps = {},
  campaign = CAMPAIGN,
): Promise<TestSendResult> {
  const d = resolve(deps)
  const now = d.now()
  const recent = await d
    .db("discord_dm_attempts")
    .where({ user_id: userId, source: TEST_SOURCE })
    .where("created_at", ">", d.db.raw("now() - INTERVAL '1 hour'"))
    .count({ n: "*" })
  if (
    Number((recent?.[0] as { n?: unknown } | undefined)?.n ?? 0) >=
    TEST_DMS_PER_HOUR
  ) {
    return { ok: false, reason: "rate_limited" }
  }
  const account = await d
    .db("accounts as a")
    .leftJoin("account_providers as p", function () {
      this.on("p.user_id", "=", "a.user_id").andOnVal(
        "p.provider_type",
        "=",
        "discord",
      )
    })
    .where("a.user_id", userId)
    .first("a.locale", "p.provider_id")
  if (!account?.provider_id) return { ok: false, reason: "no_discord" }
  const real = await testListingsFor(d.db, userId, now)
  const sample = !real.length
  const token = (action: CampaignAction) =>
    createCampaignActionToken({ campaign, userId, action, test: true }, { now })
  const newest = real.reduce(
    (m, l) => Math.max(m, new Date(l.updated_at).getTime()),
    0,
  )
  const rendered = renderStillSelling({
    locale: campaignLocale(opts.locale || account.locale),
    listings: sample ? 3 : real.length,
    months: sample ? 2 : monthsSince(new Date(newest), now),
    keepUrl: actionPageUrl(token("keep")),
    pauseUrl: actionPageUrl(token("pause")),
    manageUrl: `${frontendUrl()}${managePath(real.map((l) => l.slug))}`,
  })
  const message: RenderedMessage = {
    ...rendered,
    text:
      `${rendered.text}\n-# Test message: only you got this, and its buttons change nothing.` +
      (sample ? " You have no live listings, so the numbers are made up." : ""),
  }
  let result: Awaited<ReturnType<ReturnType<typeof resolve>["send"]>>
  try {
    result = await d.send(
      String(account.provider_id),
      toDiscordMessage(message),
      {
        userId,
        source: TEST_SOURCE,
      },
    )
  } catch (error) {
    result = {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
  if (!result.ok) return { ok: false, reason: "failed", error: result.error }
  return { ok: true, sample, message }
}
