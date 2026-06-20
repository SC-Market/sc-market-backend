import { Post, Get, Route, Tags, Request, Security } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import { getKnex } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../../v1/profiles/database.js"
import * as emailPreferenceDb from "../../v1/email/database.js"

interface OnboardingStatusResponse {
  completed: boolean
  completedAt: string | null
  steps: {
    hasDiscord: boolean
    hasAvailability: boolean
    hasEmail: boolean
    dmRemindersEnabled: boolean
  }
}

const DM_REMINDER_ACTION_TYPE_ID = 82

@Route("onboarding")
@Tags("Onboarding")
export class OnboardingV2Controller extends BaseController {
  constructor(@Request() request?: ExpressRequest) {
    super(request)
  }

  @Security("loggedin")
  @Get("status")
  public async getOnboardingStatus(
    @Request() request: ExpressRequest,
  ): Promise<OnboardingStatusResponse> {
    this.request = request
    const userId = this.getUserId()
    const knex = getKnex()

    const user = await knex("accounts")
      .where("user_id", userId)
      .select("onboarding_completed_at")
      .first()

    const providers = await profileDb.getUserProviders(userId)
    const hasDiscord = providers.some((p) => p.provider_type === "discord")

    const availability = await profileDb.getUserAvailability(userId, null)
    const hasAvailability = availability.length > 0

    const emails = await knex("user_emails")
      .where("user_id", userId)
      .where("email_verified", true)
      .first()
    const hasEmail = !!emails

    const dmPref = await emailPreferenceDb.getEmailPreference(
      userId,
      DM_REMINDER_ACTION_TYPE_ID,
      null,
    )
    const dmRemindersEnabled = dmPref?.enabled ?? false

    return {
      completed: !!user?.onboarding_completed_at,
      completedAt: user?.onboarding_completed_at?.toISOString() ?? null,
      steps: {
        hasDiscord,
        hasAvailability,
        hasEmail,
        dmRemindersEnabled,
      },
    }
  }

  @Security("loggedin")
  @Post("complete")
  public async completeOnboarding(
    @Request() request: ExpressRequest,
  ): Promise<{ completedAt: string }> {
    this.request = request
    const userId = this.getUserId()
    const knex = getKnex()

    const now = new Date()

    await knex("accounts")
      .where("user_id", userId)
      .update({ onboarding_completed_at: now })

    return { completedAt: now.toISOString() }
  }
}
