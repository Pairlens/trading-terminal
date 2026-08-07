// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// PostHog analytics + error tracking with PostHog-native consent management.
//
// Analytics is cookieless by default: `cookieless_mode: 'on_reject'` combined
// with `opt_out_capturing_by_default: true` starts capture in cookieless mode
// from the first paint — no cookies or storage are written, identity is a
// privacy-preserving server-side hash. The cookie is the opt-in enrichment:
// - consent pending → cookieless capture; the banner (CookieBanner.astro)
//   offers the cookie upgrade but ignoring it loses no data.
// - accept → regular first-party cookie analytics (remembered across visits).
// - decline → stays cookieless permanently and the banner never returns.
// Cookieless capture requires cookieless mode to be enabled in the PostHog
// project settings, or these events are dropped.
//
// The consent decision itself is persisted by PostHog (its
// `__ph_opt_in_out_<token>` storage key plus a `$opt_in` event on accept),
// which is the durable record regulators expect — no custom consent store.
// With no PUBLIC_POSTHOG_KEY configured the module is inert and the banner
// never renders. Pageviews are captured automatically via the SDK's
// `history_change` mode, which follows the ClientRouter's pushState
// navigations without page reloads.
//
// The SDK itself (~70KB) loads AFTER the window load event: on a slow
// connection a render-critical byte budget is what decides when the fonts
// and hero imagery arrive, and analytics has no business inside it. Until
// the SDK lands, consent reads come from PostHog's own storage key and
// capture/consent calls queue; the init-time pageview still fires.

import type { PostHog } from 'posthog-js'

// Pre-PostHog-consent versions of this site stored the banner choice under
// this custom localStorage key. Replay it into PostHog's consent store once
// so returning visitors keep their decision and never see the banner again.
const LEGACY_CONSENT_KEY = 'pairlens:analytics-consent'

const key = import.meta.env.PUBLIC_POSTHOG_KEY
// posthog-js persists explicit consent under this exact key ('1' | '0').
const CONSENT_KEY = key ? `__ph_opt_in_out_${key}` : ''

let client: PostHog | null = null
let booting = false
// Calls made before the deferred SDK lands. Capped so a load that never
// finishes (blocked host, offline visitor) cannot grow it without bound —
// the site emits an event per interaction, not per session.
const QUEUE_MAX = 200
const queue: Array<(ph: PostHog) => void> = []

function withClient(fn: (ph: PostHog) => void) {
  if (client) fn(client)
  else if (key && queue.length < QUEUE_MAX) queue.push(fn)
}

function migrateLegacyConsent(posthog: PostHog) {
  let legacy: string | null = null
  try {
    legacy = localStorage.getItem(LEGACY_CONSENT_KEY)
    if (legacy) localStorage.removeItem(LEGACY_CONSENT_KEY)
  } catch {
    return
  }
  if (!legacy || posthog.get_explicit_consent_status() !== 'pending') return
  if (legacy === 'granted') posthog.opt_in_capturing({ captureEventName: null })
  else posthog.opt_out_capturing()
}

async function boot() {
  if (!key || booting) return
  booting = true
  const { default: posthog } = await import('posthog-js')
  posthog.init(key, {
    // EU ingest by default: our PostHog project lives on PostHog Cloud EU, and
    // the Privacy Policy commits to analytics staying in the EEA. A US default
    // would both break ingestion and make that statement false.
    api_host: import.meta.env.PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com',
    defaults: '2026-06-25',
    cookieless_mode: 'on_reject',
    // Treat pending consent as rejected so capture starts cookieless
    // immediately instead of dropping events until the banner is answered.
    opt_out_capturing_by_default: true,
    capture_pageleave: true,
    capture_exceptions: true,
  })
  migrateLegacyConsent(posthog)
  client = posthog
  for (const fn of queue.splice(0)) fn(posthog)
}

if (key && typeof window !== 'undefined') {
  if (document.readyState === 'complete') setTimeout(() => void boot(), 0)
  else
    window.addEventListener('load', () => setTimeout(() => void boot(), 0), {
      once: true,
    })
}

export function consentStatus(): 'granted' | 'denied' | 'pending' {
  if (client) return client.get_explicit_consent_status()
  if (!key) return 'pending'
  try {
    // The legacy key predates PostHog's consent store; it still counts as an
    // answer and is folded into PostHog's own record once the SDK boots.
    const legacy = localStorage.getItem(LEGACY_CONSENT_KEY)
    if (legacy === 'granted') return 'granted'
    if (legacy === 'denied') return 'denied'
    const stored = localStorage.getItem(CONSENT_KEY)
    return stored === '1' ? 'granted' : stored === '0' ? 'denied' : 'pending'
  } catch {
    return 'pending'
  }
}

/** Persist the choice instantly (PostHog rewrites the same key on boot), so a
    quick next navigation never re-shows the banner while the SDK is loading. */
function stashConsent(value: '1' | '0') {
  try {
    localStorage.setItem(CONSENT_KEY, value)
  } catch {
    /* storage denied — PostHog will persist once booted */
  }
}

export function acceptCookies() {
  stashConsent('1')
  withClient((ph) => ph.opt_in_capturing())
  void boot()
}

export function declineCookies() {
  stashConsent('0')
  withClient((ph) => ph.opt_out_capturing())
  void boot()
}

/**
 * Explicit product event (e.g. a download CTA click). Respects the consent
 * state exactly like pageviews: pending and decline capture cookieless,
 * accept captures normally. No-op when no key is configured.
 *
 * Prefer `track()` from `analytics-events.ts` — the declared taxonomy is
 * where the privacy review of a new event happens.
 */
export function captureEvent(
  name: string,
  properties?: Record<string, unknown>,
) {
  withClient((ph) => ph.capture(name, properties))
}

/**
 * Super properties attached to every subsequent event and pageview (e.g. the
 * visitor's platform). Safe before the SDK lands — queued like everything
 * else, so the init-time pageview is the only capture that can miss them.
 */
export function registerProperties(props: Record<string, unknown>) {
  withClient((ph) => ph.register(props))
}
