/**
 * The no-login landing page behind the "Keep them live" / "Pause them"
 * buttons of the "Still selling?" DM (services/dm-campaigns/still-selling.service.ts).
 * The signed token in the path is the credential: one user, one action,
 * valid 30 days. GET says what confirming would do; POST does it. Rate
 * limited per IP (api-router.ts).
 */
import { Get, Path, Post, Request, Route, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import {
  MAX_LISTED,
  applyAction,
  lookupAction,
} from "../../../../services/dm-campaigns/still-selling.service.js"
import type {
  StillSellingActionPreview,
  StillSellingActionResult,
} from "../types/still-selling.types.js"

@Route("still-selling")
@Tags("Listings V2")
export class StillSellingController extends BaseController {
  /**
   * What the link's action would do: which of the DM's listings it would
   * refresh (keep) or pause. Changes nothing.
   *
   * @summary Preview a "Still selling?" link
   * @param token The signed token from the DM's button
   */
  @Get("{token}")
  public async getStillSellingAction(
    @Request() request: ExpressRequest,
    @Path() token: string,
  ): Promise<StillSellingActionPreview> {
    this.request = request
    this.setHeader("Cache-Control", "private, no-store")
    this.setHeader("Referrer-Policy", "no-referrer")
    const found = await lookupAction(token)
    if (!found.ok)
      return {
        valid: false,
        reason: found.reason,
        listings_total: 0,
        listings_applicable: 0,
        listings: [],
      }
    const usedAt = found.action === "keep" ? found.keptAt : found.pausedAt
    return {
      valid: true,
      action: found.action,
      listings_total: found.total,
      listings_applicable: found.applicable.length,
      listings: found.applicable
        .slice(0, MAX_LISTED)
        .map((l) => ({ title: l.title, status: l.status })),
      expires_at: found.expiresAt.toISOString(),
      manage_path: found.managePath,
      used_at: usedAt ? usedAt.toISOString() : null,
    }
  }

  /**
   * Apply the link's action: keep (refresh the listings so they rank as
   * fresh again; paused ones are reactivated) or pause (hide the active ones
   * from the market; nothing is deleted).
   *
   * @summary Confirm a "Still selling?" link
   * @param token The signed token from the DM's button
   */
  @Post("{token}")
  public async confirmStillSellingAction(
    @Request() request: ExpressRequest,
    @Path() token: string,
  ): Promise<StillSellingActionResult> {
    this.request = request
    this.setHeader("Cache-Control", "private, no-store")
    const result = await applyAction(token)
    if (!result.ok)
      return { ok: false, reason: result.reason, changed: 0, listings_total: 0 }
    return {
      ok: true,
      action: result.action,
      changed: result.changed,
      listings_total: result.total,
      manage_path: result.managePath,
    }
  }
}
