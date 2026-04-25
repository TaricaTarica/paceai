"use client"

import { useEffect, useState } from "react"
import { Sparkles, Zap, Battery, X, Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DayOfWeek, OnboardingData, TrainingPlan, TrainingSession, TrainingWeek } from "@/lib/types"
import { adaptWeekResponseSchema, type AdaptWeekResponse } from "@/lib/adapt-week-schema"
import { applyAdaptWeekResultToPlan } from "@/lib/merge-adapt-week-result"

const DAY_LABELS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface AdaptModalProps {
  session: TrainingSession
  weekPlan: TrainingWeek
  plan: TrainingPlan
  onboarding: OnboardingData
  triggeredDay: DayOfWeek
  currentWeekNumber: number
  isOpen: boolean
  onClose: () => void
  onPlanAdapted: (plan: TrainingPlan) => void
}

type FeelingOption = "great" | "low" | "skip"

const FEELING_OPTIONS: {
  value: FeelingOption
  label: string
  emoji: string
  icon: React.ElementType
  description: string
}[] = [
  {
    value: "great",
    label: "Feeling great",
    emoji: "💪",
    icon: Zap,
    description: "Boost my workout intensity",
  },
  {
    value: "low",
    label: "Low energy",
    emoji: "😴",
    icon: Battery,
    description: "Scale back to easy recovery",
  },
  {
    value: "skip",
    label: "Can't run today",
    emoji: "❌",
    icon: X,
    description: "Convert to rest day",
  },
]

function sessionSummary(s: { type: string; distanceKm: number }) {
  return s.type === "Rest" ? "Rest" : `${s.type} ${s.distanceKm}km`
}

export function AdaptModal({
  session,
  weekPlan,
  plan,
  onboarding,
  triggeredDay,
  currentWeekNumber,
  isOpen,
  onClose,
  onPlanAdapted,
}: AdaptModalProps) {
  const [selectedFeeling, setSelectedFeeling] = useState<FeelingOption | null>(null)
  const [context, setContext] = useState("")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<AdaptWeekResponse | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setPreview(null)
      setSelectedFeeling(null)
      setContext("")
      setError(null)
      setPending(false)
    }
  }, [isOpen])

  const handleAdapt = async () => {
    if (!selectedFeeling) return
    setPending(true)
    setError(null)
    try {
      const res = await fetch("/api/adapt-week", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feeling: selectedFeeling,
          userContext: context.trim() || undefined,
          triggeredDay,
          currentWeekNumber,
          profile: { onboarding, plan },
          allWeeks: plan.weeks,
          city: "Montevideo",
        }),
      })
      const raw = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg =
          typeof raw === "object" && raw !== null && "error" in raw && typeof (raw as { error: unknown }).error === "string"
            ? (raw as { error: string }).error
            : `Request failed (${res.status})`
        throw new Error(msg)
      }
      const validated = adaptWeekResponseSchema.safeParse(raw)
      if (!validated.success) {
        throw new Error("Invalid response from server")
      }
      setPreview(validated.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adaptation failed")
    } finally {
      setPending(false)
    }
  }

  const handleAccept = () => {
    if (!preview) return
    const next = applyAdaptWeekResultToPlan(plan, currentWeekNumber, preview)
    onPlanAdapted(next)
    onClose()
  }

  const handleCancelPreview = () => {
    setPreview(null)
  }

  const handleClose = () => {
    if (pending) return
    onClose()
  }

  const showPreview = preview !== null

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
    >
      <DialogContent
        className={cn(
          "bg-card border-border max-h-[90vh] overflow-y-auto overflow-x-hidden",
          showPreview
            ? "w-full max-w-[min(100vw-2rem,48rem)] sm:max-w-[min(90vw,56rem)]"
            : "sm:max-w-md"
        )}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {showPreview ? "Review changes" : "Adapt Your Session"}
          </DialogTitle>
          <DialogDescription>
            {showPreview
              ? "Accept to update your plan, or cancel to keep the current schedule."
              : "Tell us how you're feeling and we'll adjust your training with the adaptive coach."}
          </DialogDescription>
        </DialogHeader>

        {showPreview ? (
          <div className="space-y-4 py-2">
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="pt-4">
                <p className="text-sm font-medium text-foreground">{preview.coachMessage}</p>
              </CardContent>
            </Card>

            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground/80">Coach reasoning</summary>
              <p className="mt-2 whitespace-pre-wrap">{preview.reasoning}</p>
            </details>

            <div className="space-y-2">
              <p className="text-sm font-medium">Week {currentWeekNumber}</p>
              <ul className="space-y-1.5 text-sm border border-border rounded-lg p-3 bg-secondary/20">
                {preview.currentWeekAdapted.map((next, i) => {
                  const prev = weekPlan.sessions[i]
                  const day = DAY_LABELS[i]
                  const changed =
                    prev.type !== next.type || prev.distanceKm !== next.distanceKm
                  return (
                    <li key={day} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                      <span className="text-muted-foreground w-10 shrink-0">{day}</span>
                      {changed ? (
                        <span className="min-w-0 flex-1 break-words sm:text-right">
                          <span className="line-through text-muted-foreground">{sessionSummary(prev)}</span>
                          <span className="mx-1.5 inline-block text-muted-foreground">→</span>
                          <span className="font-medium">{sessionSummary(next)}</span>
                        </span>
                      ) : (
                        <span className="min-w-0 flex-1 break-words text-muted-foreground sm:text-right">
                          {sessionSummary(prev)}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>

            {preview.upcomingWeeksChanges.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Upcoming weeks</p>
                {preview.upcomingWeeksChanges.map((u) => (
                  <Card key={u.weekNumber} className="bg-secondary/30 border-border">
                    <CardContent className="pt-4 space-y-2">
                      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                        <span className="shrink-0 font-medium">Week {u.weekNumber}</span>
                        <Badge
                          variant="outline"
                          className="h-fit w-fit max-w-full whitespace-normal text-xs font-normal"
                        >
                          {u.reason}
                        </Badge>
                      </div>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {u.sessions.map((next, i) => {
                          const w = plan.weeks.find((x) => x.weekNumber === u.weekNumber)
                          const prev = w?.sessions[i]
                          if (!prev) return null
                          const changed =
                            prev.type !== next.type || prev.distanceKm !== next.distanceKm
                          if (!changed) return null
                          return (
                            <li key={i} className="break-words">
                              {DAY_LABELS[i]}:{" "}
                              <span className="line-through">{sessionSummary(prev)}</span> →{" "}
                              <span className="text-foreground">{sessionSummary(next)}</span>
                            </li>
                          )
                        })}
                      </ul>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
              <Button type="button" variant="outline" className="flex-1" onClick={handleCancelPreview}>
                Cancel
              </Button>
              <Button type="button" className="flex-1" onClick={handleAccept}>
                Accept changes
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            <Card className="bg-secondary/30 border-border">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{session.type}</div>
                    <div className="text-sm text-muted-foreground">{session.distanceKm}km planned</div>
                  </div>
                  <Badge variant="secondary">{session.date}</Badge>
                </div>
                {session.description && (
                  <p className="text-sm text-muted-foreground mt-2">{session.description}</p>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <label className="text-sm font-medium">How are you feeling?</label>
              <div className="grid gap-3">
                {FEELING_OPTIONS.map((option) => {
                  const Icon = option.icon
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={pending}
                      onClick={() => setSelectedFeeling(option.value)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all",
                        "hover:border-primary/50 hover:bg-secondary/50",
                        selectedFeeling === option.value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/30"
                      )}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background text-xl">
                        {option.emoji}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium flex items-center gap-2">
                          {option.label}
                          <Icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="text-sm text-muted-foreground">{option.description}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="context" className="text-sm font-medium">
                Any context? (optional)
              </label>
              <Textarea
                id="context"
                placeholder="e.g., Didn't sleep well, feeling sore from yesterday..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                className="resize-none"
                rows={3}
                disabled={pending}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <Button onClick={() => void handleAdapt()} disabled={!selectedFeeling || pending} className="w-full">
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adapting…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Adapt Plan
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
