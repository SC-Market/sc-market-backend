/**
 * Blueprint import planning and the column-typed diff it shares with the
 * mission import: unchanged blueprints get no write (updated_at, the sitemap
 * lastmod, stays), changed ones keep their blueprint_id.
 */
import { describe, it, expect } from "vitest"
import type { P4KBlueprint } from "./import.service.js"
import {
  BLUEPRINT_COLUMNS,
  BLUEPRINT_INGREDIENT_COLUMNS,
  BLUEPRINT_MODIFIER_COLUMNS,
  blueprintCodesToDeactivate,
  buildBlueprintRecord,
  buildIngredientRow,
  buildModifierRows,
  planBlueprintWrite,
} from "./blueprint-sync.js"
import {
  canonicalJson,
  changedColumns,
  roundTo,
  sameRows,
} from "./import-diff.js"

function blueprint(overrides: Partial<P4KBlueprint> = {}): P4KBlueprint {
  return {
    id: "bp-uuid-1",
    name: "Arclight Pistol",
    nameKey: null,
    description: null,
    descriptionKey: null,
    outputItemId: "klwe_pistol_energy_01",
    outputQuantity: 1,
    ingredients: [
      {
        itemId: "Iron",
        quantity: 1.23456,
        quantityScu: 0.5,
        minQuality: 250,
        slotName: "frame",
        slotDisplayName: "Frame",
      },
      { itemId: "Gold", quantity: 2 },
    ],
    category: "Weapons",
    subcategory: null,
    rarity: null,
    tier: null,
    craftingStation: null,
    craftingTime: 90.4,
    requiredSkill: null,
    iconUrl: null,
    source: "mission",
    slots: [
      {
        type: "slot",
        name: "frame",
        displayName: "Frame",
        modifiers: [
          {
            property: "damage",
            startQuality: 0,
            endQuality: 1000,
            modifierAtStart: 0.9,
            modifierAtEnd: 1.1234567,
          },
          {
            property: "rof",
            startQuality: 0,
            endQuality: 1000,
            modifierAtStart: 1,
            modifierAtEnd: 1,
          },
        ],
      },
    ],
    ...overrides,
  }
}

function desired(bp: P4KBlueprint) {
  return {
    record: buildBlueprintRecord(bp, "item-1"),
    ingredients: bp.ingredients.map((ing, i) =>
      buildIngredientRow(ing, `item-${ing.itemId}`, i),
    ),
    modifiers: buildModifierRows(bp),
  }
}

/** As pg returns it: decimals as fixed-scale strings, extra columns, any row order. */
function asStored(bp: P4KBlueprint) {
  const d = desired(bp)
  return {
    row: {
      blueprint_id: "bp-db-1",
      version_id: "v",
      created_at: new Date(),
      updated_at: new Date(),
      ...d.record,
    },
    ingredients: d.ingredients
      .map((r) => ({
        ...r,
        quantity_required: Number(r.quantity_required).toFixed(4),
        quantity_scu:
          r.quantity_scu === null ? null : Number(r.quantity_scu).toFixed(4),
      }))
      .reverse(),
    modifiers: d.modifiers
      .map((r) => ({
        ...r,
        modifier_at_start: Number(r.modifier_at_start).toFixed(6),
        modifier_at_end: Number(r.modifier_at_end).toFixed(6),
      }))
      .reverse(),
  }
}

describe("planBlueprintWrite", () => {
  it("an unchanged blueprint plans no write", () => {
    const plan = planBlueprintWrite(asStored(blueprint()), desired(blueprint()))
    expect(plan).toEqual({
      changes: {},
      replaceIngredients: false,
      replaceModifiers: false,
      unchanged: true,
    })
  })

  it("a changed column is the only change", () => {
    const plan = planBlueprintWrite(
      asStored(blueprint()),
      desired(blueprint({ craftingTime: 120 })),
    )
    expect(plan.changes).toEqual({ crafting_time_seconds: 120 })
    expect(plan.replaceIngredients).toBe(false)
    expect(plan.replaceModifiers).toBe(false)
    expect(plan.unchanged).toBe(false)
  })

  it("a changed ingredient replaces only the ingredients", () => {
    const next = blueprint()
    next.ingredients = [
      { ...next.ingredients[0], quantity: 3 },
      next.ingredients[1],
    ]
    const plan = planBlueprintWrite(asStored(blueprint()), desired(next))
    expect(plan.changes).toEqual({})
    expect(plan.replaceIngredients).toBe(true)
    expect(plan.replaceModifiers).toBe(false)
  })

  it("a changed modifier replaces only the modifiers", () => {
    const next = blueprint()
    next.slots![0].modifiers![1] = {
      ...next.slots![0].modifiers![1],
      modifierAtEnd: 1.05,
    }
    const plan = planBlueprintWrite(asStored(blueprint()), desired(next))
    expect(plan.replaceModifiers).toBe(true)
    expect(plan.replaceIngredients).toBe(false)
  })

  it("an inactive stored blueprint back in the import is reactivated", () => {
    const stored = asStored(blueprint())
    stored.row.is_active = false
    expect(planBlueprintWrite(stored, desired(blueprint())).changes).toEqual({
      is_active: true,
    })
  })
})

describe("blueprint builders", () => {
  it("record, ingredient and modifier rows only hold declared columns", () => {
    const d = desired(blueprint())
    expect(Object.keys(d.record).sort()).toEqual(
      Object.keys(BLUEPRINT_COLUMNS).sort(),
    )
    for (const r of d.ingredients)
      expect(Object.keys(r).sort()).toEqual(
        Object.keys(BLUEPRINT_INGREDIENT_COLUMNS).sort(),
      )
    for (const r of d.modifiers)
      expect(Object.keys(r).sort()).toEqual(
        Object.keys(BLUEPRINT_MODIFIER_COLUMNS).sort(),
      )
  })

  it("rounds to the column scale", () => {
    const d = desired(blueprint())
    expect(d.record.crafting_time_seconds).toBe(90)
    expect(d.ingredients[0].quantity_required).toBe(1.2346)
    expect(d.modifiers[0].modifier_at_end).toBe(1.123457)
  })
})

describe("blueprintCodesToDeactivate", () => {
  it("lists stored codes the import no longer has", () => {
    expect(
      blueprintCodesToDeactivate(["a", "b", "c"], ["c", "a", "new"]),
    ).toEqual(["b"])
    expect(blueprintCodesToDeactivate(["a"], ["a"])).toEqual([])
  })
})

describe("import-diff", () => {
  it("compares bigint strings exactly (no float tolerance on integers)", () => {
    const kinds = { n: "num" } as const
    expect(changedColumns({ n: "30000000" }, { n: 30000000 }, kinds)).toEqual(
      {},
    )
    expect(changedColumns({ n: "30000000" }, { n: 30000001 }, kinds)).toEqual({
      n: 30000001,
    })
  })

  it("compares real columns at float4 precision", () => {
    const kinds = { r: "real" } as const
    expect(changedColumns({ r: 123.45679 }, { r: 123.456789 }, kinds)).toEqual(
      {},
    )
    expect(changedColumns({ r: 123.5 }, { r: 123.456789 }, kinds)).toEqual({
      r: 123.456789,
    })
  })

  it("compares json ignoring key order, not array order", () => {
    const kinds = { j: "json" } as const
    expect(
      changedColumns(
        { j: { b: 1, a: [1, 2] } },
        { j: { a: [1, 2], b: 1 } },
        kinds,
      ),
    ).toEqual({})
    expect(
      changedColumns({ j: { a: [2, 1] } }, { j: { a: [1, 2] } }, kinds),
    ).toEqual({ j: { a: [1, 2] } })
    expect(canonicalJson({ b: undefined, a: 1 })).toBe('{"a":1}')
  })

  it("null and a value differ; null and undefined do not", () => {
    const kinds = { s: "str", n: "num" } as const
    expect(
      changedColumns({ s: null, n: undefined }, { s: null, n: null }, kinds),
    ).toEqual({})
    expect(
      changedColumns({ s: null, n: 0 }, { s: "x", n: null }, kinds),
    ).toEqual({ s: "x", n: null })
  })

  it("an undeclared column is an error", () => {
    expect(() => changedColumns({}, { mystery: 1 }, {})).toThrow(
      /mystery has no declared kind/,
    )
  })

  it("a non-boolean for a bool column is an error", () => {
    expect(() =>
      changedColumns({ b: "t" }, { b: true }, { b: "bool" }),
    ).toThrow(/not a boolean/)
  })

  it("sameRows is a multiset comparison", () => {
    const kinds = { name: "str", count: "num" } as const
    expect(
      sameRows(
        [
          { name: "a", count: "1" },
          { name: "b", count: 2 },
        ],
        [
          { name: "b", count: 2 },
          { name: "a", count: 1 },
        ],
        kinds,
      ),
    ).toBe(true)
    expect(
      sameRows(
        [
          { name: "a", count: 1 },
          { name: "a", count: 1 },
        ],
        [{ name: "a", count: 1 }],
        kinds,
      ),
    ).toBe(false)
    expect(
      sameRows([{ name: "a", count: 1 }], [{ name: "a", count: 2 }], kinds),
    ).toBe(false)
  })

  it("roundTo", () => {
    expect(roundTo(1.23456, 4)).toBe(1.2346)
    expect(roundTo(16.666666, 2)).toBe(16.67)
  })
})
