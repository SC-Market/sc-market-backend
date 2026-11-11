/**
 * Admin › Spectrum migration: backfill RSI Spectrum user IDs for verified
 * accounts (api/routes/v1/util/spectrum-migration.ts). Moved from v1
 * /api/admin/spectrum-migration (same bounds). Site admins only (tsoa-auth
 * admin gate + requireAdmin); the real run and the rollback need an MFA
 * step-up.
 */
import { Body, Get, Post, Request, Route, Security, Tags } from "tsoa"
import { Request as ExpressRequest } from "express"
import { BaseController } from "../base/BaseController.js"
import {
  getMigrationStatus,
  migrateExistingUsersToSpectrumIds,
  rollbackSpectrumMigration,
  simulateSpectrumMigration,
  type MigrationResult,
} from "../../v1/util/spectrum-migration.js"
import logger from "../../../../logger/logger.js"

export interface SpectrumMigrationStatus {
  totalUsers: number
  verifiedUsers: number
  usersWithSpectrumId: number
  usersNeedingMigration: number
  usersWithoutSpectrumId: number
}

export type SpectrumMigrationResult = MigrationResult

export interface SpectrumMigrationSimulateRequest {
  /** 1–100, default 10 */
  batchSize?: number
  /** 0–5000 ms, default 500 */
  delayBetweenRequests?: number
}

export interface SpectrumMigrationRunRequest extends SpectrumMigrationSimulateRequest {
  /** 0–10000 ms, default 1000 */
  delayBetweenBatches?: number
}

export interface SpectrumMigrationRollbackRequest {
  /** Must be true. */
  confirm: boolean
}

export interface SpectrumMigrationRollbackResponse {
  usersAffected: number
  message: string
}

@Route("admin/spectrum-migration")
@Tags("Admin")
export class AdminSpectrumMigrationController extends BaseController {
  /**
   * @summary Spectrum migration status
   */
  @Get("status")
  @Security("loggedin")
  public async getSpectrumMigrationStatus(
    @Request() request: ExpressRequest,
  ): Promise<SpectrumMigrationStatus> {
    this.request = request
    this.requireAdmin()
    return getMigrationStatus()
  }

  /**
   * Dry run: what the migration would do, changing nothing.
   * @summary Simulate the Spectrum migration
   */
  @Post("simulate")
  @Security("loggedin")
  public async simulateSpectrumMigration(
    @Request() request: ExpressRequest,
    @Body() body: SpectrumMigrationSimulateRequest,
  ): Promise<SpectrumMigrationResult> {
    this.request = request
    this.requireAdmin()
    const { batchSize = 10, delayBetweenRequests = 500 } = body
    this.checkBatchSize(batchSize)
    this.checkDelay("delayBetweenRequests", delayBetweenRequests, 5000)
    logger.info(
      `Admin ${this.getUser().username} started Spectrum migration simulation with batch size ${batchSize}, delay between requests ${delayBetweenRequests}ms`,
    )
    return simulateSpectrumMigration(batchSize, delayBetweenRequests)
  }

  /**
   * Fetch and store Spectrum user IDs. Needs an MFA step-up.
   * @summary Run the Spectrum migration
   */
  @Post("migrate")
  @Security("loggedin")
  public async runSpectrumMigration(
    @Request() request: ExpressRequest,
    @Body() body: SpectrumMigrationRunRequest,
  ): Promise<SpectrumMigrationResult> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    const {
      batchSize = 10,
      delayBetweenBatches = 1000,
      delayBetweenRequests = 500,
    } = body
    this.checkBatchSize(batchSize)
    this.checkDelay("delayBetweenBatches", delayBetweenBatches, 10000)
    this.checkDelay("delayBetweenRequests", delayBetweenRequests, 5000)
    logger.info(
      `Admin ${this.getUser().username} started Spectrum migration with batch size ${batchSize}, delay between batches ${delayBetweenBatches}ms, delay between requests ${delayBetweenRequests}ms`,
    )
    return migrateExistingUsersToSpectrumIds(
      batchSize,
      delayBetweenBatches,
      delayBetweenRequests,
    )
  }

  /**
   * Remove every stored Spectrum user ID (destructive). Needs confirm: true
   * and an MFA step-up.
   * @summary Roll back the Spectrum migration
   */
  @Post("rollback")
  @Security("loggedin")
  public async rollbackSpectrumMigration(
    @Request() request: ExpressRequest,
    @Body() body: SpectrumMigrationRollbackRequest,
  ): Promise<SpectrumMigrationRollbackResponse> {
    this.request = request
    this.requireAdmin()
    await this.requireStepUp()
    if (body.confirm !== true) {
      this.throwValidationError("Must confirm rollback with confirm: true", [
        { field: "confirm", message: "Must be true" },
      ])
    }
    logger.warn(
      `Admin ${this.getUser().username} initiated Spectrum migration rollback`,
    )
    const usersAffected = await rollbackSpectrumMigration()
    return {
      usersAffected,
      message: `Rollback completed: ${usersAffected} users affected`,
    }
  }

  private checkBatchSize(batchSize: number): void {
    if (batchSize < 1 || batchSize > 100) {
      this.throwValidationError("Batch size must be between 1 and 100", [
        { field: "batchSize", message: "Between 1 and 100" },
      ])
    }
  }

  private checkDelay(field: string, value: number, max: number): void {
    if (value < 0 || value > max) {
      this.throwValidationError(`${field} must be between 0 and ${max}ms`, [
        { field, message: `Between 0 and ${max}` },
      ])
    }
  }
}
