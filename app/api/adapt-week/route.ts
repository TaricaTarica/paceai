import { createGateway } from "@ai-sdk/gateway"
import { generateObject } from "ai"
import { z } from "zod"
import { adaptWeekResponseSchema } from "@/lib/adapt-week-schema"

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
})

const feelingSchema = z.enum(["great", "low", "skip"])

const dayEnum = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])

const incomingSessionSchema = z.object({
  id: z.string(),
  date: z.string(),
  type: z.string(),
  distanceKm: z.number(),
  description: z.string().optional(),
  completedAt: z.string().optional(),
  skipped: z.boolean().optional(),
})

const weekInputSchema = z.object({
  weekNumber: z.number().int(),
  sessions: z.array(incomingSessionSchema),
})

const BodySchema = z.object({
  feeling: feelingSchema,
  userContext: z.string().optional(),
  triggeredDay: dayEnum,
  currentWeekNumber: z.number().int().positive(),
  profile: z.unknown(),
  allWeeks: z.array(weekInputSchema),
})

type WeekInput = z.infer<typeof weekInputSchema>

function feelingLabel(f: z.infer<typeof feelingSchema>): string {
  switch (f) {
    case "great":
      return "Feeling great — willing to push a bit more today"
    case "low":
      return "Low energy / needs recovery or easier stimulus"
    case "skip":
      return "Cannot run today — needs rest or redistribution"
    default:
      return f
  }
}

function hasCompletedAt(session: WeekInput["sessions"][number]): boolean {
  return typeof session.completedAt === "string" && session.completedAt.trim() !== ""
}

/** Sessions explicitly done/skipped, plus past-week sessions (before current week) that were not skipped. */
function buildCompletedSessions(allWeeks: WeekInput[], currentWeekNumber: number) {
  const out: { weekNumber: number; session: WeekInput["sessions"][number] }[] = []
  for (const week of allWeeks) {
    for (const session of week.sessions) {
      const explicit = hasCompletedAt(session) || session.skipped === true
      const autoPast = week.weekNumber < currentWeekNumber && session.skipped !== true
      if (explicit || autoPast) {
        out.push({ weekNumber: week.weekNumber, session })
      }
    }
  }
  return out
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

  const { feeling, userContext, triggeredDay, currentWeekNumber, profile, allWeeks } = parsed.data

  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: "AI_GATEWAY_API_KEY is not configured" }, { status: 503 })
  }

  const completedSessions = buildCompletedSessions(allWeeks, currentWeekNumber)

  try {
    const { object } = await generateObject({
      model: gateway("anthropic/claude-sonnet-4.5"),
      schema: adaptWeekResponseSchema,
      maxRetries: 2,
      system: `You are an adaptive running coach. The runner reported how they feel about today's workout.
Return a structured adaptation only (no tools). Prioritize injury prevention and long-term progress.
coachMessage must be at most two sentences, friendly and actionable.
currentWeekAdapted must be exactly 7 sessions in Mon→Sun order matching the input week for currentWeekNumber.
Only include upcomingWeeksChanges (max 2 future weeks) when load or structure should shift beyond the current week.
Each session in your output uses only type, distanceKm, and optional description — preserve training intent.`,
      prompt: `Runner status:
- Feeling: ${feelingLabel(feeling)} (code: ${feeling})
- User context: ${userContext?.trim() || "none"}
- Triggered day (they tapped this day): ${triggeredDay}
- Current week number: ${currentWeekNumber}
- Profile: ${JSON.stringify(profile)}
- Full plan weeks: ${JSON.stringify(allWeeks)}
- Completed or assumed-done sessions (for context — do not remove history): ${JSON.stringify(completedSessions)}

Adapt starting from week ${currentWeekNumber}, especially ${triggeredDay}. Output reasoning, the full adapted current week (7 days), optional changes for up to 2 upcoming weeks, and coachMessage.`,
    })

    return Response.json(object)
  } catch (err) {
    console.error("[adapt-week]", err)
    return Response.json({ error: "Adaptation failed" }, { status: 502 })
  }
}
