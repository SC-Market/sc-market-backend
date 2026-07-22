/**
 * Wire types for the customizable dashboard. These are the single source of truth
 * for the DashboardConfig shape: TSOA emits them into the OpenAPI spec, and the
 * frontend client codegen turns them into matching TypeScript types — so the same
 * structure is used for server persistence, the API contract, and the client with
 * no casting.
 */

export type DashboardOwnerType = "user" | "org" | "shop"

/** Widget data-scope binding, chosen per widget when it is added. */
export type WidgetScope =
  | { kind: "me" }
  | { kind: "current_context" }
  | { kind: "all_orgs" }
  | { kind: "all_shops" }
  | { kind: "specific_org"; spectrumId: string }
  | { kind: "specific_shop"; shopId: string }

/** Grid placement in react-grid-layout coordinates. */
export interface WidgetLayout {
  x: number
  y: number
  w: number
  h: number
}

export interface DashboardWidget {
  /** Stable per-instance id (a widget type may appear multiple times). */
  id: string
  /** Key into the widget registry. */
  type: string
  scope: WidgetScope
  layout: WidgetLayout
  /** Widget-specific settings (e.g. period). Validated per widget on the client. */
  settings?: Record<string, string | number | boolean>
}

export interface DashboardConfig {
  version: number
  widgets: DashboardWidget[]
}

export interface DashboardLayout {
  owner_type: DashboardOwnerType
  owner_id: string
  config: DashboardConfig
  updated_by: string
  updated_at: string
}
