# Plan: Replace UEX/CStone Imports with P4K Game Data

## Context

Currently game items come from UEX API (~3,800 items) and CStone scraping (~6,985 items), imported via separate scripts. We're replacing both with a single authoritative source: Star Citizen's `Data.p4k` game files, extracted via StarBreaker and packaged as `game-data.zip` by `scripts/extract-game-data.ts`.

The test DB has 9,206 items, 6,640 with listings, 5,895 with attributes. Only 1 duplicate name exists. The `game_items` table is referenced by 8 tables via FK on `game_item_id`.

## Phase 1: Database Migration

### 1.1 Add new columns to `game_items`

```
p4k_id          UUID        -- game record UUID from p4k (authoritative ID)
p4k_file        VARCHAR     -- entity filename (e.g. behr_rifle_ballistic_01)
item_type       VARCHAR     -- p4k type (e.g. WeaponPersonal, Char_Armor_Helmet)
sub_type        VARCHAR     -- p4k subtype (e.g. Medium, Heavy)
size            INT         -- item size class
grade           INT         -- item grade
manufacturer    VARCHAR     -- manufacturer code (e.g. behr, aegs)
display_type    VARCHAR     -- resolved display type (e.g. "Rifle", "Helmet")
thumbnail_path  VARCHAR     -- p4k texture/SVG path
name_key        VARCHAR     -- raw localization key (e.g. @item_Namebehr_rifle_ballistic_01)
```

Keep existing columns: `id`, `name`, `cstone_uuid`, `uex_uuid`, `image_url`, `type`, `description`, `details_id`, `last_attribute_fetch`.

### 1.2 Add new `game_item_categories` rows

```sql
INSERT INTO game_item_categories (category, subcategory) VALUES
  ('Component', 'Countermeasure'),
  ('Component', 'EMP'),
  ('Component', 'Quantum Interdiction Generator'),
  ('Vehicle Weapon', 'Space Mine');
```

### 1.3 Create index on `p4k_id`

```sql
CREATE UNIQUE INDEX idx_game_items_p4k_id ON game_items(p4k_id) WHERE p4k_id IS NOT NULL;
```

## Phase 2: Type Mapping

A static lookup in the import service. 62 p4k types → existing DB subcategories:

```typescript
const P4K_TYPE_MAP: Record<string, string> = {
  Cargo: "Container",
  Paints: "Ship Livery",
  Char_Armor_Helmet: "Helmet",
  Char_Clothing_Torso_1: "Jackets",
  Char_Armor_Torso: "Torso",
  Char_Armor_Legs: "Legs",
  Char_Armor_Arms: "Arms",
  WeaponPersonal: "Ranged Weapon",
  Char_Clothing_Legs: "Legwear",
  Char_Clothing_Torso_0: "Shirts",
  Char_Clothing_Feet: "Footwear",
  Misc: "Other",
  Char_Clothing_Hat: "Hat",
  Char_Armor_Undersuit: "Undersuit",
  WeaponGun: "Ship Weapon",
  WeaponDefensive: "Countermeasure",
  WeaponAttachment: "Weapon Attachment",
  Food: "Food/Drink",
  Char_Clothing_Hands: "Gloves",
  Char_Armor_Backpack: "Backpack",
  MissileLauncher: "Missile Rack",
  Drink: "Food/Drink",
  Turret: "Ship Turret or Gimbal",
  PowerPlant: "Power Plant",
  Cooler: "Cooler",
  Shield: "Shield",
  Radar: "Radar",
  Missile: "Missile",
  QuantumDrive: "Quantum Drive",
  FPS_Consumable: "Medical Pen",
  MiningModifier: "Mining Modifier",
  WeaponMining: "Mining Head",
  MobiGlas: "Mobiglass",
  ExternalFuelTank: "Fuel Pod",
  TractorBeam: "Tractor Beam",
  Container: "Container",
  Gadget: "FPS Tool",
  Flair_Surface: "Decoration",
  SalvageHead: "Salvage Head",
  SalvageModifier: "Salvage Modifier",
  InventoryContainer: "Container",
  GroundVehicleMissileLauncher: "Missile Rack",
  EMP: "EMP",
  FPS_Deployable: "FPS Tool",
  Usable: "Other",
  JumpDrive: "Jump Drive",
  BombLauncher: "Bomb Launcher",
  QuantumInterdictionGenerator: "Quantum Interdiction Generator",
  ToolArm: "Tool Attachment",
  DockingCollar: "Ship Module",
  Module: "Ship Module",
  UtilityTurret: "Ship Turret or Gimbal",
  Bomb: "Bomb",
  Currency: "Other",
  TurretBase: "Ship Turret or Gimbal",
  SpaceMine: "Space Mine",
  RemovableChip: "Hacking Chip",
  Char_Clothing_Backpack: "Backpack (Clothing)",
  TowingBeam: "Towing Beam",
  Grenade: "Thrown Weapon",
  UNDEFINED: "Other",
}
```

## Phase 3: Name Matching Strategy

The critical step. We need to link 9,206 existing DB items to their p4k equivalents without breaking FK references.

### Matching order (most to least confident):

1. **Exact name match** (case-insensitive, trimmed) — expect ~5,761 matches
2. **CStone UUID → p4k UUID match** — CStone UUIDs are often the same game UUIDs. Compare `game_items.cstone_uuid` against p4k `item.id`
3. **Fuzzy name match** — Levenshtein distance ≤ 2, or normalized match after stripping color/variant suffixes. Handles cases like `'Quantanium'` vs `"Quantainium"`
4. **Unmatched DB items** — keep as-is, flag for manual review. These are mostly Full Sets (synthetic) and legacy items
5. **Unmatched P4K items** — insert as new `game_items` rows

### For matched items, UPDATE:
- `name` → p4k localized name (authoritative)
- `type` → mapped DB subcategory from p4k type
- `p4k_id`, `p4k_file`, `item_type`, `sub_type`, `size`, `grade`, `manufacturer`, `display_type`, `thumbnail_path`, `name_key`
- Keep existing: `id` (PK, all FKs preserved), `image_url` (CStone images), `details_id`, `cstone_uuid`, `uex_uuid`

### For Full Set items (861):
- Regenerate after import by scanning for "Core" items, same logic as current import scripts
- These don't exist in p4k and are a marketplace concept

## Phase 4: Attribute Migration

P4k provides `size`, `grade`, `manufacturer` natively as columns. Currently these are in `game_item_attributes` as key-value pairs fetched from UEX.

### Strategy:
- Populate the new `size`, `grade`, `manufacturer` columns from p4k data
- Keep `game_item_attributes` for extended attributes (damage stats, fire rate, etc.) — these can still come from UEX or be parsed from p4k descriptions later
- Stop running `import-all-attributes.ts` for size/grade/manufacturer since p4k is authoritative

## Phase 5: Import Service Implementation

### 5.1 `scripts/import-game-data.ts`

Accepts the `game-data.zip` (or `game-data.json` directly) and runs the import:

```
npm run import-game-data -- --file ./game-data-export/game-data.zip
npm run import-game-data -- --file ./game-data-export/game-data.json --dry
```

Steps:
1. Unzip if needed, load `game-data.json`
2. Load all existing `game_items` from DB
3. Run matching (exact name → cstone UUID → fuzzy)
4. In a transaction:
   a. UPDATE matched items with p4k data
   b. INSERT new p4k items
   c. Regenerate Full Set items
   d. Insert new `game_item_categories` if needed
5. Log summary: matched, updated, inserted, unmatched

### 5.2 Admin API endpoint (later, task 8.1 in spec)

`POST /api/v2/admin/import-game-data` — accepts zip upload, runs the same logic. This is for the web admin panel and is part of the existing spec task 8.1.

## Phase 6: Search Compatibility

The main search uses:
- `game_items.name` — ✅ updated to authoritative localized name
- `game_items.type` — ✅ mapped to existing subcategories
- `market_listing_details.item_type` FK → `game_item_categories.subcategory` — ✅ unchanged
- `to_tsvector('english', name)` full-text search — ✅ works, may need index rebuild after name updates
- `game_item_attributes` filtering — ✅ unchanged
- `listing_search` view — ✅ joins on `game_item_id` which is preserved

**No search code changes needed.** Just rebuild the search index after import:
```sql
REINDEX INDEX idx_game_items_search_vector;
```

## Phase 7: Cleanup

After successful import and verification:
1. Mark `import-items-from-uex.ts` and `import-items-from-cstone.ts` as deprecated
2. Remove `import-all-attributes.ts` dependency on UEX for size/grade/manufacturer
3. Update `scripts/README.md` to document the new workflow
4. Add `npm run import-game-data` to `package.json`

## Task Summary

| Task | Effort | Depends On |
|------|--------|------------|
| Migration: add columns + categories | Small | — |
| Type mapping constant | Small | — |
| Name matching logic | Medium | Migration |
| Import script (`import-game-data.ts`) | Medium | Type mapping, name matching |
| Full Set regeneration | Small | Import script |
| Search index rebuild | Small | Import script |
| Admin upload endpoint | Medium | Import script (spec task 8.1) |
| Deprecate UEX/CStone scripts | Small | Verification |

## Risks

- **Name changes break listing search** — mitigated by keeping `name_key` for rollback and logging all renames
- **Missing items** — the 3,445 DB-only items are mostly Full Sets (861) + paint naming variants. Full Sets are regenerated. Paint names may need manual mapping
- **CStone images** — kept via existing `image_url` column, no loss
- **Attributes** — size/grade/manufacturer move to columns; extended stats stay in `game_item_attributes` for now
