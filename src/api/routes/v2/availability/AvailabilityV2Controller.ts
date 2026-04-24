/**
 * Availability V2 Controller
 *
 * Public endpoint to get a seller's next available time.
 */

import { Controller, Get, Route, Tags, Query, Security } from "tsoa"
import { getKnex } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../../v1/profiles/database.js"
import { getNextAvailableTime } from "../util/next-available.js"

interface SellerNextAvailableResponse {
  /** ISO 8601 timestamp of next available slot, or null if currently available / no schedule */
  next_available: string | null
  /** Whether the seller has an availability schedule set */
  has_schedule: boolean
}

@Route("availability")
@Tags("Availability")
export class AvailabilityV2Controller extends Controller {
  /**
   * Get a seller's next available time
   * @param username Username (for user sellers)
   * @param spectrum_id Spectrum ID (for contractor sellers)
   */
  @Get("next")
  @Security("loggedin")
  public async getNextAvailable(
    @Query() username?: string,
    @Query() spectrum_id?: string,
  ): Promise<SellerNextAvailableResponse> {
    if (!username && !spectrum_id) {
      this.setStatus(400)
      return { next_available: null, has_schedule: false }
    }

    const db = getKnex()

    let userId: string | null = null
    let contractorId: string | null = null

    if (username) {
      const user = await db("accounts").where("username", username).first("user_id")
      if (!user) return { next_available: null, has_schedule: false }
      userId = user.user_id
    }

    if (spectrum_id) {
      const contractor = await db("contractors").where("spectrum_id", spectrum_id).first("contractor_id")
      if (!contractor) return { next_available: null, has_schedule: false }
      // For contractor availability, we need the owner's user_id
      const member = await db("contractor_members")
        .where("contractor_id", contractor.contractor_id)
        .where("role", "owner")
        .first("user_id")
      if (!member) return { next_available: null, has_schedule: false }
      userId = member.user_id
      contractorId = contractor.contractor_id
    }

    if (!userId) return { next_available: null, has_schedule: false }

    const spans = await profileDb.getUserAvailability(userId, contractorId)
    if (!spans.length) return { next_available: null, has_schedule: false }

    return {
      next_available: getNextAvailableTime(spans),
      has_schedule: true,
    }
  }
}
