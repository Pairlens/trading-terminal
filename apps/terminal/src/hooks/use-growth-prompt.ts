// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Host hook for the growth prompt: watches the engagement tally on a slow
 * clock and opens the dialog when an ask has been earned (the full set of
 * rules lives in lib/growth/growth-prompt.ts).
 *
 * The check runs once a minute, only while the tab is visible, and the
 * engine's settle window means nothing can fire in the first minutes of a
 * session. One prompt per session, enforced module-side so a desktop window
 * re-mounting the shell (route changes, viewport swaps) cannot re-ask.
 */

import { useEffect, useRef, useState } from 'react'

import type { GrowthAction } from '@/lib/growth/growth-prompt'
import { recordActiveDay } from '@/lib/growth/engagement'
import {
  markPromptDone,
  markPromptOptedOut,
  markPromptShown,
  markPromptSnoozed,
  pickGrowthAction,
  promptAskCount,
} from '@/lib/growth/growth-prompt'
import { track } from '@/lib/analytics-events'

const CHECK_INTERVAL_MS = 60 * 1000

/** When this page (session) started — the settle window anchors here. */
const SESSION_STARTED_AT = Date.now()

/** Once per session, across every mount of the host. */
let promptedThisSession = false

export type GrowthPromptController = {
  action: GrowthAction | null
  open: boolean
  /** Radix-style open change; closing without a decision snoozes. */
  onOpenChange: (open: boolean) => void
  /** CTA clicked — permanent success, never asked again. */
  complete: () => void
  /** "Maybe later" — long snooze. */
  snooze: () => void
  /** "Don't ask again" — permanent for this action. */
  optOut: () => void
}

export function useGrowthPrompt(): GrowthPromptController {
  const [action, setAction] = useState<GrowthAction | null>(null)
  const [open, setOpen] = useState(false)
  // Whether an explicit button already resolved this showing, so the
  // trailing onOpenChange(false) doesn't also count as a dismissal.
  const decidedRef = useRef(false)

  useEffect(() => {
    recordActiveDay()

    const check = () => {
      if (promptedThisSession) return
      if (document.visibilityState !== 'visible') return
      // Something else already has the stage — a section tour, the vault
      // unlock, an order confirm, any real dialog. Asking for a favor on top
      // of it would burn the ask unseen; stand down until a check tick finds
      // the floor clear. Vaul bottom sheets are excluded: on the phone they
      // are ordinary navigation (a sheet is up most of the time), and our
      // dialogs are built to open above them (see sign-in-dialog.tsx).
      if (document.querySelector('[role="dialog"]:not([data-vaul-drawer])'))
        return
      const picked = pickGrowthAction(SESSION_STARTED_AT)
      if (!picked) return
      promptedThisSession = true
      markPromptShown(picked.id)
      track('growth_prompt_shown', {
        action: picked.id,
        asks: promptAskCount(picked.id),
      })
      decidedRef.current = false
      setAction(picked)
      setOpen(true)
    }

    const interval = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const close = () => setOpen(false)

  return {
    action,
    open,
    onOpenChange: (next) => {
      if (next) return
      if (action && !decidedRef.current) {
        // ESC / outside click: a soft no, treated exactly like "later".
        markPromptSnoozed(action.id)
        track('growth_prompt_dismissed', { action: action.id, kind: 'later' })
      }
      close()
    },
    complete: () => {
      if (!action) return
      decidedRef.current = true
      markPromptDone(action.id)
      track('growth_prompt_cta_clicked', {
        action: action.id,
        asks: promptAskCount(action.id),
      })
      close()
    },
    snooze: () => {
      if (!action) return
      decidedRef.current = true
      markPromptSnoozed(action.id)
      track('growth_prompt_dismissed', { action: action.id, kind: 'later' })
      close()
    },
    optOut: () => {
      if (!action) return
      decidedRef.current = true
      markPromptOptedOut(action.id)
      track('growth_prompt_dismissed', { action: action.id, kind: 'never' })
      close()
    },
  }
}
