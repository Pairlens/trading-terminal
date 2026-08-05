// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Web update prompt — the browser sibling of updater.ts.
 *
 * A deploy to terminal.pairlens.finance swaps the bundle under long-lived
 * tabs without telling them. Every build bakes its own version in
 * (`__APP_VERSION__`) and emits the same number to /version.json (see
 * vite.config.ts); once a newer release is live, the fetched manifest runs
 * ahead of the running bundle. When that happens the tab gets the same
 * persistent toast as desktop, with "Refresh" (a plain reload) standing in
 * for "Restart & update".
 *
 * Checks run shortly after load, on an interval, and when a hidden tab comes
 * back to the foreground — that's the moment a days-old tab is most likely
 * stale. Each tab checks for itself: a reload is per-tab, so leader election
 * would only hide the prompt from the windows that need it.
 *
 * Desktop builds: every export is a no-op (`isStandalone` guard) — the Tauri
 * updater owns that surface. Dev servers never check.
 */

import { toast } from 'sonner'

import i18n from '@/lib/i18n'
import { BUILD_VERSION } from '@/lib/app-version'
import { isStandalone } from '@/lib/platform'

const FIRST_CHECK_DELAY_MS = 60_000
const CHECK_INTERVAL_MS = 60 * 60 * 1000
/** Don't re-fetch on every tab switch — only after a real absence. */
const FOCUS_CHECK_MIN_GAP_MS = 10 * 60 * 1000

/** Single toast slot — periodic re-checks update it instead of stacking. */
const TOAST_ID = 'app-update'

const t = (key: string, fallback: string): string =>
  i18n.t(key, { defaultValue: fallback })

let initialized = false
let lastCheckAt = 0

/**
 * Start background version checks. Called once from the root shell in
 * browsers; safe to call anywhere (no-ops on desktop, in dev, and on repeat
 * calls).
 */
export function initWebUpdater(): void {
  if (isStandalone || initialized) return
  if (import.meta.env.DEV) return
  initialized = true

  window.setTimeout(() => {
    void checkForNewVersion()
  }, FIRST_CHECK_DELAY_MS)
  window.setInterval(() => {
    void checkForNewVersion()
  }, CHECK_INTERVAL_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - lastCheckAt < FOCUS_CHECK_MIN_GAP_MS) return
    void checkForNewVersion()
  })
}

async function checkForNewVersion(): Promise<void> {
  lastCheckAt = Date.now()
  try {
    const res = await fetch('/version.json', { cache: 'no-store' })
    if (!res.ok) return
    const data: unknown = await res.json()
    const version =
      typeof data === 'object' && data !== null && 'version' in data
        ? (data as { version: unknown }).version
        : null
    if (typeof version !== 'string') return
    if (!isNewer(version, BUILD_VERSION)) return
    promptRefresh(version)
  } catch {
    // Offline, a network hiccup, or the SPA fallback answering with HTML for
    // a missing manifest — all fine, the next check will try again.
  }
}

/**
 * Strictly-newer semver compare. Anything that isn't plain `x.y.z` (dev
 * placeholders, a mangled response) compares as not-newer — a wrong "you're
 * stale" prompt is worse than a missed one, and a rollback deploy shouldn't
 * nag people already on the pulled version.
 */
export function isNewer(remote: string, local: string): boolean {
  const parse = (v: string): Array<number> | null => {
    const parts = v.split('.')
    if (parts.length !== 3) return null
    const nums = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : Number.NaN))
    return nums.every(Number.isFinite) ? nums : null
  }
  const r = parse(remote)
  const l = parse(local)
  if (!r || !l) return false
  for (let i = 0; i < 3; i++) {
    if (r[i] !== l[i]) return r[i] > l[i]
  }
  return false
}

function promptRefresh(version: string): void {
  toast(t('updater.available', 'Update available'), {
    id: TOAST_ID,
    description: `${t('updater.availableDesc', 'Pairlens')} ${version}`,
    duration: Infinity,
    closeButton: true,
    action: {
      label: t('updater.refreshNow', 'Refresh'),
      onClick: () => {
        window.location.reload()
      },
    },
  })
}
