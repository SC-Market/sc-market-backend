/**
 * Public API token management, for the site's token settings page.
 *
 * Browser sessions only: tokens can't manage tokens. Legacy tokens are
 * refused here (tsoa-auth SESSION_ONLY_PREFIXES), public tokens are refused
 * on every non-public route (server.ts), and custom shop domains can't reach
 * it (custom-origin.ts).
 *
 * The tokens themselves only work on /api/public/v1 (routes/public/v1).
 */

import { Body, Get, Path, Post, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import type { DBPublicApiToken } from "../../../../clients/database/db-models.js"
import {
  grantableOrgs,
  listPublicTokens,
  mintPublicToken,
  PublicTokenRequestError,
  revokePublicToken,
} from "../../../../services/public-api/tokens.service.js"
import { legacyTokenSunset } from "../../../../services/public-api/legacy-deprecation.js"
import { auditLogService } from "../../../../services/audit-log/audit-log.service.js"
import {
  PUBLIC_SCOPES,
  PUBLIC_TOKEN_DEFAULT_LIFETIME_DAYS,
  PUBLIC_TOKEN_MAX_ACTIVE,
  PUBLIC_TOKEN_MAX_LIFETIME_DAYS,
  PUBLIC_TOKEN_PRESETS,
  type PublicScope,
  type PublicTokenPreset,
} from "../../public/v1/scope-catalog.js"

export interface PublicApiTokenOrg {
  contractor_id: string
  spectrum_id: string
  name: string
}

export interface PublicApiTokenPresetInfo {
  id: PublicTokenPreset
  scopes: PublicScope[]
}

export interface PublicApiTokenOptions {
  scopes: PublicScope[]
  presets: PublicApiTokenPresetInfo[]
  default_lifetime_days: number
  max_lifetime_days: number
  max_active_tokens: number
  /** Orgs the user can grant: the orgs they are a member of. */
  orgs: PublicApiTokenOrg[]
  /** When legacy tokens stop working, once announced; null while not scheduled. */
  legacy_sunset_at: string | null
}

export interface PublicApiTokenSummary {
  id: string
  name: string
  description: string | null
  preset: string
  scopes: string[]
  /** Orgs the token may act for. Empty: personal shops only. */
  orgs: PublicApiTokenOrg[]
  /** Last 4 characters of the token. */
  token_hint: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
  /** Requests in the last 30 days. */
  requests_30d: number
  status: "active" | "expired" | "revoked"
}

export interface PublicApiTokenList {
  tokens: PublicApiTokenSummary[]
}

export interface CreatePublicApiTokenRequest {
  /** @maxLength 100 */
  name: string
  /** @maxLength 500 */
  description?: string | null
  preset: PublicTokenPreset
  /** Orgs to grant, by spectrum id. Empty: personal shops only. */
  org_spectrum_ids: string[]
  /**
   * @isInt
   * @minimum 1
   * @maximum 365
   */
  expires_in_days: number
}

export interface CreatedPublicApiToken {
  /** The token. Shown once: it can't be retrieved again. */
  token: string
  summary: PublicApiTokenSummary
}

function iso(d: Date | string | null): string | null {
  return d ? new Date(d).toISOString() : null
}

async function summarize(
  rows: DBPublicApiToken[],
): Promise<PublicApiTokenSummary[]> {
  if (!rows.length) return []
  const db = getKnex()
  const orgIds = [...new Set(rows.flatMap((r) => r.contractor_ids ?? []))]
  const orgs: PublicApiTokenOrg[] = orgIds.length
    ? await db("contractors")
        .whereIn("contractor_id", orgIds)
        .select("contractor_id", "spectrum_id", "name")
    : []
  const orgById = new Map(orgs.map((o) => [o.contractor_id, o]))
  const usage: { public_token_id: string; requests: string }[] = await db(
    "api_token_usage_hourly",
  )
    .whereIn(
      "public_token_id",
      rows.map((r) => r.id),
    )
    .where("hour", ">=", db.raw("now() - interval '30 days'"))
    .groupBy("public_token_id")
    .select("public_token_id", db.raw("SUM(requests) AS requests"))
  const requestsById = new Map(
    usage.map((u) => [u.public_token_id, Number(u.requests)]),
  )
  const now = Date.now()
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    preset: r.preset,
    scopes: r.scopes,
    orgs: (r.contractor_ids ?? [])
      .map((id) => orgById.get(id))
      .filter((o): o is PublicApiTokenOrg => !!o),
    token_hint: r.token_hint,
    expires_at: new Date(r.expires_at).toISOString(),
    last_used_at: iso(r.last_used_at),
    revoked_at: iso(r.revoked_at),
    created_at: new Date(r.created_at).toISOString(),
    requests_30d: requestsById.get(r.id) ?? 0,
    status: r.revoked_at
      ? "revoked"
      : new Date(r.expires_at).getTime() <= now
        ? "expired"
        : "active",
  }))
}

@Route("public-api-tokens")
@Tags("Public API tokens")
export class PublicApiTokensController extends BaseController {
  /**
   * What a new public API token can be: presets and their scopes, lifetime
   * bounds, and the orgs the user can grant.
   *
   * @summary Public API token options
   */
  @Get("options")
  @Security("loggedin")
  public async getPublicApiTokenOptions(
    @Request() request: ExpressRequest,
  ): Promise<PublicApiTokenOptions> {
    this.request = request
    const userId = this.getUserId()
    const sunset = legacyTokenSunset()
    return {
      scopes: [...PUBLIC_SCOPES],
      presets: (Object.keys(PUBLIC_TOKEN_PRESETS) as PublicTokenPreset[]).map(
        (id) => ({
          id,
          scopes: [...PUBLIC_TOKEN_PRESETS[id]],
        }),
      ),
      default_lifetime_days: PUBLIC_TOKEN_DEFAULT_LIFETIME_DAYS,
      max_lifetime_days: PUBLIC_TOKEN_MAX_LIFETIME_DAYS,
      max_active_tokens: PUBLIC_TOKEN_MAX_ACTIVE,
      orgs: await grantableOrgs(userId),
      legacy_sunset_at: sunset ? sunset.toISOString() : null,
    }
  }

  /**
   * The user's public API tokens (never the secrets), newest first.
   *
   * @summary List public API tokens
   */
  @Get("")
  @Security("loggedin")
  public async listPublicApiTokens(
    @Request() request: ExpressRequest,
  ): Promise<PublicApiTokenList> {
    this.request = request
    return { tokens: await summarize(await listPublicTokens(this.getUserId())) }
  }

  /**
   * Create a public API token from a preset, with an org grant and an expiry.
   * The response holds the token itself, once.
   *
   * @summary Create public API token
   */
  @Post("")
  @Security("loggedin")
  public async createPublicApiToken(
    @Body() body: CreatePublicApiTokenRequest,
    @Request() request: ExpressRequest,
  ): Promise<CreatedPublicApiToken> {
    this.request = request
    const user = this.getUser()
    try {
      const { token, record } = await mintPublicToken(user, body)
      await auditLogService.record({
        action: "public_api_token.created",
        actorId: user.user_id,
        subjectType: "public_api_token",
        subjectId: record.id,
        metadata: {
          preset: record.preset,
          scopes: record.scopes,
          contractor_ids: record.contractor_ids,
          expires_at: record.expires_at,
        },
      })
      const [summary] = await summarize([record])
      return { token, summary }
    } catch (error) {
      if (error instanceof PublicTokenRequestError) {
        this.throwValidationError(error.message, [
          { field: error.field ?? "body", message: error.message },
        ])
      }
      throw error
    }
  }

  /**
   * Revoke a public API token. It stops working at once on this server and
   * within 30 seconds everywhere.
   *
   * @summary Revoke public API token
   */
  @Post("{tokenId}/revoke")
  @Security("loggedin")
  public async revokePublicApiToken(
    @Path() tokenId: string,
    @Request() request: ExpressRequest,
  ): Promise<PublicApiTokenSummary> {
    this.request = request
    const userId = this.getUserId()
    try {
      const row = await revokePublicToken(userId, tokenId)
      await auditLogService.record({
        action: "public_api_token.revoked",
        actorId: userId,
        subjectType: "public_api_token",
        subjectId: row.id,
      })
      const [summary] = await summarize([row])
      return summary
    } catch (error) {
      if (error instanceof PublicTokenRequestError && error.status === 404) {
        this.throwNotFound("Token", tokenId)
      }
      throw error
    }
  }
}
