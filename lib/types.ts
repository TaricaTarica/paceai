export type RaceDistance = "5K" | "10K" | "Half Marathon" | "Marathon"

export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"

export type SessionType =
  | "Easy Run"
  | "Tempo"
  | "Intervals"
  | "Long Run"
  | "Cross Training"
  | "Rest"

export interface PersonalBests {
  "5K"?: string
  "10K"?: string
  "Half Marathon"?: string
  "Marathon"?: string
}

export interface OnboardingData {
  goalDistance: RaceDistance | null
  raceDate: Date | null
  personalBests: PersonalBests
  /** Race finish goal, e.g. "25:30" (5K/10K) or "1:30:00" (half/full). */
  goalTime?: string
  daysPerWeek: 3 | 4 | 5 | 6 | null
  restDays: DayOfWeek[]
  currentPR?: string
  /** When true, allow stronger weekly volume progression in AI-generated plans. */
  aggressive?: boolean
}

export interface TrainingSession {
  id: string
  date: string
  type: SessionType
  distanceKm: number
  description?: string
  /** Estimated duration in minutes. */
  durationMin?: number
  /** Target pace min/km (decimal minutes, e.g. 5.5 = 5:30/km). */
  targetPaceMin?: number
  targetPaceMax?: number
  targetHRZone?: number
  targetHRMin?: number
  targetHRMax?: number
  rpe?: number
  warmupMin?: number
  cooldownMin?: number
  mainSet?: string
  coachNotes?: string
  /** ISO timestamp when the runner marked the session complete. */
  completedAt?: string
  skipped?: boolean
}

export interface TrainingWeek {
  weekNumber: number
  sessions: TrainingSession[]
}

export type TrainingPhase = "Base" | "Build" | "Peak" | "Taper"

export interface PlannedWeekMeta {
  weekNumber: number
  phase: TrainingPhase
  focus: string
  estimatedTotalKm: number
}

export interface TrainingPlan {
  id: string
  createdAt: string
  goalDistance: RaceDistance
  raceDate: string
  daysPerWeek: number
  restDays: DayOfWeek[]
  totalWeeks: number
  weeks: TrainingWeek[]
  /** Weeks 2+ not yet materialized; omit or empty when `weeks` already covers the full plan (legacy). */
  plannedWeeks?: PlannedWeekMeta[]
}

export interface UserProfile {
  onboarding: OnboardingData
  plan: TrainingPlan | null
  completedOnboarding: boolean
}
