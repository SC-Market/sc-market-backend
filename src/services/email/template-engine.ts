/**
 * Email template engine using Handlebars
 * Handles loading and rendering email templates (HTML and plain text)
 */

import Handlebars from "handlebars"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import { EmailTemplateData } from "./email.service.types.js"
import logger from "../../logger/logger.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Template cache to avoid re-reading files
 */
const templateCache = new Map<string, HandlebarsTemplateDelegate>()

/**
 * Register Handlebars helpers for email templates
 */
function registerHelpers(): void {
  // Format date helper
  Handlebars.registerHelper("formatDate", (date: Date | string) => {
    if (!date) return ""
    const d = typeof date === "string" ? new Date(date) : date
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  })

  // Format datetime helper
  Handlebars.registerHelper("formatDateTime", (date: Date | string) => {
    if (!date) return ""
    const d = typeof date === "string" ? new Date(date) : date
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  })

  // Format currency helper (for aUEC)
  Handlebars.registerHelper("formatCurrency", (amount: number | string) => {
    if (amount === null || amount === undefined) return "0"
    const num = typeof amount === "string" ? parseFloat(amount) : amount
    return num.toLocaleString("en-US")
  })

  // Conditional helper
  Handlebars.registerHelper(
    "ifEquals",
    function (
      this: any,
      arg1: any,
      arg2: any,
      options: Handlebars.HelperOptions,
    ) {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this)
    },
  )

  // URL helper (ensures absolute URLs)
  Handlebars.registerHelper("absoluteUrl", function (this: any, url: string) {
    if (!url) return ""
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url
    }
    // Assume relative URL, prepend site URL from context
    const siteUrl = this.siteUrl || ""
    return siteUrl ? `${siteUrl}${url.startsWith("/") ? url : `/${url}`}` : url
  })
}

// Register helpers on first import
registerHelpers()

/**
 * Load a template from disk (with caching)
 */
async function loadTemplate(
  name: string,
  type: "html" | "txt",
): Promise<HandlebarsTemplateDelegate> {
  const cacheKey = `${name}.${type}`

  // Check cache first
  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey)!
  }

  // Load template file
  // Try multiple paths to handle both dev and production environments
  const possiblePaths = [
    // Standard path (works in dev and if templates are copied to dist)
    path.join(__dirname, "templates", "notifications", `${name}.${type}.hbs`),
    // Production path if templates are in dist
    path.join(
      process.cwd(),
      "dist",
      "src",
      "services",
      "email",
      "templates",
      "notifications",
      `${name}.${type}.hbs`,
    ),
    // Alternative: relative to source (for dev)
    path.join(
      process.cwd(),
      "src",
      "services",
      "email",
      "templates",
      "notifications",
      `${name}.${type}.hbs`,
    ),
  ]

  for (const templatePath of possiblePaths) {
    try {
      const templateContent = await fs.readFile(templatePath, "utf-8")
      const template = Handlebars.compile(templateContent)
      templateCache.set(cacheKey, template)
      return template
    } catch (error) {
      // Try next path
      continue
    }
  }

  // If all paths failed, log and throw error
  logger.error(`Failed to load email template: ${name}.${type}`, {
    attemptedPaths: possiblePaths,
  })
  throw new Error(`Email template not found: ${name}.${type}`)
}

/**
 * Load base layout template
 */
async function loadBaseLayout(
  type: "html" | "txt",
): Promise<HandlebarsTemplateDelegate> {
  const cacheKey = `base.${type}`

  if (templateCache.has(cacheKey)) {
    return templateCache.get(cacheKey)!
  }

  // Try multiple paths to handle both dev and production environments
  const possiblePaths = [
    // Standard path (works in dev and if templates are copied to dist)
    path.join(__dirname, "templates", "layouts", `base.${type}.hbs`),
    // Production path if templates are in dist
    path.join(
      process.cwd(),
      "dist",
      "src",
      "services",
      "email",
      "templates",
      "layouts",
      `base.${type}.hbs`,
    ),
    // Alternative: relative to source (for dev)
    path.join(
      process.cwd(),
      "src",
      "services",
      "email",
      "templates",
      "layouts",
      `base.${type}.hbs`,
    ),
  ]

  for (const templatePath of possiblePaths) {
    try {
      const templateContent = await fs.readFile(templatePath, "utf-8")
      const template = Handlebars.compile(templateContent)
      templateCache.set(cacheKey, template)
      return template
    } catch (error) {
      // Try next path
      continue
    }
  }

  // If all paths failed, log and throw error
  logger.error(`Failed to load base layout: base.${type}`, {
    attemptedPaths: possiblePaths,
  })
  throw new Error(`Base layout template not found: base.${type}`)
}

/**
 * Render an email template
 * @param templateName - Name of the template (without extension)
 * @param data - Template data
 * @param type - Template type (html or txt)
 * @returns Rendered template string
 */
export async function renderEmailTemplate(
  templateName: string,
  data: EmailTemplateData,
  type: "html" | "txt" = "html",
): Promise<string> {
  try {
    // Load notification template
    const notificationTemplate = await loadTemplate(templateName, type)

    // Render notification content
    const notificationContent = notificationTemplate(data)

    // Load base layout
    const baseLayout = await loadBaseLayout(type)

    // Render with base layout (notification content goes into body)
    const fullContent = baseLayout({
      ...data,
      body: notificationContent,
    })

    return fullContent
  } catch (error) {
    // If base layout fails, try rendering notification template directly
    // (some templates might be self-contained)
    try {
      const notificationTemplate = await loadTemplate(templateName, type)
      return notificationTemplate(data)
    } catch (fallbackError) {
      logger.error(`Failed to render email template: ${templateName}`, {
        error,
        fallbackError,
        templateName,
        type,
      })
      throw error
    }
  }
}

/**
 * Clear template cache (useful for development/testing)
 */
export function clearTemplateCache(): void {
  templateCache.clear()
}
