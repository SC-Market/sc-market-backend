/**
 * Security Headers Middleware
 *
 * Implements comprehensive HTTP security headers using Helmet.js.
 * Protects against common web vulnerabilities (XSS, clickjacking, etc.)
 */

import helmet from "helmet"
import { Request, Response, NextFunction } from "express"
import { env } from "../../config/env.js"

const isProduction = env.NODE_ENV === "production"
const backend_url = new URL(env.BACKEND_URL || "http://localhost:7000")
const frontend_url = new URL(env.FRONTEND_URL || "http://localhost:5173")
// CDN URL for serving images and assets
const cdn_url = env.CDN_URL ? new URL(env.CDN_URL) : null

/**
 * Security headers middleware configuration
 */
export function securityHeaders() {
  const helmetMiddleware = helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'", // Required for some legacy code - tighten later
          "'unsafe-eval'", // Required for some libraries - tighten later
          "https://cdn.robertsspaceindustries.com",
          "https://www.googletagmanager.com",
          "https://www.google-analytics.com",
          "https://cdn.jsdelivr.net", // Required for Scalar API reference
          "https://static.cloudflareinsights.com", // Cloudflare Web Analytics
        ],
        styleSrc: [
          "'self'",
          "'unsafe-inline'", // Required for Material-UI
          "https://fonts.googleapis.com",
          "https://cdn.jsdelivr.net", // Required for Scalar API reference
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://fonts.scalar.com",
          "data:",
        ],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: [
          "'self'",
          backend_url.toString(),
          frontend_url.toString(),
          "https://www.google-analytics.com",
          "https://cloudflareinsights.com", // Cloudflare Web Analytics
          "wss:", // WebSocket connections
          "ws:",
        ],
        frameSrc: [
          "'self'",
          "https://www.youtube.com",
          "https://player.vimeo.com",
        ],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: isProduction ? [] : null, // Only in production
        // Use report-to (modern) with report-uri (deprecated but kept for backward compatibility)
        // Helmet will automatically add both directives when reportTo is specified
        reportTo: isProduction ? "csp-endpoint" : null,
        // Keep reportURI for older browsers that don't support report-to
        reportURI: isProduction ? "/api/csp-report" : null,
      },
    },

    // X-Frame-Options (redundant with CSP but kept for older browsers)
    frameguard: {
      action: "deny",
    },

    // X-Content-Type-Options
    noSniff: true,

    // Strict-Transport-Security (HSTS)
    hsts: isProduction
      ? {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: false, // Set to true after testing
        }
      : false, // Disable in development

    // Referrer-Policy
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin",
    },

    // Permissions-Policy (formerly Feature-Policy)
    // Note: Helmet v8 uses a different API - using direct header setting if needed
    // For now, we'll rely on CSP and other headers for security

    // X-DNS-Prefetch-Control
    dnsPrefetchControl: {
      allow: false,
    },

    // X-Download-Options
    ieNoOpen: true,

    // X-Permitted-Cross-Domain-Policies
    permittedCrossDomainPolicies: false,
  })

  // Return middleware that sets both Helmet headers and Report-To header
  return (req: Request, res: Response, next: NextFunction) => {
    // Apply Helmet middleware first
    helmetMiddleware(req, res, () => {
      // Add Report-To header for Reporting API (required for report-to directive)
      // This defines the endpoint group that report-to references
      if (isProduction) {
        const reportToUrl = `${backend_url.toString()}/api/csp-report`
        res.setHeader(
          "Report-To",
          JSON.stringify({
            group: "csp-endpoint",
            max_age: 10886400, // 126 days
            endpoints: [{ url: reportToUrl }],
          }),
        )
      }
      next()
    })
  }
}
