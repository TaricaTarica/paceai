import type { DayOfWeek } from "./types"

export const ALL_DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

export const DAY_MAP: Record<DayOfWeek, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 0,
}

/** Monday 00:00:00 of the calendar week containing `d`. */
export function startOfWeekMonday(d: Date): Date {
  const start = new Date(d)
  start.setHours(0, 0, 0, 0)
  const dow = start.getDay()
  const daysToMonday = dow === 0 ? -6 : 1 - dow
  start.setDate(start.getDate() + daysToMonday)
  return start
}

export function getDateForWeekDay(weekStart: Date, dayOfWeek: DayOfWeek): Date {
  const date = new Date(weekStart)
  const targetDay = DAY_MAP[dayOfWeek]
  const currentDay = date.getDay()
  const daysToAdd = (targetDay - currentDay + 7) % 7
  date.setDate(date.getDate() + daysToAdd)
  return date
}

export function generateSessionId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).substring(2, 11)
}

export function getTrainingDays(daysPerWeek: number, restDays: DayOfWeek[]): DayOfWeek[] {
  const availableDays = ALL_DAYS.filter((day) => !restDays.includes(day))
  return availableDays.slice(0, daysPerWeek)
}
