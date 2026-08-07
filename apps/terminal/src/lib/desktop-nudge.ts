// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The browser build's one-time "this one wants the app" notice, raised on the
 * two surfaces that need Pairlens to be *running*, not merely open:
 * Notifications and Bots.
 *
 * Neither has a server behind it. Alert rules and bot strategies are evaluated
 * in this page, against streams this page holds, so the browser's own tab
 * lifecycle decides whether they run at all: a backgrounded tab has its timers
 * throttled, and one backgrounded long enough is frozen or discarded outright.
 * The desktop build has neither limit — it keeps running with the window closed
 * and blocks sleep while bots are live — and that gap is the whole content of
 * the nudge. It is not a "download the real one" pitch; the hosted terminal is
 * a shipped surface and these two pages are the honest edge of it.
 *
 * Suppression rules, in order of how much a wrong answer would annoy someone:
 *  - desktop never sees it (there is nothing to install),
 *  - nor does anyone who already opened the desktop dialog on this device —
 *    they have read the pitch, and a toast repeating it is nagging,
 *  - nor anyone who turned section tips off; that opt-out is about unsolicited
 *    first-visit popups, and this is one,
 *  - it waits out the section's own first-open tour rather than talking over a
 *    modal, which costs nothing: the flag is still unset, so it lands on the
 *    next visit,
 *  - once per surface per device, whether or not it was acted on.
 *
 * Device-local by design. "Have I been told about the desktop app" is a fact
 * about this browser, not about the account, so the key is deliberately absent
 * from the sync taxonomy (`lib/sync/sync-domains.ts`) — same reasoning as the
 * `desktop-cta-seen` flag it reads.
 */

import { DESKTOP_CTA_SEEN_KEY } from '@/lib/desktop-download'
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'

/** Per-surface "shown" map: `{ notifications: true }`. */
export const DESKTOP_NUDGE_SEEN_KEY = 'pairlens:desktop-nudge-seen'

/** The surfaces that carry the nudge. Both are `SectionTourId`s too. */
export type DesktopNudgeSurface = 'notifications' | 'bots'

/**
 * How long after the page mounts the toast appears. Long enough that it reads
 * as a remark about the page rather than part of it loading — both routes lazy
 * -load their body, and a toast that beats the content on screen is noise.
 */
export const DESKTOP_NUDGE_DELAY_MS = 1800

function readJson<T>(key: string): T | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    return null
  }
}

export function readNudgeSeen(): Record<string, boolean> {
  return readJson<Record<string, boolean>>(DESKTOP_NUDGE_SEEN_KEY) ?? {}
}

export function markNudgeSeen(surface: DesktopNudgeSurface): void {
  if (typeof localStorage === 'undefined') return
  try {
    const next = { ...readNudgeSeen(), [surface]: true }
    localStorage.setItem(DESKTOP_NUDGE_SEEN_KEY, JSON.stringify(next))
  } catch {
    // Quota or private browsing: showing the nudge twice beats not showing it.
  }
}

/**
 * Has the desktop dialog already been opened on this device? Written by the
 * nav-rail button through `usePersistedState`, hence the prefix and the JSON.
 */
export function hasSeenDesktopCta(): boolean {
  return readJson<boolean>(`${STORAGE_PREFIX}${DESKTOP_CTA_SEEN_KEY}`) === true
}

export type DesktopNudgeGate = {
  /** Browser build. False in the Tauri app, where the nudge is meaningless. */
  hosted: boolean
  /** The desktop dialog has been opened on this device before. */
  ctaSeen: boolean
  /** This surface has already raised the nudge on this device. */
  nudgeSeen: boolean
  /** The section's first-open tour is still waiting to be shown. */
  tourPending: boolean
  /** The user turned section tips off globally. */
  tipsDisabled: boolean
}

/** Every suppression rule in one place, so the component holds no policy. */
export function shouldShowDesktopNudge(gate: DesktopNudgeGate): boolean {
  return (
    gate.hosted &&
    !gate.ctaSeen &&
    !gate.nudgeSeen &&
    !gate.tourPending &&
    !gate.tipsDisabled
  )
}
