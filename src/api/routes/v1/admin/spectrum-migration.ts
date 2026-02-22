import express from "express"
import { adminAuthorized } from "../../../middleware/auth.js"
import {
  migrateExistingUsersToSpectrumIds,
  simulateSpectrumMigration,
  getMigrationStatus,
  rollbackSpectrumMigration,
} from "../util/spectrum-migration.js"
import { createResponse, createErrorResponse } from "../util/response.js"
// Legacy openapi.js has been removed - these routes need to be migrated to TSOA
// import {
//   adminOapi,
//   Response400,
//   Response401,
//   Response403,
//   Response500,
// } from "../openapi.js"
import logger from "../../../../logger/logger.js"

// Temporary stub for adminOapi until migration to TSOA
const adminOapi = {
  validPath: (config: any) => (req: any, res: any, next: any) => next(),
}

// Temporary response type stubs
const Response400 = {}
const Response401 = {}
const Response403 = {}
const Response500 = {}

export const spectrumMigrationRouter = express.Router()

// Get migration status
spectrumMigrationRouter.get(
  "/status",
  adminOapi.validPath({
    summary: "Get Spectrum migration status",
    deprecated: false,
    description: "Get the current status of Spectrum user ID migration",
    operationId: "getSpectrumMigrationStatus",
    tags: ["Admin", "Spectrum"],
    parameters: [],
    responses: {
      "200": {
        description: "Migration status retrieved successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                totalUsers: { type: "number" },
                verifiedUsers: { type: "number" },
                usersWithSpectrumId: { type: "number" },
                usersNeedingMigration: { type: "number" },
                usersWithoutSpectrumId: { type: "number" },
              },
              required: [
                "totalUsers",
                "verifiedUsers",
                "usersWithSpectrumId",
                "usersNeedingMigration",
                "usersWithoutSpectrumId",
              ],
            },
          },
        },
      },
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [],
  }),
  adminAuthorized,
  async (req, res) => {
    try {
      const status = await getMigrationStatus()
      res.json(createResponse(status))
    } catch (error) {
      logger.error("Error getting migration status:", error)
      res
        .status(500)
        .json(createErrorResponse({ error: "Failed to get migration status" }))
    }
  },
)

// Run migration simulation (dry run)
spectrumMigrationRouter.post(
  "/simulate",
  adminOapi.validPath({
    summary: "Simulate Spectrum migration",
    deprecated: false,
    description:
      "Run a simulation of the Spectrum migration to see what would happen",
    operationId: "simulateSpectrumMigration",
    tags: ["Admin", "Spectrum"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              batchSize: {
                type: "number",
                description: "Number of users to process in each batch",
                default: 10,
                minimum: 1,
                maximum: 100,
              },
              delayBetweenRequests: {
                type: "number",
                description: "Delay in ms between individual requests",
                default: 500,
                minimum: 0,
                maximum: 5000,
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Simulation completed successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                totalUsers: { type: "number" },
                successfulMigrations: { type: "number" },
                failedMigrations: { type: "number" },
                unverifiedUsers: { type: "number" },
                errors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      username: { type: "string" },
                      user_id: { type: "string" },
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [],
  }),
  adminAuthorized,
  async (req, res) => {
    try {
      const { batchSize = 10, delayBetweenRequests = 500 } = req.body as {
        batchSize?: number
        delayBetweenRequests?: number
      }

      if (batchSize && (batchSize < 1 || batchSize > 100)) {
        res.status(400).json(
          createErrorResponse({
            error: "Batch size must be between 1 and 100",
          }),
        )
        return
      }

      if (
        delayBetweenRequests &&
        (delayBetweenRequests < 0 || delayBetweenRequests > 5000)
      ) {
        res.status(400).json(
          createErrorResponse({
            error: "Delay between requests must be between 0 and 5000ms",
          }),
        )
        return
      }

      logger.info(
        `Admin ${(req.user as any)?.username || "Unknown"} started Spectrum migration simulation with batch size ${batchSize}, delay between requests ${delayBetweenRequests}ms`,
      )

      const result = await simulateSpectrumMigration(
        batchSize,
        delayBetweenRequests,
      )
      res.json(createResponse(result))
    } catch (error) {
      logger.error("Error running migration simulation:", error)
      res
        .status(500)
        .json(
          createErrorResponse({ error: "Failed to run migration simulation" }),
        )
    }
  },
)

// Run actual migration
spectrumMigrationRouter.post(
  "/migrate",
  adminOapi.validPath({
    summary: "Run Spectrum migration",
    deprecated: false,
    description:
      "Run the actual Spectrum migration to fetch and store user IDs",
    operationId: "runSpectrumMigration",
    tags: ["Admin", "Spectrum"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              batchSize: {
                type: "number",
                description: "Number of users to process in each batch",
                default: 10,
                minimum: 1,
                maximum: 100,
              },
              delayBetweenBatches: {
                type: "number",
                description: "Delay in ms between batches",
                default: 1000,
                minimum: 0,
                maximum: 10000,
              },
              delayBetweenRequests: {
                type: "number",
                description: "Delay in ms between individual requests",
                default: 500,
                minimum: 0,
                maximum: 5000,
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Migration completed successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                totalUsers: { type: "number" },
                successfulMigrations: { type: "number" },
                failedMigrations: { type: "number" },
                unverifiedUsers: { type: "number" },
                errors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      username: { type: "string" },
                      user_id: { type: "string" },
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [],
  }),
  adminAuthorized,
  async (req, res) => {
    try {
      const {
        batchSize = 10,
        delayBetweenBatches = 1000,
        delayBetweenRequests = 500,
      } = req.body as {
        batchSize?: number
        delayBetweenBatches?: number
        delayBetweenRequests?: number
      }

      if (batchSize && (batchSize < 1 || batchSize > 100)) {
        res.status(400).json(
          createErrorResponse({
            error: "Batch size must be between 1 and 100",
          }),
        )
        return
      }

      if (
        delayBetweenBatches &&
        (delayBetweenBatches < 0 || delayBetweenBatches > 10000)
      ) {
        res.status(400).json(
          createErrorResponse({
            error: "Delay between batches must be between 0 and 10000ms",
          }),
        )
        return
      }

      if (
        delayBetweenRequests &&
        (delayBetweenRequests < 0 || delayBetweenRequests > 5000)
      ) {
        res.status(400).json(
          createErrorResponse({
            error: "Delay between requests must be between 0 and 5000ms",
          }),
        )
        return
      }

      logger.info(
        `Admin ${(req.user as any)?.username || "Unknown"} started Spectrum migration with batch size ${batchSize}, delay between batches ${delayBetweenBatches}ms, delay between requests ${delayBetweenRequests}ms`,
      )

      const result = await migrateExistingUsersToSpectrumIds(
        batchSize,
        delayBetweenBatches,
        delayBetweenRequests,
      )
      res.json(createResponse(result))
    } catch (error) {
      logger.error("Error running migration:", error)
      res
        .status(500)
        .json(createErrorResponse({ error: "Failed to run migration" }))
    }
  },
)

// Rollback migration (destructive!)
spectrumMigrationRouter.post(
  "/rollback",
  adminOapi.validPath({
    summary: "Rollback Spectrum migration",
    deprecated: false,
    description:
      "Remove all Spectrum user IDs from the database (WARNING: destructive!)",
    operationId: "rollbackSpectrumMigration",
    tags: ["Admin", "Spectrum"],
    parameters: [],
    requestBody: {
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              confirm: {
                type: "boolean",
                description: "Must be true to confirm rollback",
                required: ["confirm"],
              },
            },
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Rollback completed successfully",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                usersAffected: { type: "number" },
                message: { type: "string" },
              },
            },
          },
        },
      },
      "400": Response400,
      "401": Response401,
      "403": Response403,
      "500": Response500,
    },
    security: [],
  }),
  adminAuthorized,
  async (req, res) => {
    try {
      const { confirm } = req.body as { confirm: boolean }

      if (!confirm) {
        res.status(400).json(
          createErrorResponse({
            error: "Must confirm rollback with confirm: true",
          }),
        )
        return
      }

      logger.warn(
        `Admin ${(req.user as any)?.username || "Unknown"} initiated Spectrum migration rollback`,
      )

      const usersAffected = await rollbackSpectrumMigration()
      res.json(
        createResponse({
          usersAffected,
          message: `Rollback completed: ${usersAffected} users affected`,
        }),
      )
    } catch (error) {
      logger.error("Error during rollback:", error)
      res
        .status(500)
        .json(createErrorResponse({ error: "Failed to rollback migration" }))
    }
  },
)
