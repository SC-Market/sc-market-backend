/**
 * Blueprint import planning. Pure (no database), so the rules are unit-tested.
 *
 * Blueprints are keyed by (version_id, blueprint_code) and keep their
 * blueprint_id across imports: user_blueprint_inventory,
 * organization_blueprint_inventory, crafting_history, wishlist_items and
 * mission_completions.blueprints_rewarded reference it. An unchanged
 * blueprint gets no write (its updated_at, the sitemap lastmod, stays); a
 * changed one gets only the changed columns, plus its ingredient/modifier
 * rows replaced when those differ. A blueprint missing from the import is
 * deactivated, never deleted.
 */
import type { P4KBlueprint } from "./import.service.js"
import {
  changedColumns,
  intOrNull,
  roundTo,
  sameRows,
  type ColumnKinds,
} from "./import-diff.js"

/** Column kinds of the blueprints columns the import writes. */
export const BLUEPRINT_COLUMNS: ColumnKinds = {
  blueprint_code: "str",
  blueprint_name: "str",
  blueprint_description: "str",
  output_game_item_id: "str",
  output_quantity: "num",
  item_category: "str",
  item_subcategory: "str",
  rarity: "str",
  tier: "num",
  crafting_station_type: "str",
  crafting_time_seconds: "num",
  required_skill_level: "num",
  icon_url: "str",
  is_active: "bool",
  source: "str",
}

/** blueprint_ingredients columns the import writes (quantities are decimal(10,4)). */
export const BLUEPRINT_INGREDIENT_COLUMNS: ColumnKinds = {
  ingredient_game_item_id: "str",
  quantity_required: "num",
  min_quality_tier: "num",
  recommended_quality_tier: "num",
  is_alternative: "bool",
  display_order: "num",
  slot_name: "str",
  slot_display_name: "str",
  quantity_scu: "num",
  min_quality: "num",
}

/** blueprint_slot_modifiers columns the import writes (modifiers are decimal(10,6)). */
export const BLUEPRINT_MODIFIER_COLUMNS: ColumnKinds = {
  slot_name: "str",
  slot_display_name: "str",
  property: "str",
  start_quality: "num",
  end_quality: "num",
  modifier_at_start: "num",
  modifier_at_end: "num",
  modifier_type: "str",
}

export type Row = Record<string, unknown>

export function buildBlueprintRecord(
  blueprint: P4KBlueprint,
  outputGameItemId: string,
): Row {
  return {
    blueprint_code: blueprint.id,
    blueprint_name: blueprint.name,
    blueprint_description: blueprint.description ?? null,
    output_game_item_id: outputGameItemId,
    output_quantity: Math.round(blueprint.outputQuantity),
    item_category: blueprint.category ?? null,
    item_subcategory: blueprint.subcategory ?? null,
    rarity: blueprint.rarity ?? null,
    tier: intOrNull(blueprint.tier),
    crafting_station_type: blueprint.craftingStation ?? null,
    crafting_time_seconds: intOrNull(blueprint.craftingTime),
    required_skill_level: intOrNull(blueprint.requiredSkill),
    icon_url: blueprint.iconUrl ?? null,
    is_active: true,
    source: blueprint.source || null,
  }
}

/**
 * One ingredient row (without blueprint_id). `displayOrder` is the
 * ingredient's index in the flattened recipe, unresolved ones included.
 */
export function buildIngredientRow(
  ing: P4KBlueprint["ingredients"][number],
  gameItemId: string,
  displayOrder: number,
): Row {
  return {
    ingredient_game_item_id: gameItemId,
    quantity_required: roundTo(ing.quantity, 4),
    min_quality_tier: null,
    recommended_quality_tier: null,
    is_alternative: false,
    display_order: displayOrder,
    slot_name: ing.slotName || null,
    slot_display_name: ing.slotDisplayName || null,
    quantity_scu: ing.quantityScu ? roundTo(ing.quantityScu, 4) : null,
    min_quality: ing.minQuality ? Math.round(ing.minQuality) : null,
  }
}

/** The slot modifier rows (without blueprint_id) for a blueprint's raw slots. */
export function buildModifierRows(blueprint: P4KBlueprint): Row[] {
  const rows: Row[] = []
  for (const slot of blueprint.slots ?? []) {
    if (slot.type !== "slot" || !slot.modifiers?.length) continue
    for (const mod of slot.modifiers) {
      if (mod.modifierAtStart == null || mod.modifierAtEnd == null) continue
      rows.push({
        slot_name: slot.name,
        slot_display_name: slot.displayName || slot.name,
        property: mod.property,
        start_quality: Math.round(mod.startQuality ?? 0),
        end_quality: Math.round(mod.endQuality ?? 1000),
        modifier_at_start: roundTo(mod.modifierAtStart, 6),
        modifier_at_end: roundTo(mod.modifierAtEnd, 6),
        modifier_type: mod.modifierType || "linear",
      })
    }
  }
  return rows
}

export interface BlueprintWritePlan {
  /** Changed blueprints columns with their new values (empty: none). */
  changes: Row
  replaceIngredients: boolean
  replaceModifiers: boolean
  /** Nothing differs: no write at all. */
  unchanged: boolean
}

/** What an import must write to bring one stored blueprint in line. */
export function planBlueprintWrite(
  stored: { row: Row; ingredients: Row[]; modifiers: Row[] },
  next: { record: Row; ingredients: Row[]; modifiers: Row[] },
): BlueprintWritePlan {
  const changes = changedColumns(stored.row, next.record, BLUEPRINT_COLUMNS)
  const replaceIngredients = !sameRows(
    stored.ingredients,
    next.ingredients,
    BLUEPRINT_INGREDIENT_COLUMNS,
  )
  const replaceModifiers = !sameRows(
    stored.modifiers,
    next.modifiers,
    BLUEPRINT_MODIFIER_COLUMNS,
  )
  return {
    changes,
    replaceIngredients,
    replaceModifiers,
    unchanged:
      Object.keys(changes).length === 0 &&
      !replaceIngredients &&
      !replaceModifiers,
  }
}

/** Stored blueprint codes (active ones) that the import no longer contains. */
export function blueprintCodesToDeactivate(
  storedActiveCodes: ReadonlyArray<string>,
  importedCodes: ReadonlyArray<string>,
): string[] {
  const imported = new Set(importedCodes)
  return storedActiveCodes.filter((code) => !imported.has(code))
}
