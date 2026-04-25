"use client"

import { OnboardingWizard } from "@/components/onboarding-wizard"
import { Dashboard } from "@/components/dashboard"
import { Spinner } from "@/components/ui/spinner"
import { useLocalStorage } from "@/hooks/use-local-storage"
import { OnboardingData, TrainingPlan, UserProfile } from "@/lib/types"

const DEFAULT_PROFILE: UserProfile = {
  onboarding: {
    goalDistance: null,
    raceDate: null,
    personalBests: {},
    goalTime: "",
    daysPerWeek: null,
    restDays: [],
    currentPR: "",
    aggressive: false,
  },
  plan: null,
  completedOnboarding: false,
}

export default function Home() {
  const [profile, setProfile, isLoaded] = useLocalStorage<UserProfile>("paceai-profile", DEFAULT_PROFILE)

  const handleOnboardingComplete = async (data: OnboardingData) => {
    if (!data.goalDistance || !data.raceDate || !data.daysPerWeek || !data.goalTime?.trim()) {
      throw new Error("Incomplete onboarding")
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 90_000)
    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          goalDistance: data.goalDistance,
          raceDate: data.raceDate.toISOString(),
          personalBests: data.personalBests,
          goalTime: data.goalTime.trim(),
          daysPerWeek: data.daysPerWeek,
          restDays: data.restDays,
          aggressive: data.aggressive ?? false,
          currentPR: data.currentPR,
        }),
      })
      const payload = (await res.json()) as { plan?: TrainingPlan; error?: string }
      if (!res.ok) {
        throw new Error(payload.error || "Failed to generate plan")
      }
      if (!payload.plan) {
        throw new Error("No plan returned")
      }
      setProfile({
        onboarding: data,
        plan: payload.plan,
        completedOnboarding: true,
      })
    } catch (e: unknown) {
      const isAbort =
        e instanceof Error && e.name === "AbortError"
          ? true
          : typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError"
      if (isAbort) {
        throw new Error(
          "This is taking longer than expected. Try again or reduce the number of training weeks."
        )
      }
      throw e
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const handlePlanUpdate = (updatedPlan: TrainingPlan) => {
    setProfile(prev => ({
      ...prev,
      plan: updatedPlan
    }))
  }

  const handleReset = () => {
    setProfile(DEFAULT_PROFILE)
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="h-8 w-8 text-primary" />
      </div>
    )
  }

  if (profile.completedOnboarding && profile.plan) {
    return (
      <Dashboard
        plan={profile.plan}
        onboarding={profile.onboarding}
        onPlanUpdate={handlePlanUpdate}
        onReset={handleReset}
      />
    )
  }

  return <OnboardingWizard onComplete={handleOnboardingComplete} />
}
