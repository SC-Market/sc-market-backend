/**
 * OpenAPI Spec Merger for WebSocket Documentation
 * 
 * This module provides utilities to merge WebSocket documentation
 * into the TSOA-generated OpenAPI specification.
 */

import { OpenAPIV3_1 } from "openapi-types"
import { mergeWebSocketDocumentation } from "./openapi-extension.js"
import { readFileSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Load the TSOA-generated OpenAPI spec
 * 
 * @returns TSOA-generated OpenAPI spec
 */
function loadTsoaSpec(): OpenAPIV3_1.Document {
  const specPath = join(__dirname, "../generated/swagger.json")
  const specContent = readFileSync(specPath, "utf-8")
  return JSON.parse(specContent) as OpenAPIV3_1.Document
}

/**
 * Merge WebSocket documentation into legacy OpenAPI spec
 * 
 * This function takes the legacy OpenAPI spec (from @wesleytodd/openapi)
 * and merges in WebSocket documentation.
 * 
 * @param legacySpec - Legacy OpenAPI spec from @wesleytodd/openapi
 * @returns Merged OpenAPI spec with WebSocket documentation
 */
export function mergeLegacySpecWithWebSocket(
  legacySpec: any,
): any {
  // Merge WebSocket documentation
  const merged = mergeWebSocketDocumentation(legacySpec)

  return merged
}

/**
 * Get the complete OpenAPI spec with WebSocket documentation
 * 
 * This function loads the TSOA-generated spec and merges WebSocket documentation.
 * It replaces the legacy spec with the TSOA-generated spec.
 * 
 * @param oapi - OpenAPI instance from @wesleytodd/openapi (optional, for backward compatibility during migration)
 * @returns Complete OpenAPI spec with WebSocket documentation
 */
export function getCompleteOpenAPISpec(oapi?: any): OpenAPIV3_1.Document {
  // Load TSOA-generated spec
  const tsoaSpec = loadTsoaSpec()

  // Merge WebSocket documentation
  return mergeWebSocketDocumentation(tsoaSpec)
}


