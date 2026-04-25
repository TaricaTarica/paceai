"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { format } from "date-fns"
import { CalendarIcon, ChevronLeft, ChevronRight, Target, Calendar, Activity, Clock, Trophy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { RaceDistance, DayOfWeek, OnboardingData } from "@/lib/types"
import {
  assessGoalVsPr,
  buildGoalTimeString,
  isShortGoalDistance,
  isValidGoalTimeForDistance,
  parseTimeStringToSeconds,
} from "@/lib/goal-time-helpers"

const RACE_DISTANCES: RaceDistance[] = ["5K", "10K", "Half Marathon", "Marathon"]
const DAYS_PER_WEEK = [3, 4, 5, 6] as const
const DAYS_OF_WEEK: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

interface OnboardingWizardProps {
  onComplete: (data: OnboardingData) => void | Promise<void>
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<OnboardingData>({
    goalDistance: null,
    raceDate: null,
    personalBests: {},
    goalTime: "",
    daysPerWeek: null,
    restDays: [],
    currentPR: "",
    aggressive: false,
  })
  const [gH, setGH] = useState("")
  const [gM, setGM] = useState("")
  const [gS, setGS] = useState("")
  const prevStepRef = useRef(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const totalSteps = 6
  const progress = (step / totalSteps) * 100
  const shortGoal = isShortGoalDistance(data.goalDistance)

  const syncGoalTimeToData = (h: string, m: string, s: string, isShort: boolean) => {
    const built = isShort
      ? buildGoalTimeString(true, m, s, "")
      : buildGoalTimeString(false, h, m, s)
    setData((prev) => ({ ...prev, goalTime: built ?? "" }))
  }

  useEffect(() => {
    const entered = step === 4 && prevStepRef.current !== 4
    prevStepRef.current = step
    if (!entered) return
    if (!data.goalDistance) return
    const g = data.goalTime?.trim()
    if (!g) {
      setGH("")
      setGM("")
      setGS("")
      return
    }
    const total = parseTimeStringToSeconds(g)
    if (total == null) {
      setGH("")
      setGM("")
      setGS("")
      return
    }
    if (isShortGoalDistance(data.goalDistance)) {
      const mm = Math.floor(total / 60)
      const ss = total % 60
      setGM(String(mm))
      setGS(String(ss))
      setGH("")
    } else {
      const hh = Math.floor(total / 3600)
      const mm = Math.floor((total % 3600) / 60)
      const ss = total % 60
      setGH(String(hh))
      setGM(String(mm))
      setGS(String(ss))
    }
  }, [step, data.goalDistance])

  const canProceed = () => {
    switch (step) {
      case 1:
        return data.goalDistance !== null
      case 2:
        return data.raceDate !== null
      case 3:
        return true // Personal bests are optional
      case 4:
        if (!data.goalDistance) return false
        return shortGoal
          ? isValidGoalTimeForDistance(true, gM, gS, "")
          : isValidGoalTimeForDistance(false, gH, gM, gS)
      case 5:
        return data.daysPerWeek !== null && data.restDays.length > 0
      case 6:
        return true // Current PR is optional
      default:
        return false
    }
  }

  const submitPlan = useCallback(() => {
    void (async () => {
      setSubmitting(true)
      setSubmitError(null)
      try {
        await onComplete(data)
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Could not generate plan")
      } finally {
        setSubmitting(false)
      }
    })()
  }, [data, onComplete])

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1)
      return
    }
    submitPlan()
  }

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1)
    }
  }

  const toggleRestDay = (day: DayOfWeek) => {
    setData(prev => ({
      ...prev,
      restDays: prev.restDays.includes(day)
        ? prev.restDays.filter(d => d !== day)
        : [...prev.restDays, day]
    }))
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-lg bg-card border-border">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Activity className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl font-bold">PaceAI</CardTitle>
              <CardDescription>Your AI training coach</CardDescription>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Step {step} of {totalSteps}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Target className="h-5 w-5 text-primary" />
                <span>Select your goal race</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {RACE_DISTANCES.map((distance) => (
                  <button
                    key={distance}
                    onClick={() => setData(prev => ({ ...prev, goalDistance: distance }))}
                    className={cn(
                      "p-4 rounded-xl border-2 text-left transition-all",
                      "hover:border-primary/50 hover:bg-secondary/50",
                      data.goalDistance === distance
                        ? "border-primary bg-primary/10"
                        : "border-border bg-secondary/30"
                    )}
                  >
                    <div className="font-semibold">{distance}</div>
                    <div className="text-sm text-muted-foreground">
                      {distance === "5K" && "3.1 miles"}
                      {distance === "10K" && "6.2 miles"}
                      {distance === "Half Marathon" && "13.1 miles"}
                      {distance === "Marathon" && "26.2 miles"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Calendar className="h-5 w-5 text-primary" />
                <span>When is your race?</span>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal h-12",
                      !data.raceDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {data.raceDate ? format(data.raceDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={data.raceDate || undefined}
                    onSelect={(date) => setData(prev => ({ ...prev, raceDate: date || null }))}
                    disabled={(date) => date < new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {data.raceDate && (
                <p className="text-sm text-muted-foreground">
                  {"That's"} {Math.ceil((data.raceDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24 * 7))} weeks away!
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Trophy className="h-5 w-5 text-primary" />
                <span>Personal bests (optional)</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Help us calibrate your training by sharing any previous race times.
              </p>
              <div className="grid gap-4">
                {RACE_DISTANCES.map((distance) => (
                  <div key={distance} className="flex items-center gap-3">
                    <Label htmlFor={`pb-${distance}`} className="w-28 text-sm">
                      {distance}
                    </Label>
                    <Input
                      id={`pb-${distance}`}
                      placeholder="e.g. 25:30"
                      value={data.personalBests[distance] || ""}
                      onChange={(e) => setData(prev => ({
                        ...prev,
                        personalBests: { ...prev.personalBests, [distance]: e.target.value }
                      }))}
                      className="flex-1"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && data.goalDistance && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Target className="h-5 w-5 text-primary" />
                <span>What&apos;s your goal finish time?</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Target time for your {data.goalDistance} goal race.
              </p>
              {shortGoal ? (
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Minutes</Label>
                    <Input
                      inputMode="numeric"
                      className="w-20"
                      value={gM}
                      onChange={(e) => {
                        const v = e.target.value
                        setGM(v)
                        syncGoalTimeToData(gH, v, gS, true)
                      }}
                    />
                  </div>
                  <span className="pb-2 font-medium">:</span>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Seconds</Label>
                    <Input
                      inputMode="numeric"
                      className="w-20"
                      maxLength={2}
                      value={gS}
                      onChange={(e) => {
                        const v = e.target.value
                        setGS(v)
                        syncGoalTimeToData(gH, gM, v, true)
                      }}
                    />
                  </div>
                  <span className="pb-2 text-sm text-muted-foreground">(MM:SS)</span>
                </div>
              ) : (
                <div className="flex items-end gap-2 flex-wrap">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Hours</Label>
                    <Input
                      inputMode="numeric"
                      className="w-20"
                      value={gH}
                      onChange={(e) => {
                        const v = e.target.value
                        setGH(v)
                        syncGoalTimeToData(v, gM, gS, false)
                      }}
                    />
                  </div>
                  <span className="pb-2 font-medium">:</span>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Minutes</Label>
                    <Input
                      inputMode="numeric"
                      className="w-20"
                      maxLength={2}
                      value={gM}
                      onChange={(e) => {
                        const v = e.target.value
                        setGM(v)
                        syncGoalTimeToData(gH, v, gS, false)
                      }}
                    />
                  </div>
                  <span className="pb-2 font-medium">:</span>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Seconds</Label>
                    <Input
                      inputMode="numeric"
                      className="w-20"
                      maxLength={2}
                      value={gS}
                      onChange={(e) => {
                        const v = e.target.value
                        setGS(v)
                        syncGoalTimeToData(gH, gM, v, false)
                      }}
                    />
                  </div>
                  <span className="pb-2 text-sm text-muted-foreground">(HH:MM:SS)</span>
                </div>
              )}
              {(() => {
                const prRaw = data.personalBests[data.goalDistance]?.trim()
                if (!prRaw) return null
                const built = shortGoal
                  ? buildGoalTimeString(true, gM, gS, "")
                  : buildGoalTimeString(false, gH, gM, gS)
                const goalSec = built ? parseTimeStringToSeconds(built) : null
                const prSec = parseTimeStringToSeconds(prRaw)
                if (goalSec == null || prSec == null) return null
                const label = assessGoalVsPr(goalSec, prSec)
                return (
                  <p className="text-sm text-muted-foreground">
                    Your current PR is {prRaw} — this goal is{" "}
                    <span className="font-medium text-foreground">{label}</span>.
                  </p>
                )
              })()}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Clock className="h-5 w-5 text-primary" />
                  <span>How many days can you train?</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {DAYS_PER_WEEK.map((days) => (
                    <button
                      key={days}
                      onClick={() => setData(prev => ({ ...prev, daysPerWeek: days }))}
                      className={cn(
                        "p-3 rounded-xl border-2 transition-all",
                        "hover:border-primary/50 hover:bg-secondary/50",
                        data.daysPerWeek === days
                          ? "border-primary bg-primary/10"
                          : "border-border bg-secondary/30"
                      )}
                    >
                      <div className="font-semibold">{days}</div>
                      <div className="text-xs text-muted-foreground">days</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <div className="text-sm font-medium">Select your rest days</div>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleRestDay(day)}
                      className={cn(
                        "px-4 py-2 rounded-lg border-2 transition-all text-sm font-medium",
                        "hover:border-primary/50",
                        data.restDays.includes(day)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-secondary/30"
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/30 px-4 py-3">
                <div className="space-y-0.5">
                  <Label htmlFor="aggressive" className="text-sm font-medium">
                    Aggressive progression
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Higher weekly volume jumps when the AI builds your plan
                  </p>
                </div>
                <Switch
                  id="aggressive"
                  checked={data.aggressive ?? false}
                  onCheckedChange={(checked) =>
                    setData((prev) => ({ ...prev, aggressive: checked }))
                  }
                />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-lg font-semibold">
                <Trophy className="h-5 w-5 text-primary" />
                <span>Current PR in {data.goalDistance} (optional)</span>
              </div>
              <p className="text-sm text-muted-foreground">
                If you have a recent {data.goalDistance} time, share it to help personalize your plan.
              </p>
              <Input
                placeholder="e.g. 1:45:00 for half marathon"
                value={data.currentPR || ""}
                onChange={(e) => setData(prev => ({ ...prev, currentPR: e.target.value }))}
              />
            </div>
          )}

          {submitError && (
            <div className="space-y-2">
              <p className="text-sm text-destructive" role="alert">
                {submitError}
              </p>
              {step === totalSteps && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={submitPlan}
                  disabled={submitting}
                >
                  Try again
                </Button>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            {step > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={submitting} className="flex-1">
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
            )}
            <Button
              onClick={handleNext}
              disabled={!canProceed() || submitting}
              className="flex-1"
            >
              {step === totalSteps ? (
                submitting ? "Generating…" : "Generate My Plan"
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
