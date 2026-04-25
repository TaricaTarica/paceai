import type { SessionType, TrainingSession } from "./types"

export const restSessionMeta = (): Pick<
  TrainingSession,
  | "durationMin"
  | "targetPaceMin"
  | "targetPaceMax"
  | "targetHRZone"
  | "targetHRMin"
  | "targetHRMax"
  | "rpe"
  | "warmupMin"
  | "cooldownMin"
  | "mainSet"
  | "coachNotes"
> => ({
  durationMin: 0,
  targetPaceMin: 0,
  targetPaceMax: 0,
  targetHRZone: 1,
  targetHRMin: 0,
  targetHRMax: 0,
  rpe: 1,
  warmupMin: 0,
  cooldownMin: 0,
  mainSet: "Complete rest — no running.",
  coachNotes: "Rest allows adaptation from prior training and keeps you ready for the next key session.",
})

function midPaceForType(t: SessionType): { min: number; max: number } {
  switch (t) {
    case "Tempo":
      return { min: 4.75, max: 5.1 }
    case "Intervals":
      return { min: 4.4, max: 4.8 }
    case "Long Run":
      return { min: 5.3, max: 5.75 }
    case "Cross Training":
      return { min: 5.8, max: 6.2 }
    case "Easy Run":
    default:
      return { min: 5.9, max: 6.4 }
  }
}

function hrForType(t: SessionType): { z: number; min: number; max: number } {
  switch (t) {
    case "Tempo":
      return { z: 4, min: 155, max: 172 }
    case "Intervals":
      return { z: 5, min: 168, max: 185 }
    case "Long Run":
      return { z: 2, min: 128, max: 150 }
    case "Cross Training":
      return { z: 2, min: 120, max: 145 }
    case "Easy Run":
    default:
      return { z: 2, min: 130, max: 152 }
  }
}

function rpeForType(t: SessionType): number {
  switch (t) {
    case "Tempo":
      return 7
    case "Intervals":
      return 8
    case "Long Run":
      return 5
    case "Cross Training":
      return 4
    case "Easy Run":
    default:
      return 4
  }
}

export function fallbackTrainingSessionMeta(
  type: SessionType,
  distanceKm: number,
  description: string
): Pick<
  TrainingSession,
  | "durationMin"
  | "targetPaceMin"
  | "targetPaceMax"
  | "targetHRZone"
  | "targetHRMin"
  | "targetHRMax"
  | "rpe"
  | "warmupMin"
  | "cooldownMin"
  | "mainSet"
  | "coachNotes"
> {
  const pace = midPaceForType(type)
  const hr = hrForType(type)
  const midPace = (pace.min + pace.max) / 2
  const durationMin = Math.max(20, Math.round(distanceKm * midPace))
  const wu = type === "Intervals" || type === "Tempo" ? 15 : 10
  const cd = 10
  return {
    durationMin,
    targetPaceMin: pace.min,
    targetPaceMax: pace.max,
    targetHRZone: hr.z,
    targetHRMin: hr.min,
    targetHRMax: hr.max,
    rpe: rpeForType(type),
    warmupMin: wu,
    cooldownMin: cd,
    mainSet: `${description} (steady effort appropriate to ${type.toLowerCase()}.)`,
    coachNotes:
      type === "Long Run"
        ? "Builds endurance and musculoskeletal durability for your race. Kept in this week to balance volume and recovery."
        : "This session supports the phase goal while staying within a sustainable progression for your current fitness.",
  }
}
