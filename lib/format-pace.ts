/** `minutesPerKm` as decimal (e.g. 5.5) → "5:30" (no unit). */
export function formatDecimalMinutesToMmSs(minutesPerKm: number): string {
  if (Number.isNaN(minutesPerKm) || minutesPerKm < 0) return "—"
  const m = Math.floor(minutesPerKm)
  const s = Math.round((minutesPerKm - m) * 60)
  const adjM = s >= 60 ? m + 1 : m
  const adjS = s >= 60 ? 0 : s
  return `${adjM}:${adjS.toString().padStart(2, "0")}`
}
