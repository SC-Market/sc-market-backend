/**
 * Normalize attribute names from different sources to consistent names
 */

// Map of source attribute names to normalized names
const ATTRIBUTE_NAME_MAP: Record<string, string> = {
  // Manufacturer variations
  MANUFACTURER: "Manufacturer",
  "COMPANY NAME": "Manufacturer",
  company_name: "Manufacturer",

  // Size variations
  SIZE: "Size",
  size: "Size",

  // Armor type variations
  "ARMOR TYPE": "Armor Class",
  "Heavy Armor": "Heavy",
  "Medium Armor": "Medium",
  "Light Armor": "Light",

  // Color variations
  COLOR: "Color",
  color: "Color",

  // Capacity variations
  CAPACITY: "Capacity",
  capacity: "Capacity",

  // Volume variations
  VOLUME: "Volume",
  volume: "Volume",

  // Temperature variations
  "MIN SAFE TEMPERATURE": "Min Temperature",
  "MAX SAFE TEMPERATURE": "Max Temperature",

  // Radiation variations
  "RADIATION PROTECTION": "Radiation Protection",
  "RADIATION SCRUB RATE": "Radiation Scrub Rate",

  // Damage resistance variations
  PHYSICAL: "Physical Resistance",
  ENERGY: "Energy Resistance",
  DISTORTION: "Distortion Resistance",
  THERMAL: "Thermal Resistance",
  BIOCHEMICAL: "Biochemical Resistance",
  STUN: "Stun Resistance",

  // Category/Type variations
  category: "Category",
  section: "Type",
}

/**
 * Normalize an attribute name to a consistent format
 */
export function normalizeAttributeName(name: string): string {
  return ATTRIBUTE_NAME_MAP[name] || name
}

/**
 * Normalize an attribute value
 */
export function normalizeAttributeValue(name: string, value: string): string {
  const normalized = normalizeAttributeName(name)

  // Special handling for armor class
  if (normalized === "Armor Class") {
    if (value.includes("Heavy")) return "Heavy"
    if (value.includes("Medium")) return "Medium"
    if (value.includes("Light")) return "Light"
  }

  // Special handling for percentages - ensure consistent format
  if (value.endsWith("%")) {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      return `${num}%`
    }
  }

  return value
}

/**
 * Normalize a set of attributes
 */
export function normalizeAttributes(
  attributes: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {}

  for (const [name, value] of Object.entries(attributes)) {
    const normalizedName = normalizeAttributeName(name)
    const normalizedValue = normalizeAttributeValue(name, value)
    normalized[normalizedName] = normalizedValue
  }

  return normalized
}
