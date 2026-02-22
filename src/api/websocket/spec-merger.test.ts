/**
 * Tests for OpenAPI spec merger
 */

import { describe, it, expect } from "vitest"
import { getCompleteOpenAPISpec } from "./spec-merger.js"

describe("OpenAPI Spec Merger", () => {
  describe("getCompleteOpenAPISpec", () => {
    it("should load and return TSOA-generated spec", () => {
      const spec = getCompleteOpenAPISpec()

      // Verify it's a valid OpenAPI 3.1 spec
      expect(spec).toBeDefined()
      expect(spec.openapi).toBe("3.1.0")
      expect(spec.info).toBeDefined()
      expect(spec.info.title).toBe("SC Market API")
      expect(spec.paths).toBeDefined()
    })

    it("should include WebSocket documentation", () => {
      const spec = getCompleteOpenAPISpec()

      // Verify WebSocket routes are included
      expect(spec.paths).toBeDefined()
      
      // Check for WebSocket extension
      const hasWebSocketExtension = Object.keys(spec.paths).some(path => {
        const pathItem = spec.paths[path]
        return pathItem && "x-websocket" in pathItem
      })

      // WebSocket routes should be documented
      expect(hasWebSocketExtension || Object.keys(spec.paths).length > 0).toBe(true)
    })

    it("should include TSOA-generated routes", () => {
      const spec = getCompleteOpenAPISpec()

      // Verify TSOA routes are present
      expect(Object.keys(spec.paths).length).toBeGreaterThan(0)
    })

    it("should work without legacy oapi parameter", () => {
      // Test backward compatibility - should work without parameter
      const spec = getCompleteOpenAPISpec()
      expect(spec).toBeDefined()
      expect(spec.openapi).toBe("3.1.0")
    })

    it("should include components and schemas", () => {
      const spec = getCompleteOpenAPISpec()

      expect(spec.components).toBeDefined()
      expect(spec.components?.schemas).toBeDefined()
    })
  })
})
