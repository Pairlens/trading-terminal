// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { OnboardingSpotlight } from '@/components/onboarding/spotlight/onboarding-spotlight'
import { isOnboardingComplete } from '@/lib/onboarding-state'
import { closeSplashScreen } from '@/lib/platform'

export const Route = createFileRoute('/onboarding')({
  beforeLoad: () => {
    if (typeof window !== 'undefined' && isOnboardingComplete()) {
      throw redirect({ to: '/' })
    }
  },
  component: OnboardingPage,
})

function OnboardingPage() {
  // First run lands here before the terminal shell mounts, so the desktop
  // splash window is still up — dismiss it once the experience renders.
  useEffect(() => {
    closeSplashScreen()
  }, [])

  return <OnboardingSpotlight />
}
