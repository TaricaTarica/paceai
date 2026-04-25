import {
  RaceDistance,
  DayOfWeek,
  OnboardingData,
  PlannedWeekMeta,
  SessionType,
  TrainingPhase,
  TrainingPlan,
  TrainingSession,
  TrainingWeek,
} from "./types"
import {
  ALL_DAYS,
  generateSessionId,
  getDateForWeekDay,
  getTrainingDays,
  startOfWeekMonday,
} from "./plan-dates"
import { fallbackTrainingSessionMeta, restSessionMeta } from "./session-meta"

const SESSION_TYPES: Record<RaceDistance, SessionType[]> = {
  "5K": ["Easy Run", "Intervals", "Tempo", "Long Run"],
  "10K": ["Easy Run", "Tempo", "Intervals", "Long Run"],
  "Half Marathon": ["Easy Run", "Tempo", "Long Run", "Easy Run"],
  "Marathon": ["Easy Run", "Tempo", "Long Run", "Easy Run", "Easy Run"]
}

const BASE_DISTANCES: Record<RaceDistance, Record<SessionType, number>> = {
  "5K": {
    "Easy Run": 5,
    "Tempo": 6,
    "Intervals": 5,
    "Long Run": 8,
    "Cross Training": 5,
    "Rest": 0,
  },
  "10K": {
    "Easy Run": 6,
    "Tempo": 8,
    "Intervals": 6,
    "Long Run": 12,
    "Cross Training": 6,
    "Rest": 0,
  },
  "Half Marathon": {
    "Easy Run": 8,
    "Tempo": 10,
    "Intervals": 8,
    "Long Run": 16,
    "Cross Training": 8,
    "Rest": 0,
  },
  "Marathon": {
    "Easy Run": 10,
    "Tempo": 12,
    "Intervals": 10,
    "Long Run": 25,
    "Cross Training": 10,
    "Rest": 0,
  },
}

function getWeeksUntilRace(raceDate: Date): number {
  const now = new Date()
  const diffTime = raceDate.getTime() - now.getTime()
  const diffWeeks = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 7))
  return Math.max(1, Math.min(diffWeeks, 20))
}

export function generateTrainingPlan(data: OnboardingData): TrainingPlan | null {
  if (!data.goalDistance || !data.raceDate || !data.daysPerWeek || !String(data.goalTime ?? "").trim()) {
    return null
  }

  const raceDate = new Date(data.raceDate)
  const totalWeeks = getWeeksUntilRace(raceDate)
  const trainingDays = getTrainingDays(data.daysPerWeek, data.restDays)
  const sessionTypes = SESSION_TYPES[data.goalDistance]
  const baseDistances = BASE_DISTANCES[data.goalDistance]
  
  const weeks: TrainingWeek[] = []
  const startOfWeek = startOfWeekMonday(new Date())

  for (let week = 0; week < totalWeeks; week++) {
    const weekStart = new Date(startOfWeek)
    weekStart.setDate(startOfWeek.getDate() + week * 7)

    const sessions: TrainingSession[] = []
    
    // Calculate progression factor (build up, then taper)
    let progressionFactor: number
    if (week < totalWeeks * 0.7) {
      // Build phase: gradually increase
      progressionFactor = 0.7 + (0.4 * (week / (totalWeeks * 0.7)))
    } else if (week < totalWeeks * 0.9) {
      // Peak phase
      progressionFactor = 1.1
    } else {
      // Taper phase
      progressionFactor = 0.8 - (0.3 * ((week - totalWeeks * 0.9) / (totalWeeks * 0.1)))
    }
    
    let sessionIndex = 0
    
    for (const day of ALL_DAYS) {
      const sessionDate = getDateForWeekDay(weekStart, day)
      
      if (data.restDays.includes(day) || !trainingDays.includes(day)) {
        sessions.push({
          id: generateSessionId(),
          date: sessionDate.toISOString().split('T')[0],
          type: "Rest",
          distanceKm: 0,
          description: "Rest day",
          ...restSessionMeta(),
        })
      } else {
        const sessionType = sessionTypes[sessionIndex % sessionTypes.length]
        const baseDistance = baseDistances[sessionType]
        const distance = Math.round(baseDistance * progressionFactor)
        const description = getSessionDescription(sessionType, distance)

        sessions.push({
          id: generateSessionId(),
          date: sessionDate.toISOString().split('T')[0],
          type: sessionType,
          distanceKm: distance,
          description,
          ...fallbackTrainingSessionMeta(sessionType, distance, description),
        })
        
        sessionIndex++
      }
    }
    
    weeks.push({
      weekNumber: week + 1,
      sessions
    })
  }
  
  return {
    id: generateSessionId(),
    createdAt: new Date().toISOString(),
    goalDistance: data.goalDistance,
    raceDate: raceDate.toISOString().split('T')[0],
    daysPerWeek: data.daysPerWeek,
    restDays: data.restDays,
    totalWeeks,
    weeks
  }
}

function getSessionDescription(type: SessionType, distance: number): string {
  switch (type) {
    case "Easy Run":
      return `${distance}km at comfortable, conversational pace`
    case "Tempo":
      return `${distance}km at threshold pace, comfortably hard`
    case "Intervals":
      return `${distance}km including speed work intervals`
    case "Long Run":
      return `${distance}km long run at easy pace`
    case "Cross Training":
      return `${distance}km cross-training (easy effort, non-running stimulus)`
    default:
      return ""
  }
}

function sumWeekDistanceKm(week: TrainingWeek): number {
  return week.sessions.reduce(
    (acc, s) => acc + (s.type === "Rest" ? 0 : s.distanceKm),
    0
  )
}

function phaseAndFocusForWeekIndex(weekIndex0: number, totalWeeks: number): {
  phase: TrainingPhase
  focus: string
} {
  if (totalWeeks <= 1) {
    return { phase: "Base", focus: "Build toward your goal" }
  }
  const p = weekIndex0 / (totalWeeks - 1)
  if (p < 0.65) {
    return { phase: "Base", focus: "Aerobic base, durability, and consistent easy volume" }
  }
  if (p < 0.88) {
    return { phase: "Build", focus: "Progressive load with quality sessions" }
  }
  if (p < 0.95) {
    return { phase: "Peak", focus: "Race-specific work at highest sustainable load" }
  }
  return { phase: "Taper", focus: "Reduced volume, freshness for race day" }
}

/** Keeps only week 1 in `weeks` and records metadata for the rest (lazy generation alignment). */
export function reshapeFullPlanToLazyMaterialization(full: TrainingPlan): TrainingPlan {
  if (full.totalWeeks <= 1 || full.weeks.length <= 1) {
    return { ...full, plannedWeeks: full.plannedWeeks ?? [] }
  }
  const plannedWeeks: PlannedWeekMeta[] = full.weeks.slice(1).map((w) => {
    const { phase, focus } = phaseAndFocusForWeekIndex(w.weekNumber - 1, full.totalWeeks)
    return {
      weekNumber: w.weekNumber,
      phase,
      focus,
      estimatedTotalKm: sumWeekDistanceKm(w),
    }
  })
  return {
    ...full,
    weeks: [full.weeks[0]],
    plannedWeeks,
  }
}

export function adaptSession(
  plan: TrainingPlan,
  sessionId: string,
  feeling: "great" | "low" | "skip"
): TrainingPlan {
  const updatedWeeks = plan.weeks.map(week => ({
    ...week,
    sessions: week.sessions.map(session => {
      if (session.id !== sessionId) return session
      
      switch (feeling) {
        case "great":
          return {
            ...session,
            distanceKm: Math.round(session.distanceKm * 1.15),
            description: session.description?.replace(/\d+km/, `${Math.round(session.distanceKm * 1.15)}km`) + " (boosted)"
          }
        case "low":
          return {
            ...session,
            distanceKm: Math.round(session.distanceKm * 0.7),
            type: "Easy Run" as SessionType,
            description: `${Math.round(session.distanceKm * 0.7)}km easy recovery run`
          }
        case "skip":
          return {
            ...session,
            type: "Rest" as SessionType,
            distanceKm: 0,
            description: "Rest day (adapted)"
          }
        default:
          return session
      }
    })
  }))
  
  return { ...plan, weeks: updatedWeeks }
}
