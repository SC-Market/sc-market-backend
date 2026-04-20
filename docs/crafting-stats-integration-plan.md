# Crafting Stats Integration Plan

## Overview

Enhance the CraftingController to use actual component stats from P4K extraction (`game_item_attributes` table) to show players how material quality affects final item statistics.

## Current State

The CraftingController currently only calculates abstract quality values (tier 1-5, value 0-100) without showing how these translate to actual item stats like:
- Weapon damage, fire rate, ammo capacity
- Shield HP, regen rate, down delay
- Power plant output
- Cooler cooling rate
- QD spool time, speed, fuel usage
- Armor damage reduction
- Component durability

## Enhancement Goals

1. **Fetch base stats** from `game_item_attributes` for the output item
2. **Calculate stat modifiers** based on crafted quality
3. **Display predicted stats** in the calculation response
4. **Show stat comparisons** between quality tiers in simulations

## Database Schema

### Existing: game_item_attributes
```sql
CREATE TABLE game_item_attributes (
  id UUID PRIMARY KEY,
  game_item_id UUID REFERENCES game_items(id),
  attribute_name VARCHAR(100),
  attribute_value TEXT,
  created_at TIMESTAMP
);
```

### Stat Categories from P4K Extraction (Task 8.8)

**Weapons:**
- `weapon_damage` - Base damage per shot
- `weapon_fire_rate` - Rounds per minute
- `weapon_ammo_capacity` - Magazine size
- `weapon_range` - Effective range

**Shields:**
- `shield_max_hp` - Maximum shield points
- `shield_regen_rate` - HP per second
- `shield_down_delay` - Seconds before regen starts

**Power Plants:**
- `power_output` - Total power generation

**Coolers:**
- `cooling_rate` - Heat dissipation per second

**Quantum Drives:**
- `qd_spool_time` - Seconds to spool
- `qd_speed` - Travel speed multiplier
- `qd_fuel_usage` - Fuel per jump

**Armor:**
- `armor_damage_reduction` - Percentage reduction
- `armor_temp_min` - Minimum operating temp
- `armor_temp_max` - Maximum operating temp

**Universal:**
- `health` - Component durability
- `distortion_resistance` - Resistance to EMP

## Quality-to-Stat Modifier Formula

### Linear Scaling (Default)
```
final_stat = base_stat * (1 + (quality_value - 50) / 100)
```

Examples:
- Quality 50 (Tier 3) = 100% of base stat (no modifier)
- Quality 90 (Tier 5) = 140% of base stat (+40%)
- Quality 10 (Tier 1) = 60% of base stat (-40%)

### Per-Stat Scaling Factors

Some stats may scale differently:
```typescript
const STAT_SCALING: Record<string, number> = {
  // Damage scales strongly with quality
  'weapon_damage': 0.8,  // ±40% range
  
  // Fire rate scales moderately
  'weapon_fire_rate': 0.3,  // ±15% range
  
  // Durability scales strongly
  'health': 1.0,  // ±50% range
  
  // Shield HP scales strongly
  'shield_max_hp': 0.8,  // ±40% range
  
  // Regen scales moderately
  'shield_regen_rate': 0.5,  // ±25% range
  
  // Power output scales moderately
  'power_output': 0.6,  // ±30% range
  
  // Default for unlisted stats
  'default': 0.5  // ±25% range
}
```

## Implementation Plan

### Phase 1: Add Stat Fetching Service

Create `src/services/game-data/item-stats.service.ts`:

```typescript
export class ItemStatsService {
  /**
   * Fetch base stats for a game item from game_item_attributes
   */
  async getBaseStats(gameItemId: string): Promise<Record<string, number>> {
    const knex = getKnex()
    
    const attributes = await knex('game_item_attributes')
      .where('game_item_id', gameItemId)
      .whereIn('attribute_name', STAT_ATTRIBUTES)
      .select('attribute_name', 'attribute_value')
    
    return attributes.reduce((stats, attr) => {
      const numValue = parseFloat(attr.attribute_value)
      if (!isNaN(numValue)) {
        stats[attr.attribute_name] = numValue
      }
      return stats
    }, {} as Record<string, number>)
  }
  
  /**
   * Calculate modified stats based on quality
   */
  calculateModifiedStats(
    baseStats: Record<string, number>,
    qualityValue: number
  ): Record<string, number> {
    const modifiedStats: Record<string, number> = {}
    
    for (const [statName, baseValue] of Object.entries(baseStats)) {
      const scalingFactor = STAT_SCALING[statName] || STAT_SCALING.default
      const modifier = (qualityValue - 50) / 100 * scalingFactor
      modifiedStats[statName] = baseValue * (1 + modifier)
    }
    
    return modifiedStats
  }
}
```

### Phase 2: Enhance CalculateQualityResponse Type

Update `crafting.types.ts`:

```typescript
export interface ItemStatComparison {
  /** Stat name (e.g., "weapon_damage") */
  stat_name: string
  
  /** Display name (e.g., "Damage") */
  display_name: string
  
  /** Base stat value */
  base_value: number
  
  /** Modified stat value at calculated quality */
  modified_value: number
  
  /** Percentage change from base */
  percent_change: number
  
  /** Unit (e.g., "HP", "DPS", "kW") */
  unit?: string
}

export interface CalculateQualityResponse {
  // ... existing fields ...
  
  /** Predicted item stats at calculated quality */
  predicted_stats?: ItemStatComparison[]
}
```

### Phase 3: Enhance CraftingController.calculateQuality

Add stat calculation after quality calculation:

```typescript
// After calculating output quality...

// Fetch base stats for output item
const itemStatsService = new ItemStatsService()
const baseStats = await itemStatsService.getBaseStats(blueprint.output_game_item_id)

// Calculate modified stats
let predictedStats: ItemStatComparison[] | undefined

if (Object.keys(baseStats).length > 0) {
  const modifiedStats = itemStatsService.calculateModifiedStats(
    baseStats,
    outputQualityValue
  )
  
  predictedStats = Object.entries(baseStats).map(([statName, baseValue]) => ({
    stat_name: statName,
    display_name: formatStatDisplayName(statName),
    base_value: baseValue,
    modified_value: modifiedStats[statName],
    percent_change: ((modifiedStats[statName] - baseValue) / baseValue) * 100,
    unit: getStatUnit(statName)
  }))
}

return {
  // ... existing fields ...
  predicted_stats: predictedStats
}
```

### Phase 4: Enhance Simulation to Show Stat Ranges

Update `simulateCrafting` to include stat comparisons across quality tiers:

```typescript
export interface SimulateCraftingResponse {
  // ... existing fields ...
  
  /** Stat comparison across best/worst/cost-effective results */
  stat_comparison?: {
    stat_name: string
    display_name: string
    best_value: number
    worst_value: number
    cost_effective_value: number
    unit?: string
  }[]
}
```

## Frontend Display

### Crafting Calculator Output Preview

```tsx
<div className="predicted-stats">
  <h3>Predicted Item Stats</h3>
  <table>
    <thead>
      <tr>
        <th>Stat</th>
        <th>Base</th>
        <th>Crafted</th>
        <th>Change</th>
      </tr>
    </thead>
    <tbody>
      {predictedStats.map(stat => (
        <tr key={stat.stat_name}>
          <td>{stat.display_name}</td>
          <td>{stat.base_value} {stat.unit}</td>
          <td>{stat.modified_value.toFixed(2)} {stat.unit}</td>
          <td className={stat.percent_change > 0 ? 'positive' : 'negative'}>
            {stat.percent_change > 0 ? '+' : ''}{stat.percent_change.toFixed(1)}%
          </td>
        </tr>
      ))}
    </tbody>
  </table>
</div>
```

### Simulation Comparison

```tsx
<div className="stat-comparison">
  <h3>Stat Ranges Across Quality Tiers</h3>
  {statComparison.map(stat => (
    <div key={stat.stat_name} className="stat-range">
      <label>{stat.display_name}</label>
      <div className="range-bar">
        <span className="worst">{stat.worst_value.toFixed(1)}</span>
        <div className="bar">
          <div className="cost-effective-marker" 
               style={{left: `${calculatePosition(stat)}%`}} />
        </div>
        <span className="best">{stat.best_value.toFixed(1)}</span>
      </div>
    </div>
  ))}
</div>
```

## Testing Strategy

### Unit Tests

1. Test stat fetching from `game_item_attributes`
2. Test quality-to-stat modifier calculations
3. Test edge cases (quality 0, 100, missing stats)
4. Test different stat scaling factors

### Integration Tests

1. Test full crafting calculation with stats
2. Test simulation with stat comparisons
3. Test with various item types (weapons, shields, power plants)

### Property-Based Tests

```typescript
// Property: Higher quality always produces better or equal stats
test('quality monotonicity for stats', () => {
  fc.assert(
    fc.property(
      fc.record({
        baseStats: fc.dictionary(fc.string(), fc.float()),
        quality1: fc.integer({min: 0, max: 100}),
        quality2: fc.integer({min: 0, max: 100})
      }),
      ({baseStats, quality1, quality2}) => {
        const stats1 = calculateModifiedStats(baseStats, quality1)
        const stats2 = calculateModifiedStats(baseStats, quality2)
        
        if (quality1 > quality2) {
          // All stats should be >= when quality is higher
          return Object.keys(baseStats).every(
            key => stats1[key] >= stats2[key]
          )
        }
        return true
      }
    )
  )
})
```

## Migration Path

1. **Phase 1**: Implement stat service and enhance types (non-breaking)
2. **Phase 2**: Add `predicted_stats` to response (optional field, backward compatible)
3. **Phase 3**: Update frontend to display stats when available
4. **Phase 4**: Ensure P4K extraction populates `game_item_attributes` with all stat data

## Success Criteria

- [ ] Crafting calculator shows predicted weapon damage, shield HP, etc.
- [ ] Simulation shows stat ranges across quality tiers
- [ ] Stats scale correctly with quality (higher quality = better stats)
- [ ] All stat types from P4K extraction are supported
- [ ] Frontend displays stats in user-friendly format
- [ ] Performance impact is minimal (<50ms additional latency)

## Future Enhancements

1. **Stat breakpoints**: Show quality thresholds where stats jump significantly
2. **Optimal quality finder**: Suggest minimum quality needed for desired stats
3. **Comparison with market**: Compare crafted stats vs. available market listings
4. **Stat weights**: Let users prioritize certain stats in optimization
