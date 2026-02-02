/**
 * Location Service Tests
 * 
 * Unit tests for location service functionality.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { LocationService } from "./location.service.js"
import { LocationRepository } from "./repository.js"
import { DBLocation } from "./types.js"

describe("LocationService", () => {
  let service: LocationService
  let mockRepository: LocationRepository

  // Mock data
  const mockPresetLocations: DBLocation[] = [
    {
      location_id: "loc-1",
      name: "Unspecified",
      is_preset: true,
      display_order: 0,
      created_by: null,
      created_at: new Date("2024-01-01"),
    },
    {
      location_id: "loc-2",
      name: "Orison",
      is_preset: true,
      display_order: 10,
      created_by: null,
      created_at: new Date("2024-01-01"),
    },
    {
      location_id: "loc-3",
      name: "Lorville",
      is_preset: true,
      display_order: 20,
      created_by: null,
      created_at: new Date("2024-01-01"),
    },
  ]

  const mockCustomLocations: DBLocation[] = [
    {
      location_id: "loc-4",
      name: "My Warehouse",
      is_preset: false,
      display_order: null,
      created_by: "user-1",
      created_at: new Date("2024-01-02"),
    },
  ]

  beforeEach(() => {
    // Create a mock repository
    mockRepository = {
      getById: async (id: string) => {
        const allLocations = [...mockPresetLocations, ...mockCustomLocations]
        return allLocations.find((loc) => loc.location_id === id) || null
      },
      getByName: async (name: string) => {
        return mockPresetLocations.find((loc) => loc.name === name) || null
      },
      getPresetLocations: async () => mockPresetLocations,
      getUserLocations: async (userId: string) => {
        return mockCustomLocations.filter((loc) => loc.created_by === userId)
      },
      searchLocations: async (filters) => {
        let results = [...mockPresetLocations]
        
        if (filters.user_id && !filters.preset_only) {
          const userLocs = mockCustomLocations.filter(
            (loc) => loc.created_by === filters.user_id
          )
          results = [...results, ...userLocs]
        }
        
        if (filters.search) {
          const searchLower = filters.search.toLowerCase()
          results = results.filter((loc) =>
            loc.name.toLowerCase().includes(searchLower)
          )
        }
        
        return results
      },
      createCustomLocation: async (input) => {
        const newLocation: DBLocation = {
          location_id: `loc-${Date.now()}`,
          name: input.name,
          is_preset: false,
          display_order: null,
          created_by: input.created_by,
          created_at: new Date(),
        }
        return newLocation
      },
      locationExistsForUser: async (name: string, userId: string) => {
        return mockCustomLocations.some(
          (loc) => loc.name === name && loc.created_by === userId
        )
      },
      presetLocationExists: async (name: string) => {
        return mockPresetLocations.some((loc) => loc.name === name)
      },
    } as LocationRepository

    service = new LocationService(mockRepository)
  })

  describe("searchLocations", () => {
    it("should return preset locations when no user specified", async () => {
      const results = await service.searchLocations()
      
      expect(results).toHaveLength(3)
      expect(results.every((loc) => loc.is_preset)).toBe(true)
    })

    it("should return preset and user custom locations when user specified", async () => {
      const results = await service.searchLocations(undefined, "user-1")
      
      expect(results).toHaveLength(4)
      expect(results.filter((loc) => loc.is_preset)).toHaveLength(3)
      expect(results.filter((loc) => !loc.is_preset)).toHaveLength(1)
    })

    it("should filter locations by search term", async () => {
      const results = await service.searchLocations("oris", "user-1")
      
      expect(results).toHaveLength(1) // Only Orison
      expect(results[0].name).toBe("Orison")
    })

    it("should return only preset locations when presetOnly is true", async () => {
      const results = await service.searchLocations(undefined, "user-1", true)
      
      expect(results).toHaveLength(3)
      expect(results.every((loc) => loc.is_preset)).toBe(true)
    })
  })

  describe("createCustomLocation", () => {
    it("should create a custom location with valid name", async () => {
      const result = await service.createCustomLocation("My Storage", "user-2")
      
      expect(result.name).toBe("My Storage")
      expect(result.is_preset).toBe(false)
      expect(result.created_by).toBe("user-2")
    })

    it("should trim whitespace from location name", async () => {
      const result = await service.createCustomLocation("  Spaced  ", "user-2")
      
      expect(result.name).toBe("Spaced")
    })

    it("should reject empty location name", async () => {
      await expect(
        service.createCustomLocation("", "user-2")
      ).rejects.toThrow("Location name cannot be empty")
    })

    it("should reject location name exceeding 255 characters", async () => {
      const longName = "a".repeat(256)
      
      await expect(
        service.createCustomLocation(longName, "user-2")
      ).rejects.toThrow("Location name cannot exceed 255 characters")
    })

    it("should reject duplicate preset location name", async () => {
      await expect(
        service.createCustomLocation("Orison", "user-2")
      ).rejects.toThrow("A preset location with this name already exists")
    })

    it("should reject duplicate custom location name for same user", async () => {
      await expect(
        service.createCustomLocation("My Warehouse", "user-1")
      ).rejects.toThrow("You already have a custom location with this name")
    })
  })

  describe("getPresetLocations", () => {
    it("should return all preset locations", async () => {
      const results = await service.getPresetLocations()
      
      expect(results).toHaveLength(3)
      expect(results.every((loc) => loc.is_preset)).toBe(true)
    })
  })

  describe("getUserLocations", () => {
    it("should return custom locations for specified user", async () => {
      const results = await service.getUserLocations("user-1")
      
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe("My Warehouse")
      expect(results[0].created_by).toBe("user-1")
    })

    it("should return empty array for user with no custom locations", async () => {
      const results = await service.getUserLocations("user-2")
      
      expect(results).toHaveLength(0)
    })
  })

  describe("getUnspecifiedLocation", () => {
    it("should return the Unspecified location", async () => {
      const result = await service.getUnspecifiedLocation()
      
      expect(result).not.toBeNull()
      expect(result?.name).toBe("Unspecified")
      expect(result?.is_preset).toBe(true)
    })
  })
})
