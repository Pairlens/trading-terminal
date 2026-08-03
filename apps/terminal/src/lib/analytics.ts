// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Opt-in PostHog product analytics + error tracking.
//
// Analytics is OFF by default. The user opts in during onboarding (or later
// from Settings → Privacy) and can turn it off at any time; the flag lives in
// localStorage via the synced-setting bus so the settings dialog, onboarding,
// and any sibling windows stay in lockstep. posthog-js is dynamically
// imported only after opt-in — a declined or unset choice means the bundle is
// never even fetched. With no VITE_POSTHOG_KEY at build time the whole module
// is inert.
//
// Privacy posture: no autocapture and no session recording — only explicit
// events, SPA pageviews, and uncaught-exception capture. The consent flag is
// deliberately device-local (not in the cloud-sync tier): consent given on
// one device must not silently enable tracking on another.

import type { PostHog } from 'posthog-js'
import { createSyncedSetting } from '@/lib/settings/synced-setting'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { isStandalone } from '@/lib/platform'

export const ANALYTICS_ENABLED_KEY = 'analytics-enabled'
export const ANALYTICS_ENABLED_DEFAULT = false

/** Non-React accessor (onboarding finish, init in the root shell). */
export const analyticsSetting = createSyncedSetting<boolean>(
  ANALYTICS_ENABLED_KEY,
  ANALYTICS_ENABLED_DEFAULT,
)

/** React accessor for the settings toggle. */
export function useAnalyticsEnabled() {
  return usePersistedState<boolean>(
    ANALYTICS_ENABLED_KEY,
    ANALYTICS_ENABLED_DEFAULT,
  )
}

/** Whether this build ships with a PostHog key at all. */
export function isAnalyticsConfigured(): boolean {
  return Boolean(import.meta.env.VITE_POSTHOG_KEY)
}

let client: PostHog | null = null
let loading = false

// Events fired after opt-in but before the dynamically-imported posthog-js
// finishes loading (e.g. `onboarding_completed` right after the consent
// step, or early pageload events). Flushed on init, capped so a failed load
// can't grow it unbounded. Never holds events without consent.
const PRE_INIT_QUEUE_MAX = 50
let preInitQueue: Array<[string, Record<string, unknown> | undefined]> = []

// Super properties registered before the client loads (e.g. the app language
// applied during onboarding). Merged into every event once capture starts.
let pendingSuperProps: Record<string, unknown> = {}

/** The UI language persisted by use-language.ts / read by lib/i18n.ts. */
function storedAppLanguage(): string {
  try {
    const raw = localStorage.getItem('pairlens:language')
    if (raw) return JSON.parse(raw) as string
  } catch {
    // Ignore parse/storage errors.
  }
  return typeof navigator !== 'undefined' ? navigator.language : 'unknown'
}

async function start(): Promise<void> {
  const key = import.meta.env.VITE_POSTHOG_KEY
  if (!key || loading) return
  if (client) {
    client.opt_in_capturing()
    return
  }
  loading = true
  try {
    const { posthog } = await import('posthog-js')
    posthog.init(key, {
      // EU ingest by default — see the note in the marketing site's
      // analytics.ts: the project is on PostHog Cloud EU and the Privacy
      // Policy commits to analytics data staying in the EEA.
      api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://eu.i.posthog.com',
      defaults: '2026-06-25',
      // The Tauri webview origin is tauri://localhost, so the defaults'
      // localhost heuristic would flag every desktop user as internal/test
      // traffic. Platform is registered as a super property instead.
      internal_or_test_user_hostname: null,
      // TanStack Router navigates via the History API.
      capture_pageview: 'history_change',
      capture_pageleave: true,
      capture_exceptions: true,
      // A trading terminal renders balances, orders, and API-key forms —
      // never harvest the DOM wholesale.
      autocapture: false,
      disable_session_recording: true,
      persistence: 'localStorage',
    })
    posthog.register({
      platform: isStandalone ? 'desktop' : 'web',
      app_language: storedAppLanguage(),
      ...pendingSuperProps,
    })
    pendingSuperProps = {}
    // App version on every event — release adoption + regression
    // attribution. Desktop resolves the real bundle version async; web dev
    // builds are just 'web'.
    if (isStandalone) {
      void import('@tauri-apps/api/app')
        .then((app) => app.getVersion())
        .then((version) => posthog.register({ app_version: version }))
        .catch(() => posthog.register({ app_version: 'desktop-unknown' }))
    } else {
      posthog.register({ app_version: 'web' })
    }
    // Record explicit consent in PostHog's own store — a timestamped $opt_in
    // event plus granted status — so the durable consent record lives with
    // the analytics data. Also recovers from a stale opt-out persisted by a
    // previous session.
    if (posthog.get_explicit_consent_status() !== 'granted') {
      posthog.opt_in_capturing()
    }
    client = posthog
    const queued = preInitQueue
    preInitQueue = []
    for (const [name, properties] of queued) posthog.capture(name, properties)
  } finally {
    loading = false
  }
}

/**
 * Mount once from the root shell. Starts capture if the user already opted
 * in, and follows every later change of the setting (settings toggle,
 * onboarding, other windows) — enable starts/resumes, disable stops.
 */
export function initAnalytics(): void {
  if (!isAnalyticsConfigured()) return
  if (analyticsSetting.get()) void start()
  analyticsSetting.subscribe((enabled) => {
    if (enabled) void start()
    else if (!client) {
      // Consent revoked before the client ever loaded — drop the buffer.
      preInitQueue = []
    } else {
      // Drop the device-side identity first — revoking consent also forgets
      // the local distinct_id, so re-opting-in starts fresh — then persist
      // the denial. This order matters: reset() also clears PostHog's
      // consent record, so opting out must come after.
      client.reset()
      client.opt_out_capturing()
    }
  })
}

/**
 * The live PostHog client, or null when analytics is unconfigured, declined,
 * or still loading. Starts the client on demand when consent is already
 * granted.
 *
 * Almost nothing should need this — events go through `track()`. The one
 * caller is the in-app feedback survey, which has to read survey definitions
 * off PostHog's own API (`getSurveys`). Treat null as "no survey today" and
 * degrade, never as a reason to bypass the consent gate.
 */
export async function getPostHogClient(): Promise<PostHog | null> {
  if (!isAnalyticsConfigured() || !analyticsSetting.get()) return null
  // A load already in flight makes start() a no-op; the caller retries.
  if (!client) await start()
  if (!client || client.has_opted_out_capturing()) return null
  return client
}

/**
 * Tie events to the signed-in user; pass null on sign-out. Identified by the
 * opaque account id only — email (PII) stays in the App Server DB, where the
 * id can be joined back when genuinely needed.
 */
export function identifyAnalyticsUser(userId: string | null): void {
  if (!client || client.has_opted_out_capturing()) return
  if (userId) client.identify(userId)
  else client.reset()
}

/**
 * Register super properties attached to every subsequent event (e.g.
 * `app_language`). Safe before init — buffered and applied when capture
 * starts; a no-op forever if the user never opts in.
 */
export function registerAnalyticsProperties(
  props: Record<string, unknown>,
): void {
  if (client) {
    if (!client.has_opted_out_capturing()) client.register(props)
    return
  }
  pendingSuperProps = { ...pendingSuperProps, ...props }
}

/**
 * Set person properties for segmentation (e.g. onboarding persona).
 * Rides the same consent gate and pre-init queue as events.
 */
export function setPersonProperties(props: Record<string, unknown>): void {
  captureEvent('$set', { $set: props })
}

/** Fire-and-forget product event; no-op unless the user opted in. */
export function captureEvent(
  name: string,
  properties?: Record<string, unknown>,
): void {
  if (client) {
    if (!client.has_opted_out_capturing()) client.capture(name, properties)
    return
  }
  // Client not ready — buffer only when consent is already granted and this
  // build actually ships a key, so the queue never outlives a "no".
  if (!isAnalyticsConfigured() || !analyticsSetting.get()) return
  if (preInitQueue.length >= PRE_INIT_QUEUE_MAX) return
  preInitQueue.push([name, properties])
}
