import { Controller, Get, Request, Response, Route, Security, Tags } from "tsoa"
import type { Request as ExpressRequest } from "express"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { actingUser } from "../access.js"
import type { PublicErrorBody } from "../errors.js"
import { isPublicScope } from "../scope-catalog.js"
import type { PublicData, PublicMe, PublicOrgRef } from "../types.js"

@Route("me")
@Tags("Token")
@Response<PublicErrorBody>(401, "Missing, invalid, expired or revoked token")
@Response<PublicErrorBody>(429, "Rate limit exceeded")
export class MeController extends Controller {
  /**
   * The token making the request: its user, scopes, org grant and expiry.
   * Needs no scope.
   *
   * @summary Token introspection
   */
  @Get("")
  @Security("apiToken", [])
  public async getMe(
    @Request() request: ExpressRequest,
  ): Promise<PublicData<PublicMe>> {
    const user = actingUser(request)
    const token = request.publicApiToken!
    const orgs: PublicOrgRef[] = token.contractor_ids.length
      ? await getKnex()("contractors")
          .whereIn("contractor_id", token.contractor_ids)
          .select("contractor_id", "spectrum_id", "name")
          .orderBy("name", "asc")
      : []
    return {
      data: {
        user: {
          user_id: user.user_id,
          username: user.username,
          display_name: user.display_name,
        },
        token: {
          id: token.id,
          name: token.name,
          preset: token.preset,
          scopes: token.scopes.filter(isPublicScope),
          orgs,
          expires_at: new Date(token.expires_at).toISOString(),
          last_used_at: token.last_used_at
            ? new Date(token.last_used_at).toISOString()
            : null,
          created_at: new Date(token.created_at).toISOString(),
        },
      },
    }
  }
}
