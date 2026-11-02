import { Delete, Get, Path, Put, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import { ErrorCode } from "../../v1/util/error-codes.js"
import {
  DismissHintError,
  clearDismissedHints,
  dismissHint,
  listDismissedHints,
} from "../../../../services/hints/dismissed-hints.service.js"
import type {
  ClearDismissedHintsResponse,
  DismissedHint,
  DismissedHintsResponse,
} from "../types/hints.types.js"

/**
 * The inline help hints (first-use cards) the signed-in user has dismissed,
 * so a dismissed hint stays hidden on every device.
 */
@Route("hints")
@Tags("Hints")
export class HintsV2Controller extends BaseController {
  /**
   * Keys of every inline help hint the current user has dismissed
   * @summary List my dismissed hints
   */
  @Security("loggedin")
  @Get("dismissed")
  public async getDismissedHints(
    @Request() request: ExpressRequest,
  ): Promise<DismissedHintsResponse> {
    this.request = request
    const hint_keys = await listDismissedHints(getKnex(), this.getUserId())
    return { hint_keys }
  }

  /**
   * Show every inline help hint again: forgets all of the current user's
   * dismissals. Clearing an empty list is a no-op.
   * @summary Show all hints again
   */
  @Security("loggedin")
  @Delete("dismissed")
  public async clearDismissedHints(
    @Request() request: ExpressRequest,
  ): Promise<ClearDismissedHintsResponse> {
    this.request = request
    const cleared = await clearDismissedHints(getKnex(), this.getUserId())
    return { cleared }
  }

  /**
   * Dismiss an inline help hint for good. Dismissing it again is a no-op.
   * @summary Dismiss a hint
   * @param hint_key Lower-case letters, digits, dots, dashes and underscores (at most 64)
   */
  @Security("loggedin")
  @Put("dismissed/{hint_key}")
  public async dismissHint(
    @Path() hint_key: string,
    @Request() request: ExpressRequest,
  ): Promise<DismissedHint> {
    this.request = request
    const userId = this.getUserId()
    try {
      const row = await dismissHint(getKnex(), userId, hint_key)
      return {
        hint_key: row.hint_key,
        dismissed_at: new Date(row.dismissed_at).toISOString(),
      }
    } catch (error) {
      if (!(error instanceof DismissHintError)) throw error
      if (error.code === "limit") {
        this.throwBusinessError(ErrorCode.VALIDATION_ERROR, error.message)
      }
      this.throwValidationError(error.message, [
        { field: "hint_key", message: error.message },
      ])
    }
  }
}
