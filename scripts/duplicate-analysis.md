# Duplicate Analysis

## Exact Duplicates (5 groups)

All are true duplicates - same item, one has UUIDs, one doesn't:

1. **Year Of The Monkey/Rooster/Dog/Pig Envelope** - Keep version with UUIDs
2. **medical supplies** - Keep version with CStone UUID

## Normalized Duplicates (66 groups)

### Trailing Space Issues (30+ groups)

Items with trailing spaces - true duplicates:

- "Boreal Quasi Grazer Egg " vs "Boreal Quasi Grazer Egg"
- "CitizenCon '54 Coin" vs "CitizenCon '54 Coin" (double space)
- "DeconPen (Canoiodide)" vs "DeconPen (Canoiodide)"
- Many more with trailing spaces

**Solution**: Trim names during import

### Armor Name Order Variations (40+ groups)

Two patterns from different sources:

1. **CStone format**: "DCP Armor Arms New Dawn" → "DCP Armor New Dawn Arms"
2. **UEX format**: "Venture Executive Arms" → "Venture Arms Executive"

**Solution**: Already handled by normalizer, but some slipped through

### Special Cases

- **"Smoltz (Bottle)" vs "Smoltz Light (Bottle)"** - DIFFERENT items (regular vs light beer)
- **"Inquisitor Neon Pink - Full Set"** - Double space in one version
- **"Microid Battle Suit Crucible - Full Set"** - Double space in one version

## Fuzzy Duplicates (47 groups)

### Manufacturer Prefix Variations (30+ groups)

Same item with/without manufacturer prefix:

- "Drake Ore Pod" vs "Argo Ore Pod" vs "MISC Ore Pod" - DIFFERENT manufacturers
- "RSI Accent Chair" vs "Anvil Accent Chair" vs "Crusader Accent Chair" - DIFFERENT
- Chess pieces: "Crusader Black Bishop" vs "Origin Black Bishop" - DIFFERENT

**Solution**: These are NOT duplicates - different manufacturers = different items

### Livery vs Paint vs Edition (15+ groups)

- "Starlancer Mojave Livery" vs "Starlancer Mojave Paint" - Likely same
- "Hammerhead 2949 Best In Show Livery" vs "Edition" - Likely same
- "F8C Lightning Executive Edition" with/without "Anvil" prefix

**Solution**: Normalize "Livery", "Paint", "Edition" as synonyms

### Model Variations

- "WillsOp Long Look Radar Mk1" vs "Mk2" - DIFFERENT versions
- "Stor\*All Big Box Model H Mk1" vs "Mk2" - DIFFERENT versions

**Solution**: These are NOT duplicates - different model numbers

### Ship Variants

- "MISC Reliant Mako" vs "Reliant Mako Livery" - Ship vs livery
- "Aegis Eclipse" vs "Eclipse" - With/without manufacturer

**Solution**: Keep both - one is ship, one might be livery/item

## Import Process Changes Needed

1. **Trim all names** - Remove leading/trailing whitespace
2. **Normalize multiple spaces** - Replace multiple spaces with single space
3. **Expand normalizer** - Handle "Livery"/"Paint"/"Edition" synonyms
4. **Don't normalize manufacturer prefixes** - They indicate different items
