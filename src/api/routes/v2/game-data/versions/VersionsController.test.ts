/**
 * Unit tests for VersionsController
 *
 * Tests version listing, active version retrieval, and version selection.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { getKnex } from "../../../../../clients/database/knex-db.js"
import { VersionsController } from "./VersionsController.js"

describe("VersionsController", () => {
  let controller: VersionsController
  let testLiveVersionId: string
  let testPtuVersionId: string
  let testEptuVersionId: string

  beforeAll(async () => {
    controller = new VersionsController()
    const knex = getKnex()

    // Create test LIVE version
    const [liveVersion] = await knex("game_versions")
      .insert({
        version_type: "LIVE",
        version_number: "4.7.0",
        build_number: "11592622",
        release_date: new Date("2024-01-15"),
        is_active: true,
        last_data_update: new Date("2024-01-20"),
      })
      .returning("*")

    testLiveVersionId = liveVersion.version_id

    // Create test PTU version
    const [ptuVersion] = await knex("game_versions")
      .insert({
        version_type: "PTU",
        version_number: "4.8.0",
        build_number: "11600000",
        release_date: new Date("2024-02-01"),
        is_active: true,
        last_data_update: new Date("2024-02-05"),
      })
      .returning("*")

    testPtuVersionId = ptuVersion.version_id

    // Create test EPTU version
    const [eptuVersion] = await knex("game_versions")
      .insert({
        version_type: "EPTU",
        version_number: "4.9.0",
        build_number: "11610000",
        release_date: new Date("2024-03-01"),
        is_active: true,
        last_data_update: new Date("2024-03-02"),
      })
      .returning("*")

    testEptuVersionId = eptuVersion.version_id

    // Create an inactive version for testing
    await knex("game_versions").insert({
      version_type: "LIVE",
      version_number: "4.6.0",
      build_number: "11500000",
      release_date: new Date("2023-12-01"),
      is_active: false,
      last_data_update: new Date("2023-12-15"),
    })
  })

  afterAll(async () => {
    const knex = getKnex()

    // Clean up test data
    await knex("game_versions")
      .whereIn("version_id", [testLiveVersionId, testPtuVersionId, testEptuVersionId])
      .del()

    // Clean up inactive version
    await knex("game_versions").where("version_number", "4.6.0").del()
  })

  describe("listVersions", () => {
    it("should return all game versions", async () => {
      const result = await controller.listVersions()

      expect(result).toBeDefined()
      expect(result).toBeInstanceOf(Array)
      expect(result.length).toBeGreaterThanOrEqual(4) // 3 active + 1 inactive
    })

    it("should include all version types", async () => {
      const result = await controller.listVersions()

      const liveVersions = result.filter((v) => v.version_type === "LIVE")
      const ptuVersions = result.filter((v) => v.version_type === "PTU")
      const eptuVersions = result.filter((v) => v.version_type === "EPTU")

      expect(liveVersions.length).toBeGreaterThanOrEqual(1)
      expect(ptuVersions.length).toBeGreaterThanOrEqual(1)
      expect(eptuVersions.length).toBeGreaterThanOrEqual(1)
    })

    it("should include version metadata", async () => {
      const result = await controller.listVersions()

      const liveVersion = result.find((v) => v.version_id === testLiveVersionId)
      expect(liveVersion).toBeDefined()
      expect(liveVersion!.version_type).toBe("LIVE")
      expect(liveVersion!.version_number).toBe("4.7.0")
      expect(liveVersion!.build_number).toBe("11592622")
      expect(liveVersion!.is_active).toBe(true)
      expect(liveVersion!.release_date).toBeDefined()
      expect(liveVersion!.last_data_update).toBeDefined()
      expect(liveVersion!.created_at).toBeDefined()
      expect(liveVersion!.updated_at).toBeDefined()
    })

    it("should include both active and inactive versions", async () => {
      const result = await controller.listVersions()

      const activeVersions = result.filter((v) => v.is_active)
      const inactiveVersions = result.filter((v) => !v.is_active)

      expect(activeVersions.length).toBeGreaterThanOrEqual(3)
      expect(inactiveVersions.length).toBeGreaterThanOrEqual(1)
    })

    it("should sort versions by type and creation date", async () => {
      const result = await controller.listVersions()

      // Verify EPTU comes before LIVE which comes before PTU (alphabetical)
      const eptuIndex = result.findIndex((v) => v.version_type === "EPTU")
      const liveIndex = result.findIndex((v) => v.version_type === "LIVE")
      const ptuIndex = result.findIndex((v) => v.version_type === "PTU")

      expect(eptuIndex).toBeLessThan(liveIndex)
      expect(liveIndex).toBeLessThan(ptuIndex)
    })
  })

  describe("getActiveVersions", () => {
    it("should return active versions by type", async () => {
      const result = await controller.getActiveVersions()

      expect(result).toBeDefined()
      expect(result.LIVE).toBeDefined()
      expect(result.PTU).toBeDefined()
      expect(result.EPTU).toBeDefined()
    })

    it("should return correct LIVE version", async () => {
      const result = await controller.getActiveVersions()

      expect(result.LIVE).toBeDefined()
      expect(result.LIVE!.version_id).toBe(testLiveVersionId)
      expect(result.LIVE!.version_type).toBe("LIVE")
      expect(result.LIVE!.version_number).toBe("4.7.0")
      expect(result.LIVE!.build_number).toBe("11592622")
      expect(result.LIVE!.is_active).toBe(true)
    })

    it("should return correct PTU version", async () => {
      const result = await controller.getActiveVersions()

      expect(result.PTU).toBeDefined()
      expect(result.PTU!.version_id).toBe(testPtuVersionId)
      expect(result.PTU!.version_type).toBe("PTU")
      expect(result.PTU!.version_number).toBe("4.8.0")
      expect(result.PTU!.build_number).toBe("11600000")
      expect(result.PTU!.is_active).toBe(true)
    })

    it("should return correct EPTU version", async () => {
      const result = await controller.getActiveVersions()

      expect(result.EPTU).toBeDefined()
      expect(result.EPTU!.version_id).toBe(testEptuVersionId)
      expect(result.EPTU!.version_type).toBe("EPTU")
      expect(result.EPTU!.version_number).toBe("4.9.0")
      expect(result.EPTU!.build_number).toBe("11610000")
      expect(result.EPTU!.is_active).toBe(true)
    })

    it("should include last_data_update timestamps", async () => {
      const result = await controller.getActiveVersions()

      expect(result.LIVE!.last_data_update).toBeDefined()
      expect(result.PTU!.last_data_update).toBeDefined()
      expect(result.EPTU!.last_data_update).toBeDefined()
    })

    it("should only return active versions", async () => {
      const result = await controller.getActiveVersions()

      const allVersions = Object.values(result).filter((v) => v !== undefined)
      allVersions.forEach((version) => {
        expect(version!.is_active).toBe(true)
      })
    })
  })

  describe("selectVersion", () => {
    it("should successfully select a valid version", async () => {
      // Mock authentication context
      ;(controller as any).user = { user_id: "test-user-123" }

      const result = await controller.selectVersion({
        version_id: testLiveVersionId,
      })

      expect(result).toBeDefined()
      expect(result.success).toBe(true)
      expect(result.version).toBeDefined()
      expect(result.version!.version_id).toBe(testLiveVersionId)
      expect(result.version!.version_type).toBe("LIVE")
    })

    it("should return complete version details", async () => {
      ;(controller as any).user = { user_id: "test-user-123" }

      const result = await controller.selectVersion({
        version_id: testPtuVersionId,
      })

      expect(result.version).toBeDefined()
      expect(result.version!.version_number).toBe("4.8.0")
      expect(result.version!.build_number).toBe("11600000")
      expect(result.version!.release_date).toBeDefined()
      expect(result.version!.last_data_update).toBeDefined()
    })

    it("should throw error for non-existent version", async () => {
      ;(controller as any).user = { user_id: "test-user-123" }

      const fakeVersionId = "00000000-0000-0000-0000-000000000000"

      await expect(
        controller.selectVersion({
          version_id: fakeVersionId,
        }),
      ).rejects.toThrow()
    })

    it("should throw validation error for missing version_id", async () => {
      ;(controller as any).user = { user_id: "test-user-123" }

      await expect(
        controller.selectVersion({
          version_id: "",
        }),
      ).rejects.toThrow()
    })

    it("should throw unauthorized error when user not authenticated", async () => {
      // Clear authentication context
      ;(controller as any).user = undefined

      await expect(
        controller.selectVersion({
          version_id: testLiveVersionId,
        }),
      ).rejects.toThrow()
    })

    it("should allow selecting inactive version", async () => {
      ;(controller as any).user = { user_id: "test-user-123" }

      const knex = getKnex()
      const inactiveVersion = await knex("game_versions")
        .where("version_number", "4.6.0")
        .first()

      const result = await controller.selectVersion({
        version_id: inactiveVersion.version_id,
      })

      expect(result.success).toBe(true)
      expect(result.version!.is_active).toBe(false)
    })

    it("should work for all version types", async () => {
      ;(controller as any).user = { user_id: "test-user-123" }

      // Test LIVE
      const liveResult = await controller.selectVersion({
        version_id: testLiveVersionId,
      })
      expect(liveResult.success).toBe(true)
      expect(liveResult.version!.version_type).toBe("LIVE")

      // Test PTU
      const ptuResult = await controller.selectVersion({
        version_id: testPtuVersionId,
      })
      expect(ptuResult.success).toBe(true)
      expect(ptuResult.version!.version_type).toBe("PTU")

      // Test EPTU
      const eptuResult = await controller.selectVersion({
        version_id: testEptuVersionId,
      })
      expect(eptuResult.success).toBe(true)
      expect(eptuResult.version!.version_type).toBe("EPTU")
    })
  })
})
