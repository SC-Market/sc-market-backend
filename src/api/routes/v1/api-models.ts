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

export type User = DBUser

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
  setting_type: "offer_message" | "order_message" | "require_availability"
  message_content: string
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface CreateOrderSettingRequest {
  setting_type: "offer_message" | "order_message" | "require_availability"
  message_content?: string // Optional for require_availability
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
