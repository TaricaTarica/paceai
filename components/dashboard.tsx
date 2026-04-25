"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { format, differenceInDays, parseISO } from "date-fns"
import { ChevronLeft, ChevronRight, Calendar, Target, Clock, Activity, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  TrainingPlan,
  TrainingSession,
  SessionType,
  DayOfWeek,
  OnboardingData,
  PlannedWeekMeta,
  TrainingWeek,
} from "@/lib/types"
import { AdaptModal } from "./adapt-modal"
import { SessionDetailSheet } from "./session-detail-sheet"
import { SESSION_ICONS, SESSION_COLORS } from "./session-type-styles"

const DAY_LABELS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

const WEATHER_CITY = "Montevideo"

interface WttrJ1Current {
  temp_C?: string
  weatherDesc?: Array<{ value?: string }>
}

interface WttrJ1Widget {
  current_condition?: WttrJ1Current[]
}

interface DashboardProps {
  plan: TrainingPlan
  onboarding: OnboardingData
  onPlanUpdate: (plan: TrainingPlan) => void
  onReset: () => void
}

function getPreviousWeeksForApi(plan: TrainingPlan, beforeWeek: number): TrainingWeek[] {
  return plan.weeks
    .filter((w) => w.weekNumber < beforeWeek)
    .sort((a, b) => b.weekNumber - a.weekNumber)
    .slice(0, 2)
    .sort((a, b) => a.weekNumber - b.weekNumber)
}

export function Dashboard({ plan, onboarding, onPlanUpdate, onReset }: DashboardProps) {
  const [currentWeek, setCurrentWeek] = useState(1)
  const [selectedSession, setSelectedSession] = useState<TrainingSession | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sessionIdInSheet, setSessionIdInSheet] = useState<string | null>(null)
  const [generatingWeek, setGeneratingWeek] = useState<number | null>(null)
  const [weekGenError, setWeekGenError] = useState<string | null>(null)
  const autoAttemptedWeek = useRef<number | null>(null)
  const [weatherLine, setWeatherLine] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        // format=3 often returns HTML in browsers; j1 is JSON and stable.
        const r = await fetch(`https://wttr.in/${encodeURIComponent(WEATHER_CITY)}?format=j1`, {
          headers: { "User-Agent": "PaceAI/1.0", Accept: "application/json" },
        })
        if (!r.ok || cancelled) return
        const data = (await r.json()) as WttrJ1Widget
        const cur = data.current_condition?.[0]
        if (!cur || cancelled) return
        const desc = cur.weatherDesc?.[0]?.value?.trim() ?? ""
        const tempRaw = (cur.temp_C ?? "").replace(/^\+/, "")
        const part = [desc, tempRaw ? `${tempRaw}°C` : ""].filter(Boolean).join(" ")
        if (!part) return
        setWeatherLine(`📍 ${WEATHER_CITY} · ${part}`)
      } catch {
        if (!cancelled) setWeatherLine(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const week = plan.weeks.find(w => w.weekNumber === currentWeek)
  const plannedMeta: PlannedWeekMeta | undefined = plan.plannedWeeks?.find(
    (p) => p.weekNumber === currentWeek
  )
  const weekNotLoaded =
    !week &&
    currentWeek >= 1 &&
    currentWeek <= plan.totalWeeks

  const runGenerateWeek = useCallback(
    async (wn: number) => {
      const meta = plan.plannedWeeks?.find((p) => p.weekNumber === wn)
      if (!meta) {
        setWeekGenError("No preview data for this week. Start a new plan if this persists.")
        return
      }
      if (!onboarding.goalDistance || !onboarding.raceDate || !onboarding.daysPerWeek) {
        setWeekGenError("Profile is incomplete.")
        return
      }
      setWeekGenError(null)
      setGeneratingWeek(wn)
      try {
        const res = await fetch("/api/generate-week", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekNumber: wn,
            plannedWeekMeta: meta,
            previousWeeks: getPreviousWeeksForApi(plan, wn),
            profile: {
              onboarding: {
                goalDistance: onboarding.goalDistance,
                raceDate: onboarding.raceDate.toISOString(),
                personalBests: onboarding.personalBests,
                goalTime: onboarding.goalTime,
                daysPerWeek: onboarding.daysPerWeek,
                restDays: onboarding.restDays,
                aggressive: onboarding.aggressive ?? false,
                currentPR: onboarding.currentPR,
              },
            },
          }),
        })
        const raw = (await res.json()) as { week?: TrainingWeek; error?: string }
        if (!res.ok) {
          throw new Error(raw.error || "Failed to generate week")
        }
        if (!raw.week) {
          throw new Error("No week returned")
        }
        const other = plan.weeks.filter((w) => w.weekNumber !== wn)
        const newWeeks = [...other, raw.week].sort((a, b) => a.weekNumber - b.weekNumber)
        const newPlanned = (plan.plannedWeeks ?? []).filter((p) => p.weekNumber !== wn)
        onPlanUpdate({
          ...plan,
          weeks: newWeeks,
          plannedWeeks: newPlanned,
        })
      } catch (e) {
        setWeekGenError(e instanceof Error ? e.message : "Could not generate week")
      } finally {
        setGeneratingWeek(null)
      }
    },
    [plan, onboarding, onPlanUpdate]
  )

  useEffect(() => {
    setWeekGenError(null)
  }, [currentWeek])

  useEffect(() => {
    if (week) {
      autoAttemptedWeek.current = null
      return
    }
    if (!weekNotLoaded || !plannedMeta) return
    if (generatingWeek !== null) return
    if (autoAttemptedWeek.current === currentWeek) return
    autoAttemptedWeek.current = currentWeek
    void runGenerateWeek(currentWeek)
  }, [week, weekNotLoaded, plannedMeta, currentWeek, generatingWeek, runGenerateWeek])
  const sessionInSheet = sessionIdInSheet
    ? week?.sessions.find((s) => s.id === sessionIdInSheet) ?? null
    : null
  const dayIdx =
    sessionInSheet && week
      ? week.sessions.findIndex((s) => s.id === sessionInSheet.id)
      : -1
  const dayForSheet: DayOfWeek | null =
    dayIdx >= 0 ? (DAY_LABELS[dayIdx] ?? null) : null
  const daysUntilRace = differenceInDays(parseISO(plan.raceDate), new Date())

  const patchSession = (sessionId: string, patch: Partial<TrainingSession>) => {
    onPlanUpdate({
      ...plan,
      weeks: plan.weeks.map((w) =>
        w.weekNumber !== currentWeek
          ? w
          : {
              ...w,
              sessions: w.sessions.map((s) => (s.id === sessionId ? { ...s, ...patch } : s)),
            }
      ),
    })
  }

  const handlePlanAdapted = (updatedPlan: TrainingPlan) => {
    onPlanUpdate(updatedPlan)
    setIsModalOpen(false)
    setSelectedSession(null)
  }

  const triggeredDay: DayOfWeek | null =
    week && selectedSession
      ? (DAY_LABELS[week.sessions.findIndex((s) => s.id === selectedSession.id)] ?? "Mon")
      : null

  return (
    <div className="min-h-screen bg-background">
      <div className="flex flex-col lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-border bg-card p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">PaceAI</h1>
              <p className="text-sm text-muted-foreground">Training Dashboard</p>
            </div>
          </div>

          <Card className="bg-secondary/30 border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Your Goal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-2xl font-bold text-primary">{plan.goalDistance}</div>
                <div className="text-sm text-muted-foreground">Target Distance</div>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>{format(parseISO(plan.raceDate), "MMMM d, yyyy")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>{plan.daysPerWeek} days/week</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className="text-4xl font-bold text-primary">{Math.max(0, daysUntilRace)}</div>
                <div className="text-sm text-muted-foreground mt-1">days until race</div>
              </div>
            </CardContent>
          </Card>

          {weatherLine ? (
            <p className="text-xs text-muted-foreground px-0.5">{weatherLine}</p>
          ) : null}

          <Button variant="outline" onClick={onReset} className="w-full">
            Start New Plan
          </Button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Week Navigation */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Weekly Schedule</h2>
              <div className="flex items-center gap-4">
                <Badge variant="secondary" className="text-sm">
                  Week {currentWeek} of {plan.totalWeeks}
                </Badge>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentWeek(Math.max(1, currentWeek - 1))}
                    disabled={currentWeek === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentWeek(Math.min(plan.totalWeeks, currentWeek + 1))}
                    disabled={currentWeek === plan.totalWeeks}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>

            {weekNotLoaded && (
              <Card className="border-dashed border-primary/40 bg-secondary/20">
                <CardContent className="pt-6 space-y-4">
                  {generatingWeek === currentWeek ? (
                    <div className="flex items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>Building week {currentWeek}…</span>
                    </div>
                  ) : (
                    <>
                      {plannedMeta && (
                        <div className="space-y-1 text-sm">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary">{plannedMeta.phase}</Badge>
                            <span className="text-muted-foreground">~{plannedMeta.estimatedTotalKm} km planned</span>
                          </div>
                          <p className="text-foreground">{plannedMeta.focus}</p>
                        </div>
                      )}
                      {!plannedMeta && (
                        <p className="text-sm text-muted-foreground">
                          No preview data for this week. Try a new plan if this message persists.
                        </p>
                      )}
                      {weekGenError && (
                        <p className="text-sm text-destructive" role="alert">
                          {weekGenError}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          onClick={() => {
                            autoAttemptedWeek.current = null
                            void runGenerateWeek(currentWeek)
                          }}
                          disabled={!plannedMeta || generatingWeek !== null}
                        >
                          Generate week {currentWeek}
                        </Button>
                        {weekGenError && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              autoAttemptedWeek.current = null
                              void runGenerateWeek(currentWeek)
                            }}
                            disabled={!plannedMeta || generatingWeek !== null}
                          >
                            Try again
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Calendar Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {week?.sessions.map((session, index) => {
                const Icon = SESSION_ICONS[session.type]
                const colorClass = SESSION_COLORS[session.type]
                const dayLabel = DAY_LABELS[index]

                return (
                  <Card
                    key={session.id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        setSessionIdInSheet(session.id)
                        setSheetOpen(true)
                      }
                    }}
                    onClick={() => {
                      setSessionIdInSheet(session.id)
                      setSheetOpen(true)
                    }}
                    className={cn(
                      "relative overflow-hidden transition-all hover:shadow-lg cursor-pointer",
                      session.type === "Rest" ? "bg-card" : "bg-card hover:border-primary/50"
                    )}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">{dayLabel}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(session.date), "MMM d")}
                        </span>
                      </div>

                      <Badge className={cn("w-full justify-center gap-1 border", colorClass)}>
                        <Icon className="h-3 w-3" />
                        <span className="text-xs">{session.type}</span>
                      </Badge>

                      {session.type !== "Rest" && (
                        <div className="text-center">
                          <span className="text-2xl font-bold">{session.distanceKm}</span>
                          <span className="text-sm text-muted-foreground ml-1">km</span>
                        </div>
                      )}

                      {session.type === "Rest" && (
                        <div className="text-center py-2">
                          <span className="text-sm text-muted-foreground">Recovery Day</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            {/* Session Type Legend */}
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 justify-center">
                  {(Object.keys(SESSION_COLORS) as SessionType[]).map((type) => {
                    const Icon = SESSION_ICONS[type]
                    return (
                      <div key={type} className="flex items-center gap-2">
                        <Badge className={cn("gap-1 border", SESSION_COLORS[type])}>
                          <Icon className="h-3 w-3" />
                          <span className="text-xs">{type}</span>
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>

      {sessionInSheet && dayForSheet && (
        <SessionDetailSheet
          session={sessionInSheet}
          dayLabel={dayForSheet}
          open={sheetOpen}
          onOpenChange={(open) => {
            setSheetOpen(open)
            if (!open) setSessionIdInSheet(null)
          }}
          onAdapt={() => {
            setSelectedSession(sessionInSheet)
            setIsModalOpen(true)
            setSheetOpen(false)
            setSessionIdInSheet(null)
          }}
          onMarkDone={() => {
            patchSession(sessionInSheet.id, {
              completedAt: new Date().toISOString(),
              skipped: false,
            })
          }}
          onSkip={() => {
            if (!sessionInSheet.skipped) {
              patchSession(sessionInSheet.id, { skipped: true, completedAt: undefined })
            }
          }}
        />
      )}

      {selectedSession && week && triggeredDay && (
        <AdaptModal
          session={selectedSession}
          weekPlan={week}
          plan={plan}
          onboarding={onboarding}
          triggeredDay={triggeredDay}
          currentWeekNumber={currentWeek}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedSession(null)
          }}
          onPlanAdapted={handlePlanAdapted}
        />
      )}
    </div>
  )
}
