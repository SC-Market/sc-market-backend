# Location Data Research — Star Citizen P4K DCB Export

> Generated 2026-04-30 from `/Volumes/Sandisk-SSD/dcb_out/libs/foundry/records/`

---

## 1. Starmap Objects (`starmap/pu/`)

### Record Counts
- **Total files**: 1,991 JSON files (919 top-level + 970 in `system/` subdirs + 102 in `mission_item/`)
- **Directory structure**: `system/{stanton,pyro,nyx,demo}/{planet}/{subdirs}`
- Subdirs per planet: `landingzone/`, `outpost/`, `ugf/`, `lagrange/`, `commarray/`, `orbiting/`, `conventioncenter/`, `miningclaim/`, `secondarycities/`

### StarMapObject JSON Structure

Every file follows this envelope:

```json
{
  "_RecordName_": "StarMapObject.Stanton4",        // string
  "_RecordId_": "5a529db7-...",                     // UUID
  "_RecordValue_": {
    "_Type_": "StarMapObject",                      // always "StarMapObject"
    // --- fields below ---
  }
}
```

### Complete Field List on `_RecordValue_`

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Localization key (e.g. `"@Stanton4"`) |
| `affiliation` | `string \| null` | Faction affiliation |
| `description` | `string` | Localization key for description |
| `callout1` | `string` | Localization key (usually `@LOC_UNINITIALIZED`) |
| `callout2` | `string` | Localization key |
| `callout3` | `string` | Localization key |
| `respawnLocationType` | `string` | `"None"` \| `"Other"` — indicates if you can respawn here |
| `jurisdiction` | `string \| null` | File ref to jurisdiction JSON (e.g. `"file://...jurisdictions/stanton/microtech.json"`) |
| `locationHierarchyTag` | `object \| null` | `{_RecordPath_, _RecordName_, _RecordId_}` — ref to tag database |
| `type` | `object` | `{_RecordPath_, _RecordName_, _RecordId_}` — ref to `starmapobjecttypes.json` |
| `radarProperties` | `object \| null` | `SSCRadarContactProperites` with signatures, scan bounds (present on stations/landing zones) |
| `navIcon` | `string` | `"Planet"` \| `"LandingZone"` \| `"Station"` \| `"Outpost"` \| `"Default"` \| `"JumpPoint"` etc. |
| `parent` | `string` | File ref to parent StarMapObject |
| `isScannable` | `boolean` | Whether radar can detect this |
| `size` | `number` | Display size (1000000 for planets, 1200 for stations, 1.0 for outposts) |
| `hideInStarmap` | `boolean` | Hidden from starmap UI |
| `hideInWorld` | `boolean` | Hidden from world |
| `hideWhenInAdoptionRadius` | `boolean` | |
| `blockTravel` | `boolean` | Blocks quantum travel |
| `onlyShowWhenParentSelected` | `boolean` | Only visible when parent is selected in starmap |
| `overrideShowInAllZones` | `string` | `"NoOverride"` \| other |
| `overridePermanent` | `string` | `"NoOverride"` \| other |
| `minimumDisplaySize` | `number` | Min display size in starmap |
| `overrideRotationSpeed` | `boolean` | |
| `overrideRotationSpeedValue` | `number` | |
| `showOrbitLine` | `boolean` | Show orbital path in starmap |
| `useHoloMaterial` | `boolean` | Use holographic material in starmap |
| `noAutoBodyRecovery` | `boolean` | |
| `starMapGeomPath` | `string` | 3D model path for starmap |
| `starMapMaterialPath` | `string` | Material path for starmap |
| `starMapShapePath` | `string` | SVG icon path |
| `assetManagerLocationParams` | `object` | `{_Type_: "StarMapAssetManagerLocationParams", previewImagePath: string, previewIconPath: string}` |
| `asteroidRings` | `array` | Usually `[]` |
| `quantumTravelData` | `object` | See sub-structure below |
| `locationParams` | `object` | `{setEntityLocationOnEnter: bool, exposeForPlayerCreatedMissions: bool, excludeFromLevelLoad: bool}` |
| `locationImagePath` | `string` | UI image path |
| `locationMedicalImagePath` | `string` | Medical UI image |
| `locationAudioPlayTrigger` | `object` | `{_Type_: "GlobalResourceAudio", audioTrigger: string}` |
| `locationAudioStopTrigger` | `object` | Same as above |
| `amenities` | `array` | Array of refs to `starmapamenitytypes.json` entries |

### `quantumTravelData` Sub-structure

```json
{
  "_Type_": "StarMapQuantumTravelDataParams",
  "obstructionRadius": 1010875.0,    // number
  "arrivalRadius": 1050000.0,        // number
  "arrivalPointDetectionOffset": 50000.0,  // number
  "adoptionRadius": 118481500.0,     // number
  "subPointRadiusMultiplier": 1.5    // number
}
```

### `radarProperties` Sub-structure (present on stations/landing zones)

```json
{
  "_Type_": "SSCRadarContactProperites",
  "contactType": { "_RecordPath_": "...", "_RecordName_": "...", "_RecordId_": "..." },
  "baseSignatureParams": {
    "_Type_": "SSCSignatureSystemBaseSignatureParams",
    "signatures": [22500.0, 75000.0, 250000.0, 0.0, 0.0, 250000.0, 0.0, 0.0],
    "signatureCategories": [],
    "taggedSignatures": []
  },
  "crossSectionParams": null,
  "emissionModifierParams": null,
  "deathParams": null,
  "scanBounds": {
    "_Type_": "SSCSignatureSystemScanBounds",
    "min": { "_Type_": "Vec3", "x": -2000.0, "y": -2000.0, "z": -5000.0 },
    "max": { "_Type_": "Vec3", "x": 2000.0, "y": 2000.0, "z": 5000.0 },
    "localRotation": { "_Type_": "Deg3", "x": 0.0, "y": 0.0, "z": 0.0 }
  },
  "roomParams": { "_Type_": "SCSignatureSystemRoomParams", "ignoreInteriorVsExteriorCheck": false }
}
```

### `amenities` Array Entry

Each entry is a record reference:
```json
{
  "_RecordPath_": "file://...starmapamenitytypes/starmapamenitytypes.json",
  "_RecordName_": "StarMapAmenityTypeEntry.610a2197-c2ba-4128-ada3-77390f41c48d",
  "_RecordId_": "610a2197-c2ba-4128-ada3-77390f41c48d"
}
```

### Examples by Type

| navIcon | Example File | Has Amenities | Has Jurisdiction | Has Radar |
|---------|-------------|---------------|-----------------|-----------|
| Planet | `starmapobject.stanton4.json` | No | Yes (microtech) | No |
| LandingZone | `stanton4_newbabbage.json` | Yes (11 amenities) | Yes (microtech) | Yes |
| Station | `rr_mic_leo.json` (rest stop) | Yes (10 amenities) | No | Yes |
| Outpost | `stanton4_shubin_sm0_13.json` | Yes (3 amenities) | No | No |
| Default | `stanton4_l1.json` (lagrange) | No | No | No |

---

## 2. Starmap Object Types (`starmap/starmapobjecttypes.json`)

**21 types total.** Each StarMapObject's `type._RecordId_` maps to one of these:

| UUID | Name | validQuantumTravelDestination | showInMapSelectList |
|------|------|-------------------------------|---------------------|
| `32ed44de-920b-43ce-b55d-82cc4ef9fa59` | SolarSystem | false | false |
| `80846bb9-e389-411f-b50f-f65f3b639b1d` | Star | false | false |
| `73efbf7b-a595-49df-b99f-f3fe75558d8a` | Planet | true | true |
| `4af1132e-d980-482d-823f-f713a196b9aa` | Moon | true | true |
| `3819ac97-18f1-499e-9729-b889172da3f8` | Manmade | true | true |
| `d68b137c-28c4-4c14-8a29-19e83a586b6d` | LandingZone | true | true |
| `e207a1ec-1395-4c1c-8e51-b38c4420784c` | Outpost | true | true |
| `4969b9e4-4b1e-45b4-b335-506bbf7af476` | PointOfInterest | true | false |
| `c7f1393f-8cb3-4ac8-9dc7-75671c1b07fe` | NavPoint | true | false |
| `d8d66ae3-89fa-4acd-bc6d-466770f18b8a` | YouAreHere | false | false |
| `e60452a5-b85c-4ab1-97e7-9cefb466f87b` | Asteroid | false | false |
| `24975610-8f9b-442c-8f90-4e58f660e8f7` | Anomaly | false | false |
| `4895b5bb-94ac-470a-bf6f-084a54a09be5` | Manmade_VisibleOnInteraction | true | false |
| `f8b09816-e5d1-4be4-9243-e84df0cf5477` | CardinalPoint | false | false |
| `6aba5dfd-0fcb-4fd1-a2e0-ae81742c259e` | QuantumTracePoint | false | false |
| `f6461834-fa63-468f-a3c4-d1ed6ef8c20d` | Asteroid_ValidQT | true | false |
| `65b8ee34-7fbc-432a-afca-834b16fa22f5` | JumpPoint | true | true |
| `0f3924b5-24ad-4e40-bbf2-d9c15e728f9f` | S42_Moon | false | false |
| `458729b4-b257-4d85-af57-938d52b0e18d` | S42_Planet | false | false |
| `f264a1ec-32cd-4262-bcfd-db685d3c970a` | ManmadeJumpPoint | true | true |
| `7949a092-c8c3-447e-b417-156403cf27f0` | Outpost_InvalidQT | false | true |

### StarMapObjectType Fields

```json
{
  "_RecordId_": "UUID",
  "_RecordName_": "StarMapObjectType.UUID",
  "_Type_": "StarMapObjectType",
  "name": "string",                    // e.g. "Planet", "LandingZone"
  "classification": "string",          // localization key for subtext
  "facingMode": "string",              // "Default" | "AwayFromParent"
  "minimumDisplaySize": "number",
  "rotationSpeed": "number",
  "selectable": "boolean",
  "fadeBehindParent": "boolean",
  "onParentSurface": "boolean",        // true for LandingZone, Outpost
  "spawnNavPoints": "boolean",
  "showAsNeighbor": "boolean",
  "innerCulling": "boolean",
  "showInMapSelectList": "boolean",
  "markerConfig": "string",            // file ref to AR marker config
  "validQuantumTravelDestination": "boolean",
  "geometry": { "_Type_": "GlobalResourceGeometry", "path": "string" },
  "material": { "_Type_": "GlobalResourceMaterial", "path": "string" }
}
```

---

## 3. Starmap Amenity Types (`starmapamenitytypes/starmapamenitytypes.json`)

**25 amenity types.** Full ID→name mapping:

| UUID | Name | Display Key |
|------|------|-------------|
| `5438a6c0-818e-45cf-b2fc-f2574d688e8a` | Special Event | `@Maps_Amenities_Event` |
| `1fe6d52d-6c5d-4eb8-b620-3a6ab6477935` | Docking | `@Maps_Amenities_Docking` |
| `10c8aba4-80f7-43bd-a1f6-3396f60394df` | Garage | `@Maps_Amenities_Garage` |
| `9dfc785e-cb15-4e2e-87e3-8d17b825a828` | Hospital | `@Maps_Amenities_Hospital` |
| `e7534915-ab67-4f62-9599-ca139a4eb60a` | Clinic | `@Maps_Amenities_Clinic` |
| `7618a59c-75f4-4f63-9c51-d39c3cc58a75` | Refinery | `@Maps_Amenities_Refinery` |
| `9625042e-95ca-48e3-b6ed-f1cc214048f1` | Buy Weapons | `@Maps_Amenities_Weapons` |
| `f2b40e41-e017-4578-83c6-6ce805af3e46` | Buy Ship Items and Weapons | `@Maps_Amenities_ShipItems` |
| `ef9ab9d9-81b5-4a4a-8d23-5e69d93b0dd9` | Buy Armor | `@Maps_Amenities_Armor` |
| `678d6274-aba3-4749-abfc-31fd2eb7917a` | Buy Clothing | `@Maps_Amenities_Clothing` |
| `4d6a0ad9-27ec-42fa-af64-5f159b906aae` | Buy Vehicles | `@Maps_Amenities_BuyVehicles` |
| `2131b0aa-9e7f-42f0-9970-02a290366679` | Rent Vehicles | `@Maps_Amenities_RentVehicles` |
| `4570fbad-2ac8-4c32-bf2d-54fa5de9e43e` | Buy and Rent Vehicles | `@Maps_Amenities_BuyRentVehicles` |
| `65423473-aab4-4ab7-a836-228da342fa31` | Food Court | `@Maps_Amenities_FoodCourt` |
| `51cf89b3-ecd7-489a-b381-b34e67529533` | Hangar S | `@Maps_Amenities_HangarS` |
| `b0f9d01a-2286-4698-9726-a91697f23a3a` | Hangar M | `@Maps_Amenities_HangarM` |
| `e9192fcd-d722-4599-b057-6e9aa5ed8fc1` | Hangar L | `@Maps_Amenities_HangarL` |
| `610a2197-c2ba-4128-ada3-77390f41c48d` | Hangar XL | `@Maps_Amenities_HangarXL` |
| `76438648-b697-4f2c-a5dd-a3efe0f3b64a` | Landing Pad S | `@Maps_Amenities_LandingPadS` |
| `56d20b90-2e44-4cca-ac14-9f537f7d285e` | Landing Pad M | `@Maps_Amenities_LandingPadM` |
| `7a788ad2-57be-464b-80f8-60a803868bba` | Landing Pad L | `@Maps_Amenities_LandingPadL` |
| `08dfe0cc-f52b-4922-bded-5b33e017b5ac` | Landing Pad XL | `@Maps_Amenities_LandingPadXL` |
| `1178cca7-dd66-4b9d-a22f-5515710a5f9e` | Vehicle Services | `@Maps_Amenities_VehicleServices` |
| `a783bfb9-0f0a-491f-864b-945a49ef5da4` | Commodity Trading - Freight Elevator | `@Maps_Amenities_CargoFreightElevator` |
| `02905cad-b6ef-4e1d-a996-291647200f42` | Commodity Trading - Loading Dock | `@Maps_Amenities_CargoLoadingDock` |

### StarMapAmenityTypeEntry Fields

```json
{
  "_RecordId_": "UUID",
  "_RecordName_": "StarMapAmenityTypeEntry.UUID",
  "_Type_": "StarMapAmenityTypeEntry",
  "name": "string",           // e.g. "Hospital"
  "displayName": "string",    // localization key e.g. "@Maps_Amenities_Hospital"
  "icon": "string"            // SVG icon path
}
```

---

## 4. Jurisdictions (`lawsystem/jurisdictions/`)

**13 jurisdiction files** across 5 systems:

| File | System | Name Key |
|------|--------|----------|
| `uee.json` | (root) | `@Jurisdictions_Name_001` |
| `stanton/crusaderindustries.json` | Stanton | `@Jurisdictions_Name_002` |
| `stanton/hurstondynamics.json` | Stanton | Hurston Dynamics |
| `stanton/arccorp.json` | Stanton | ArcCorp |
| `stanton/microtech.json` | Stanton | microTech |
| `pyro/roughandready.json` | Pyro | Rough and Ready |
| `pyro/xenothreat.json` | Pyro | XenoThreat |
| `pyro/citizensforprosperity.json` | Pyro | Citizens for Prosperity |
| `pyro/headhunters.json` | Pyro | Headhunters |
| `nyx/peoplesalliance.json` | Nyx | People's Alliance |
| `nyx/unclaimedspace.json` | Nyx | Unclaimed Space |
| `ellis/green.json` | Ellis | Green |
| `klescherprison.json` | (special) | Klescher Prison |

### Jurisdiction JSON Structure

```json
{
  "_RecordName_": "Jurisdiction.CrusaderIndustries",
  "_RecordId_": "UUID",
  "_RecordValue_": {
    "_Type_": "Jurisdiction",
    "subsumptionJurisdiction": "string",
    "name": "string",                          // localization key
    "logoPath": "string",                       // SVG brand logo path
    "parentJurisdiction": "string | null",      // file ref to parent (e.g. uee.json)
    "respectsParentJurisdictionLaws": "boolean",
    "infractions": [/* Infraction[] */],        // 0-33 entries
    "infractionSets": [],                       // usually empty
    "journalEntry": "string",                   // file ref to journal entry
    "maxStolenGoodsPossessionSCU": "number",    // e.g. 1.0
    "prohibitedGoods": ["string"],              // file refs to commodity entities
    "prohibitedResources": [/* RecordRef[] */], // refs to resourcetypedatabase
    "controlledSubstanceClasses": [/* ControlledSubstanceClass[] */],
    "baseFine": "number",                       // e.g. 125
    "earlyPaymentPeriod": "number",             // -1.0 = inherit from parent
    "isPrison": "boolean",
    "impoundingDefinitions": []                 // vehicle impounding rules
  }
}
```

### Infraction Entry

```json
{
  "_Type_": "Infraction",
  "definition": "string",    // file ref to infractiondefinitions/
  "parameterOverrides": {
    "_Type_": "InfractionParameters",
    "isFelony": -1,                        // -1 = inherit
    "graceAllowance": -1,
    "graceAllowanceCooldown": -1.0,
    "gracePeriod": -1.0,
    "graceCooloffScale": -1.0,
    "graceWarnings": [],
    "displayGraceTime": -1,
    "escalatedPaymentFineMultiplier": -1.0,
    "earlyPaymentPeriod": -1.0,
    "lifetime": -1.0,
    "coolOffTime": -1.0,
    "pressChargesNotificationTime": -1.0,
    "removeTimeSeconds": -1.0,
    "felonyMerits": -1,
    "ignoreIfAgainstPartyMember": -1,
    "hideCrimeNotification": -1,
    "hideCrimeInJournal": -1
  }
}
```

### ControlledSubstanceClass Entry

```json
{
  "_Type_": "ControlledSubstanceClass",
  "commodities": ["string"],     // file refs to commodity entities (e.g. vice/slam.json)
  "resources": [/* RecordRef[] */],
  "maxPossessionSCU": "number"
}
```

### Infraction Definitions (`lawsystem/infractiondefinitions/`)

- **Felonies** (5): `escapedconvict`, `attemptedhomicide`, `attemptedescape`, `terroristact`, `murder`
- **Misdemeanours** (33): `aggravatedassault`, `armisticeviolation`, `batteryseconddegree`, `brandishingdeadlyweapon`, `dischargedeadlyweapon`, `distributionofcontrolledsubstances_class{a,b,c}`, `distributionofstolengoods`, `evadingarrest`, `failuretocomply`, `felonytrespassing`, `grievousbodilyharm`, `hacking`, `harboringafelon`, `insurancefraud`, `manslaughter`, `misdemeanortrespassing`, `possessionofcontrolledsubstances_class{a,b,c}`, `possessionofprohibitedgoods`, `possessionofstolengoods`, `propertydestruction`, `propertytheft`, `resistingarrest`, `restrictedareatrespass`, `unauthorizedinterdiction`, `vehiclecollision`, `vehicledestruction`, `vehicletheft`, `vehicletowing`
- **Special** (2): `inprison`, `prisonsuicide`

---

## 5. Commodity Type Database (`commoditytypedatabase/`)

Single file: `commoditytypedatabase.commoditytypes.json` (574 KB)

### Top-Level Structure

```json
{
  "_RecordValue_": {
    "_Type_": "CommodityTypeDatabase",
    "types": [/* 16 CommodityType entries */],
    "subtypes": [/* 247 CommoditySubtype entries */]
  }
}
```

### CommodityType (16 types)

```json
{
  "_RecordId_": "UUID",
  "_RecordName_": "CommodityType.UUID",
  "_Type_": "CommodityType",
  "typeName": "string",              // e.g. "Metal"
  "name": "string",                  // localization key
  "description": "string",           // localization key
  "defaultThumbnailPath": "string"   // image path
}
```

**All 16 type names**: Metal, Gas, Mineral, Scrap, Waste, Food, Consumer Goods, Vice, Medical Supply, Agricultural Supply, Mixed Mining, Nonmetal, ProcessedGoods, Manmade, Alloy, Natural

### CommoditySubtype (247 subtypes)

```json
{
  "_RecordId_": "UUID",
  "_RecordName_": "CommoditySubtype.UUID",
  "_Type_": "CommoditySubtype",
  "typeName": "string",              // e.g. "Metal_Aluminum_Ore"
  "name": "string",                  // localization key
  "description": "string",           // localization key
  "symbol": "string",               // e.g. "Al"
  "color": {
    "_Type_": "SRGBA8",
    "r": 100, "g": 100, "b": 100, "a": 255
  },
  "commodity": "string | null",     // file ref to commodity entity
  "volatility": 0.0,
  "gForceTolerance": 0.0,
  "gForceDeltaToDamage": 0.0,
  "HealthDecayOverTime": 0.0,
  "temperatureTolerance": {
    "_Type_": "CommodityTemperatureTolerance",
    "optimalTempMin": 0.0,
    "optimalTempMax": 5778.0,
    "OptimalTempFallOff": 2.0,
    "damageCurveControl": { "_Type_": "LinearDamage", "slope": 0.0, "yIntercept": 0.0 }
  },
  "damageResistance": {
    "_Type_": "DamageResistance",
    "IgnoreMeleeDamage": false,
    "PhysicalResistance": { "Multiplier": 1.0, "Threshold": 0.0, "DamageCap": 0.0 },
    "EnergyResistance": { "Multiplier": 1.0, "Threshold": 0.0, "DamageCap": 0.0 },
    "DistortionResistance": { "Multiplier": 1.0, "Threshold": 0.0, "DamageCap": 0.0 },
    "ThermalResistance": { "Multiplier": 1.0, "Threshold": 0.0, "DamageCap": 0.0 },
    "BiochemicalResistance": { "Multiplier": 1.0, "Threshold": 0.0, "DamageCap": 0.0 },
    "StunResistance": { "Multiplier": 1.0, "Threshold": 0.0, "DamageCap": 0.0 }
  },
  "refineOutput": "CommoditySubtype | null"  // INLINE nested subtype (not a ref!) — links ore→refined
}
```

### refineOutput Cross-Reference

The `refineOutput` field is an **inline copy** of the target CommoditySubtype (not a file reference). Example: `Metal_Aluminum_Ore` has `refineOutput` containing the full `Metal_Aluminum` subtype. Match via `_RecordId_` to link ore→refined commodity.

---

## 6. Cross-Reference Map

### Location → Jurisdiction
- `StarMapObject.jurisdiction` → file ref to `lawsystem/jurisdictions/*.json`
- Many locations have `jurisdiction: null` (outposts, lagrange points, rest stops)
- Planets always have jurisdiction; landing zones inherit from parent planet's jurisdiction

### Location → Amenities
- `StarMapObject.amenities[]._RecordId_` → matches `StarMapAmenityTypeEntry._RecordId_` in `starmapamenitytypes.json`
- Landing zones have 10-11 amenities; rest stops have ~10; outposts have 2-3; planets/moons have 0

### Location → Parent Hierarchy
- `StarMapObject.parent` → file ref to parent StarMapObject
- Hierarchy: System → Star → Planet → Moon/LandingZone/Station/Outpost
- Rest stops (`orbiting/`) parent to the planet, not the star

### Location → Type
- `StarMapObject.type._RecordId_` → matches `StarMapObjectType._RecordId_` in `starmapobjecttypes.json`
- The `navIcon` field is a **separate** classification from `type` (e.g. navIcon="Station" but type="Manmade")

### Jurisdiction → Prohibited Goods
- `Jurisdiction.prohibitedGoods[]` → file refs to `entities/commodities/*.json`
- `Jurisdiction.prohibitedResources[]._RecordId_` → matches `ResourceType._RecordId_` in `resourcetypedatabase.json`

### Jurisdiction → Controlled Substances
- `Jurisdiction.controlledSubstanceClasses[].commodities[]` → file refs to commodity entities
- `Jurisdiction.controlledSubstanceClasses[].resources[]._RecordId_` → resource type refs
- Classes correspond to Class A/B/C controlled substances

### Jurisdiction → Parent Jurisdiction
- `Jurisdiction.parentJurisdiction` → file ref to parent (e.g. Crusader → UEE)
- `respectsParentJurisdictionLaws: true` means parent laws also apply

### Commodity Subtype → Refine Output
- `CommoditySubtype.refineOutput._RecordId_` → matches another `CommoditySubtype._RecordId_`
- Links raw ore to refined commodity (e.g. Aluminum Ore → Aluminum)

---

## 7. What the Existing Extraction Already Covers

### `parseStarmap()` in `extract-game-data.ts`

The existing script extracts from `starmap/pu/system/` only (970 files). It produces:

```typescript
{
  id: string,           // _RecordId_
  name: string,         // resolved via loc()
  nameKey: string,      // raw localization key
  description: string,  // resolved via loc()
  type: string,         // resolved type name (e.g. "Planet", "LandingZone")
  parent: string,       // basename of parent file
  jurisdiction: string, // basename of jurisdiction file (e.g. "microtech")
  navIcon: string,      // raw navIcon value
  size: number,         // raw size value
  file: string          // basename of source file
}
```

**What it extracts**: name, description, type, parent, jurisdiction name, navIcon, size
**What it skips**: amenities, respawnLocationType, quantumTravelData, radarProperties, locationParams, hideInStarmap, all display/rendering fields, all 919 top-level template/instance files

### Existing Database Schema (`20260420000000_game_data_schema.ts`)

The migration creates these tables relevant to locations:

- **`missions`** — has `star_system`, `planet_moon`, `location_detail` columns but no FK to a locations table
- **`resources`** — has `mining_locations` and `purchase_locations` as JSONB columns

**No dedicated location/starmap tables exist.** The starmap data is only output to `game-data.json` as a flat array, not stored in the database.

---

## 8. Gap Analysis — What's New vs Already Extracted

### NEW data not currently extracted:

| Data | Source | Records | Value |
|------|--------|---------|-------|
| **Amenities per location** | `StarMapObject.amenities[]` | ~1991 locations × 0-11 amenities | Shows what services each location offers |
| **Amenity type definitions** | `starmapamenitytypes.json` | 25 types | ID→name mapping for amenities |
| **Object type definitions** | `starmapobjecttypes.json` | 21 types | Full type metadata (QT valid, selectable, etc.) |
| **Quantum travel data** | `StarMapObject.quantumTravelData` | per location | Arrival radius, obstruction radius, adoption radius |
| **Respawn capability** | `StarMapObject.respawnLocationType` | per location | "None" vs "Other" — where you can respawn |
| **Location hierarchy tags** | `StarMapObject.locationHierarchyTag` | per location | Tag database cross-reference |
| **Radar properties** | `StarMapObject.radarProperties` | stations/LZs | Signature data, scan bounds |
| **Top-level starmap files** | `starmap/pu/*.json` (non-system) | 919 files | Templates, pyro outposts, distribution centres, etc. |
| **Full jurisdiction data** | `lawsystem/jurisdictions/` | 13 files | Prohibited goods, controlled substances, infractions, fines |
| **Commodity subtypes** | `commoditytypedatabase/` | 247 subtypes | Full commodity classification with refine links |
| **Commodity types** | `commoditytypedatabase/` | 16 types | Top-level commodity categories |

### Already extracted (but could be enriched):

| Data | Current State | Enhancement |
|------|--------------|-------------|
| Location name/type/parent | ✅ Extracted | Add amenities, QT data, respawn |
| Jurisdiction name | ✅ As string basename | Add full jurisdiction details (prohibited goods, fines, controlled substances) |
| Location hierarchy | ✅ Via parent basename | Add proper parent chain resolution |

### Recommended New Database Tables:

1. **`starmap_locations`** — Full location data with amenities, QT params, respawn type
2. **`starmap_amenity_types`** — 25 amenity type definitions
3. **`starmap_location_amenities`** — Junction table: location → amenity
4. **`jurisdictions`** — Full jurisdiction data with parent hierarchy
5. **`jurisdiction_prohibited_goods`** — Junction: jurisdiction → commodity
6. **`jurisdiction_controlled_substances`** — Controlled substance classes per jurisdiction
7. **`commodity_types`** — 16 commodity categories
8. **`commodity_subtypes`** — 247 commodity subtypes with refine links
