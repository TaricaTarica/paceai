import { z } from "zod"

const sessionTypeEnum = z.enum([
  "Easy Run",
  "Tempo",
  "Intervals",
  "Long Run",
  "Cross Training",
  "Rest",
])

/** One session row returned by the adapt-week model (merge onto existing by index). */
export const adaptWeekSessionSliceSchema = z.object({
  type: sessionTypeEnum,
  distanceKm: z.number(),
  description: z.string().optional(),
})

export const adaptWeekResponseSchema = z.object({
  reasoning: z.string(),
  currentWeekAdapted: z.array(adaptWeekSessionSliceSchema).length(7),
  upcomingWeeksChanges: z
    .array(
      z.object({
        weekNumber: z.number().int(),
        sessions: z.array(adaptWeekSessionSliceSchema).length(7),
        reason: z.string(),
      })
    )
    .max(2),
  coachMessage: z
    .string()
    .describe("Short encouraging summary for the athlete, at most two sentences."),
})

export type AdaptWeekSessionSlice = z.infer<typeof adaptWeekSessionSliceSchema>
export type AdaptWeekResponse = z.infer<typeof adaptWeekResponseSchema>
