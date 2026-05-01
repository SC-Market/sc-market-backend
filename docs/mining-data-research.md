# Mining Data Research — Star Citizen P4K DCB Export

**Date:** 2026-04-30
**DCB Source:** `/Volumes/Sandisk-SSD/dcb_out/libs/foundry/records/`

---

## 1. Data Reference Chain

The complete mining data chain flows as:

```
Provider Preset (location spawn table)
  → Harvestable Preset (links to entity + transform)
    → Entity (mineable rock .json — not in records/, in entities/mineable/)
      → Rock Composition Preset (what minerals are inside)
        → Mineable Element (mining gameplay params per mineral)
          → Resource Type (from resourcetypedatabase — trade commodity)
```

Quality distributions are a parallel system:
```
Quality Distribution (per mining tier: fps/ground/ship×rarity)
  → Location Overrides (Pyro, Nyx clusters get different quality curves)
```

---

## 2. mining/mineableelements/ — Mineable Elements

**Count:** 46 files (including 3 ship templates, 1 fps template, 1 ground vehicle template, 1 test)

### JSON Structure

```json
{
  "_RecordName_": "MineableElement.Gold_Ore",
  "_RecordId_": "f2f5bf2e-...",
  "_RecordValue_": {
    "_Type_": "MineableElement",
    "resourceType": {                              // Reference to resourcetypedatabase
      "_RecordPath_": "file://...resourcetypedatabase.json",
      "_RecordName_": "ResourceType.Ore_Gold",
      "_RecordId_": "57aba429-..."
    },
    "elementInstability": 550.0,                   // number — mining instability
    "elementResistance": 0.5,                      // number — resistance to mining laser
    "elementOptimalWindowMidpoint": 0.5,           // number — center of optimal charge window (0-1)
    "elementOptimalWindowMidpointRandomness": 0.25, // number — randomness of window position
    "elementOptimalWindowThinness": 2.1,           // number — how narrow the optimal window is
    "elementExplosionMultiplier": 100.0,           // number — explosion damage multiplier
    "elementClusterFactor": 0.05                   // number — clustering tendency
  }
}
```

### Categories

| Category | Files | Examples |
|----------|-------|---------|
| Ship mining ores | 22 | `gold_ore`, `iron_ore`, `quantainium_raw`, `agricium_ore`, `bexalite_raw`, `savrilium_ore`, `stileron_ore` |
| FPS mining gems | 12 | `minableelement_fps_hadanite`, `_fps_aphorite`, `_fps_dolivine`, `_fps_carinite`, `_fps_saldynium`, `_fps_vlklimpet`, `_fps_flowstone`, `_fps_sadaryx` |
| Ground vehicle mining | 5 | `minableelement_groundvehicle_feynmaline`, `_groundvehicle_beradom`, `_groundvehicle_carinite`, `_groundvehicle_glacosite` |
| Templates | 4 | `minableelement_ship_template`, `_fps_template`, `_groundvehicle_template` |
| Test | 1 | `testelement_balance` |
| Special | 2 | `diamond_raw`, `minableelement_fps_carinitepure` |

### What extract-game-data.ts extracts: **NOTHING** from this directory.

The existing script only reads `rockcompositionpresets` and extracts `element: refName(p.mineableElement)` — it gets the filename but not the actual gameplay parameters (instability, resistance, optimal window, explosion multiplier, cluster factor).

**Missing fields:** `elementInstability`, `elementResistance`, `elementOptimalWindowMidpoint`, `elementOptimalWindowMidpointRandomness`, `elementOptimalWindowThinness`, `elementExplosionMultiplier`, `elementClusterFactor`, and the `resourceType` reference.

---

## 3. harvestable/harvestablepresets/ — Harvestable Presets

**Total files:** 571 (all types including loot, weapons, plants, etc.)
**Mining-related:** 237 files (207 `mining_*` + 24 `fpsmining_*` + 6 `groundvehiclemining_*`)

### JSON Structure (all mining presets share this)

```json
{
  "_RecordName_": "HarvestablePreset.Mining_Common_Iron",
  "_RecordId_": "bc74b87f-...",
  "_RecordValue_": {
    "_Type_": "HarvestablePreset",
    "entityClass": "file://...entities/mineable/mineablerock_surfacecommon_iron.json",  // string — entity ref
    "harvestBehaviour": {
      "_Type_": "HarvestBehaviourParams",
      "harvestConditions": [{
        "_Type_": "HarvestConditionHealth",
        "healthRatio": 0.0                         // number
      }],
      "despawnTimer": {
        "_Type_": "HarvestDespawnTimerParams",
        "despawnTimeSeconds": 600,                 // number
        "additionalWaitForNearbyPlayersSeconds": 300 // number
      }
    },
    "transformParams": {
      "_Type_": "HarvestableTransformParams",
      "localRotationOffset": { "x": 0.0, "y": 0.0, "z": 0.0 },
      "minScale": 0.2,                            // number
      "maxScale": 1.0,                            // number
      "terrainNormalAlignment": 1.0,               // number
      "rotationRange": { "x": 360.0, "y": 360.0, "z": 360.0 },
      "positionOffset": { "x": 0.0, "y": 0.0, "z": 0.0 },
      "minZOffset": 0.1,                          // number
      "maxZOffset": 0.25,                         // number
      "minSlope": 0.0,                            // number
      "maxSlope": 90.0,                           // number
      "minElevation": -10000.0,                   // number
      "maxElevation": 10000.0                     // number
    },
    "subConfigBase": null,                         // null OR SubHarvestableConfigManual (see below)
    "respawnInSlotTime": 3600.0,                   // number — seconds
    "specialHarvestableString": ""                 // string
  }
}
```

### SubConfig (for asteroid FPS mining bases)

Files like `fpsmining_asteroid_base_hadanite.json` have a `subConfigBase` that nests child harvestables:

```json
"subConfigBase": {
  "_Type_": "SubHarvestableConfigManual",
  "subConfigManual": {
    "_Type_": "SubHarvestableConfig",
    "initialSlotsProbability": 0.3,                // number
    "initialSlotsProbabilityDeepest": null,         // number | null
    "configRespawnTimeMultiplier": 1.0,            // number
    "subHarvestables": [{
      "_Type_": "SubHarvestableSlot",
      "harvestable": "file://...fpsmining_hadanite.json",  // ref to child preset
      "harvestableEntityClass": null,
      "harvestableSetup": null,
      "relativeProbability": 1.0,                  // number
      "relativeProbabilityDeepest": null,           // number | null
      "harvestableRespawnTimeMultiplier": 1.0,     // number
      "geometries": [{ "_Type_": "HarvestableGeometry", "tag": {...} }],
      "lootConfig": null
    }]
  }
}
```

### Mining Preset Subcategories

| Prefix | Count | Description |
|--------|-------|-------------|
| `mining_common_*` | 10 | Surface common rocks (iron, tin, quartz, etc.) |
| `mining_uncommon_*` | 7 | Surface uncommon (titanium, agricium, laranite, etc.) |
| `mining_rare_*` | 6 | Surface rare (gold, beryl, bexalite, taranite, borase) |
| `mining_epic_*` | 4 | Surface epic (riccite, ouratite, lindinium + template) |
| `mining_legendary_*` | 4 | Surface legendary (quantainium, savrilium, stileron + template) |
| `mining_felsic_*` | 10 | Felsic rock type variants |
| `mining_granite_*` | 10 | Granite rock type variants |
| `mining_gneiss_*` | 10 | Gneiss rock type variants |
| `mining_shale_*` | 10 | Shale rock type variants |
| `mining_igneous_*` | 10 | Igneous rock type variants |
| `mining_obsidian_*` | 10 | Obsidian rock type variants |
| `mining_atacamite_*` | 10 | Atacamite rock type variants |
| `mining_quartzite_*` | 10 | Quartzite rock type variants |
| `mining_quantanium` | 1 | Special quantanium preset |
| `mining_asteroid*` | ~90 | Asteroid variants (ctype, etype, mtype, ptype, qtype, stype, itype, common, uncommon, rare, epic, legendary) |
| `fpsmining_*` | 24 | FPS mining (hand mining) presets |
| `groundvehiclemining_*` | 6 | Ground vehicle mining presets |

### What extract-game-data.ts extracts: **NOTHING** from harvestable presets.

The key field for the data chain is `entityClass` — this links the preset to the actual mineable entity. The entity then references a rock composition preset.

---

## 4. harvestable/providerpresets/system/ — Location Spawn Tables

**Systems:** Stanton, Pyro, Nyx

### File Counts

| System | Surface files | Asteroid field files |
|--------|--------------|---------------------|
| Stanton | 16 (hpp_stanton1.json through hpp_stanton4c.json + shipgraveyard + spacederelict) | 14 (aaronhalo, lagrange_a-g, stanton2c_belt, clusters, resourcerush) |
| Pyro | 11 (hpp_pyro1-6, hpp_pyro5a-f) | 6 (deepspace, warm01-02, cool01-02, akirocluster) |
| Nyx | 0 surface | 2 (keegerbelt, glaciemring) |

### JSON Structure

```json
{
  "_RecordName_": "HarvestableProviderPreset.HPP_Stanton1b",
  "_RecordId_": "8f6fb27e-...",
  "_RecordValue_": {
    "_Type_": "HarvestableProviderPreset",
    "harvestableGroups": [                         // Array of HarvestableElementGroup
      {
        "_Type_": "HarvestableElementGroup",
        "groupName": "SpaceShip_Mineables",        // string — group identifier
        "groupProbability": 6.0,                    // number — weight for this group
        "harvestables": [                           // Array of HarvestableElement
          {
            "_Type_": "HarvestableElement",
            "harvestable": "file://...mining_common_aluminum.json",  // ref to preset
            "harvestableEntityClass": null,
            "harvestableSetup": null,
            "relativeProbability": 29.7,            // number — weight within group
            "clustering": "file://...commonshipmineable_cluster.json",  // clustering ref
            "geometries": [{
              "_Type_": "HarvestableGeometry",
              "tag": { "_RecordId_": "..." }
            }]
          }
          // ... more harvestables
        ]
      }
      // ... more groups
    ],
    "areas": []                                    // Array (usually empty for surface)
  }
}
```

### Group Names Found

Surface providers typically have 3 groups:
- `SpaceShip_Mineables` — ship-mineable rocks
- `GroundVehicle_Mineables` — ground vehicle rocks
- `FPS_Mineables` — hand-mineable deposits

Asteroid field providers have groups like:
- `AsteroidCommon`, `AsteroidUncommon`, `AsteroidRare`, `AsteroidEpic`, `AsteroidLegendary`
- Various asteroid type groups (ctype, etype, mtype, ptype, qtype, stype, itype)

### Example: Stanton 1b (Hurston's moon Magda)

```
SpaceShip_Mineables (groupProbability: 6.0):
  mining_common_aluminum      → relativeProbability: 29.7
  mining_uncommon_titanium    → relativeProbability: 28.5
  mining_epic_ouratite        → relativeProbability: 10.0
  mining_legendary_quantainium → relativeProbability: 2.0
  mining_common_corundum      → relativeProbability: 29.8

GroundVehicle_Mineables (groupProbability: 12.5):
  groundvehiclemining_beradom   → relativeProbability: 0.5
  groundvehiclemining_glacosite → relativeProbability: 4.0
  groundvehiclemining_feynmaline → relativeProbability: 8.0

FPS_Mineables (groupProbability: 25.0):
  fpsmining_aphorite  → relativeProbability: 58.6
  fpsmining_dolivine  → relativeProbability: 35.4
  fpsmining_hadanite  → relativeProbability: 6.0
```

### What extract-game-data.ts extracts: **NOTHING** from provider presets.

This is the most critical missing data — it tells you WHERE each mineral spawns and with what probability.

---

## 5. crafting/qualitydistribution/ — Quality Distributions

### Directory Structure

```
crafting/qualitydistribution/
├── fpsmineables/          (3 files)
│   ├── fpsmineable_qualitydistribution_default.json
│   ├── fpsmineable_qualitydistribution_carinite.json
│   └── fpsmineable_qualitydistribution_pyro.json
├── groundmineables/       (2 files)
│   ├── groundmineable_qualitydistribution_default.json
│   └── groundmineable_qualitydistribution_pyro.json
├── shipmineables/         (14 files)
│   ├── commonshipmineable_qualitydistribution_default.json
│   ├── uncommonshipmineable_qualitydistribution_default.json
│   ├── rareshipmineable_qualitydistribution_default.json
│   ├── epicshipmineable_qualitydistribution_default.json
│   ├── legendaryshipmineable_qualitydistribution_default.json
│   ├── shipmineable_qualitydistribution_pyro_template.json
│   ├── commonshipmineable_qualityoverride_pyro.json
│   ├── uncommonshipmineable_qualityoverride_pyro.json
│   ├── rareshipmineable_qualityoverride_pyro.json
│   ├── epicshipmineable_qualityoverride_pyro.json
│   ├── legendaryshipmineable_qualityoverride_pyro.json
│   ├── uncommonshipmineable_qualityoverride_torite.json   (25KB! many location overrides)
│   └── legendaryshipmineable_qualityoverride_rcd.json     (25KB! many location overrides)
├── harvestables/          (2 files — for plants/gatherables, not mining)
└── creatures/             (2 files — not mining)
```

### Default Distribution Structure

```json
{
  "_RecordName_": "CraftingQualityDistributionRecord.FPSMineable_QualityDistribution_Default",
  "_RecordId_": "ef749246-...",
  "_RecordValue_": {
    "_Type_": "CraftingQualityDistributionRecord",
    "qualityDistribution": {
      "_Type_": "CraftingQualityDistributionNormal",
      "min": 201,          // number — minimum quality value
      "max": 1000,         // number — maximum quality value
      "mean": 201.0,       // number — mean of normal distribution
      "stddev": 298.0      // number — standard deviation
    }
  }
}
```

### Location Override Structure

```json
{
  "_RecordName_": "CraftingQualityLocationOverrideRecord.FPSMineable_QualityDistribution_Pyro",
  "_RecordId_": "d4574707-...",
  "_RecordValue_": {
    "_Type_": "CraftingQualityLocationOverrideRecord",
    "locationOverride": {
      "_Type_": "CraftingQualityLocationOverride",
      "locationOverrideList": [                    // Array of overrides
        {
          "_Type_": "CraftingQualityLocationOverrideEntry",
          "location": "file://...starmap/pu/pyrosolarsystem.json",  // starmap ref
          "qualityDistribution": {
            "_Type_": "CraftingQualityDistributionNormal",
            "min": 201,
            "max": 1000,
            "mean": 209.0,
            "stddev": 308.0
          }
        }
      ]
    }
  }
}
```

### Quality Distribution Summary

| Mining Type | Default min-max | Default mean/stddev | Pyro mean/stddev |
|-------------|----------------|---------------------|------------------|
| FPS Mineable | 201-1000 | 201/298 | 209/308 |
| FPS Carinite | 201-1000 | (separate file) | — |
| Ground Mineable | 1-1000 | 297/256 | (separate file) |
| Ship Common | 501-1000 | 105/209 | (override file) |
| Ship Uncommon | 501-1000 | (default file) | 109/220 |
| Ship Rare | (default file) | — | (override file) |
| Ship Epic | (default file) | — | (override file) |
| Ship Legendary | (default file) | — | (override file) |

The torite and RCD (legendary) overrides have **hundreds** of location-specific entries for individual Nyx asteroid cluster locations.

### What extract-game-data.ts extracts: **NOTHING** from quality distributions.

---

## 6. mining/rockcompositionpresets/ — Rock Composition Presets

**Total files:** 249 (186 root + 32 asteroidshipmining/ + 31 surfaceshipmining/)

### Directory Structure

```
mining/rockcompositionpresets/
├── *.json                    (186 files — surface/fps/ground/old asteroid compositions)
├── asteroidshipmining/       (32 files — new asteroid ship mining compositions)
└── surfaceshipmining/        (31 files — new surface ship mining compositions)
```

### JSON Structure (MineableComposition)

```json
{
  "_RecordName_": "MineableComposition.GraniteDeposit_Iron",
  "_RecordId_": "c242805c-...",
  "_RecordValue_": {
    "_Type_": "MineableComposition",
    "depositName": "@hud_mining_rock_name_2",      // string — localization key
    "minimumDistinctElements": 2,                   // number
    "compositionArray": [                           // Array of MineableCompositionPart
      {
        "_Type_": "MineableCompositionPart",
        "mineableElement": "file://...mineableelements/iron_ore.json",  // ref to element
        "minPercentage": 30.0,                     // number — min % of rock
        "maxPercentage": 70.0,                     // number — max % of rock
        "probability": 1.0,                        // number — chance this element appears (0-1)
        "curveExponent": 1.0,                      // number — distribution curve shape
        "qualityScale": 1.0                        // number — quality multiplier for this part
      }
      // ... more composition parts
    ]
  }
}
```

### Key Fields on MineableCompositionPart

| Field | Type | Description |
|-------|------|-------------|
| `mineableElement` | ref | Points to mineableelements/ file |
| `minPercentage` | number | Minimum percentage of rock this element occupies |
| `maxPercentage` | number | Maximum percentage |
| `probability` | number | 0-1, chance this element appears in a given rock |
| `curveExponent` | number | Controls distribution shape (1.0 = linear) |
| `qualityScale` | number | Multiplier on quality for this part (0.49 = half quality) |

### Composition Categories

| Category | Count | Example |
|----------|-------|---------|
| Surface rock types (granite, shale, felsic, gneiss, igneous, obsidian, atacamite, quartzite) × mineral | ~144 | `granitedeposit_iron`, `atacamitedeposit_tin` |
| Old asteroid types (ctype, etype, mtype, ptype, qtype, stype, itype) × mineral | ~70 | `asteroid_ctype_iron`, `asteroid_stype_silicon` |
| FPS compositions | 12 | `fps_composition_hadanitedeposit`, `fps_composition_vlklimpet` |
| Ground vehicle compositions | 5 | `groundvehicle_composition_feynmalinedeposit` |
| Special | 3 | `quantaniumdeposit`, `asteroid_goldonly`, `asteroid_itype_ice` |
| New asteroid ship mining | 32 | `commonshipmineablesasteroid_iron`, `rareshipmineablesasteroid_gold` |
| New surface ship mining | 31 | `commonshipmineables_iron`, `rareshipmineables_gold` |
| Test/template | ~20 | `testcompositionpreset_*`, `*_template` |

### New Ship Mining Compositions (asteroidshipmining/ and surfaceshipmining/)

These use `qualityScale` extensively. Example:

```json
// commonshipmineablesasteroid_iron.json
"compositionArray": [
  { "mineableElement": "iron_ore", "minPercentage": 2.82, "maxPercentage": 6.82,
    "probability": 1.0, "curveExponent": 1.0, "qualityScale": 1.0 },
  { "mineableElement": "iron_ore", "minPercentage": 43.18, "maxPercentage": 93.18,
    "probability": 1.0, "curveExponent": 1.0, "qualityScale": 0.49 }
]
```

Note: The same element appears twice with different quality scales — high-quality portion is small (2.82-6.82%), low-quality portion (qualityScale: 0.49) is large (43.18-93.18%).

### What extract-game-data.ts extracts

The `parseRockCompositions()` function extracts:
- ✅ `name` (filename)
- ✅ `depositName` (localized)
- ✅ `minDistinctElements`
- ✅ `elements[].element` (refName of mineableElement)
- ✅ `elements[].minPct`
- ✅ `elements[].maxPct`
- ✅ `elements[].probability`
- ❌ **MISSING: `curveExponent`** — always 1.0 in old presets but could vary
- ❌ **MISSING: `qualityScale`** — critical for new ship mining compositions (0.49, 0.789, etc.)
- ❌ **MISSING: subdirectories** — `asteroidshipmining/` and `surfaceshipmining/` are NOT traversed because `findJsonFiles` is recursive, but the current code only reads from the root `rockcompositionpresets/` directory. **Wait — `findJsonFiles` IS recursive**, so these should be included. Let me verify...

Actually, `findJsonFiles` in the script IS recursive (it walks subdirectories), so `asteroidshipmining/` and `surfaceshipmining/` files ARE included. The missing fields are just `curveExponent` and `qualityScale`.

---

## 7. Summary: What's Missing from extract-game-data.ts

### Currently Extracted
- Rock compositions (186+32+31 = 249 files) with element, minPct, maxPct, probability

### NOT Extracted At All

| Data Type | Files | Why It Matters |
|-----------|-------|---------------|
| **Mineable Elements** | 46 | Mining gameplay params (instability, resistance, optimal window, explosion) + resource type link |
| **Harvestable Presets** | 237 mining | Links preset name → entity class (the actual rock entity) |
| **Provider Presets** | 49 | WHERE minerals spawn and with what probability per location |
| **Quality Distributions** | 19 | Quality curves per mining tier and location overrides |

### Missing Fields on Existing Extractions

| Extraction | Missing Fields |
|-----------|---------------|
| Rock Compositions | `curveExponent`, `qualityScale` on each composition part |

---

## 8. Recommended Extraction Plan

### Phase 1: Enrich existing rockCompositions
Add `curveExponent` and `qualityScale` to each element in the composition array.

### Phase 2: Extract mineable elements
New output: `mineableElements[]` with all gameplay parameters and resource type reference.

### Phase 3: Extract provider presets (location spawn tables)
New output: `miningLocations[]` with structure:
```typescript
{
  location: string           // e.g. "stanton1b" (Magda)
  system: string             // "stanton" | "pyro" | "nyx"
  type: "surface" | "asteroidfield"
  groups: {
    groupName: string        // "SpaceShip_Mineables" etc.
    groupProbability: number
    harvestables: {
      preset: string         // e.g. "mining_common_aluminum"
      relativeProbability: number
      clustering: string     // clustering preset ref
    }[]
  }[]
}
```

### Phase 4: Extract quality distributions
New output: `miningQualityDistributions[]` with defaults and location overrides.

### Phase 5: Extract harvestable presets (mining only)
New output: `miningPresets[]` linking preset name → entity class → composition.

This would enable computing: "At location X, what's the probability of finding mineral Y, and what quality range can I expect?"
