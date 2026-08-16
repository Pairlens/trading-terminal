// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Warm the hosted terminal before the visitor clicks "Launch".
//
// The terminal boots from a 17 KB shell plus ~170 content-hashed chunks, 2.2
// MB compressed, and 1.5 MB of that is a single `main` bundle. Cold, those
// bytes are most of the wait between the click and the first chart.
//
// This is only worth doing because terminal.pairlens.finance and
// pairlens.finance are the same SITE. Chrome and Firefox partition the HTTP
// cache by top-level site rather than by origin, so bytes fetched from the
// terminal origin while the visitor is still on the marketing page land in
// the exact partition the terminal reads from a moment later. From any other
// registrable domain — a *.vercel.app preview, localhost — the same fetches
// land in a partition the terminal can never read, so we skip them outright
// rather than spend bandwidth nobody gets to use.
//
// The DOCUMENT navigation is not handled here: SiteLayout ships a speculation
// rule for it, which puts the shell in the browser's own prefetch cache and
// activates without revalidating. Speculation rules deliberately stop at the
// document, so the subresources are this file's job. It does read the shell a
// second time to learn the hashes, which is 17 KB of overlap against the ~2 MB
// it unlocks.

import { SITE } from '@/lib/site'
import { track } from '@/scripts/analytics-events'

const LAUNCH = new URL(SITE.launchUrl)

/** Registrable domain of the terminal (`pairlens.finance`). A last-two-labels
 *  split is exact for this one host and never sees another. */
const TERMINAL_SITE = LAUNCH.hostname.split('.').slice(-2).join('.')

/** Sanity bound on the warm, not a tuning knob: the shell lists ~170 chunks
 *  today, and a shell that somehow listed thousands should not turn a hover
 *  into a download storm. */
const MAX_ASSETS = 220

interface ConnectionInfo {
  saveData?: boolean
  effectiveType?: string
}

let warmed = false

/** Whether this visit should pay for the 2 MB warm. The document prefetch and
 *  the preconnect are unconditional; only the chunks are gated. */
function shouldWarmAssets(): boolean {
  // Hover-capable pointers only. On a phone this is somebody's data plan
  // spent on a page they have not opened yet, and there is no hover to spend
  // it during — the tap is already the navigation.
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return false
  if (matchMedia('(prefers-reduced-data: reduce)').matches) return false
  const connection = (navigator as Navigator & { connection?: ConnectionInfo })
    .connection
  if (connection?.saveData) return false
  if (connection?.effectiveType && connection.effectiveType !== '4g')
    return false
  return true
}

/** The hashed chunks the shell asks for on boot, read out of the shell itself
 *  rather than a manifest the two deploys would have to keep in step. The
 *  shell is the terminal build's own answer and is always current; if its
 *  markup ever changes shape the match simply finds nothing and the warm
 *  quietly does less. */
function bootAssets(html: string): Array<string> {
  const paths = new Set<string>()
  for (const [path] of html.matchAll(/\/assets\/[\w.-]+\.(?:js|css)/g)) {
    paths.add(path)
    if (paths.size >= MAX_ASSETS) break
  }
  return [...paths]
}

function prefetch(path: string): void {
  const link = document.createElement('link')
  link.rel = 'prefetch'
  link.as = path.endsWith('.css') ? 'style' : 'script'
  // Deliberately NO `crossorigin`. The cache entry has to match the request
  // the terminal itself will make for the same file, and there it is a plain
  // same-origin (credentialed) load. A CORS-anonymous prefetch sits in a
  // different slot and gets re-fetched from scratch: the font-preload trap,
  // in reverse.
  link.href = LAUNCH.origin + path
  document.head.append(link)
}

async function warm(): Promise<void> {
  if (warmed) return
  warmed = true
  track('terminal_prefetched')

  let html: string
  try {
    const response = await fetch(LAUNCH.href, {
      // The shell is public and its bytes are only read to pull hashes out.
      credentials: 'omit',
      priority: 'low',
    })
    if (!response.ok) return
    html = await response.text()
  } catch {
    // Offline, blocked by an extension, or the terminal is down. There is
    // nothing to warm and nothing worth reporting — the click still works.
    return
  }

  for (const path of bootAssets(html)) prefetch(path)
}

function onIntent(event: Event): void {
  if (warmed) return
  const target = event.target
  if (!(target instanceof Element)) return
  if (!target.closest('a[data-launch-terminal]')) return
  if (!shouldWarmAssets()) return
  void warm()
}

declare global {
  interface Window {
    __plTerminalPrefetchArmed?: boolean
  }
}

const host = typeof location === 'undefined' ? '' : location.hostname
const sameSiteAsTerminal =
  host === TERMINAL_SITE || host.endsWith(`.${TERMINAL_SITE}`)

if (
  typeof window !== 'undefined' &&
  !window.__plTerminalPrefetchArmed &&
  sameSiteAsTerminal
) {
  window.__plTerminalPrefetchArmed = true
  // Delegated on `document` so it survives every ClientRouter swap, and armed
  // on hover and on keyboard focus so both routes into a CTA get the lead
  // time. `pointerover` rather than `pointerenter`: it bubbles.
  document.addEventListener('pointerover', onIntent, { passive: true })
  document.addEventListener('focusin', onIntent, { passive: true })
}
