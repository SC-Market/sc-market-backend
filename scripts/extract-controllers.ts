#!/usr/bin/env tsx

import { readFileSync, writeFileSync, existsSync } from "fs"
import { join, dirname } from "path"
import { parse } from "@typescript-eslint/typescript-estree"
import { TSESTree } from "@typescript-eslint/typescript-estree"
import { execSync } from "child_process"

interface HandlerInfo {
  method: string
  path: string
  middleware: string[]
  openApiConfig: any
  openApiConfigSource: string
  openApiConfigName: string
  handlerFunction:
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression
  handlerName: string
  startLine: number
  endLine: number
  functionSource: string
  handlerSource: string // Just the handler function part
}

interface SchemaInfo {
  schemaName: string
  schemaSource: string
  startLine: number
  endLine: number
}

interface RouteFileInfo {
  filePath: string
  routerNames: string[]
  imports: string[]
  existingControllerImports: string[]
  handlers: HandlerInfo[]
  openApiSpecs: HandlerInfo[]
  schemas: SchemaInfo[]
  originalContent: string
}

/**
 * Controller Extractor - Extracts inline request handlers from Express route files
 * and converts them to controller functions.
 *
 * This script uses AST parsing to:
 * 1. Find inline async handler functions in route definitions
 * 2. Extract them to a separate controller file
 * 3. Update the route file to import and use the controller functions
 * 4. Skip handlers that are already imported from controller files
 */
class ControllerExtractor {
  private routeFile: string
  private outputDir: string

  constructor(routeFile: string, outputDir?: string) {
    this.routeFile = routeFile
    this.outputDir = outputDir || dirname(routeFile)
  }

  async extract(): Promise<void> {
    console.log(`Extracting controllers from: ${this.routeFile}`)

    const routeInfo = this.parseRouteFile()

    if (routeInfo.handlers.length === 0) {
      console.log("No inline handlers found to extract")
    }

    console.log(
      `Found ${routeInfo.handlers.length} inline handlers to extract:`,
    )
    routeInfo.handlers.forEach((h) =>
      console.log(`  - ${h.handlerName} (${h.method} ${h.path})`),
    )

    // Generate controller file content to append (only if handlers exist)
    if (routeInfo.handlers.length > 0) {
      const controllerContent = this.generateControllerFile(routeInfo)
      const controllerPath = join(this.outputDir, "controller.ts")

      // Append to existing controller file or create new one
      if (existsSync(controllerPath)) {
        const existingContent = readFileSync(controllerPath, "utf-8")
        const newContent = existingContent + "\n" + controllerContent
        writeFileSync(controllerPath, newContent)
        console.log(`Appended to controller file: ${controllerPath}`)
      } else {
        writeFileSync(controllerPath, controllerContent)
        console.log(`Generated controller file: ${controllerPath}`)
      }
    }

    // Generate OpenAPI specs file content to append (if specs or schemas exist)
    if (routeInfo.openApiSpecs.length > 0 || routeInfo.schemas.length > 0) {
      console.log(
        `Found ${routeInfo.openApiSpecs.length} OpenAPI specs and ${routeInfo.schemas.length} schemas to extract`,
      )

      const openApiContent = this.generateOpenApiFile(routeInfo)
      const openApiPath = join(this.outputDir, "openapi.ts")

      // Append to existing OpenAPI file or create new one
      if (existsSync(openApiPath)) {
        const existingContent = readFileSync(openApiPath, "utf-8")
        const newContent = existingContent + "\n" + openApiContent
        writeFileSync(openApiPath, newContent)
        console.log(`Appended to OpenAPI file: ${openApiPath}`)
      } else {
        writeFileSync(openApiPath, openApiContent)
        console.log(`Generated OpenAPI file: ${openApiPath}`)
      }
    } else {
      console.log("No OpenAPI specs or schemas found to extract")
    }

    // Update route file
    const updatedRouteContent = this.updateRouteFile(routeInfo)
    writeFileSync(this.routeFile, updatedRouteContent)
    console.log(`Updated route file: ${this.routeFile}`)

    // Format files with prettier
    const filesToFormat = [this.routeFile]
    if (routeInfo.handlers.length > 0) {
      filesToFormat.push(join(this.outputDir, "controller.ts"))
    }
    if (routeInfo.openApiSpecs.length > 0 || routeInfo.schemas.length > 0) {
      filesToFormat.push(join(this.outputDir, "openapi.ts"))
    }
    this.formatFiles(filesToFormat)
  }

  private parseRouteFile(): RouteFileInfo {
    const content = readFileSync(this.routeFile, "utf-8")
    const ast = parse(content, {
      loc: true,
      range: true,
      tokens: true,
      comment: true,
      jsx: false,
      useJSXTextNode: false,
      project: "./tsconfig.json",
    })

    const routeInfo: RouteFileInfo = {
      filePath: this.routeFile,
      routerNames: [],
      imports: [],
      existingControllerImports: [],
      handlers: [],
      openApiSpecs: [],
      schemas: [],
      originalContent: content,
    }

    // Extract imports and router name
    this.extractImportsAndRouter(ast, routeInfo)

    // Extract handlers
    this.extractHandlers(ast, routeInfo)

    // Extract schema definitions
    this.extractSchemas(ast, routeInfo)

    // Extract OpenAPI specs (even if no handlers)
    this.extractOpenApiSpecs(ast, routeInfo)

    // Deduplicate results
    this.deduplicateResults(routeInfo)

    return routeInfo
  }

  private extractImportsAndRouter(
    ast: TSESTree.Node,
    routeInfo: RouteFileInfo,
  ): void {
    const visitor = (node: TSESTree.Node) => {
      if (node.type === "ImportDeclaration") {
        const source = node.source.value as string
        const specifiers = node.specifiers
          .map((spec) => {
            if (spec.type === "ImportDefaultSpecifier") {
              return `import ${spec.local.name} from "${source}"`
            } else if (spec.type === "ImportSpecifier") {
              const importedName =
                spec.imported.type === "Identifier"
                  ? spec.imported.name
                  : spec.imported.value
              return `import { ${importedName} as ${spec.local.name} } from "${source}"`
            } else if (spec.type === "ImportNamespaceSpecifier") {
              return `import * as ${spec.local.name} from "${source}"`
            }
            return ""
          })
          .filter(Boolean)
        routeInfo.imports.push(...specifiers)

        // Check if this is a controller import
        if (source.includes("controller")) {
          const controllerSpecifiers = node.specifiers
            .filter((spec) => spec.type === "ImportSpecifier")
            .map((spec) => {
              const importSpec = spec as TSESTree.ImportSpecifier
              return importSpec.imported.type === "Identifier"
                ? importSpec.imported.name
                : importSpec.imported.value
            })
          routeInfo.existingControllerImports.push(...controllerSpecifiers)
        }
      } else if (node.type === "VariableDeclaration") {
        if (node.declarations) {
          for (const declarator of node.declarations) {
            if (
              declarator.id.type === "Identifier" &&
              declarator.id.name.includes("Router") &&
              declarator.init?.type === "CallExpression" &&
              declarator.init.callee.type === "MemberExpression" &&
              declarator.init.callee.object.type === "Identifier" &&
              declarator.init.callee.object.name === "express"
            ) {
              routeInfo.routerNames.push(declarator.id.name)
            }
          }
        }
      }
    }

    this.traverseAST(ast, visitor)
  }

  private extractHandlers(ast: TSESTree.Node, routeInfo: RouteFileInfo): void {
    const visitor = (node: TSESTree.Node) => {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        routeInfo.routerNames.includes(node.callee.object.name) &&
        node.callee.property.type === "Identifier" &&
        ["get", "post", "put", "patch", "delete"].includes(
          node.callee.property.name,
        )
      ) {
        const method =
          node.callee.property.type === "Identifier"
            ? node.callee.property.name
            : ""
        const args = node.arguments

        if (args.length < 2) return

        const path = this.extractStringLiteral(args[0])
        if (path === null) return

        // Find the handler function and OpenAPI config
        let handlerFunction:
          | TSESTree.FunctionExpression
          | TSESTree.ArrowFunctionExpression
          | null = null
        let handlerIdentifier: string | null = null
        let openApiConfig: any = null
        const middleware: string[] = []

        for (let i = 1; i < args.length; i++) {
          const arg = args[i]
          if (
            arg.type === "CallExpression" &&
            arg.callee.type === "MemberExpression" &&
            arg.callee.property.type === "Identifier" &&
            arg.callee.property.name === "validPath"
          ) {
            // This is the OpenAPI config
            openApiConfig = arg
          } else if (arg.type === "Identifier") {
            // This could be middleware or a handler function
            // Check if it's the last argument or if the next argument is a function
            const isLastArg = i === args.length - 1
            const nextArgIsFunction =
              i < args.length - 1 &&
              (args[i + 1].type === "FunctionExpression" ||
                args[i + 1].type === "ArrowFunctionExpression")

            if (isLastArg && !nextArgIsFunction) {
              // Last argument and not followed by a function - likely the handler
              handlerIdentifier = arg.name
            } else {
              // Middleware
              middleware.push(arg.name)
            }
          } else if (
            arg.type === "FunctionExpression" ||
            arg.type === "ArrowFunctionExpression"
          ) {
            // This is the handler function
            handlerFunction = arg
          }
        }

        // If we found an OpenAPI config but no handler function yet,
        // look for the handler function that comes after it
        if (openApiConfig && !handlerFunction && !handlerIdentifier) {
          for (let i = 1; i < args.length; i++) {
            const arg = args[i]
            if (arg === openApiConfig) {
              // Found the OpenAPI config, look for the next function
              for (let j = i + 1; j < args.length; j++) {
                const nextArg = args[j]
                if (
                  nextArg.type === "FunctionExpression" ||
                  nextArg.type === "ArrowFunctionExpression"
                ) {
                  handlerFunction = nextArg
                  break
                } else if (nextArg.type === "Identifier") {
                  handlerIdentifier = nextArg.name
                  break
                }
              }
              break
            }
          }
        }

        // Only extract if it's an inline function (not an imported identifier)
        if (handlerFunction && !handlerIdentifier) {
          const routerName = node.callee.object.name
          const handlerName = this.generateHandlerName(method, path, routerName)
          const openApiConfigName = this.generateOpenApiConfigName(method, path, routerName)

          const startLine = handlerFunction.loc?.start.line || 0
          const endLine = handlerFunction.loc?.end.line || 0

          // Extract function source
          const functionSource = this.extractFunctionSource(
            handlerFunction,
            routeInfo.originalContent,
          )

          // Extract just the handler function part for replacement
          const handlerSource = this.extractHandlerSource(
            handlerFunction,
            routeInfo.originalContent,
          )

          // Extract OpenAPI config source
          const openApiConfigSource = this.extractOpenApiConfigSource(
            openApiConfig,
            routeInfo.originalContent,
          )

          const handlerInfo: HandlerInfo = {
            method,
            path,
            middleware,
            openApiConfig,
            openApiConfigSource,
            openApiConfigName,
            handlerFunction,
            handlerName,
            startLine,
            endLine,
            functionSource,
            handlerSource,
          }

          routeInfo.handlers.push(handlerInfo)

          // Also add to OpenAPI specs if there's a config
          if (openApiConfig) {
            routeInfo.openApiSpecs.push(handlerInfo)
          }
        }
      }
    }

    this.traverseAST(ast, visitor)
  }

  private extractSchemas(ast: TSESTree.Node, routeInfo: RouteFileInfo): void {
    const visitor = (node: TSESTree.Node) => {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        node.callee.object.name === "oapi" &&
        node.callee.property.type === "Identifier" &&
        node.callee.property.name === "schema" &&
        node.arguments.length >= 2 &&
        node.arguments[0].type === "Literal" &&
        typeof node.arguments[0].value === "string"
      ) {
        const schemaName = node.arguments[0].value as string
        const startLine = node.loc?.start.line || 0
        const endLine = node.loc?.end.line || 0

        // Extract schema source
        const schemaSource = this.extractSchemaSource(
          node,
          routeInfo.originalContent,
        )

        routeInfo.schemas.push({
          schemaName,
          schemaSource,
          startLine,
          endLine,
        })
      }
    }

    this.traverseAST(ast, visitor)
  }

  private extractOpenApiSpecs(
    ast: TSESTree.Node,
    routeInfo: RouteFileInfo,
  ): void {
    // Find all router method calls and extract OpenAPI specs from them
    const visitor = (node: TSESTree.Node) => {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression" &&
        node.callee.object.type === "Identifier" &&
        routeInfo.routerNames.includes(node.callee.object.name) &&
        node.callee.property.type === "Identifier" &&
        ["get", "post", "put", "patch", "delete"].includes(
          node.callee.property.name,
        )
      ) {
        const method = node.callee.property.name
        const path = this.extractStringLiteral(node.arguments[0])
        const routerName = node.callee.object.name
        
        if (path === null) return

        // Look for oapi.validPath calls in the arguments
        for (let i = 1; i < node.arguments.length; i++) {
          const arg = node.arguments[i]
          if (
            arg.type === "CallExpression" &&
            arg.callee.type === "MemberExpression" &&
            arg.callee.object.type === "Identifier" &&
            arg.callee.object.name === "oapi" &&
            arg.callee.property.type === "Identifier" &&
            arg.callee.property.name === "validPath"
          ) {
            // Found an OpenAPI spec
            const openApiConfigSource = this.extractOpenApiConfigSource(
              arg,
              routeInfo.originalContent,
            )
            if (openApiConfigSource) {
              // Generate meaningful name based on method and path
              const openApiConfigName = this.generateOpenApiConfigName(
                method,
                path,
                routerName,
              )

              const handlerInfo: HandlerInfo = {
                method,
                path,
                middleware: [],
                openApiConfig: { placeholder: true },
                openApiConfigSource,
                openApiConfigName,
                handlerFunction: null as any,
                handlerName: "",
                startLine: arg.loc?.start.line || 0,
                endLine: arg.loc?.end.line || 0,
                functionSource: "",
                handlerSource: "",
              }

              routeInfo.openApiSpecs.push(handlerInfo)
            }
            break // Only process the first oapi.validPath call per route
          }
        }
      }
    }

    this.traverseAST(ast, visitor)
  }

  private deduplicateResults(routeInfo: RouteFileInfo): void {
    // Deduplicate handlers by handlerName
    const seenHandlers = new Set<string>()
    routeInfo.handlers = routeInfo.handlers.filter(handler => {
      if (seenHandlers.has(handler.handlerName)) {
        return false
      }
      seenHandlers.add(handler.handlerName)
      return true
    })

    // Deduplicate OpenAPI specs by openApiConfigName
    const seenSpecs = new Set<string>()
    routeInfo.openApiSpecs = routeInfo.openApiSpecs.filter(spec => {
      if (seenSpecs.has(spec.openApiConfigName)) {
        return false
      }
      seenSpecs.add(spec.openApiConfigName)
      return true
    })

    // Deduplicate schemas by schemaName
    const seenSchemas = new Set<string>()
    routeInfo.schemas = routeInfo.schemas.filter(schema => {
      if (seenSchemas.has(schema.schemaName)) {
        return false
      }
      seenSchemas.add(schema.schemaName)
      return true
    })
  }

  private extractOpenApiConfig(node: TSESTree.CallExpression): any {
    // For now, just return a placeholder - we'll extract the source code directly
    return { placeholder: true }
  }

  private extractStringLiteral(node: TSESTree.Node): string | null {
    if (node.type === "Literal" && typeof node.value === "string") {
      return node.value
    }
    return null
  }

  private generateHandlerName(method: string, path: string, routerName?: string): string {
    // Convert path to function name
    let name = path
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")

    if (name.startsWith("_")) {
      name = name.substring(1)
    }

    if (name === "") {
      name = "root"
    }

    // Add method prefix in snake_case
    const methodPrefix = method.toLowerCase()
    const baseName = `${methodPrefix}_${name}`
    
    // Add router prefix if there are multiple routers to avoid conflicts
    if (routerName && routerName !== "offersRouter") {
      const routerPrefix = routerName.replace("Router", "").toLowerCase()
      return `${routerPrefix}_${baseName}`
    }
    
    return baseName
  }

  private generateOpenApiConfigName(method: string, path: string, routerName?: string): string {
    // Convert path to function name using snake_case
    let name = path
      .replace(/[^a-zA-Z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")

    if (name.startsWith("_")) {
      name = name.substring(1)
    }

    if (name === "") {
      name = "root"
    }

    // Add method prefix in snake_case
    const methodPrefix = method.toLowerCase()
    const baseName = `${methodPrefix}_${name}_spec`
    
    // Add router prefix if there are multiple routers to avoid conflicts
    if (routerName && routerName !== "offersRouter") {
      const routerPrefix = routerName.replace("Router", "").toLowerCase()
      return `${routerPrefix}_${baseName}`
    }
    
    return baseName
  }

  private extractFunctionSource(
    handlerFunction:
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression,
    originalContent: string,
  ): string {
    // Extract the function source from the original content
    const lines = originalContent.split("\n")
    const startLine = (handlerFunction.loc?.start.line || 1) - 1
    const endLine = (handlerFunction.loc?.end.line || 1) - 1

    const functionLines = lines.slice(startLine, endLine + 1)

    // Clean up the function declaration
    if (functionLines[0].includes("async (req, res, next) => {")) {
      functionLines[0] = "async (req, res, next) => {"
    }

    return functionLines.join("\n")
  }

  private extractHandlerSource(
    handlerFunction:
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression,
    originalContent: string,
  ): string {
    // Extract just the handler function part for replacement
    const lines = originalContent.split("\n")
    const startLine = (handlerFunction.loc?.start.line || 1) - 1
    const endLine = (handlerFunction.loc?.end.line || 1) - 1

    return lines.slice(startLine, endLine + 1).join("\n")
  }

  private extractOpenApiConfigSource(
    node: TSESTree.CallExpression,
    originalContent: string,
  ): string {
    if (!node) return ""

    const lines = originalContent.split("\n")
    const startLine = (node.loc?.start.line || 1) - 1
    const endLine = (node.loc?.end.line || 1) - 1

    return lines.slice(startLine, endLine + 1).join("\n")
  }

  private extractSchemaSource(
    schemaNode: TSESTree.CallExpression,
    originalContent: string,
  ): string {
    const lines = originalContent.split("\n")
    const startLine = (schemaNode.loc?.start.line || 1) - 1
    const endLine = (schemaNode.loc?.end.line || 1) - 1

    return lines.slice(startLine, endLine + 1).join("\n")
  }

  private generateControllerFile(routeInfo: RouteFileInfo): string {
    // Copy all imports from the route file, plus RequestHandler
    const routeImports = routeInfo.imports.join("\n")
    const requestHandlerImport = `import { RequestHandler } from "express"`
    
    // Only generate the new handler exports
    const handlerExports = routeInfo.handlers
      .map((handler) => {
        const functionName = handler.handlerName
        const functionBody = handler.functionSource

        return `export const ${functionName}: RequestHandler = ${functionBody}`
      })
      .join("\n\n")

    return `${requestHandlerImport}\n${routeImports}\n\n${handlerExports}\n`
  }

  private generateOpenApiFile(routeInfo: RouteFileInfo): string {
    // Copy all imports from the route file
    const routeImports = routeInfo.imports.join("\n")

    // Generate schema exports
    const schemaExports = routeInfo.schemas
      .map((schema) => {
        return schema.schemaSource
      })
      .join("\n\n")

    // Generate OpenAPI spec exports
    const openApiExports = routeInfo.openApiSpecs
      .map((spec) => {
        const specName = spec.openApiConfigName
        const specBody = spec.openApiConfigSource

        return `export const ${specName} = ${specBody}`
      })
      .join("\n\n")

    return `${routeImports}\n\n${schemaExports}\n\n${openApiExports}\n`
  }

  private updateRouteFile(routeInfo: RouteFileInfo): string {
    let content = routeInfo.originalContent

    if (
      routeInfo.handlers.length === 0 &&
      routeInfo.openApiSpecs.length === 0
    ) {
      return content
    }

    // Add import for new controller functions (only if there are handlers)
    if (routeInfo.handlers.length > 0) {
      const newHandlerNames = routeInfo.handlers.map((h) => h.handlerName)

      // Find the existing controller import and add to it
      const controllerImportRegex =
        /import\s*\{\s*([^}]+)\s*\}\s*from\s*["']\.\/controller\.js["']/
      const match = content.match(controllerImportRegex)

      if (match) {
        // Add to existing import
        const existingImports = match[1]
          .split(",")
          .map((imp) => imp.trim())
          .filter((imp) => imp)
        const allImports = [...existingImports, ...newHandlerNames]
        const updatedImport = `import {\n  ${allImports.join(",\n  ")}\n} from "./controller.js"`
        content = content.replace(controllerImportRegex, updatedImport)
      } else {
        // Add new import
        const controllerImport = `import {\n  ${newHandlerNames.join(",\n  ")}\n} from "./controller.js"`
        const lines = content.split("\n")
        let insertIndex = 0

        // Find the last complete import statement (ending with "from" and ".js")
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].includes("from ") && lines[i].includes(".js")) {
            insertIndex = i + 1
            break
          }
        }

        lines.splice(insertIndex, 0, "", controllerImport)
        content = lines.join("\n")
      }
    }

    // Add import for new OpenAPI specs
    const newOpenApiNames = routeInfo.openApiSpecs.map(
      (s) => s.openApiConfigName,
    )
    if (newOpenApiNames.length > 0) {
      // Check if openapi import already exists
      const openApiImportRegex =
        /import\s*\{[^}]*\}\s*from\s*["']\.\/openapi\.js["']/
      if (!content.match(openApiImportRegex)) {
        const openApiImport = `import {\n  ${newOpenApiNames.join(
          ",\n  ",
        )}\n} from "./openapi.js"`

        // Find a safe place to insert the import - after the last complete import
        const lines = content.split("\n")
        let insertIndex = 0

        // Find the last line that contains "from" (indicating end of an import)
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i].includes("from ") && lines[i].includes(".js")) {
            insertIndex = i + 1
            break
          }
        }

        lines.splice(insertIndex, 0, "", openApiImport)
        content = lines.join("\n")
      }
    }

    // Replace only the handler functions, preserving all middleware and configuration
    for (const handler of routeInfo.handlers) {
      // Replace just the handler function part
      const handlerSource = this.extractHandlerSource(
        handler.handlerFunction,
        routeInfo.originalContent,
      )
      content = content.replace(handlerSource, handler.handlerName + ",")
    }

    // Replace OpenAPI configs with imported specs
    for (const spec of routeInfo.openApiSpecs) {
      if (spec.openApiConfigSource) {
        // Replace the specific oapi.validPath(...) call with just the spec name
        // Ensure proper comma structure
        const replacement = spec.openApiConfigName + ","
        content = content.replace(spec.openApiConfigSource, replacement)
      }
    }

    // Remove schema definitions from route file
    for (const schema of routeInfo.schemas) {
      if (schema.schemaSource) {
        content = content.replace(schema.schemaSource, "")
      }
    }

    return content
  }

  private formatFiles(filePaths: string[]): void {
    try {
      console.log("Formatting files with prettier and ESLint...")
      const files = filePaths.filter((file) => existsSync(file)).join(" ")
      if (files) {
        // Run prettier first
        execSync(`npx prettier --write ${files}`, { stdio: "inherit" })
        console.log("Files formatted with prettier")

        // Run ESLint with --fix
        execSync(`npx eslint --fix ${files}`, { stdio: "inherit" })
        console.log("Files cleaned up with ESLint")
      }
    } catch (error) {
      console.warn("Warning: Failed to format files:", error)
    }
  }

  private traverseAST(
    node: TSESTree.Node,
    visitor: (node: TSESTree.Node) => void,
  ): void {
    visitor(node)

    for (const key in node) {
      if (key === "parent" || key === "range" || key === "loc") continue

      const child = (node as any)[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item === "object" && item.type) {
            this.traverseAST(item, visitor)
          }
        }
      } else if (child && typeof child === "object" && child.type) {
        this.traverseAST(child, visitor)
      }
    }
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.log(
      "Usage: tsx scripts/extract-controllers.ts <route-file> [output-dir]",
    )
    console.log(
      "Example: tsx scripts/extract-controllers.ts src/api/routes/v1/orders/orders.ts",
    )
    console.log("")
    console.log(
      "This script extracts inline request handlers from Express route files",
    )
    console.log("and converts them to controller functions.")
    process.exit(1)
  }

  const routeFile = args[0]
  const outputDir = args[1]

  if (!existsSync(routeFile)) {
    console.error(`Route file not found: ${routeFile}`)
    process.exit(1)
  }

  const extractor = new ControllerExtractor(routeFile, outputDir)
  await extractor.extract()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
