// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Web update prompt — the browser sibling of updater.ts.
 *
 * A deploy to terminal.pairlens.finance swaps the bundle under long-lived
 * tabs without telling them. Every build bakes in its version and a build id
 * and emits both to /version.json (see vite.config.ts); a tab is stale when
 * either the release ran ahead of it or the build id simply stopped matching.
 * When that happens the tab gets the same persistent toast as desktop, with
 * "Refresh" (a plain reload) standing in for "Restart & update".
 *
 * The build id is what makes this honest between releases. The web terminal
 * redeploys on every push to main while the version only moves on
 * `bun run release`, so a version-only check sees nothing for weeks at a time
 * — and meanwhile every deploy has rewritten the content hashes those tabs
 * still point at. `@/lib/lazy-chunk` catches the tabs that reach a dead chunk
 * before the prompt reaches them; this is the half that asks first.
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
import { BUILD_ID, BUILD_VERSION } from '@/lib/app-version'
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
    const manifest =
      typeof data === 'object' && data !== null
        ? (data as { version?: unknown; build?: unknown })
        : {}
    const version = manifest.version
    if (typeof version !== 'string') return
    const build = typeof manifest.build === 'string' ? manifest.build : ''

    if (!isNewer(version, BUILD_VERSION) && !isDifferentBuild(build, BUILD_ID))
      return
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

/**
 * A build id that is present on both sides and simply doesn't match. Missing
 * on either side means "can't tell" — a deploy predating the build id, or a
 * bundle built outside vite — and can't-tell must not prompt, because the
 * version compare above is still a valid answer on its own.
 */
export function isDifferentBuild(remote: string, local: string): boolean {
  if (!remote || !local) return false
  return remote !== local
}

function promptRefresh(version: string): void {
  // The version line is dropped when the release number hasn't moved: a deploy
  // between releases is still worth refreshing for, but "Pairlens 0.1.4" under
  // "Update available" on a tab already running 0.1.4 reads like a bug.
  const description =
    version === BUILD_VERSION
      ? t('updater.availableDesc', 'Pairlens')
      : `${t('updater.availableDesc', 'Pairlens')} ${version}`

  toast(t('updater.available', 'Update available'), {
    id: TOAST_ID,
    description,
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
