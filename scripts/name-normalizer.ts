/**
 * Shared name normalization for deduplication across UEX and CStone imports
 * Handles variations in armor piece naming:
 * - "Palatino Deadlock Armor Arms" vs "Palatino Arms Deadlock"
 * - "Quirinus Necropolis Heavy Armor Legs" vs "Palatino Legs Necropolis"
 */
export function normalizeItemName(name: string): string {
  let normalized = name.toLowerCase().trim()

  // Remove common armor keywords
  normalized = normalized
    .replace(/\s+armor\s+/g, " ")
    .replace(/\s+heavy\s+/g, " ")
    .replace(/\s+medium\s+/g, " ")
    .replace(/\s+light\s+/g, " ")

  // Extract parts: manufacturer, piece type, variant
  const pieces = normalized.split(/\s+/).filter((p) => p.length > 0)

  // Armor piece types
  const pieceTypes = ["arms", "legs", "helmet", "torso", "core", "backpack"]
  const pieceType = pieces.find((p) => pieceTypes.includes(p))

  if (!pieceType) {
    return normalized.replace(/\s+/g, " ")
  }

  // Separate manufacturer/variant from piece type
  const otherParts = pieces.filter((p) => p !== pieceType)

  // Canonical order: manufacturer + piece + variant
  return [otherParts[0], pieceType, ...otherParts.slice(1)]
    .filter(Boolean)
    .join(" ")
}
