import type {
  DayOfWeek,
  OnboardingData,
  PlannedWeekMeta,
  RaceDistance,
  SessionType,
  TrainingPlan,
  TrainingSession,
  TrainingWeek,
} from "./types"
import { ALL_DAYS, generateSessionId, getDateForWeekDay, getTrainingDays, startOfWeekMonday } from "./plan-dates"
import { fallbackTrainingSessionMeta, restSessionMeta } from "./session-meta"

const AI_SESSION_TYPES = [
  "Easy Run",
  "Tempo",
  "Intervals",
  "Long Run",
  "Rest",
  "Cross Training",
] as const

type AiSessionType = (typeof AI_SESSION_TYPES)[number]

export type AiPlanSession = {
  day: DayOfWeek
  type: AiSessionType
  distanceKm?: number
  durationMin?: number
  description: string
  intensity?: "low" | "medium" | "high"
  targetPaceMin: number
  targetPaceMax: number
  targetHRZone: number
  targetHRMin: number
  targetHRMax: number
  rpe: number
  warmupMin: number
  cooldownMin: number
  mainSet: string
  coachNotes: string
}

export type AiPlanWeek = {
  weekNumber: number
  phase: "Base" | "Build" | "Peak" | "Taper"
  focus: string
  sessions: AiPlanSession[]
  totalKm: number
}

export type AiPlannedWeekRow = {
  weekNumber: number
  phase: "Base" | "Build" | "Peak" | "Taper"
  focus: string
  estimatedTotalKm: number
}

export type AiGeneratedPlan = {
  totalWeeks: number
  currentPhase: "Base" | "Build" | "Peak" | "Taper"
  /** Exactly one fully detailed week (week 1). */
  weeks: AiPlanWeek[]
  plannedWeeks: AiPlannedWeekRow[]
  notes: string
}

function mapAiTypeToSessionType(t: AiSessionType): SessionType {
  if (t === "Rest") return "Rest"
  if (t === "Cross Training") return "Cross Training"
  return t as SessionType
}

function weeksUntilRaceFloor(raceDate: Date): number {
  return Math.floor((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7))
}

function validateAiWeek(week: AiPlanWeek): boolean {
  if (!week.sessions || week.sessions.length !== 7) return false
  const days = new Set(week.sessions.map((s) => s.day))
  if (days.size !== 7) return false
  for (const d of ALL_DAYS) {
    if (!days.has(d)) return false
  }
  return true
}

/**
 * Maps a single AI week (7 sessions) to `TrainingWeek` with correct calendar dates
 * for `weekNumber` (1-based) in the plan starting this Monday.
 */
export function mapGeneratedWeekToTrainingWeek(
  aiWeek: AiPlanWeek,
  data: Pick<OnboardingData, "goalDistance" | "raceDate" | "restDays" | "daysPerWeek" | "personalBests" | "aggressive">,
  weekNumber: number
): TrainingWeek | null {
  if (!data.goalDistance || !data.raceDate || !data.daysPerWeek) return null
  if (weekNumber < 1) return null
  if (!validateAiWeek(aiWeek)) return null
  if (aiWeek.weekNumber !== weekNumber) return null

  const trainingDays = getTrainingDays(data.daysPerWeek, data.restDays)
  const startMonday = startOfWeekMonday(new Date())
  const w = weekNumber - 1
  const weekStart = new Date(startMonday)
  weekStart.setDate(startMonday.getDate() + w * 7)

  const byDay = new Map<DayOfWeek, AiPlanSession>()
  for (const s of aiWeek.sessions) {
    byDay.set(s.day, s)
  }

  const sessions: TrainingSession[] = []

  for (const day of ALL_DAYS) {
    const sessionDate = getDateForWeekDay(weekStart, day)
    const dateStr = sessionDate.toISOString().split("T")[0]
    const mustRest = data.restDays.includes(day) || !trainingDays.includes(day)

    const src = byDay.get(day)
    if (mustRest) {
      sessions.push({
        id: generateSessionId(),
        date: dateStr,
        type: "Rest",
        distanceKm: 0,
        description: "Rest day",
        ...restSessionMeta(),
      })
      continue
    }

    if (!src || src.type === "Rest") {
      const desc = "Easy run (filled where AI omitted a session)"
      sessions.push({
        id: generateSessionId(),
        date: dateStr,
        type: "Easy Run",
        distanceKm: 5,
        description: desc,
        ...fallbackTrainingSessionMeta("Easy Run", 5, desc),
      })
      continue
    }

    const type = mapAiTypeToSessionType(src.type)
    const distanceKm =
      typeof src.distanceKm === "number" && !Number.isNaN(src.distanceKm)
        ? Math.max(0, Math.round(src.distanceKm))
        : 5

    let description = src.description || `${distanceKm}km ${type}`
    if (src.intensity) {
      description += ` (${src.intensity} intensity)`
    }

    const midPace = (src.targetPaceMin + src.targetPaceMax) / 2
    const durationMin =
      typeof src.durationMin === "number" && !Number.isNaN(src.durationMin)
        ? src.durationMin
        : type === "Rest"
          ? 0
          : Math.max(1, Math.round(distanceKm * midPace))

    sessions.push({
      id: generateSessionId(),
      date: dateStr,
      type,
      distanceKm: type === "Rest" ? 0 : distanceKm,
      description,
      durationMin,
      targetPaceMin: src.targetPaceMin,
      targetPaceMax: src.targetPaceMax,
      targetHRZone: src.targetHRZone,
      targetHRMin: src.targetHRMin,
      targetHRMax: src.targetHRMax,
      rpe: src.rpe,
      warmupMin: src.warmupMin,
      cooldownMin: src.cooldownMin,
      mainSet: src.mainSet,
      coachNotes: src.coachNotes,
    })
  }

  return {
    weekNumber,
    sessions,
  }
}

/**
 * Maps AI structured output + onboarding constraints into the app's `TrainingPlan`
 * (week 1 only materialized, plus `plannedWeeks` metadata for the rest).
 */
export function mapAiPlanToTrainingPlan(
  ai: AiGeneratedPlan,
  data: Pick<OnboardingData, "goalDistance" | "raceDate" | "restDays" | "daysPerWeek" | "personalBests" | "aggressive">
): TrainingPlan | null {
  if (!data.goalDistance || !data.raceDate || !data.daysPerWeek) return null

  const raceDate = new Date(data.raceDate)
  const raceDateStr = raceDate.toISOString().split("T")[0]
  const goalDistance: RaceDistance = data.goalDistance

  if (!ai.weeks?.length) return null

  const firstAi = ai.weeks[0]
  const cap = Math.max(1, Math.min(weeksUntilRaceFloor(raceDate), 24))
  const nPlanned = ai.plannedWeeks?.length ?? 0
  const totalWeeks = Math.max(1, Math.min(1 + nPlanned, cap, ai.totalWeeks))

  const firstWeek = mapGeneratedWeekToTrainingWeek(firstAi, data, 1)
  if (!firstWeek) return null

  const plannedWeeks: PlannedWeekMeta[] = (ai.plannedWeeks ?? [])
    .filter((p) => p.weekNumber > 1 && p.weekNumber <= totalWeeks)
    .sort((a, b) => a.weekNumber - b.weekNumber)
    .map((p) => ({
      weekNumber: p.weekNumber,
      phase: p.phase,
      focus: p.focus,
      estimatedTotalKm: p.estimatedTotalKm,
    }))

  return {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    goalDistance,
    raceDate: raceDateStr,
    daysPerWeek: data.daysPerWeek,
    restDays: data.restDays,
    totalWeeks,
    weeks: [firstWeek],
    plannedWeeks,
  }
}
