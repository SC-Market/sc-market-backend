/**
 * Allocation Mode Service
 *
 * Manages allocation mode settings for users and contractors.
 * Supports three modes:
 * - 'auto': Automatically allocate stock when orders are created (default)
 * - 'manual': Wait for seller to manually allocate via UI
 * - 'none': No physical allocation (legacy behavior)
 */

import * as orderDb from "../../api/routes/v1/orders/database.js"
import { DBOrderSetting } from "../../clients/database/db-models.js"

export type AllocationMode = "auto" | "manual" | "none"

const DEFAULT_ALLOCATION_MODE: AllocationMode = "auto"

/**
 * Get allocation mode for an entity (user or contractor).
 * Returns 'auto' if no setting exists.
 */
export async function getAllocationMode(
  entityType: "user" | "contractor",
  entityId: string,
): Promise<AllocationMode> {
  const setting = await orderDb.getOrderSetting(
    entityType,
    entityId,
    "allocation_mode",
  )

  if (!setting || !setting.enabled) {
    return DEFAULT_ALLOCATION_MODE
  }

  const mode = setting.message_content as AllocationMode
  if (mode !== "auto" && mode !== "manual" && mode !== "none") {
    return DEFAULT_ALLOCATION_MODE
  }

  return mode
}

/**
 * Set allocation mode for an entity (user or contractor).
 */
export async function setAllocationMode(
  entityType: "user" | "contractor",
  entityId: string,
  mode: AllocationMode,
): Promise<DBOrderSetting> {
  // Validate mode
  if (mode !== "auto" && mode !== "manual" && mode !== "none") {
    throw new Error(
      `Invalid allocation mode: ${mode}. Must be 'auto', 'manual', or 'none'.`,
    )
  }

  // Check if setting already exists
  const existing = await orderDb.getOrderSetting(
    entityType,
    entityId,
    "allocation_mode",
  )

  if (existing) {
    // Update existing setting
    return orderDb.updateOrderSetting(existing.id, {
      message_content: mode,
      enabled: true,
    })
  } else {
    // Create new setting
    return orderDb.createOrderSetting({
      entity_type: entityType,
      entity_id: entityId,
      setting_type: "allocation_mode",
      message_content: mode,
      enabled: true,
    })
  }
}

/**
 * Get allocation mode for a listing based on seller (contractor or user).
 * Prioritizes contractor settings over user settings.
 */
export async function getAllocationModeForListing(
  contractorId: string | null,
  userId: string | null,
): Promise<AllocationMode> {
  // If there's a contractor, use contractor settings
  if (contractorId) {
    return getAllocationMode("contractor", contractorId)
  }

  // Otherwise use user settings
  if (userId) {
    return getAllocationMode("user", userId)
  }

  // Default if neither is provided
  return DEFAULT_ALLOCATION_MODE
}
