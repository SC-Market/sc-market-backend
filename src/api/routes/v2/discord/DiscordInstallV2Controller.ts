/**
 * "Add SC Market to Discord" link clicks (services/discord/install-clicks.ts).
 * The frontend's /discord/install route calls this before redirecting to
 * Discord. Anyone may call it (signed in or not): it only increments a daily
 * counter per install type and surface, stores nothing about the caller, and
 * rate limited like the other writes (api-router.ts).
 */
import { Body, Post, Route, SuccessResponse, Tags } from "tsoa"
import { BaseController } from "../base/BaseController.js"
import { recordInstallClick } from "../../../../services/discord/install-clicks.js"
import type { DiscordInstallClickRequest } from "../types/discord-install.types.js"

@Route("discord/install-clicks")
@Tags("Discord")
export class DiscordInstallV2Controller extends BaseController {
  /**
   * Count one click on an "Add SC Market to Discord" link. Unknown surfaces
   * count as "other"; an unknown install type is ignored.
   * @summary Count a Discord install link click
   */
  @Post("")
  @SuccessResponse(204, "Counted")
  public async recordDiscordInstallClick(@Body() body: DiscordInstallClickRequest): Promise<void> {
    await recordInstallClick(body?.type, body?.src)
    this.setStatus(204)
  }
}
