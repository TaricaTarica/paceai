"use client"

import { format, parseISO } from "date-fns"
import { Activity } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatDecimalMinutesToMmSs } from "@/lib/format-pace"
import type { DayOfWeek, TrainingSession, SessionType } from "@/lib/types"
import { SESSION_ICONS, SESSION_COLORS } from "./session-type-styles"

export interface SessionDetailSheetProps {
  session: TrainingSession | null
  dayLabel: DayOfWeek
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdapt: () => void
  onMarkDone: () => void
  onSkip: () => void
}

function estimateDurationIfNeeded(s: TrainingSession): number | null {
  if (typeof s.durationMin === "number" && s.durationMin > 0) return s.durationMin
  if (s.type === "Rest" || s.distanceKm <= 0) return null
  if (
    s.targetPaceMin != null &&
    s.targetPaceMax != null
  ) {
    const mid = (s.targetPaceMin + s.targetPaceMax) / 2
    return Math.round(s.distanceKm * mid)
  }
  return Math.round(s.distanceKm * 6)
}

function RpeBar({ rpe }: { rpe: number | undefined }) {
  const n = rpe != null && rpe >= 1 && rpe <= 10 ? rpe : 0
  return (
    <div className="flex gap-0.5 w-full" aria-label={`RPE ${n} of 10`}>
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 flex-1 rounded-sm",
            i < n ? "bg-primary" : "bg-muted"
          )}
        />
      ))}
    </div>
  )
}

export function SessionDetailSheet({
  session,
  dayLabel,
  open,
  onOpenChange,
  onAdapt,
  onMarkDone,
  onSkip,
}: SessionDetailSheetProps) {
  if (!session) return null

  const Icon = SESSION_ICONS[session.type as SessionType] ?? Activity
  const colorClass = SESSION_COLORS[session.type as SessionType] ?? "bg-muted text-muted-foreground border-border"
  const isRest = session.type === "Rest"
  const estMin = estimateDurationIfNeeded(session)
  const paceLine =
    session.targetPaceMin != null &&
    session.targetPaceMax != null &&
    (session.targetPaceMin > 0 || session.targetPaceMax > 0)
      ? `${formatDecimalMinutesToMmSs(session.targetPaceMin)} - ${formatDecimalMinutesToMmSs(session.targetPaceMax)} /km`
      : "—"
  const hrLine =
    session.targetHRZone != null &&
    session.targetHRMin != null &&
    session.targetHRMax != null &&
    (session.targetHRMin > 0 || session.targetHRMax > 0)
      ? `Zone ${session.targetHRZone} (${session.targetHRMin}-${session.targetHRMax} bpm)`
      : "—"

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col p-0 gap-0 overflow-y-auto"
      >
        <SheetHeader className="p-6 border-b border-border text-left space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{dayLabel}</span>
            <span>·</span>
            <span>{format(parseISO(session.date), "MMM d, yyyy")}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={cn("gap-1 border w-fit", colorClass)}>
              <Icon className="h-3 w-3" />
              {session.type}
            </Badge>
          </div>
          <SheetTitle className="text-xl">Session details</SheetTitle>
          {!isRest && (
            <p className="text-sm text-muted-foreground">
              {session.distanceKm} km
              {estMin != null && (
                <span> · about {estMin} min</span>
              )}
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 p-6 space-y-6">
          {!isRest && (
            <section>
              <h3 className="text-sm font-semibold mb-3">How to run this</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-muted-foreground">Target pace range</div>
                  <div className="font-medium tabular-nums">{paceLine}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Target heart rate</div>
                  <div className="font-medium">{hrLine}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">RPE (1–10)</div>
                  <RpeBar rpe={session.rpe} />
                </div>
              </div>
            </section>
          )}

          {isRest && (
            <p className="text-sm text-muted-foreground">
              Recovery day — let your body absorb training and return fresh for the next run.
            </p>
          )}

          <section>
            <h3 className="text-sm font-semibold mb-3">Session structure</h3>
            {isRest ? (
              <p className="text-sm text-muted-foreground">No workout structure — full rest.</p>
            ) : (
              <ul className="text-sm space-y-2 list-none">
                <li>
                  <span className="text-muted-foreground">Warmup: </span>
                  {session.warmupMin != null ? `${session.warmupMin} min easy` : "—"}
                </li>
                <li>
                  <span className="text-muted-foreground">Main set: </span>
                  {session.mainSet || session.description || "—"}
                </li>
                <li>
                  <span className="text-muted-foreground">Cooldown: </span>
                  {session.cooldownMin != null ? `${session.cooldownMin} min easy` : "—"}
                </li>
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-3">Coach notes</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {isRest
                ? (session.coachNotes || "Rest is part of training — it keeps injury risk in check and consolidates fitness gains.")
                : (session.coachNotes || "This session is placed to support your current training phase and overall race build-up.")}
            </p>
          </section>
        </div>

        <SheetFooter className="p-6 border-t border-border gap-2 sm:flex-col sm:space-x-0">
          {!isRest && (
            <Button
              className="w-full"
              variant="default"
              onClick={() => {
                onAdapt()
              }}
            >
              Adapt this session
            </Button>
          )}
          {!isRest && (
            <div className="flex gap-2 w-full">
              <Button
                className="flex-1"
                variant="secondary"
                onClick={onMarkDone}
                disabled={!!session.completedAt}
              >
                {session.completedAt ? "Done" : "Mark as done"}
              </Button>
              <Button
                className="flex-1"
                variant="outline"
                onClick={onSkip}
                disabled={session.skipped}
              >
                {session.skipped ? "Skipped" : "Skip"}
              </Button>
            </div>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
