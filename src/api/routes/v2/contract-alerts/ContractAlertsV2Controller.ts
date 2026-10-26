import { Body, Get, Put, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import * as contractorDb from "../../v1/contractors/database.js"
import type {
  ContractAlertScope,
  ContractAlertsResponse,
  ContractKind,
  UpdateContractAlertRequest,
} from "../types/contract-alerts.types.js"

export const CONTRACT_KINDS: ContractKind[] = [
  "Support",
  "Escort",
  "Transport",
  "Construction",
  "Resource Acquisition",
  "Rental",
  "Delivery",
  "Medical",
  "Intelligence Services",
  "Misc",
  "Custom",
]

/**
 * Opt-in in-app + push alerts for new public contracts, personally or for an
 * org the user belongs to, optionally filtered by kind. Off by default. Push
 * can still be turned off in Settings -> Notifications ("Public contracts").
 */
@Route("contract-alerts")
@Tags("Notifications")
export class ContractAlertsV2Controller extends BaseController {
  /**
   * Get the current user's public contract alert subscriptions
   * @summary Get contract alerts
   */
  @Security("loggedin")
  @Get()
  public async getContractAlerts(@Request() request: ExpressRequest): Promise<ContractAlertsResponse> {
    this.request = request
    return this.view(this.getUserId())
  }

  /**
   * Turn the public contract alert on or off for one scope, or change its kinds
   * @summary Update contract alerts
   */
  @Security("loggedin")
  @Put()
  public async updateContractAlert(
    @Body() body: UpdateContractAlertRequest,
    @Request() request: ExpressRequest,
  ): Promise<ContractAlertsResponse> {
    this.request = request
    const userId = this.getUserId()
    const scopes = await this.scopes(userId)
    const contractorId = body.contractor_id ?? null
    if (contractorId && !scopes.some((s) => s.contractor_id === contractorId)) {
      this.throwForbidden("You are not a member of this organization")
    }
    const kinds = body.kinds ?? null
    if (kinds && (kinds.length === 0 || kinds.some((k) => !CONTRACT_KINDS.includes(k)))) {
      this.throwValidationError("kinds must list known contract kinds, or be null for all", [
        { field: "kinds", message: "Unknown or empty contract kinds" },
      ])
    }

    const db = getKnex()
    const scoped = db("contract_alert_subscriptions").where({ user_id: userId })
    const existing = await (contractorId ? scoped.where({ contractor_id: contractorId }) : scoped.whereNull("contractor_id")).first()
    if (!body.enabled) {
      if (existing) await db("contract_alert_subscriptions").where({ id: existing.id }).delete()
    } else if (existing) {
      await db("contract_alert_subscriptions").where({ id: existing.id }).update({ kinds, updated_at: db.fn.now() })
    } else {
      await db("contract_alert_subscriptions").insert({ user_id: userId, contractor_id: contractorId, kinds })
    }
    return this.view(userId, scopes)
  }

  private async scopes(userId: string): Promise<ContractAlertScope[]> {
    const orgs = await contractorDb.getUserContractors({ "contractor_members.user_id": userId })
    return [
      { contractor_id: null, name: "Personal" },
      ...orgs.map((o) => ({ contractor_id: o.contractor_id, name: o.name })),
    ]
  }

  private async view(userId: string, scopes?: ContractAlertScope[]): Promise<ContractAlertsResponse> {
    const rows = await getKnex()("contract_alert_subscriptions")
      .where({ user_id: userId })
      .orderBy("created_at")
      .select("contractor_id", "kinds")
    return {
      subscriptions: rows.map((r) => ({ contractor_id: r.contractor_id, kinds: r.kinds })),
      scopes: scopes ?? (await this.scopes(userId)),
      kinds: CONTRACT_KINDS,
    }
  }
}
