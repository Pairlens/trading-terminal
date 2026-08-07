// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useState } from 'react'

import type { SectionTourId } from './section-tours'
import { ONBOARDING_KEY } from '@/lib/onboarding-state'

/** Per-section "seen" map: `{ notifications: true, charts: true }`. */
export const SECTION_TOURS_SEEN_KEY = 'pairlens:section-tours-seen'
/** Global opt-out flag for all section tours. */
export const SECTION_TOURS_DISABLED_KEY = 'pairlens:section-tours-disabled'

function readSeen(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(SECTION_TOURS_SEEN_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

/** Global "no first-visit tips" opt-out. */
export function areSectionTipsDisabled(): boolean {
  return localStorage.getItem(SECTION_TOURS_DISABLED_KEY) === '1'
}

/**
 * Is this section's tour still owed? Exported for anything that must not talk
 * over it — the desktop nudge toast waits this out rather than landing on top
 * of the tour's modal.
 */
export function isSectionTourPending(sectionId: SectionTourId): boolean {
  const onboardingDone = localStorage.getItem(ONBOARDING_KEY) === '1'
  return onboardingDone && !areSectionTipsDisabled() && !readSeen()[sectionId]
}

/**
 * Drives the first-open tutorial for a single section.
 *
 * A tour shows only after the global welcome wizard is complete, the user
 * hasn't opted out of tips, and this section hasn't been seen yet.
 */
export function useSectionTour(sectionId: SectionTourId) {
  // Bump to force a re-evaluation of localStorage after a write.
  const [, bump] = useState(0)

  const showTour = isSectionTourPending(sectionId)

  const completeTour = useCallback(() => {
    const next = { ...readSeen(), [sectionId]: true }
    localStorage.setItem(SECTION_TOURS_SEEN_KEY, JSON.stringify(next))
    bump((v) => v + 1)
  }, [sectionId])

  const skipAll = useCallback(() => {
    localStorage.setItem(SECTION_TOURS_DISABLED_KEY, '1')
    bump((v) => v + 1)
  }, [])

  return { showTour, completeTour, skipAll }
}
