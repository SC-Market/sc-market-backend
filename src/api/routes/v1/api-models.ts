import { Profile } from "passport-discord"
import { DBUser } from "../../../clients/database/db-models.js"

export interface ProfileBody {
  role?: "user" | "admin"
  user_id?: string
  display_name?: string
  profile_description?: string
  username: string
  // profile_link?: string,
}

// User type excludes discord_id - use provider system instead
// Explicitly define to avoid TypeScript resolution issues with Omit
export interface User {
  user_id: string
  display_name: string
  profile_description: string
  role: "user" | "admin"
  banned: boolean
  username: string
  avatar: string
  banner: string
  balance: string
  created_at: Date
  locale: string
  rsi_confirmed: boolean
  spectrum_user_id: string | null
  discord_access_token?: string | null
  discord_refresh_token?: string | null
  official_server_id: string | null
  discord_thread_channel_id: string | null
  market_order_template: string
}

export interface PostBody {
  user_id: string
  caption: string
  description: string
}

export interface MessageBody {
  author: string | null
  content: string
  attachments?: string[]
  chat_id: string
}

export interface Contractor {
  contractor_id: string
  spectrum_id: string
  kind: string
  size: number
  name: string
  description: string
  archived: boolean
}

export interface ShipsFileEntry {
  name: string
  manufacturer_code: string
  manufacturer_name: string
  ship_code: string
  ship_name: string
  ship_series: string
  pledge_id: string
  pledge_name: string
  pledge_date: string
  pledge_cost: string
  lti: boolean
  warbond: boolean
}

export interface OrderSetting {
  id: string
  entity_type: "user" | "contractor"
  entity_id: string
  setting_type:
    | "offer_message"
    | "order_message"
    | "require_availability"
    | "stock_subtraction_timing"
    | "min_order_size"
    | "max_order_size"
    | "min_order_value"
    | "max_order_value"
    | "allocation_mode"
  message_content: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreateOrderSettingRequest {
  setting_type:
    | "offer_message"
    | "order_message"
    | "require_availability"
    | "stock_subtraction_timing"
    | "min_order_size"
    | "max_order_size"
    | "min_order_value"
    | "max_order_value"
    | "allocation_mode"
  message_content?: string // Optional for require_availability and stock_subtraction_timing
  enabled?: boolean
}

export interface UpdateOrderSettingRequest {
  message_content?: string
  enabled?: boolean
}

export const ShipsFileSchema = [
  {
    name: "string",
    manufacturer_code: "string",
    manufacturer_name: "string",
    ship_code: "string",
    ship_name: "string",
    ship_series: "string",
    pledge_id: "string",
    pledge_name: "string",
    pledge_date: "string",
    pledge_cost: "string",
    lti: "boolean",
    warbond: "boolean",
  },
]
