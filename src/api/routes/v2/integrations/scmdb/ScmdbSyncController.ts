import { Controller, Get, Post, Delete, Route, Tags, Path, Security, Request } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../../base/BaseController.js"
import { scmdbSyncService } from "../../../../../services/scmdb/scmdb-sync.service.js"
import logger from "../../../../../logger/logger.js"
import {
  ScmdbIngestResponse,
  ScmdbConnectResponse,
  ScmdbStatusResponse,
} from "./scmdb.types.js"

@Route("integrations/scmdb")
@Tags("Integrations - SCMDB")
export class ScmdbSyncController extends BaseController {
  /**
   * Receive SCMDB sync events.
   * Public endpoint — authentication is via the token in the URL path.
   * Content-Type from SCMDB is text/plain but body is JSON.
   *
   * @summary Ingest SCMDB webhook
   * @param token Sync token identifying the user
   */
  @Post("ingest/{token}")
  public async ingestWebhook(
    @Path() token: string,
    @Request() request: ExpressRequest,
  ): Promise<ScmdbIngestResponse> {
    try {
      const rawBody = typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body)

      const result = await scmdbSyncService.processEvent(token, rawBody)

      logger.info("SCMDB ingest processed", {
        status: result.status,
        matched: result.matched,
        unmatched: result.unmatched,
      })
    } catch (error) {
      logger.error("SCMDB ingest error", {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return { ok: true }
  }

  /**
   * Get SCMDB sync connection status for the authenticated user.
   *
   * @summary Get SCMDB status
   */
  @Get("status")
  @Security("loggedin")
  public async getConnectionStatus(
    @Request() request: ExpressRequest,
  ): Promise<ScmdbStatusResponse> {
    this.request = request
    const userId = this.getUserId()

    const status = await scmdbSyncService.getTokenStatus(userId)

    if (!status) {
      return {
        is_connected: false,
        ingest_url: null,
        last_event_at: null,
        created_at: null,
      }
    }

    return {
      is_connected: true,
      ingest_url: status.ingest_url,
      last_event_at: status.last_event_at,
      created_at: status.created_at,
    }
  }

  /**
   * Generate a new SCMDB sync token and return the ingest URL.
   *
   * @summary Connect SCMDB
   */
  @Post("connect")
  @Security("loggedin")
  public async connect(
    @Request() request: ExpressRequest,
  ): Promise<ScmdbConnectResponse> {
    this.request = request
    const userId = this.getUserId()

    const existing = await scmdbSyncService.getTokenStatus(userId)
    if (existing) {
      return { ingest_url: existing.ingest_url! }
    }

    const { ingest_url } = await scmdbSyncService.generateToken(userId)
    return { ingest_url }
  }

  /**
   * Regenerate the SCMDB sync token. Old URL stops working immediately.
   *
   * @summary Regenerate SCMDB token
   */
  @Post("regenerate")
  @Security("loggedin")
  public async regenerate(
    @Request() request: ExpressRequest,
  ): Promise<ScmdbConnectResponse> {
    this.request = request
    const userId = this.getUserId()

    const { ingest_url } = await scmdbSyncService.regenerateToken(userId)
    return { ingest_url }
  }

  /**
   * Disconnect SCMDB sync. Deactivates the token.
   *
   * @summary Disconnect SCMDB
   */
  @Delete("disconnect")
  @Security("loggedin")
  public async disconnect(
    @Request() request: ExpressRequest,
  ): Promise<{ ok: boolean }> {
    this.request = request
    const userId = this.getUserId()

    await scmdbSyncService.deactivateToken(userId)
    return { ok: true }
  }
}
