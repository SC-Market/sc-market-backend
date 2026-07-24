import { Application } from "express"

// Base URL this API is served from. api.sc-market.space in production; the
// catalog advertises absolute URLs so agents can dereference them regardless of
// which origin fetched the catalog (the homepage Link header lives on the
// frontend origin, sc-market.space, and points here cross-origin).
const API_BASE = process.env.API_BASE_URL || "https://api.sc-market.space"

// API catalog per RFC 9727 (served as an RFC 9264 linkset). Lets agents and
// tooling discover our machine-readable API description (service-desc → the
// OpenAPI spec), human docs (service-doc → the Scalar reference UI), and a
// liveness endpoint (status). We expose both API versions; v2 (TSOA-generated
// spec) is the current surface, v1 is the legacy hand-written one.
//
// The relation types are IANA-registered: service-desc/service-doc (RFC 8631),
// status (RFC 8631), and the api-catalog relation itself (RFC 9727).
function buildCatalog() {
  return {
    linkset: [
      {
        anchor: `${API_BASE}/api/v2`,
        "service-desc": [
          {
            href: `${API_BASE}/api/v2/openapi.json`,
            type: "application/json",
          },
        ],
        "service-doc": [
          {
            href: `${API_BASE}/docs`,
            type: "text/html",
          },
        ],
        status: [
          {
            href: `${API_BASE}/api/v2/health`,
          },
        ],
      },
      {
        anchor: `${API_BASE}/api/v1`,
        "service-desc": [
          {
            href: `${API_BASE}/api/v1/openapi.json`,
            type: "application/json",
          },
        ],
        "service-doc": [
          {
            href: `${API_BASE}/docs`,
            type: "text/html",
          },
        ],
      },
    ],
  }
}

export function setupWellKnownRoutes(app: Application): void {
  app.get("/.well-known/api-catalog", function (_req, res) {
    // RFC 9727 mandates the application/linkset+json media type for the JSON
    // linkset representation of an API catalog.
    res.set("Content-Type", "application/linkset+json; charset=utf-8")
    res.set("Cross-Origin-Resource-Policy", "cross-origin")
    res.set("Cache-Control", "public, max-age=3600")
    res.send(JSON.stringify(buildCatalog()))
  })
}
