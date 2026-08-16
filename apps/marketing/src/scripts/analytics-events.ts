// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Typed product-event taxonomy for the marketing site, and the one delegated
// listener that emits most of it.
//
// Same contract as the terminal's `analytics-events.ts`: every event the site
// can emit is declared here with the exact property set it may carry, and call
// sites use `track()` rather than `captureEvent()` directly, so an event
// cannot grow an undeclared property without touching this file — which is
// where the privacy review happens.
//
// Privacy rules:
// - No PII and no free text the visitor typed. The affiliate claim form is the
//   sharp edge here: it collects an email and exchange referral codes, and
//   NONE of it is captured — only that a step happened and how many venues
//   were picked.
// - Identifiers are fine when they name OUR OWN surface (a nav label, a plan
//   name, a feature name, a venue id, an FAQ question we wrote). Those
//   describe the page, not the person.
// - Everything rides the same consent posture as pageviews: cookieless while
//   consent is pending or declined, cookie-backed after accept. Nothing here
//   changes what is stored, only what is measured.
//
// Instrumentation style: ONE delegated activation listener reading data
// attributes that already exist in the markup (`data-card`, `data-skin`,
// `data-acc-toggle`, ...). The site's interactive bits are a mix of Astro
// `is:inline` scripts, module scripts and React islands, and delegation is the
// only hook that reaches all three without a script import per component.
// Islands that own their own state (the docs command palette, the affiliate
// flow) import `track` directly instead.

import { captureEvent, registerProperties } from '@/scripts/analytics'

/** Which page the visitor is on, coarse enough to group by in a dashboard. */
export type PageArea =
  | 'landing'
  | 'install'
  | 'charts'
  | 'intelligence'
  | 'affiliates'
  | 'licensing'
  | 'docs'
  | 'legal'
  | 'other'

/** The machine the visitor is browsing from, not the build they downloaded. */
export type VisitorOs = 'mac' | 'win' | 'linux' | 'mobile' | 'unknown'

/** Where a link lives in the chrome. */
export type NavLocation =
  | 'header'
  | 'header-sheet'
  | 'footer'
  | 'footer-legal'
  | 'docs-header'
  | 'docs-sidebar'
  | 'docs-toc'
  | 'legal-toc'
  | 'body'

export interface MarketingAnalyticsEvents {
  // ── The two doors (the whole point of the site) ────────────────────
  /** An anchor into the hosted terminal was clicked. `surface` is the
   * placement, so the funnel reads per CTA rather than as one lump. */
  terminal_launched: { surface: string }
  /** The visitor showed intent on a launch CTA and we spent ~2 MB warming
   * the terminal's chunks for them. Fires at most once per page load, so the
   * ratio against `terminal_launched` is the honest read on whether the
   * bandwidth is buying anything. */
  terminal_prefetched: Record<string, never>
  /** A desktop release download started. `os` is the build that was asked
   * for; the `visitor_os` super property is the machine that asked, and the
   * gap between them is the interesting part. */
  download_clicked: { os: string; surface: string }
  /** The install page's "didn't start?" link. */
  download_retried: { os: string }
  /** The install page's post-download card was dismissed back to the
   * chooser — a download that did not land the way it should have. */
  download_flow_restarted: Record<string, never>
  /** A shell command was copied (install page, charts quickstart). `command`
   * is the leading token of our own printed command, never page input. */
  command_copied: { command: string }
  /** Phone visit: the page was sent to a desk instead of installed here. */
  install_page_shared: { method: 'copy_link' | 'native_share' }

  // ── Chrome & navigation ───────────────────────────────────────────
  /** An internal link in the site chrome. `label` is our own link text. */
  nav_clicked: { location: NavLocation; label: string; href: string }
  /** A link leaving pairlens.finance (GitHub, X, the hosted terminal is
   * tracked as `terminal_launched` instead). `domain` only, never a path
   * with anything visitor-specific in it. */
  outbound_link_clicked: {
    domain: string
    label: string
    location: NavLocation
  }
  mobile_nav_opened: Record<string, never>
  docs_drawer_opened: Record<string, never>
  /** The cookie gate was answered. The durable consent record is PostHog's
   * own; this is the funnel view of it. */
  cookie_consent_decided: { decision: 'accepted' | 'declined' }

  // ── Reading depth ─────────────────────────────────────────────────
  /** Fired once per page at 25 / 50 / 75 / 100 percent scrolled. The honest
   * version of "did anyone read past the hero". */
  scroll_depth_reached: { depth: 25 | 50 | 75 | 100 }

  // ── Landing engagement ────────────────────────────────────────────
  /** The feature dialog was opened. `source` separates the card rail from
   * the inline phrases in the paragraph above it. */
  feature_opened: { feature: string; source: 'card' | 'phrase' | 'rail' }
  /** The feature rail or dialog was stepped through. */
  feature_stepped: { direction: 'next' | 'prev' }
  /** A slot in the "build your desk" panel was cycled. */
  desk_slot_changed: { slot: string }

  // ── Answers people go looking for ─────────────────────────────────
  /** An FAQ disclosure was opened (never the close). `question` is our own
   * copy, truncated — it is the label, not a search. */
  faq_opened: { question: string }
  /** A pricing plan CTA on /intelligence. */
  pricing_plan_cta_clicked: { plan: string }

  // ── /charts, the developer-facing product page ────────────────────
  /** The live chart skinner was used. `control` is the group
   * (palette/surface/font/radius/grid/reset), `value` the choice. */
  chart_skin_changed: { control: string; value: string }
  /** A code-example tab was switched. */
  code_example_viewed: { example: string }

  // ── Docs ──────────────────────────────────────────────────────────
  docs_search_opened: { trigger: 'hotkey' | 'button' }
  /** Something was picked out of the docs command palette. `kind` separates
   * a doc page from one of the palette's actions. */
  docs_search_selected: { kind: 'page' | 'action'; target: string }

  // ── Affiliates ────────────────────────────────────────────────────
  /** A Pairlens affiliate code was entered. `ok` is whether it resolved to a
   * tier; the code itself is never captured. */
  affiliate_code_applied: { ok: boolean; tier: string }
  affiliate_venue_toggled: { venue: string; action: 'added' | 'removed' }
  /** The claim form was submitted. Venue count only — no email, no referral
   * codes, no payout address. */
  affiliate_claim_submitted: { tier: string; venue_count: number }
}

/** Path → coarse area. Kept here so events and dashboards share one map. */
export function pageArea(pathname: string): PageArea {
  if (pathname === '/' || pathname === '') return 'landing'
  if (pathname.startsWith('/docs')) return 'docs'
  if (pathname.startsWith('/install')) return 'install'
  if (pathname.startsWith('/charts')) return 'charts'
  if (pathname.startsWith('/intelligence')) return 'intelligence'
  if (pathname.startsWith('/affiliates')) return 'affiliates'
  if (pathname.startsWith('/licensing')) return 'licensing'
  if (pathname.startsWith('/privacy') || pathname.startsWith('/terms')) {
    return 'legal'
  }
  return 'other'
}

/**
 * Emit a declared product event. `page_area` is merged in at capture time
 * rather than registered as a super property: the site navigates through
 * Astro's ClientRouter, and a super property registered on `astro:page-load`
 * races the pageview of the page it describes.
 */
export function track<TEvent extends keyof MarketingAnalyticsEvents>(
  event: TEvent,
  ...args: MarketingAnalyticsEvents[TEvent] extends Record<string, never>
    ? []
    : [properties: MarketingAnalyticsEvents[TEvent]]
): void {
  captureEvent(event, {
    ...(args[0] as Record<string, unknown> | undefined),
    page_area: pageArea(
      typeof location === 'undefined' ? '' : location.pathname,
    ),
  })
}

function detectVisitorOs(): VisitorOs {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  const platform = navigator.platform || ''
  // iPads report as Macintosh but expose multi-touch — same test the hero's
  // OS-swapping script uses, so the two never disagree about who is on a
  // machine that can run an installer.
  if (
    /android|iphone|ipod|ipad/i.test(ua) ||
    (/mac/i.test(platform) && navigator.maxTouchPoints > 1)
  ) {
    return 'mobile'
  }
  if (/win/i.test(platform) || /windows/i.test(ua)) return 'win'
  if (/linux|x11|cros/i.test(platform) || /linux|x11|cros/i.test(ua)) {
    return 'linux'
  }
  if (/mac/i.test(platform) || /mac os/i.test(ua)) return 'mac'
  return 'unknown'
}

// ── Delegated instrumentation ───────────────────────────────────────

/** Our own copy, but a heading can still be long; keep the label a label. */
const trim = (value: string | null | undefined, max = 80) =>
  (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)

function navLocation(el: Element): NavLocation {
  const holder = el.closest<HTMLElement>('[data-nav-loc]')
  return (holder?.dataset.navLoc as NavLocation | undefined) ?? 'body'
}

function trackLink(anchor: HTMLAnchorElement) {
  const label =
    trim(anchor.getAttribute('aria-label')) || trim(anchor.textContent, 40)
  const location = navLocation(anchor)
  let url: URL
  try {
    url = new URL(anchor.href, window.location.href)
  } catch {
    return
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return
  if (url.host === window.location.host) {
    // Keep the hash: half the top nav is `/#features`-style deep links, and
    // without it every one of them reports as a click on the landing page.
    track('nav_clicked', {
      location,
      label,
      href: url.pathname + url.hash,
    })
    return
  }
  track('outbound_link_clicked', { domain: url.host, label, location })
}

/** Which OS build a release anchor points at. Static `data-os` first, then
 *  the visible face on the landing's OS-swapping buttons, then the platform
 *  label on /install. */
function downloadOs(anchor: Element): string {
  const face = anchor
    .querySelector('[data-os-face]:not([hidden])')
    ?.getAttribute('data-os-face')
  return (
    anchor.getAttribute('data-os') ||
    face ||
    trim(anchor.querySelector('[data-os-name]')?.textContent, 20) ||
    'unknown'
  )
}

/** One entry point for pointer clicks and keyboard activation, because the
 *  landing's feature cards are `role="button"` divs, not real buttons. */
function onActivate(target: Element) {
  const launch = target.closest('a[data-launch-terminal]')
  if (launch) {
    track('terminal_launched', {
      surface: launch.getAttribute('data-launch-terminal') || 'unknown',
    })
    return
  }

  const download = target.closest('a[data-os-download]')
  if (download) {
    track('download_clicked', {
      os: downloadOs(download),
      surface: download.getAttribute('data-os-download') || 'unknown',
    })
    return
  }

  if (target.closest('[data-dl-retry]')) {
    track('download_retried', {
      os: trim(document.querySelector('[data-dl-os]')?.textContent, 20),
    })
    return
  }
  if (target.closest('[data-dl-back]')) {
    track('download_flow_restarted')
    return
  }

  const copy = target.closest('[data-install-copy], [data-copy]')
  if (copy) {
    const command =
      copy.getAttribute('data-install-copy') ?? copy.getAttribute('data-copy')
    track('command_copied', {
      // The first two tokens name the tool without carrying a full URL.
      command: trim(command, 60).split(' ').slice(0, 2).join(' '),
    })
    return
  }
  if (target.closest('[data-mobile-copy]')) {
    track('install_page_shared', { method: 'copy_link' })
    return
  }
  if (target.closest('[data-mobile-share]')) {
    track('install_page_shared', { method: 'native_share' })
    return
  }

  const card = target.closest<HTMLElement>('[data-card]')
  if (card) {
    track('feature_opened', {
      feature: trim(card.dataset.name, 40),
      source: 'card',
    })
    return
  }
  const phrase = target.closest<HTMLElement>('[data-phrase]')
  if (phrase) {
    // `data-phrase` is the rail index; the name rides alongside it.
    track('feature_opened', {
      feature: trim(phrase.dataset.name, 40),
      source: 'phrase',
    })
    return
  }
  if (target.closest('[data-rail-next]')) {
    track('feature_stepped', { direction: 'next' })
    return
  }
  if (target.closest('[data-rail-prev]')) {
    track('feature_stepped', { direction: 'prev' })
    return
  }

  const slot = target.closest<HTMLElement>('[data-slot]')
  if (slot) {
    track('desk_slot_changed', { slot: slot.dataset.slot ?? 'unknown' })
    return
  }

  // Both FAQ implementations drive `aria-expanded`; read it BEFORE their own
  // handler flips it, so this is the state we are leaving. Only the open
  // direction is interesting — a close is just tidying up.
  const faq = target.closest('[data-acc-toggle], [data-licensing-acc]')
  if (faq) {
    if (faq.getAttribute('aria-expanded') !== 'true') {
      track('faq_opened', { question: trim(faq.textContent, 90) })
    }
    return
  }

  const plan = target.closest<HTMLElement>('[data-plan-cta]')
  if (plan) {
    track('pricing_plan_cta_clicked', {
      plan: plan.dataset.planCta || 'unknown',
    })
    return
  }

  const skin = target.closest<HTMLElement>('[data-skin]')
  if (skin) {
    const [control, value] = (skin.dataset.skin ?? '').split(':')
    track('chart_skin_changed', {
      control: control || 'unknown',
      value: value || '',
    })
    return
  }

  const codeTab = target.closest<HTMLElement>('[data-code-tab]')
  if (codeTab) {
    track('code_example_viewed', { example: codeTab.dataset.codeTab ?? '' })
    return
  }

  if (target.closest('[data-hdr-menu]')) {
    track('mobile_nav_opened')
    return
  }
  if (target.closest('[data-docs-nav-toggle]')) {
    track('docs_drawer_opened')
    return
  }

  const anchor = target.closest<HTMLAnchorElement>('a[href]')
  if (anchor) trackLink(anchor)
}

// Reading depth. Thresholds fire once per page and are re-armed on every
// ClientRouter navigation. Passive + rAF-coalesced: the landing already runs
// parallax and reveal listeners on this event and none of them may be the
// reason a phone drops frames.
const DEPTHS = [25, 50, 75, 100] as const
let reached = new Set<number>()
let depthRaf = 0

function measureDepth() {
  depthRaf = 0
  const doc = document.documentElement
  const scrollable = doc.scrollHeight - window.innerHeight
  // A page shorter than the viewport has no depth to report; counting it as
  // 100% would make every legal page look like a page-turner.
  if (scrollable < 200) return
  const percent =
    ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100
  for (const depth of DEPTHS) {
    if (percent >= depth && !reached.has(depth)) {
      reached.add(depth)
      track('scroll_depth_reached', { depth })
    }
  }
}

declare global {
  interface Window {
    __plMarketingAnalyticsBound?: boolean
  }
}

if (typeof window !== 'undefined' && !window.__plMarketingAnalyticsBound) {
  window.__plMarketingAnalyticsBound = true

  registerProperties({ visitor_os: detectVisitorOs() })

  document.addEventListener('click', (event) => {
    if (event.target instanceof Element) onActivate(event.target)
  })
  // `role="button"` elements (the feature cards and phrases) are activated
  // with Enter/Space, and those never surface as clicks.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.matches('[data-card], [data-phrase]')) onActivate(target)
  })

  window.addEventListener(
    'scroll',
    () => {
      if (!depthRaf) depthRaf = requestAnimationFrame(measureDepth)
    },
    { passive: true },
  )
  document.addEventListener('astro:page-load', () => {
    reached = new Set()
  })
}
