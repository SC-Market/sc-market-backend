# Game Data Extraction

Extracts Star Citizen game data from `Data.p4k` using [StarBreaker](https://github.com/diogotr7/StarBreaker) CLI. Resolves all localization keys to English and produces a `game-data.zip` for admin import.

## What it extracts

| Data | Count | Details |
|------|-------|---------|
| **Items** | ~8,755 | Name, type, subtype, size, grade, manufacturer, thumbnail path, **component stats** |
| **Blueprints** | ~1,044 | Crafting recipes with ingredients, quality modifiers, craft times |
| **Missions** | ~2,558 | Title, type, rewards, reputation, location |
| **Resources** | ~195 | Name, group, density |
| **Ships** | ~TBD | Manufacturer, focus, description, movement class, default loadout |
| **Manufacturers** | ~TBD | Name, code, localized descriptions and lore |
| **Starmap** | ~298 | Locations with hierarchy (System → Planet → Moon → Outpost) |

All `@localization_key` references are resolved to English using `global.ini` (86k+ strings). Coverage: **98% of items** have resolved names.

### Component Stats Extracted

Items now include detailed `attributes` with component statistics:

**Weapons:**
- Ammo reference, fire rate, heat per shot, weapon class
- Damage stats (from linked ammo): impact, energy, physical, distortion
- Ammo speed, lifetime
- Attachment ports (optics, barrel, underbarrel)

**Shields:**
- Max HP, regen rate, downed delay, absorption

**Power Plants:**
- Power output, power draw

**Coolers:**
- Cooling rate, thermal energy base/draw

**Quantum Drives:**
- Spool time, speed, fuel rate, cooldown
- Stage 1/2 acceleration rates

**Armor:**
- Damage reduction, signal reduction
- Temperature range (min/max)

**Mining Modules:**
- Instability, resistance, optimal charge window
- Optimal charge rate, shatter damage

**Health/Durability:**
- Max health from SHealthComponentParams

**Distortion:**
- Max distortion, decay rate, recovery time, overload ratio

All stats stored as `attributes` object per item in game-data.json. Import script populates `game_item_attributes` table from these.

## Prerequisites

- **StarBreaker CLI** — Rust binary ([build from source](https://github.com/diogotr7/StarBreaker))
- **Star Citizen `Data.p4k`** — the game's data archive
- Node.js 24+ with `tsx`

## Usage

### Full extraction (from p4k)

```sh
npm run extract-game-data -- \
  --p4k /Volumes/Sandisk-SSD/Data.p4k \
  --starbreaker /Volumes/Sandisk-SSD/StarBreaker-src/target/release/starbreaker
```

This runs StarBreaker to extract both the DCB database and `global.ini` localization, then parses everything into a single zip.

### From pre-extracted data (faster)

```sh
npm run extract-game-data -- \
  --dcb-dir /Volumes/Sandisk-SSD/dcb_out \
  --loc /Volumes/Sandisk-SSD/loc_extract/Data/Localization/english/global.ini
```

### Custom output directory

```sh
npm run extract-game-data -- --dcb-dir /path/to/dcb --loc /path/to/global.ini --output ./my-export
```

## Output

`game-data-export/game-data.zip` (~764 KB) containing `game-data.json`:

```json
{
  "extractedAt": "2026-04-19T...",
  "localizationKeys": 86813,
  "counts": { 
    "items": 8755, 
    "blueprints": 1044, 
    "missions": 2558, 
    "resources": 195, 
    "ships": 150,
    "manufacturers": 50,
    "locations": 298 
  },
  "items": [...],
  "blueprints": [...],
  "missions": [...],
  "resources": [...],
  "ships": [...],
  "manufacturers": [...],
  "starmap": [...]
}
```

### Item fields

| Field | Example | Source |
|-------|---------|--------|
| `name` | `P4-AR Rifle` | Resolved from `@item_Name...` via global.ini |
| `nameKey` | `@item_Namebehr_rifle_ballistic_01` | Raw localization key |
| `displayType` | `Rifle` | Resolved from `@item_displayType_Rifle` |
| `type` | `WeaponPersonal` | `SAttachableComponentParams.AttachDef.Type` |
| `subType` | `Medium` | `SAttachableComponentParams.AttachDef.SubType` |
| `size` | `2` | Game item size class |
| `grade` | `1` | Game item grade |
| `manufacturer` | `behr` | Manufacturer code |
| `thumbnail` | `ui/textures/vector/...` | SVG/texture path |
| `attributes` | `{ health: 1000, shieldMaxHP: 5000, ... }` | Component stats (see below) |

### Attributes object structure

Items with component stats include an `attributes` object with relevant stats:

```json
{
  "id": "...",
  "name": "Behring P4-AR",
  "type": "WeaponPersonal",
  "attributes": {
    "health": 1000,
    "ammoRef": "ammo_ballistic_medium",
    "fireRate": 600,
    "ammoDamage": 45,
    "ammoSpeed": 800,
    "ports": [
      { "name": "optics", "minSize": 1, "maxSize": 1, "types": ["Optics"] }
    ]
  }
}
```

### Ship fields

| Field | Example |
|-------|---------|
| `name` | `Anvil Hornet F7C` (resolved from localization) |
| `manufacturer` | `anvil` |
| `focus` | `Combat` |
| `description` | Localized ship description |
| `movementClass` | `Fighter` |
| `defaultLoadout` | Array of `{ port, item, size }` for default equipment |

### Manufacturer fields

| Field | Example |
|-------|---------|
| `code` | `anvil` |
| `name` | `Anvil Aerospace` (resolved from localization) |
| `description` | Localized manufacturer lore and description |

### Starmap fields

| Field | Example |
|-------|---------|
| `name` | `Hurston` (resolved from `@Stanton1`) |
| `type` | `Planet`, `Moon`, `LandingZone`, `Outpost`, `Star`, `Manmade` |
| `parent` | `starmapobject.stantonstar` (for hierarchy) |
| `jurisdiction` | `hurstondynamics` |

## Updating after a patch

1. Update Star Citizen to the latest patch
2. Run the extraction script against the new `Data.p4k`
3. Upload `game-data.zip` via the admin import endpoint
