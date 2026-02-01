export interface AttributeDefinition {
  attribute_name: string
  display_name: string
  attribute_type: "select" | "multiselect" | "range" | "text"
  allowed_values: string[] | null
  applicable_item_types: string[] | null
  display_order: number
  created_at: Date
  updated_at: Date
}

export interface CreateAttributeDefinitionPayload {
  attribute_name: string
  display_name: string
  attribute_type: "select" | "multiselect" | "range" | "text"
  allowed_values?: string[] | null
  applicable_item_types?: string[] | null
  display_order?: number
}

export interface UpdateAttributeDefinitionPayload {
  display_name?: string
  attribute_type?: "select" | "multiselect" | "range" | "text"
  allowed_values?: string[] | null
  applicable_item_types?: string[] | null
  display_order?: number
}

export interface GameItemAttribute {
  game_item_id: string
  attribute_name: string
  attribute_value: string
  created_at: Date
  updated_at: Date
}

export interface GameItemAttributeWithDefinition extends GameItemAttribute {
  display_name: string
  attribute_type: "select" | "multiselect" | "range" | "text"
  allowed_values: string[] | null
}

export interface UpsertGameItemAttributePayload {
  attribute_name: string
  attribute_value: string
}
