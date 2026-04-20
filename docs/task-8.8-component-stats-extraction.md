# Task 8.8: Component Stats Extraction Implementation

**Status:** ✅ Complete  
**Date:** 2026-04-20  
**Spec:** `.kiro/specs/sc-game-data-crafting-system/tasks.md` - Task 8.8

## Overview

Enhanced the `extract-game-data.ts` script to extract detailed component statistics from P4K game data and store them as `attributes` objects per item. The import script now populates the `game_item_attributes` table from these extracted stats.

## Changes Made

### 1. Enhanced Item Extraction (`extract-game-data.ts`)

#### Added Two-Pass Parsing for Ammo Data
- **First pass:** Build ammo lookup map from `SAmmoContainerComponentParams`
- **Second pass:** Parse items and link weapon damage stats via ammo references
- Extracts: damage, speed, lifetime, impact/energy/physical/distortion damage

#### Expanded Component Stat Extraction

**Weapons (SCItemWeaponComponentParams):**
- `ammoRef` - Reference to ammo container
- `fireRate` - Rounds per minute
- `fireAction` - Fire mode name
- `heatPerShot` - Heat generation per shot
- `weaponClass` - Weapon classification
- Linked ammo stats: `ammoDamage`, `ammoSpeed`, `ammoLifetime`, `ammoImpactDamage`, `ammoEnergyDamage`, `ammoPhysicalDamage`, `ammoDistortionDamage`

**Shields (SCItemShieldGeneratorParams):**
- `shieldMaxHP` - Maximum shield health
- `shieldRegen` - Regeneration rate
- `shieldDownedDelay` - Delay before regen after down
- `shieldDownedRegen` - Damaged regen delay
- `shieldAbsorption` - Maximum absorption

**Power Plants & Coolers (ItemResourceComponentParams):**
- `powerOutput` - Power generation
- `powerDraw` - Power consumption
- `coolingRate` - Cooling capacity
- `thermalEnergyBase` - Base thermal energy
- `thermalEnergyDraw` - Thermal energy draw

**Quantum Drives (SCItemQuantumDriveParams):**
- `qdSpoolTime` - Spool up time
- `qdSpeed` - Drive speed
- `qdFuelRate` - Fuel consumption rate
- `qdCooldownTime` - Cooldown duration
- `qdStage1AccelRate` - Stage 1 acceleration
- `qdStage2AccelRate` - Stage 2 acceleration

**Armor (SCItemArmorParams):**
- `damageReduction` - Damage mitigation
- `signalReduction` - Signature reduction
- `tempMin` - Minimum temperature tolerance
- `tempMax` - Maximum temperature tolerance

**Mining Modules (SCItemMiningModuleParams):**
- `instability` - Mining instability factor
- `resistance` - Rock resistance
- `optimalChargeWindowSize` - Optimal charge window
- `optimalChargeRate` - Optimal charge rate
- `shatterDamage` - Shatter damage value

**Health/Durability (SHealthComponentParams):**
- `health` - Maximum health
- `healthMax` - Maximum health (alias)

**Distortion (SDistortionParams):**
- `distortionMax` - Maximum distortion
- `distortionDecayRate` - Decay rate
- `distortionRecoveryTime` - Recovery time
- `distortionOverloadRatio` - Overload ratio

**Attachment Ports (SItemPortContainerComponentParams):**
- `ports` - Array of port definitions with:
  - `name` - Port name
  - `minSize` - Minimum size
  - `maxSize` - Maximum size
  - `types` - Allowed port types

### 2. Added Ship Extraction

New `parseShips()` function extracts:
- Ship name (localized)
- Manufacturer
- Focus (Combat, Exploration, etc.)
- Description (localized)
- Movement class
- Default loadout (port → item mappings)

### 3. Added Manufacturer Database Extraction

New `parseManufacturers()` function extracts:
- Manufacturer code (e.g., "anvil", "behr")
- Name (localized, e.g., "Anvil Aerospace")
- Description (localized lore text)

### 4. Enhanced Import Script (`import-game-data.ts`)

#### Attribute Import for Matched Items
- Delete existing attributes before update
- Insert new attributes from P4K data
- Filter out null/undefined values
- Convert objects to JSON strings

#### Attribute Import for New Items
- Insert items with `.returning('id')` to get IDs
- Insert attributes for each new item
- Handle object values via JSON serialization

#### Updated Interface
- Added `attributes?: Record<string, any>` to `P4KItem` interface

### 5. Updated Documentation

**README-GAME-DATA-EXTRACTION.md:**
- Added component stats section with full list of extracted attributes
- Added ships and manufacturers to extraction counts
- Added attributes object structure example
- Added ship and manufacturer field documentation

## Data Flow

```
P4K Data.p4k
    ↓
StarBreaker CLI (DCB extraction)
    ↓
extract-game-data.ts
    ├─ Parse items with component stats → attributes object
    ├─ Parse ships with loadouts
    ├─ Parse manufacturers with lore
    └─ Output: game-data.json with attributes
        ↓
import-game-data.ts
    ├─ Match/insert items
    ├─ Extract attributes from P4K items
    └─ Populate game_item_attributes table
        ↓
Database: game_item_attributes
    ├─ game_item_id (UUID)
    ├─ attribute_name (string)
    └─ attribute_value (string/JSON)
```

## Example Output

### Item with Attributes
```json
{
  "id": "abc123",
  "name": "Behring P4-AR",
  "type": "WeaponPersonal",
  "size": 2,
  "grade": 1,
  "manufacturer": "behr",
  "attributes": {
    "health": 1000,
    "ammoRef": "ammo_ballistic_medium",
    "fireRate": 600,
    "heatPerShot": 15,
    "weaponClass": "Rifle",
    "ammoDamage": 45,
    "ammoSpeed": 800,
    "ammoLifetime": 2.5,
    "ammoPhysicalDamage": 45,
    "ports": [
      {
        "name": "optics",
        "minSize": 1,
        "maxSize": 1,
        "types": ["Optics"]
      }
    ]
  }
}
```

### Ship Data
```json
{
  "id": "ship123",
  "name": "Anvil Hornet F7C",
  "manufacturer": "anvil",
  "focus": "Combat",
  "description": "The F7C is the foundation to build on...",
  "movementClass": "Fighter",
  "defaultLoadout": [
    { "port": "hardpoint_weapon_left", "item": "weapon_ballistic_01", "size": 3 },
    { "port": "hardpoint_weapon_right", "item": "weapon_ballistic_01", "size": 3 }
  ]
}
```

### Manufacturer Data
```json
{
  "id": "mfr123",
  "code": "anvil",
  "name": "Anvil Aerospace",
  "description": "Anvil Aerospace is a Human spacecraft manufacturer..."
}
```

## Database Schema

The `game_item_attributes` table stores all extracted attributes:

```sql
CREATE TABLE game_item_attributes (
  game_item_id UUID REFERENCES game_items(id),
  attribute_name VARCHAR NOT NULL,
  attribute_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (game_item_id, attribute_name)
);
```

## Testing

Both scripts compile successfully:
```bash
✓ npx tsc --noEmit scripts/extract-game-data.ts
✓ npx tsc --noEmit scripts/import-game-data.ts
```

## Usage

### Extract with Component Stats
```bash
npm run extract-game-data -- \
  --p4k /path/to/Data.p4k \
  --starbreaker /path/to/starbreaker
```

### Import with Attributes
```bash
npm run import-game-data -- \
  --file ./game-data-export/game-data.json
```

The import will automatically:
1. Update/insert items with P4K metadata
2. Delete old attributes for matched items
3. Insert new attributes from extracted data
4. Handle JSON serialization for complex values

## Benefits

1. **Rich Item Data:** All component stats available for wiki, search, and filtering
2. **Market Integration:** Stats can be displayed on listing pages
3. **Crafting System:** Quality calculations can reference actual item stats
4. **Wiki Features:** Full item database with complete specifications
5. **Search & Filter:** Users can filter by specific stat ranges (e.g., "shields > 5000 HP")

## Next Steps

- Task 8.9: Implement Game Database Wiki (backend)
- Task 8.10: Implement Game Database Wiki (frontend)
- Task 8.11: Integrate crafting with inventory/stock management

## Files Modified

- `sc-market-backend/scripts/extract-game-data.ts` - Enhanced extraction
- `sc-market-backend/scripts/import-game-data.ts` - Attribute import
- `sc-market-backend/scripts/README-GAME-DATA-EXTRACTION.md` - Documentation
- `sc-market-backend/docs/task-8.8-component-stats-extraction.md` - This file
