import type { TrainingPlan, TrainingWeek } from "./types"
import type { AdaptWeekResponse, AdaptWeekSessionSlice } from "./adapt-week-schema"

function mergeWeekByIndex(week: TrainingWeek, adapted: AdaptWeekSessionSlice[]): TrainingWeek {
  const sessions = week.sessions.map((existing, i) => {
    const next = adapted[i]
    if (!next) return existing
    return {
      ...existing,
      type: next.type,
      distanceKm: next.distanceKm,
      description: next.description !== undefined ? next.description : existing.description,
    }
  })
  return { ...week, sessions }
}

/** Applies adapt-week `generateObject` output onto the plan (preserves id, date, completedAt, skipped). */
export function applyAdaptWeekResultToPlan(
  plan: TrainingPlan,
  currentWeekNumber: number,
  result: AdaptWeekResponse
): TrainingPlan {
  const weekByNumber = new Map(plan.weeks.map((w) => [w.weekNumber, w]))

  const patchWeek = (weekNumber: number, adapted: AdaptWeekSessionSlice[]) => {
    const w = weekByNumber.get(weekNumber)
    if (!w) return
    weekByNumber.set(weekNumber, mergeWeekByIndex(w, adapted))
  }

  patchWeek(currentWeekNumber, result.currentWeekAdapted)
  for (const u of result.upcomingWeeksChanges) {
    patchWeek(u.weekNumber, u.sessions)
  }

  return {
    ...plan,
    weeks: plan.weeks.map((w) => weekByNumber.get(w.weekNumber) ?? w),
  }
}
