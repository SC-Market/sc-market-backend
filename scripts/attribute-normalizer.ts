/**
 * Normalize attribute names from CStone to match UEX conventions
 * Only maps attributes that UEX already uses
 */

// Map CStone attribute names to UEX attribute names
const CSTONE_TO_UEX_MAP: Record<string, string> = {
  MANUFACTURER: "manufacturer",
  "ARMOR TYPE": "class",
  SIZE: "size",
  COLOR: "color",
}

// Allowed attribute names (from UEX)
const ALLOWED_ATTRIBUTES = new Set([
  "size",
  "color",
  "grade",
  "manufacturer",
  "class",
  "component_type",
])

/**
 * Normalize CStone attributes to UEX format
 * Only returns attributes that match UEX's preset list
 */
export function normalizeAttributes(
  attributes: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [name, value] of Object.entries(attributes)) {
    // Map CStone name to UEX name
    const normalizedName = CSTONE_TO_UEX_MAP[name] || name.toLowerCase()

    // Only include if it's in the allowed list
    if (ALLOWED_ATTRIBUTES.has(normalizedName)) {
      // Special handling for class - extract Heavy/Medium/Light
      if (normalizedName === "class") {
        if (value.includes("Heavy")) {
          normalized[normalizedName] = "Heavy"
        } else if (value.includes("Medium")) {
          normalized[normalizedName] = "Medium"
        } else if (value.includes("Light")) {
          normalized[normalizedName] = "Light"
        } else {
          normalized[normalizedName] = value
        }
      } else {
        normalized[normalizedName] = value
      }
    }
  }

  return normalized
}
