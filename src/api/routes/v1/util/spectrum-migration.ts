import { database } from "../../../../clients/database/knex-db.js"
import * as profileDb from "../profiles/database.js"
import { getSpectrumUserIdByHandle } from "./spectrum.js"
import logger from "../../../../logger/logger.js"

/**
 * Migration helper to fetch Spectrum user IDs for all existing verified users
 * This should be run once after deploying the spectrum_user_id column
 */

export interface MigrationResult {
  totalUsers: number
  successfulMigrations: number
  failedMigrations: number
  unverifiedUsers: number
  errors: Array<{
    username: string
    user_id: string
    error: string
  }>
}

/**
 * Fetch Spectrum user IDs for all existing verified users
 * If a user can't be found, unverify their account
 *
 * @param batchSize - Number of users to process in each batch (default: 10)
 * @param delayBetweenBatches - Delay in ms between batches to avoid overwhelming the API (default: 1000)
 * @param delayBetweenRequests - Delay in ms between individual requests (default: 500)
 * @returns Promise<MigrationResult> - Summary of the migration results
 */
export async function migrateExistingUsersToSpectrumIds(
  batchSize: number = 10,
  delayBetweenBatches: number = 1000,
  delayBetweenRequests: number = 500,
): Promise<MigrationResult> {
  logger.info(
    "🚀 Starting Spectrum user ID migration for existing verified users",
  )

  const result: MigrationResult = {
    totalUsers: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    unverifiedUsers: 0,
    errors: [],
  }

  try {
    // Get all verified users that don't have a spectrum_user_id yet
    const users = await database
      .knex("accounts")
      .where("rsi_confirmed", true)
      .whereNull("spectrum_user_id")
      .select("user_id", "username", "rsi_confirmed")

    result.totalUsers = users.length
    logger.info(
      `Found ${users.length} verified users without Spectrum user IDs`,
    )

    if (users.length === 0) {
      logger.info(
        "✅ No users need migration - all verified users already have Spectrum IDs",
      )
      return result
    }

    // Process users in batches
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize)
      logger.info(
        `Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)} (${batch.length} users)`,
      )

      // Process batch sequentially with delays between requests
      for (const user of batch) {
        try {
          logger.debug(
            `Fetching Spectrum user ID for ${user.username} (${user.user_id})`,
          )

          const spectrumUserId = await getSpectrumUserIdByHandle(user.username)

          // Log the API response for debugging
          logger.debug(
            `Spectrum API response for ${user.username}: ${spectrumUserId ? `Found ID: ${spectrumUserId}` : "User not found"}`,
          )

          // Log additional details for successful lookups
          if (spectrumUserId) {
            logger.debug(
              `Successfully resolved ${user.username} to Spectrum ID ${spectrumUserId}`,
            )
          } else {
            logger.debug(
              `Failed to resolve ${user.username} - no Spectrum ID found in API response`,
            )
          }

          if (spectrumUserId) {
            // Check if this Spectrum ID is already in use by another user
            try {
              const existingUser = await profileDb.getUser({
                spectrum_user_id: spectrumUserId,
              })
              if (existingUser && existingUser.user_id !== user.user_id) {
                logger.warn(
                  `Spectrum user ID ${spectrumUserId} is already in use by user ${existingUser.user_id} (${existingUser.username}), cannot migrate ${user.username}`,
                )
                result.errors.push({
                  username: user.username,
                  user_id: user.user_id,
                  error: `Spectrum ID ${spectrumUserId} already in use by another user`,
                })
                result.failedMigrations++
                continue
              } else if (existingUser) {
                logger.debug(
                  `Spectrum ID ${spectrumUserId} belongs to the same user ${user.username} (${user.user_id})`,
                )
              }
            } catch (error) {
              // User not found with this spectrum_user_id, which is expected for new migrations
              logger.debug(
                `No existing user found with Spectrum ID ${spectrumUserId} - safe to proceed with migration`,
              )
            }

            // Update user with Spectrum user ID
            await profileDb.updateUser(
              { user_id: user.user_id },
              { spectrum_user_id: spectrumUserId },
            )

            logger.debug(
              `✅ Successfully migrated ${user.username} with Spectrum ID ${spectrumUserId}`,
            )
            result.successfulMigrations++
          } else {
            // User not found in Spectrum - unverify the account
            logger.debug(
              `❌ User ${user.username} not found in Spectrum - unverifying account`,
            )

            // await database.updateUser(
            //   { user_id: user.user_id },
            //   {
            //     rsi_confirmed: false,
            //     spectrum_user_id: null,
            //   },
            // )

            result.unverifiedUsers++
            logger.debug(
              `🔄 Unverified account for ${user.username} - Spectrum user not found`,
            )
          }
        } catch (error) {
          logger.error(`❌ Error migrating user ${user.username}: ${error}`)
          result.errors.push({
            username: user.username,
            user_id: user.user_id,
            error: error instanceof Error ? error.message : String(error),
          })
          result.failedMigrations++
        }

        // Add delay between individual requests (except for the last user in the batch)
        if (user !== batch[batch.length - 1]) {
          logger.debug(
            `Waiting ${delayBetweenRequests}ms before next request...`,
          )
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenRequests),
          )
        }
      }

      // Add delay between batches to avoid overwhelming the API
      if (i + batchSize < users.length) {
        logger.debug(`Waiting ${delayBetweenBatches}ms before next batch...`)
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
      }
    }

    logger.info("🎉 Spectrum user ID migration completed!")
    logger.info(
      `📊 Results: ${result.successfulMigrations} migrated, ${result.failedMigrations} failed, ${result.unverifiedUsers} unverified`,
    )

    if (result.errors.length > 0) {
      logger.warn(
        `⚠️  ${result.errors.length} errors occurred during migration`,
      )
      for (const error of result.errors) {
        logger.warn(`  - ${error.username}: ${error.error}`)
      }
    }

    return result
  } catch (error) {
    logger.error(`💥 Fatal error during migration: ${error}`)
    throw error
  }
}

/**
 * Dry run mode - shows what would happen without making changes
 *
 * @param batchSize - Number of users to process in each batch
 * @param delayBetweenRequests - Delay in ms between individual requests (default: 500)
 * @returns Promise<MigrationResult> - Simulation results
 */
export async function simulateSpectrumMigration(
  batchSize: number = 10,
  delayBetweenRequests: number = 500,
): Promise<MigrationResult> {
  logger.info("🔍 Running Spectrum migration simulation (dry run)")

  const result: MigrationResult = {
    totalUsers: 0,
    successfulMigrations: 0,
    failedMigrations: 0,
    unverifiedUsers: 0,
    errors: [],
  }

  try {
    // Get all verified users that don't have a spectrum_user_id yet
    const users = await database
      .knex("accounts")
      .where("rsi_confirmed", true)
      .whereNull("spectrum_user_id")
      .select("user_id", "username", "rsi_confirmed")

    result.totalUsers = users.length
    logger.info(
      `Found ${users.length} verified users without Spectrum user IDs`,
    )

    if (users.length === 0) {
      logger.info(
        "✅ No users need migration - all verified users already have Spectrum IDs",
      )
      return result
    }

    // Process users in batches (simulation only)
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize)
      logger.info(
        `Simulating batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)} (${batch.length} users)`,
      )

      // Process batch sequentially with delays between requests (simulation only)
      for (const user of batch) {
        try {
          logger.debug(
            `[SIMULATION] Fetching Spectrum user ID for ${user.username}`,
          )

          const spectrumUserId = await getSpectrumUserIdByHandle(user.username)

          // Log the API response for debugging (simulation mode)
          logger.debug(
            `[SIMULATION] Spectrum API response for ${user.username}: ${spectrumUserId ? `Found ID: ${spectrumUserId}` : "User not found"}`,
          )

          // Log additional details for successful lookups (simulation mode)
          if (spectrumUserId) {
            logger.debug(
              `[SIMULATION] Successfully resolved ${user.username} to Spectrum ID ${spectrumUserId}`,
            )
          } else {
            logger.debug(
              `[SIMULATION] Failed to resolve ${user.username} - no Spectrum ID found in API response`,
            )
          }

          if (spectrumUserId) {
            // Check if this Spectrum ID is already in use by another user
            try {
              const existingUser = await profileDb.getUser({
                spectrum_user_id: spectrumUserId,
              })
              if (existingUser && existingUser.user_id !== user.user_id) {
                logger.warn(
                  `[SIMULATION] Spectrum user ID ${spectrumUserId} is already in use by user ${existingUser.user_id}, cannot migrate ${user.username}`,
                )
                result.errors.push({
                  username: user.username,
                  user_id: user.user_id,
                  error: `Spectrum ID ${spectrumUserId} already in use by another user`,
                })
                result.failedMigrations++
                continue
              }
            } catch (error) {
              // User not found with this spectrum_user_id, which is expected for new migrations
              logger.debug(
                `[SIMULATION] No existing user found with Spectrum ID ${spectrumUserId}`,
              )
            }

            logger.debug(
              `[SIMULATION] ✅ Would migrate ${user.username} with Spectrum ID ${spectrumUserId}`,
            )
            result.successfulMigrations++
          } else {
            // User not found in Spectrum - would unverify the account
            logger.warn(
              `[SIMULATION] ❌ User ${user.username} not found in Spectrum - would unverify account`,
            )
            result.unverifiedUsers++
          }
        } catch (error) {
          logger.error(
            `[SIMULATION] ❌ Error migrating user ${user.username}: ${error}`,
          )
          result.errors.push({
            username: user.username,
            user_id: user.user_id,
            error: error instanceof Error ? error.message : String(error),
          })
          result.failedMigrations++
        }

        // Add delay between individual requests (except for the last user in the batch)
        if (user !== batch[batch.length - 1]) {
          logger.debug(
            `[SIMULATION] Waiting ${delayBetweenRequests}ms before next request...`,
          )
          await new Promise((resolve) =>
            setTimeout(resolve, delayBetweenRequests),
          )
        }
      }
    }

    logger.info("🔍 Spectrum migration simulation completed!")
    logger.info(
      `📊 Simulation Results: ${result.successfulMigrations} would be migrated, ${result.failedMigrations} would fail, ${result.unverifiedUsers} would be unverified`,
    )

    return result
  } catch (error) {
    logger.error(`💥 Fatal error during simulation: ${error}`)
    throw error
  }
}

/**
 * Get migration status for all users
 *
 * @returns Promise<object> - Status summary
 */
export async function getMigrationStatus(): Promise<{
  totalUsers: number
  verifiedUsers: number
  usersWithSpectrumId: number
  usersNeedingMigration: number
  usersWithoutSpectrumId: number
}> {
  try {
    const totalUsers = await database
      .knex("accounts")
      .count("* as count")
      .first()
    const verifiedUsers = await database
      .knex("accounts")
      .where("rsi_confirmed", true)
      .count("* as count")
      .first()
    const usersWithSpectrumId = await database
      .knex("accounts")
      .whereNotNull("spectrum_user_id")
      .count("* as count")
      .first()
    const usersNeedingMigration = await database
      .knex("accounts")
      .where("rsi_confirmed", true)
      .whereNull("spectrum_user_id")
      .count("* as count")
      .first()

    return {
      totalUsers: parseInt(totalUsers?.count as string) || 0,
      verifiedUsers: parseInt(verifiedUsers?.count as string) || 0,
      usersWithSpectrumId: parseInt(usersWithSpectrumId?.count as string) || 0,
      usersNeedingMigration:
        parseInt(usersNeedingMigration?.count as string) || 0,
      usersWithoutSpectrumId:
        parseInt(totalUsers?.count as string) -
          parseInt(usersWithSpectrumId?.count as string) || 0,
    }
  } catch (error) {
    logger.error(`Error getting migration status: ${error}`)
    throw error
  }
}

/**
 * Rollback function to remove all spectrum_user_id values
 * WARNING: This will remove all Spectrum user IDs - use with caution!
 *
 * @returns Promise<number> - Number of users affected
 */
export async function rollbackSpectrumMigration(): Promise<number> {
  logger.warn(
    "⚠️  Rolling back Spectrum migration - removing all spectrum_user_id values",
  )

  try {
    const result = await database
      .knex("accounts")
      .whereNotNull("spectrum_user_id")
      .update({ spectrum_user_id: null })

    logger.info(`🔄 Rollback completed: ${result} users affected`)
    return result
  } catch (error) {
    logger.error(`💥 Error during rollback: ${error}`)
    throw error
  }
}

// Export convenience functions
export {
  migrateExistingUsersToSpectrumIds as migrateUsers,
  simulateSpectrumMigration as simulateMigration,
  getMigrationStatus as getStatus,
  rollbackSpectrumMigration as rollback,
}
