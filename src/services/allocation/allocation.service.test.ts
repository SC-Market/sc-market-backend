/**
 * Allocation Service Tests
 *
 * Unit tests for allocation service functionality.
 *
 * Note: These tests focus on the business logic and error handling.
 * Integration tests with real database transactions should be added separately.
 */

import { describe, it, expect } from "vitest"
import {
  InsufficientStockError,
  AllocationValidationError,
} from "./allocation.service.js"

describe("AllocationService", () => {
  describe("Error Classes", () => {
    it("should create InsufficientStockError with correct properties", () => {
      const error = new InsufficientStockError(100, 50, "listing-1")

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("InsufficientStockError")
      expect(error.requested).toBe(100)
      expect(error.available).toBe(50)
      expect(error.listingId).toBe("listing-1")
      expect(error.message).toContain("Insufficient stock")
      expect(error.message).toContain("100")
      expect(error.message).toContain("50")
    })

    it("should create AllocationValidationError with correct properties", () => {
      const error = new AllocationValidationError("Invalid allocation")

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("AllocationValidationError")
      expect(error.message).toBe("Invalid allocation")
    })
  })

  describe("Error Classes", () => {
    it("should create InsufficientStockError with correct properties", () => {
      const error = new InsufficientStockError(100, 50, "listing-1")

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("InsufficientStockError")
      expect(error.requested).toBe(100)
      expect(error.available).toBe(50)
      expect(error.listingId).toBe("listing-1")
      expect(error.message).toContain("Insufficient stock")
      expect(error.message).toContain("100")
      expect(error.message).toContain("50")
    })

    it("should create AllocationValidationError with correct properties", () => {
      const error = new AllocationValidationError("Invalid allocation")

      expect(error).toBeInstanceOf(Error)
      expect(error.name).toBe("AllocationValidationError")
      expect(error.message).toBe("Invalid allocation")
    })
  })

  // Note: Full integration tests with database transactions should be added
  // in a separate integration test suite. These unit tests verify the error
  // handling and type definitions are correct.
})
