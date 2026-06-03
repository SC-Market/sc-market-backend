import { Post, Get, Route, Tags, Request, Body, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import * as accountDeletionService from "../../../../services/account-deletion/account-deletion.service.js"

interface RequestDeletionBody {
  reason?: string
}

interface RequestDeletionResponse {
  scheduledAt: string
  message: string
}

interface DeletionStatusResponse {
  pending: boolean
  scheduledAt?: string
  isTombstone: boolean
}

interface DeletionPreCheckResponse {
  canDelete: boolean
  blockers: Array<{ type: string; detail: string }>
}

@Route("accounts")
@Tags("Accounts V2")
export class AccountDeletionV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  @Security("loggedin")
  @Post("delete")
  public async requestDeletion(
    @Body() body: RequestDeletionBody,
    @Request() request: ExpressRequest,
  ): Promise<RequestDeletionResponse> {
    this.request = request
    const userId = this.getUserId()

    const result = await accountDeletionService.requestDeletion(
      userId,
      body.reason,
    )

    return {
      scheduledAt: result.scheduledAt.toISOString(),
      message:
        "Account scheduled for deletion. You can cancel within 30 days by logging in.",
    }
  }

  @Security("loggedin")
  @Post("cancel-deletion")
  public async cancelDeletion(
    @Request() request: ExpressRequest,
  ): Promise<{ message: string }> {
    this.request = request
    const userId = this.getUserId()

    await accountDeletionService.cancelDeletion(userId)

    return { message: "Account deletion cancelled." }
  }

  @Security("loggedin")
  @Get("deletion-status")
  public async getDeletionStatus(
    @Request() request: ExpressRequest,
  ): Promise<DeletionStatusResponse> {
    this.request = request
    const userId = this.getUserId()

    const status = await accountDeletionService.getDeletionStatus(userId)

    return {
      pending: status.pending,
      scheduledAt: status.scheduledAt?.toISOString(),
      isTombstone: status.isTombstone,
    }
  }

  @Security("loggedin")
  @Get("deletion-precheck")
  public async preDeletionCheck(
    @Request() request: ExpressRequest,
  ): Promise<DeletionPreCheckResponse> {
    this.request = request
    const userId = this.getUserId()

    return accountDeletionService.preCheckDeletion(userId)
  }
}
