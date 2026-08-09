// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Replay the first-run tutorial — offered by both shells, implemented once.
 *
 * The reset is four localStorage keys that only mean anything together: the
 * onboarding gate, the two section-tour flags, and the desktop nudge. They are
 * the same family of first-visit tips, so clearing three of them is a replay
 * that skips half of itself. Duplicating the list into the phone's profile
 * screen would have guaranteed that drift, so the list lives here.
 *
 * Outside `src/mobile/` on purpose: a helper both shells need is app code the
 * mobile tree imports, never the other way round (see the separability rule).
 */
import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'

import {
  SECTION_TOURS_DISABLED_KEY,
  SECTION_TOURS_SEEN_KEY,
} from '@/components/onboarding/use-section-tour'
import { DESKTOP_NUDGE_SEEN_KEY } from '@/lib/desktop-nudge'
import { ONBOARDING_KEY } from '@/lib/onboarding-state'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'

/**
 * Returns a handler that clears the tutorial state and jumps straight into
 * `/onboarding` — a route that sits outside `_terminal`, so it renders on the
 * phone as well as the desktop.
 */
export function useResetTutorial(): () => void {
  const navigate = useNavigate()

  // Clearing the flag re-arms the /_terminal gate; navigating replays the
  // onboarding now instead of on the next reload.
  return useCallback(() => {
    localStorage.removeItem(ONBOARDING_KEY)
    localStorage.removeItem(SECTION_TOURS_SEEN_KEY)
    localStorage.removeItem(SECTION_TOURS_DISABLED_KEY)
    localStorage.removeItem(DESKTOP_NUDGE_SEEN_KEY)
    // No-op on the phone, which never opens this dialog. On the desktop it has
    // to run before the navigation, or the tutorial replays underneath a
    // settings dialog that is still open when the user comes back.
    useSettingsDialogStore.getState().close()
    void navigate({ to: '/onboarding' })
  }, [navigate])
}
