import type { ElementType } from "react"
import { Activity, BedDouble, Dumbbell, Flame, Route, Zap } from "lucide-react"
import type { SessionType } from "@/lib/types"

export const SESSION_ICONS: Record<SessionType, ElementType> = {
  "Easy Run": Route,
  "Tempo": Flame,
  "Intervals": Zap,
  "Long Run": Activity,
  "Cross Training": Dumbbell,
  "Rest": BedDouble,
}

export const SESSION_COLORS: Record<SessionType, string> = {
  "Easy Run": "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "Tempo": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Intervals": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Long Run": "bg-primary/20 text-primary border-primary/30",
  "Cross Training": "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "Rest": "bg-muted text-muted-foreground border-border",
}
