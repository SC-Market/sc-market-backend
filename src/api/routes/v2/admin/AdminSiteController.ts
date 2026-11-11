/**
 * Site-wide admin reads and tools: activity, users, membership and offer
 * analytics, audit logs, and the notification test. Moved from v1
 * /api/admin (same queries and validation). Site admins only (tsoa-auth admin
 * gate + requireAdmin); rate limits are registered in api-router.ts.
 */
import { Body, Get, Post, Query, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import * as adminDb from "../../v1/admin/database.js"
import * as profileDb from "../../v1/profiles/database.js"
import * as contractorDb from "../../v1/contractors/database.js"
import type { MinimalUser } from "../../../../clients/database/db-models.js"
import type { SiteRole } from "../../../util/site-role.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import logger from "../../../../logger/logger.js"
import {
  sendAdminTestNotification,
  TestNotificationSampleMissingError,
} from "../../../../services/admin/test-notification.service.js"
import type {
  AdminActivityPoint,
  AdminActivityResponse,
  AdminAuditLogContractor,
  AdminAuditLogsResponse,
  AdminTestNotificationRequest,
  AdminTestNotificationResponse,
  AdminUser,
  AdminUserSortField,
  AdminUsersResponse,
  MembershipAnalyticsPoint,
  MembershipAnalyticsResponse,
  OfferAnalyticsResponse,
} from "./admin-site.types.js"

const USER_SORT_FIELDS: readonly AdminUserSortField[] = [
  "created_at",
  "username",
  "display_name",
  "role",
  "banned",
  "rsi_confirmed",
  "balance",
  "locale",
]

/** The account columns Admin › Users shows (never the OAuth tokens). */
const ADMIN_USER_COLUMNS = [
  "user_id",
  "username",
  "display_name",
  "discord_id",
  "profile_description",
  "role",
  "banned",
  "avatar",
  "banner",
  "balance",
  "created_at",
  "locale",
  "rsi_confirmed",
  "market_order_template",
] as const

function isoDate(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function clampPage(raw: number | undefined): number {
  return Math.max(1, Math.floor(Number(raw)) || 1)
}

function clampPageSize(raw: number | undefined): number {
  return Math.min(100, Math.max(1, Math.floor(Number(raw)) || 20))
}

interface ActivityRow {
  date: Date
  count: string | number
}

function activityPoints(rows: ActivityRow[]): AdminActivityPoint[] {
  return rows.map((r) => ({ date: isoDate(r.date), count: Number(r.count) }))
}

interface MembershipRow {
  date: Date
  new_members: string
  new_members_rsi_verified: string
  new_members_rsi_unverified: string
  cumulative_members: string
  cumulative_members_rsi_verified: string
  cumulative_members_rsi_unverified: string
}

function membershipPoints(rows: MembershipRow[]): MembershipAnalyticsPoint[] {
  return rows.map((r) => ({
    date: isoDate(r.date),
    new_members: Number(r.new_members),
    new_members_rsi_verified: Number(r.new_members_rsi_verified),
    new_members_rsi_unverified: Number(r.new_members_rsi_unverified),
    cumulative_members: Number(r.cumulative_members),
    cumulative_members_rsi_verified: Number(r.cumulative_members_rsi_verified),
    cumulative_members_rsi_unverified: Number(
      r.cumulative_members_rsi_unverified,
    ),
  }))
}

interface AuditLogRow {
  audit_log_id: string
  action: string
  actor_id: string | null
  subject_type: string
  subject_id: string
  metadata: Record<string, unknown>
  created_at: Date
}

function metadataContractorId(log: AuditLogRow): string | null {
  const id = log.metadata?.contractor_id
  return typeof id === "string" ? id : null
}

@Route("admin")
@Tags("Admin")
export class AdminSiteController extends BaseController {
  /**
   * Distinct active users per day, week and month.
   * @summary Site activity
   */
  @Get("activity")
  @Security("loggedin")
  public async getAdminActivity(
    @Request() request: ExpressRequest,
  ): Promise<AdminActivityResponse> {
    this.request = request
    this.requireAdmin()
    const [daily, weekly, monthly] = await Promise.all([
      adminDb.getDailyActivity(),
      adminDb.getWeeklyActivity(),
      adminDb.getMonthlyActivity(),
    ])
    return {
      daily: activityPoints(daily),
      weekly: activityPoints(weekly),
      monthly: activityPoints(monthly),
    }
  }

  /**
   * Every account, paged, filtered and sorted.
   * @summary List users
   * @param page 1-based page
   * @param page_size 1–100, default 20
   */
  @Get("users")
  @Security("loggedin")
  public async getAdminUsers(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() role?: SiteRole,
    @Query() banned?: boolean,
    @Query() rsi_confirmed?: boolean,
    @Query() sort_by?: AdminUserSortField,
    @Query() sort_order?: "asc" | "desc",
  ): Promise<AdminUsersResponse> {
    this.request = request
    this.requireAdmin()
    const p = clampPage(page)
    const size = clampPageSize(page_size)
    const where: Record<string, string | boolean> = {}
    if (role) where.role = role
    if (banned !== undefined) where.banned = banned
    if (rsi_confirmed !== undefined) where.rsi_confirmed = rsi_confirmed
    const sortBy =
      sort_by && USER_SORT_FIELDS.includes(sort_by) ? sort_by : "created_at"
    const order = sort_order ?? "desc"

    const knex = getKnex()
    const countRow = await knex("accounts")
      .where(where)
      .count("* as count")
      .first()
    const total = countRow ? Number(countRow.count) : 0
    const rows = await knex("accounts")
      .where(where)
      .orderBy(sortBy, order)
      .limit(size)
      .offset((p - 1) * size)
      .select(...ADMIN_USER_COLUMNS)
    const users: AdminUser[] = rows.map((r) => ({
      ...r,
      created_at: isoDate(r.created_at),
    }))
    const totalPages = Math.ceil(total / size)
    return {
      users,
      pagination: {
        page: p,
        page_size: size,
        total_users: total,
        total_pages: totalPages,
        has_next: p < totalPages,
        has_prev: p > 1,
      },
    }
  }

  /**
   * New and cumulative members per day (30 days), week (12 weeks) and month
   * (12 months), plus totals. Test accounts are left out.
   * @summary Membership analytics
   */
  @Get("membership/analytics")
  @Security("loggedin")
  public async getAdminMembershipAnalytics(
    @Request() request: ExpressRequest,
  ): Promise<MembershipAnalyticsResponse> {
    this.request = request
    this.requireAdmin()
    const a = await adminDb.getMembershipAnalytics()
    const s = a.summary as Record<string, string | undefined>
    return {
      daily_totals: membershipPoints(a.daily_totals),
      weekly_totals: membershipPoints(a.weekly_totals),
      monthly_totals: membershipPoints(a.monthly_totals),
      summary: {
        total_members: Number(s.total_members ?? 0),
        admin_members: Number(s.admin_members ?? 0),
        regular_members: Number(s.regular_members ?? 0),
        rsi_confirmed_members: Number(s.rsi_confirmed_members ?? 0),
        banned_members: Number(s.banned_members ?? 0),
        new_members_30d: Number(s.new_members_30d ?? 0),
        new_members_7d: Number(s.new_members_7d ?? 0),
      },
    }
  }

  /**
   * Offers per day, week and month, top shops and buyers, and totals. Test
   * accounts and test shops are left out.
   * @summary Offer analytics
   */
  @Get("offers/analytics")
  @Security("loggedin")
  public async getAdminOfferAnalytics(
    @Request() request: ExpressRequest,
  ): Promise<OfferAnalyticsResponse> {
    this.request = request
    this.requireAdmin()
    return adminDb.getOfferAnalytics()
  }

  /**
   * The audit log, newest first, with the actor and, where the entry names
   * one, the org.
   * @summary List audit log entries
   * @param page 1-based page
   * @param page_size 1–100, default 20
   * @param start_date Inclusive lower bound on created_at
   * @param end_date Inclusive upper bound on created_at
   */
  @Get("audit-logs")
  @Security("loggedin")
  public async getAdminAuditLogs(
    @Request() request: ExpressRequest,
    @Query() page?: number,
    @Query() page_size?: number,
    @Query() action?: string,
    @Query() subject_type?: string,
    @Query() subject_id?: string,
    @Query() actor_id?: string,
    @Query() start_date?: string,
    @Query() end_date?: string,
  ): Promise<AdminAuditLogsResponse> {
    this.request = request
    this.requireAdmin()
    const p = clampPage(page)
    const size = clampPageSize(page_size)

    let query = getKnex()("audit_logs").select("audit_logs.*")
    if (action) query = query.where("audit_logs.action", action)
    if (subject_type)
      query = query.where("audit_logs.subject_type", subject_type)
    if (subject_id) query = query.where("audit_logs.subject_id", subject_id)
    if (actor_id) query = query.where("audit_logs.actor_id", actor_id)
    if (start_date)
      query = query.where("audit_logs.created_at", ">=", start_date)
    if (end_date) query = query.where("audit_logs.created_at", "<=", end_date)

    const totalRow = await query
      .clone()
      .clearSelect()
      .count("* as count")
      .first()
    const total = totalRow ? Number(totalRow.count) : 0
    const logs: AuditLogRow[] = await query
      .orderBy("audit_logs.created_at", "desc")
      .limit(size)
      .offset((p - 1) * size)

    const actors = new Map<string, MinimalUser>()
    await Promise.all(
      [
        ...new Set(
          logs.map((l) => l.actor_id).filter((id): id is string => id !== null),
        ),
      ].map(async (id) => {
        try {
          actors.set(id, await profileDb.getMinimalUser({ user_id: id }))
        } catch {
          // Deleted account: shown without an actor.
        }
      }),
    )

    const contractorIds = new Set<string>()
    for (const log of logs) {
      const fromMetadata = metadataContractorId(log)
      if (fromMetadata) contractorIds.add(fromMetadata)
      if (log.subject_type === "contractor" && log.subject_id)
        contractorIds.add(log.subject_id)
    }
    const contractors = new Map<string, AdminAuditLogContractor>()
    await Promise.all(
      [...contractorIds].map(async (contractor_id) => {
        try {
          const c = await contractorDb.getMinimalContractor({ contractor_id })
          contractors.set(contractor_id, {
            contractor_id,
            name: c.name,
            spectrum_id: c.spectrum_id,
          })
        } catch {
          // Not an org id (or the org is gone): shown without one.
        }
      }),
    )

    const items = logs.map((log) => {
      const fromMetadata = metadataContractorId(log)
      let contractor = fromMetadata
        ? (contractors.get(fromMetadata) ?? null)
        : null
      if (!contractor && log.subject_type === "contractor" && log.subject_id) {
        contractor = contractors.get(log.subject_id) ?? null
      }
      return {
        audit_log_id: log.audit_log_id,
        action: log.action,
        actor_id: log.actor_id,
        actor: log.actor_id ? (actors.get(log.actor_id) ?? null) : null,
        subject_type: log.subject_type,
        subject_id: log.subject_id,
        metadata: log.metadata,
        created_at: isoDate(log.created_at),
        contractor,
      }
    })

    return { items, total, page: p, page_size: size }
  }

  /**
   * Send one notification of the given type to a user, built from the first
   * matching real row (order, offer, bid…), through in-app, push, email and
   * webhooks like the real event. 404 when no such row exists.
   * @summary Send a test notification
   */
  @Post("notifications/test")
  @Security("loggedin")
  public async postAdminTestNotification(
    @Request() request: ExpressRequest,
    @Body() body: AdminTestNotificationRequest,
  ): Promise<AdminTestNotificationResponse> {
    this.request = request
    this.requireAdmin()
    const actorId = this.getUserId()
    const { notification_type, target_username, contractor_id } = body
    if (!target_username) {
      this.throwValidationError("target_username is required", [
        { field: "target_username", message: "target_username is required" },
      ])
    }

    const target: { user_id: string } | undefined = await getKnex()("accounts")
      .where({ username: target_username })
      .first("user_id")
    if (!target)
      this.throwBusinessError(ErrorCode.NOT_FOUND, "Target user not found")
    const targetUserId = target.user_id

    let data
    try {
      data = await sendAdminTestNotification({
        notificationType: notification_type,
        targetUserId,
        actorId,
        contractorId: contractor_id,
      })
    } catch (error) {
      if (error instanceof TestNotificationSampleMissingError) {
        this.throwBusinessError(ErrorCode.NOT_FOUND, error.message)
      }
      throw error
    }

    logger.info(
      `Admin ${actorId} tested notification type: ${notification_type}`,
      {
        target_username,
        target_user_id: targetUserId,
        data,
      },
    )
    return { message: "Notification test completed", data }
  }
}
