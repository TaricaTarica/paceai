import type { RaceDistance } from "./types"

export function isShortGoalDistance(d: RaceDistance | null): boolean {
  return d === "5K" || d === "10K"
}

/** Parse "MM:SS" or "H:MM:SS" / "HH:MM:SS" to total seconds, or null if invalid. */
export function parseTimeStringToSeconds(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const parts = t.split(":").map((p) => p.trim())
  if (parts.length < 2 || parts.length > 3) return null
  const nums = parts.map((p) => Number(p))
  if (nums.some((n) => Number.isNaN(n) || n < 0)) return null
  let h = 0
  let m = 0
  let s = 0
  if (nums.length === 2) {
    ;[m, s] = nums
  } else {
    ;[h, m, s] = nums
  }
  if (s >= 60 || m >= 60) return null
  if (h > 24) return null
  return h * 3600 + m * 60 + s
}

export function buildGoalTimeString(
  isShort: boolean,
  a: string,
  b: string,
  c: string
): string | null {
  if (isShort) {
    const mm = a.trim()
    const ss = b.trim()
    if (!/^\d+$/.test(mm) || !/^\d+$/.test(ss)) return null
    const m = Number(mm)
    const s = Number(ss)
    if (m > 200 || s >= 60) return null
    return `${m}:${s.toString().padStart(2, "0")}`
  }
  const hh = a.trim()
  const mmm = b.trim()
  const sss = c.trim()
  if (!/^\d+$/.test(hh) || !/^\d+$/.test(mmm) || !/^\d+$/.test(sss)) return null
  const h = Number(hh)
  const m = Number(mmm)
  const s = Number(sss)
  if (h > 12 || m >= 60 || s >= 60) return null
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

export function isValidGoalTimeForDistance(
  isShort: boolean,
  a: string,
  b: string,
  c: string
): boolean {
  const built = buildGoalTimeString(isShort, a, b, c)
  if (!built) return false
  return parseTimeStringToSeconds(built) != null
}

export type GoalVsPrLabel = "realistic" | "ambitious" | "very aggressive"

/**
 * PR is previous best (lower seconds = faster). Goal time in same direction.
 * compare: if goal is faster than PR by >5% → very aggressive, faster by any amount >0 → ambitious, else realistic.
 */
export function assessGoalVsPr(goalSec: number, prSec: number): GoalVsPrLabel {
  if (prSec <= 0) return "realistic"
  const improve = (prSec - goalSec) / prSec
  if (improve > 0.05) return "very aggressive"
  if (improve > 0) return "ambitious"
  return "realistic"
}
