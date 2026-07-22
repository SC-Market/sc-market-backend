import { Get, Put, Route, Tags, Request, Body, Query, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as dashboardService from "../../../../services/dashboard/dashboard.service.js"

type DashboardOwnerType = "user" | "org" | "shop"

interface DashboardLayoutResponse {
  owner_type: DashboardOwnerType
  owner_id: string
  /** Opaque DashboardConfig blob (widgets, scopes, grid layout). Validated client-side. */
  config: Record<string, unknown>
  updated_by: string
  updated_at: string
}

interface UpdateDashboardLayoutRequest {
  owner_type: DashboardOwnerType
  owner_id: string
  config: Record<string, unknown>
}

@Route("dashboard")
@Tags("Dashboard V2")
export class DashboardV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  /**
   * Get the saved dashboard layout for an owner. `owner_type`/`owner_id` default
   * to the authenticated user's personal dashboard. Returns null config when no
   * layout has been saved yet.
   */
  @Security("loggedin")
  @Get("layout")
  public async getLayout(
    @Request() request: ExpressRequest,
    @Query() owner_type?: DashboardOwnerType,
    @Query() owner_id?: string,
  ): Promise<DashboardLayoutResponse | null> {
    this.request = request
    const userId = this.getUserId()

    const resolvedType: DashboardOwnerType = owner_type ?? "user"
    const resolvedId = owner_id ?? userId

    return dashboardService.getLayout(resolvedType, resolvedId, userId)
  }

  /**
   * Create or replace the dashboard layout for an owner. Requires edit access:
   * personal dashboards by their owner, org dashboards by members with
   * manage_org_details, shop dashboards by users who can manage the shop.
   */
  @Security("loggedin")
  @Put("layout")
  public async saveLayout(
    @Body() body: UpdateDashboardLayoutRequest,
    @Request() request: ExpressRequest,
  ): Promise<DashboardLayoutResponse> {
    this.request = request
    const userId = this.getUserId()

    return dashboardService.saveLayout(
      body.owner_type,
      body.owner_id,
      body.config,
      userId,
    )
  }
}
