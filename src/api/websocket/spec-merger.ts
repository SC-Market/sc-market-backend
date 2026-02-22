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
export function loadTsoaSpec(): OpenAPIV3_1.Document {
  const specPath = join(__dirname, "../generated/swagger.json")
  const specContent = readFileSync(specPath, "utf-8")
  return JSON.parse(specContent) as OpenAPIV3_1.Document
}

/**
 * Get the complete OpenAPI spec with WebSocket documentation
 * 
 * This function loads the TSOA-generated spec and merges WebSocket documentation.
 * 
 * @returns Complete OpenAPI spec with WebSocket documentation
 */
export function getCompleteOpenAPISpec(): OpenAPIV3_1.Document {
  // Load TSOA-generated spec
  const tsoaSpec = loadTsoaSpec()

  // Merge WebSocket documentation
  return mergeWebSocketDocumentation(tsoaSpec)
}


