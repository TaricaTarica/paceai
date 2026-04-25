import { createGateway } from "@ai-sdk/gateway"
import { generateObject } from "ai"
import { z } from "zod"
import { generateTrainingPlan, reshapeFullPlanToLazyMaterialization } from "@/lib/generate-plan"
import { mapAiPlanToTrainingPlan } from "@/lib/map-ai-plan"
import type { OnboardingData, RaceDistance, DayOfWeek } from "@/lib/types"

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
})

const dayEnum = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])

const SessionSchema = z.object({
  day: dayEnum,
  type: z.enum(["Easy Run", "Tempo", "Intervals", "Long Run", "Rest", "Cross Training"]),
  distanceKm: z.number().optional(),
  durationMin: z.number().nonnegative().optional(),
  description: z.string(),
  intensity: z.enum(["low", "medium", "high"]).optional(),
  targetPaceMin: z.number().nonnegative(),
  targetPaceMax: z.number().nonnegative(),
  targetHRZone: z.number().int().min(1).max(5),
  targetHRMin: z.number().int().nonnegative(),
  targetHRMax: z.number().int().nonnegative(),
  rpe: z.number().int().min(1).max(10),
  warmupMin: z.number().nonnegative(),
  cooldownMin: z.number().nonnegative(),
  mainSet: z.string(),
  coachNotes: z.string(),
})

const Week1Schema = z.object({
  weekNumber: z.literal(1),
  phase: z.enum(["Base", "Build", "Peak", "Taper"]),
  focus: z.string(),
  sessions: z.array(SessionSchema).length(7),
  totalKm: z.number().nonnegative(),
})

const PlannedWeekRowSchema = z.object({
  weekNumber: z.number().int().positive(),
  phase: z.enum(["Base", "Build", "Peak", "Taper"]),
  focus: z.string(),
  estimatedTotalKm: z.number().nonnegative(),
})

const PlanSchema = z.object({
  totalWeeks: z.number().int().positive().max(24),
  /** Macro phase the plan is starting in (align with week 1). */
  currentPhase: z.enum(["Base", "Build", "Peak", "Taper"]),
  /** Exactly week 1 with full session detail. */
  weeks: z.tuple([Week1Schema]),
  /** Weeks 2 through totalWeeks: phase, focus, and estimated total km only (no sessions). */
  plannedWeeks: z.array(PlannedWeekRowSchema),
  notes: z.string(),
})

const BodySchema = z.object({
  goalDistance: z.enum(["5K", "10K", "Half Marathon", "Marathon"]),
  raceDate: z.string().min(1),
  personalBests: z
    .record(z.string())
    .optional()
    .default({}),
  daysPerWeek: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  restDays: z.array(dayEnum).min(1),
  aggressive: z.boolean().optional().default(false),
  currentPR: z.string().optional(),
  goalTime: z.string().min(1),
})

function formatPersonalBests(pb: Record<string, string> | undefined): string {
  if (!pb) return "not provided"
  const entries = Object.entries(pb).filter(([, v]) => v && String(v).trim() !== "")
  if (entries.length === 0) return "not provided"
  return JSON.stringify(Object.fromEntries(entries))
}

function toOnboardingData(parsed: z.infer<typeof BodySchema>): OnboardingData {
  const race = new Date(parsed.raceDate)
  return {
    goalDistance: parsed.goalDistance as RaceDistance,
    raceDate: race,
    personalBests: parsed.personalBests as OnboardingData["personalBests"],
    goalTime: parsed.goalTime,
    daysPerWeek: parsed.daysPerWeek,
    restDays: parsed.restDays as DayOfWeek[],
    currentPR: parsed.currentPR,
    aggressive: parsed.aggressive,
  }
}

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsedBody = BodySchema.safeParse(json)
  if (!parsedBody.success) {
    return Response.json({ error: "Invalid request", details: parsedBody.error.flatten() }, { status: 400 })
  }

  const body = parsedBody.data
  const raceDate = new Date(body.raceDate)
  if (Number.isNaN(raceDate.getTime())) {
    return Response.json({ error: "Invalid raceDate" }, { status: 400 })
  }

  const onboarding = toOnboardingData(body)
  const weeksUntilRace = Math.floor((raceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7))

  if (!process.env.AI_GATEWAY_API_KEY) {
    const full = generateTrainingPlan(onboarding)
    if (!full) {
      return Response.json({ error: "Could not build plan" }, { status: 500 })
    }
    return Response.json({
      plan: reshapeFullPlanToLazyMaterialization(full),
      source: "deterministic",
      reason: "missing AI_GATEWAY_API_KEY",
    })
  }

  const capWeeks = Math.max(1, Math.min(weeksUntilRace, 24))

  try {
    const { object } = await generateObject({
      model: gateway("anthropic/claude-sonnet-4.5"),
      schema: PlanSchema,
      maxRetries: 0,
      prompt: `You are an expert running coach. Create the START of a structured training plan (initial load must be small).

Runner profile:
- Goal race: ${body.goalDistance} on ${body.raceDate}
- Athlete goal: finish ${body.goalDistance} in ${body.goalTime}. Current PR: ${formatPersonalBests(body.personalBests)}
- Weeks until race (floor): ${weeksUntilRace}
- Training days/week: ${body.daysPerWeek}
- Preferred rest days: ${body.restDays.join(", ")}
- Approach: ${body.aggressive ? "aggressive (push limits, up to ~15% weekly volume jumps when justified)" : "conservative (injury prevention first, ~10% weekly volume progression)"}
- Personal bests: ${formatPersonalBests(body.personalBests)}
${body.currentPR ? `- Stated goal race PR / target: ${body.currentPR}` : ""}

Output shape (CRITICAL):
- **weeks**: a single-element array containing ONLY week 1 with weekNumber=1, full phase/focus, totalKm for that week, and all 7 sessions in full detail.
- **plannedWeeks**: for weeks 2, 3, ... through totalWeeks, provide ONLY: weekNumber, phase, focus, estimatedTotalKm (rough planned weekly load). NO sessions in plannedWeeks.
- **totalWeeks** must be at least 2 if time allows; at most ${capWeeks}. Must equal 1 + plannedWeeks.length.
- **currentPhase**: the training phase for week 1 (start of plan).
- **notes**: high-level plan notes for the full cycle.

Rules for week 1 (detailed):
- Week 1 MUST have exactly 7 sessions, one per calendar day Mon through Sun, each with the correct "day" field.
- Only schedule hard/easy workouts on days that are NOT in rest days: ${body.restDays.join(", ")}.
- Exactly ${body.daysPerWeek} distinct training days per week (non-rest); other non-rest slots should be Rest or very easy recovery as needed — prefer explicit Rest on unused slots.
- Prefer long runs on Sat or Sun when possible.
- Each session needs a clear, motivating description.
- For every session, set targetPaceMin and targetPaceMax as minutes per km (decimal, e.g. 5.5 = 5:30/km). For Rest days, use 0 for pace fields, targetHRMin/Max 0, rpe 1, warmupMin/cooldownMin 0, and brief placeholder strings for mainSet/coachNotes (e.g. "Complete rest" / "Full recovery").
- For non-Rest training sessions: set coherent targetHRZone (1-5), targetHRMin/Max in bpm, rpe 1-10, warmupMin and cooldownMin, mainSet (detailed work description), and coachNotes (2-3 sentences: why this session matters now). Set durationMin to match the workout when possible.

Rules for plannedWeeks (weeks 2+ summary only):
- Set phase and focus to show progression toward the goal race and include taper in the last 2 weeks before the race in your weekly breakdown (lower estimatedTotalKm, still note intensity touches in focus).
- estimatedTotalKm should rise gradually (max ~10% per week if conservative, ~15% if aggressive, except taper weeks where it drops).
- plannedWeeks[i].weekNumber must be i+2 (consecutive 2, 3, ..., totalWeeks).`,
    })

    const mapped = mapAiPlanToTrainingPlan(object, onboarding)
    if (mapped) {
      return Response.json({ plan: mapped, source: "ai" })
    }

    const fullFallback = generateTrainingPlan(onboarding)
    if (!fullFallback) {
      return Response.json({ error: "AI output failed validation and fallback failed" }, { status: 422 })
    }
    return Response.json({
      plan: reshapeFullPlanToLazyMaterialization(fullFallback),
      source: "deterministic",
      reason: "ai_output_validation",
    })
  } catch (err) {
    console.error("[generate-plan]", err)
    const fullFallback = generateTrainingPlan(onboarding)
    if (fullFallback) {
      return Response.json({
        plan: reshapeFullPlanToLazyMaterialization(fullFallback),
        source: "deterministic",
        reason: "ai_error",
      })
    }
    return Response.json({ error: "Plan generation failed" }, { status: 502 })
  }
}
