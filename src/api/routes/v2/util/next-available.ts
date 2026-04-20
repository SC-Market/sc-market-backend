/**
 * Compute the next available time from a user's availability schedule.
 *
 * Availability is stored as rows with `start` and `finish` fields representing
 * half-hour slot indices in a week (0 = Sunday 00:00 UTC, 335 = Saturday 23:30 UTC).
 * Each slot is 30 minutes. 48 slots per day × 7 days = 336 total slots.
 *
 * Returns null if the seller is currently available or has no schedule set.
 * Returns an ISO 8601 string of the next available slot otherwise.
 */

interface AvailabilitySpan {
  start: number
  finish: number
}

export function getNextAvailableTime(
  spans: AvailabilitySpan[],
): string | null {
  if (!spans.length) return null // No schedule set — treat as always available

  // Build a boolean array of 336 slots (48 per day × 7 days)
  const slots = new Array(336).fill(false)
  for (const span of spans) {
    for (let i = span.start; i <= span.finish && i < 336; i++) {
      slots[i] = true
    }
  }

  // If no slots are marked available, return null (no schedule)
  if (!slots.some(Boolean)) return null

  // Get current UTC time and compute current slot index
  const now = new Date()
  const dayOfWeek = now.getUTCDay() // 0 = Sunday
  const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes()
  const currentSlot = dayOfWeek * 48 + Math.floor(minuteOfDay / 30)

  // If currently available, return null
  if (slots[currentSlot]) return null

  // Search forward for the next available slot (wrap around the week)
  for (let offset = 1; offset < 336; offset++) {
    const slot = (currentSlot + offset) % 336
    if (slots[slot]) {
      // Convert slot back to a Date
      const slotDay = Math.floor(slot / 48)
      const slotHalfHour = slot % 48
      const slotHour = Math.floor(slotHalfHour / 2)
      const slotMinute = (slotHalfHour % 2) * 30

      // Build the next occurrence of this day/time
      const result = new Date(now)
      result.setUTCHours(slotHour, slotMinute, 0, 0)

      // Calculate days ahead
      let daysAhead = slotDay - dayOfWeek
      if (daysAhead < 0 || (daysAhead === 0 && slot <= currentSlot)) {
        daysAhead += 7
      }
      result.setUTCDate(result.getUTCDate() + daysAhead)

      return result.toISOString()
    }
  }

  return null // Should not reach here if any slot is true
}
