import { createGateway } from "@ai-sdk/gateway"
import { generateObject } from "ai"
import { z } from "zod"
import { mapGeneratedWeekToTrainingWeek, type AiPlanWeek } from "@/lib/map-ai-plan"
import type { OnboardingData, DayOfWeek, RaceDistance } from "@/lib/types"

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

const OneAiWeekSchema = z.object({
  weekNumber: z.number().int().positive(),
  phase: z.enum(["Base", "Build", "Peak", "Taper"]),
  focus: z.string(),
  sessions: z.array(SessionSchema).length(7),
  totalKm: z.number().nonnegative(),
})

const PlannedWeekMetaBodySchema = z.object({
  weekNumber: z.number().int().positive(),
  phase: z.enum(["Base", "Build", "Peak", "Taper"]),
  focus: z.string(),
  estimatedTotalKm: z.number().nonnegative(),
})

const previousWeekSessionSchema = z
  .object({
    type: z.string(),
    distanceKm: z.number(),
  })
  .passthrough()

const previousWeekSchema = z.object({
  weekNumber: z.number().int(),
  sessions: z.array(previousWeekSessionSchema),
})

const OnboardingForWeekBodySchema = z.object({
  goalDistance: z.enum(["5K", "10K", "Half Marathon", "Marathon"]),
  raceDate: z.string().min(1),
  personalBests: z.record(z.string()).optional().default({}),
  daysPerWeek: z.union([z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  restDays: z.array(dayEnum).min(1),
  aggressive: z.boolean().optional().default(false),
  goalTime: z.string().optional(),
  currentPR: z.string().optional(),
})

const BodySchema = z.object({
  weekNumber: z.number().int().positive(),
  plannedWeekMeta: PlannedWeekMetaBodySchema,
  previousWeeks: z.array(previousWeekSchema).max(2),
  profile: z.object({
    onboarding: OnboardingForWeekBodySchema,
  }),
})

function toOnboardingData(parsed: z.infer<typeof OnboardingForWeekBodySchema>): OnboardingData {
  return {
    goalDistance: parsed.goalDistance as RaceDistance,
    raceDate: new Date(parsed.raceDate),
    personalBests: parsed.personalBests as OnboardingData["personalBests"],
    goalTime: parsed.goalTime,
    daysPerWeek: parsed.daysPerWeek,
    restDays: parsed.restDays as DayOfWeek[],
    currentPR: parsed.currentPR,
    aggressive: parsed.aggressive,
  }
}

function formatPbs(pb: object | undefined): string {
  if (!pb) return "not provided"
  const e = Object.entries(pb as Record<string, string | undefined>).filter(
    ([, v]) => v && String(v).trim() !== ""
  )
  if (e.length === 0) return "not provided"
  return JSON.stringify(Object.fromEntries(e))
}

export async function POST(req: Request) {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(json)
  if (!parsed.success) {
    return Response.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 })
  }

  const { weekNumber, plannedWeekMeta, previousWeeks, profile } = parsed.data

  if (plannedWeekMeta.weekNumber !== weekNumber) {
    return Response.json(
      { error: "plannedWeekMeta.weekNumber must match weekNumber" },
      { status: 400 }
    )
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: "AI_GATEWAY_API_KEY is not configured" }, { status: 503 })
  }

  const onboarding = toOnboardingData(profile.onboarding)

  try {
    const { object: aiWeek } = await generateObject({
      model: gateway("anthropic/claude-sonnet-4.5"),
      schema: OneAiWeekSchema,
      maxRetries: 0,
      prompt: `You are an expert running coach. Generate exactly ONE training week in full detail.

Target week (must use this weekNumber in output):
- weekNumber: ${weekNumber}

Planned week summary (respect phase, load intent, and focus; align detailed sessions to ~${plannedWeekMeta.estimatedTotalKm} km total running load unless rest days make that approximate):
- phase: ${plannedWeekMeta.phase}
- focus: ${plannedWeekMeta.focus}
- estimatedTotalKm: ${plannedWeekMeta.estimatedTotalKm}

Runner profile (from profile.onboarding):
- Goal: ${onboarding.goalDistance}, race: ${onboarding.raceDate?.toISOString?.() ?? "unknown"}${onboarding.goalTime ? `, target finish: ${onboarding.goalTime}` : ""}
- Days/week: ${onboarding.daysPerWeek}, rest days: ${(onboarding.restDays ?? []).join(", ")}
- PBs: ${formatPbs(onboarding.personalBests)}
- Approach: ${onboarding.aggressive ? "aggressive" : "conservative"} weekly progression

Context — previous materialized week(s) for progression (only last 1–2 weeks, JSON):
${JSON.stringify(previousWeeks)}

Rules for this week:
- Exactly 7 sessions, one per calendar day Mon through Sun, with correct "day" field in order.
- Only schedule key workouts on days that are NOT in rest days: ${(onboarding.restDays ?? []).join(", ")}.
- Exactly ${onboarding.daysPerWeek} distinct training days (non-rest); other non-rest slots Rest or very easy as needed.
- For every session, targetPaceMin/Max in min/km (decimals). Rest: 0 paces, HR 0, rpe 1, warmup/cooldown 0, short mainSet/coachNotes.
- For training sessions: full HR, RPE, warmup/cooldown, mainSet, coachNotes, durationMin when possible.
- totalKm should be your estimate of the week's run volume (excludes pure rest) and should be consistent with the planned summary.`,
    })

    if (aiWeek.weekNumber !== weekNumber) {
      return Response.json(
        { error: "Model returned a different weekNumber" },
        { status: 422 }
      )
    }

    const week = mapGeneratedWeekToTrainingWeek(
      aiWeek as AiPlanWeek,
      onboarding,
      weekNumber
    )
    if (!week) {
      return Response.json({ error: "Could not map generated week" }, { status: 422 })
    }

    return Response.json({ week })
  } catch (err) {
    console.error("[generate-week]", err)
    return Response.json({ error: "Week generation failed" }, { status: 502 })
  }
}
