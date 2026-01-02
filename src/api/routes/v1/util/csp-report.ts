/**
 * CSP Reporting Endpoint
 *
 * Handles Content Security Policy violation reports from browsers.
 * Supports both legacy report-uri format and modern report-to (Reporting API) format.
 *
 * POST /api/csp-report
 *
 * Legacy format (report-uri):
 *   Body: { "csp-report": { ... } }
 *
 * Modern format (report-to / Reporting API):
 *   Body: [{ type: "csp-violation", body: { ... } }, ...]
 */

import { Request, Response } from "express"
import logger from "../../../../logger/logger.js"

/**
 * Handle CSP violation reports
 */
export function cspReportHandler(req: Request, res: Response) {
  const body = req.body

  // Handle legacy report-uri format: { "csp-report": { ... } }
  if (body && typeof body === "object" && "csp-report" in body) {
    logger.warn("CSP violation reported (legacy format)", {
      "csp-report": body["csp-report"],
      user_agent: req.headers["user-agent"],
      ip: req.ip,
      referer: req.headers.referer,
    })
  }
  // Handle modern report-to format (Reporting API): [{ type: "csp-violation", body: { ... } }, ...]
  else if (Array.isArray(body)) {
    body.forEach((report: any) => {
      if (report.type === "csp-violation" && report.body) {
        logger.warn("CSP violation reported (Reporting API format)", {
          "csp-report": report.body,
          user_agent: req.headers["user-agent"],
          ip: req.ip,
          referer: req.headers.referer,
          age: report.age, // Time in milliseconds since the report was generated
        })
      }
    })
  }
  // Fallback for unexpected formats
  else {
    logger.warn("CSP violation reported (unknown format)", {
      body,
      user_agent: req.headers["user-agent"],
      ip: req.ip,
      referer: req.headers.referer,
    })
  }

  // Return 204 No Content (standard for CSP reporting endpoints)
  res.status(204).send()
}
