// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Haptics for the mobile terminal — a tick under the thumb when the surface
 * changes what it is showing.
 *
 * There is no one web API for this, so there are two backends and a no-op:
 *
 *  1. **Vibration API** (`navigator.vibrate`). Android Chrome and Samsung
 *     Internet. Takes a `[pulse, gap, pulse, …]` pattern in milliseconds, so
 *     the tables below are written in its shape. It needs sticky user
 *     activation — Chrome logs "Blocked call to navigator.vibrate" and does
 *     nothing before the first tap, which is why `hasBeenActive` is checked
 *     rather than letting it fail into the console. Its presence is NOT a
 *     capability test: desktop Chrome defines `navigator.vibrate` as a
 *     function on a machine with no vibrator (measured), which is why
 *     `isHandheld` gates it.
 *  2. **The iOS switch input.** WebKit has never shipped the Vibration API
 *     (caniuse still reads "not supported" for every Safari through 26.5, on
 *     iOS and macOS alike) and does not expose the property at all. What it
 *     does have is `<input type="checkbox" switch>` (Safari 17.4+), which
 *     drives the Taptic Engine when it toggles. Activating a hidden one is
 *     the only route to a haptic in mobile Safari, and it is what the
 *     ios-haptics/vibrator.dev family of libraries all reduce to. Apple is
 *     reported to have closed it in iOS 26.5; the driver is written so that
 *     costs a hidden element and a no-op click, not a broken surface.
 *  3. **Nothing**, everywhere else — desktop browsers, a Tauri webview, an
 *     iPad (no vibration hardware). `haptic()` is always safe to call.
 *
 * Installing the app as a PWA changes none of this. The Vibration API is not
 * gated on display mode; an installed Android PWA and an Android tab have the
 * same access, and an installed iOS PWA is the same WebKit with the same
 * missing API. There is nothing to unlock by asking the user to install.
 *
 * **Haptics fire from the gesture, never from the state change.** Every call
 * site in this directory is a handler the user's finger reached — a row press,
 * a tab tap, a confirmed hold. Putting one behind `setFocusedPair` instead
 * would look like it covered more ground and would buzz the phone for a deep
 * link, a shared URL and every back press that adopts a pair
 * (`use-mobile-route-sync.ts` drives all three), which is the one thing a
 * feedback channel must not do.
 *
 * It lives in `src/lib/` and not in `src/mobile/` even though only the mobile
 * shell calls it: the preference lives in the app's own Settings › Appearance,
 * which the desktop dialog owns, and nothing outside `src/mobile/` may import
 * from it (see `mobile/__tests__/separability.test.ts`). A helper both shells
 * touch belongs out here — that is the rule in CLAUDE.md, and the settings
 * card is the second shell.
 */
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'
import { onHydrate, onWrite } from '@/lib/sync/sync-channel'

/**
 * What a haptic MEANS, not how strong it is. The call site says "the user
 * changed a selection"; this module decides what that feels like on whichever
 * backend is present, and the iOS one has exactly one intensity to spend.
 */
export type HapticKind =
  /** A pair, a venue, a tab, a timeframe — the thing on screen changed. */
  | 'selection'
  /** A gesture landed: a crosshair placed, a hold confirmed. */
  | 'impact'
  /** An order went through. */
  | 'success'
  /** A guardrail stopped something. */
  | 'warning'
  /** An order was rejected or failed. */
  | 'error'

/**
 * Patterns in the Vibration API's own `[pulse, gap, pulse, …]` shape, in
 * milliseconds.
 *
 * They are SHORT. A trading terminal ticks, it does not buzz: `selection`
 * fires on every pair tap in a scrolling watchlist, and anything a user can
 * feel as a duration rather than an event turns into noise by the third one.
 * The outcome kinds are longer only because they answer a question the user
 * asked and is waiting on.
 */
export const HAPTIC_PATTERNS: Record<HapticKind, ReadonlyArray<number>> = {
  selection: [7],
  impact: [14],
  success: [10, 70, 20],
  warning: [18, 80, 18],
  error: [22, 55, 22, 55, 22],
}

/**
 * Two haptics closer together than this are one haptic.
 *
 * The guard is not about taste — `navigator.vibrate` CANCELS whatever is
 * playing, so a burst of calls leaves the last one audible and the rest
 * silently truncated, and on the iOS backend the queued clicks pile up into a
 * rattle. 30ms is below the threshold where two ticks read as two events.
 */
export const HAPTIC_MIN_GAP_MS = 30

/**
 * Whether a haptic at `now` is far enough from the one at `last`.
 *
 * Split out as a pure function so the pacing is testable without a device:
 * everything else in this module needs a `navigator` or a `document`.
 */
export function shouldFire(
  now: number,
  last: number | null,
  minGap: number = HAPTIC_MIN_GAP_MS,
): boolean {
  return last === null || now - last >= minGap
}

/**
 * When each pulse of a pattern starts, in ms from the first one.
 *
 * The Vibration API takes the pattern whole; the iOS backend can only fire
 * one fixed tick at a time, so it has to schedule the pulses itself. Even
 * indices are pulses, odd indices are the gaps between them — so `[10, 70,
 * 20]` is a tick, 70ms of quiet, another tick, and comes back as `[0, 80]`.
 */
export function pulseOffsets(pattern: ReadonlyArray<number>): Array<number> {
  const offsets: Array<number> = []
  let elapsed = 0
  for (let i = 0; i < pattern.length; i++) {
    if (i % 2 === 0) offsets.push(elapsed)
    elapsed += pattern[i] ?? 0
  }
  return offsets
}

/**
 * The preference key, under `usePersistedState`'s namespace so the Settings
 * row can own it as ordinary React state while this module reads it from
 * outside React.
 */
export const HAPTICS_PREF_KEY = 'mobile.haptics'

const HAPTICS_STORAGE_KEY = `${STORAGE_PREFIX}${HAPTICS_PREF_KEY}`

export type HapticBackend = 'vibration' | 'taptic' | null

let backend: HapticBackend | undefined
let enabledCache: boolean | undefined
let lastFiredAt: number | null = null
let tapticLabel: HTMLLabelElement | null = null
let pending: Array<ReturnType<typeof setTimeout>> = []

/**
 * iOS and iPadOS, by user agent, because there is nothing better.
 *
 * The switch input has no feature detection worth the name: `switch` is a
 * content attribute that unsupported browsers ignore, MDN does not list it
 * among `HTMLInputElement`'s reflected IDL attributes, and a haptic is not
 * something a page can observe having happened. So the probe is what the
 * capability actually depends on — an Apple touch device — and the failure
 * mode of getting it wrong is a hidden checkbox that toggles and no tick.
 *
 * iPadOS 13+ reports itself as Macintosh, hence the touch-point arm. It has
 * no Taptic Engine, so it lands on a backend that does nothing; that is
 * correct and costs a click.
 */
export function isAppleTouchDevice(
  userAgent: string,
  maxTouchPoints: number,
): boolean {
  if (/iP(hone|od|ad)/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}

/**
 * Whether this is a device with a vibrator in it — a phone or a tablet.
 *
 * This exists because `typeof navigator.vibrate === 'function'` is NOT a
 * capability test. Desktop Chrome defines it on a laptop with nothing to
 * vibrate (measured: `vibrate: "function", maxTouchPoints: 0`), so a check
 * that trusted it would put a haptics card in Settings on every desktop
 * browser and fire silent no-ops behind it.
 *
 * Three signals, cheapest and most authoritative first:
 *
 *  - `userAgentData.mobile` — Chromium's own answer, but only in a secure
 *    context and false on Android tablets, so it can confirm and never deny.
 *  - The `Mobi` / `Android` UA tokens — the platform's long-standing mobile
 *    marker, and the arm that catches Android tablets.
 *  - An Apple touch device, which is also the switch backend's audience.
 *
 * A Windows laptop with a touchscreen matches none of them, which is right:
 * `maxTouchPoints > 0` there means a screen you can poke, not one that buzzes.
 */
export function isHandheld(env: {
  uaDataMobile: boolean | undefined
  userAgent: string
  maxTouchPoints: number
}): boolean {
  if (env.uaDataMobile === true) return true
  if (/Mobi|Android/i.test(env.userAgent)) return true
  return isAppleTouchDevice(env.userAgent, env.maxTouchPoints)
}

/**
 * Which backend an environment gets. Pure, and exported so the heuristics
 * above are pinned by a table of real user agents rather than by a device.
 *
 * Nothing that is not a handheld gets a backend, whatever APIs it exposes.
 * Past that gate the Vibration API wins wherever it exists — it is the real
 * API, it takes a pattern, and an Android browser that has it is never also
 * the switch trick's audience.
 */
export function pickBackend(env: {
  handheld: boolean
  hasVibrate: boolean
  appleTouch: boolean
}): HapticBackend {
  if (!env.handheld) return null
  if (env.hasVibrate) return 'vibration'
  if (env.appleTouch) return 'taptic'
  return null
}

function detectBackend(): HapticBackend {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') {
    return null
  }
  const { userAgent, maxTouchPoints } = navigator
  return pickBackend({
    handheld: isHandheld({
      uaDataMobile: (
        navigator as Navigator & { userAgentData?: { mobile?: boolean } }
      ).userAgentData?.mobile,
      userAgent,
      maxTouchPoints,
    }),
    hasVibrate: typeof navigator.vibrate === 'function',
    appleTouch: isAppleTouchDevice(userAgent, maxTouchPoints),
  })
}

function resolveBackend(): HapticBackend {
  if (backend === undefined) backend = detectBackend()
  return backend
}

/**
 * Whether this device can produce a haptic at all — what Settings › Appearance
 * uses to decide whether the card is worth drawing at all.
 *
 * "Can" is the honest word: on the iOS backend it means "this is an Apple
 * touch device and the switch trick is the way in", not that the tick will
 * land. Silent mode, System Haptics being off and an OS that closed the hole
 * are all invisible from here.
 *
 * Memoised on first call, so a resize or a rerender cannot flip the card in
 * and out — the answer is about hardware and hardware does not change.
 */
export function hapticsAvailable(): boolean {
  return resolveBackend() !== null
}

function readEnabled(): boolean {
  if (enabledCache !== undefined) return enabledCache
  enabledCache = true
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(HAPTICS_STORAGE_KEY)
      if (stored !== null) enabledCache = JSON.parse(stored) === true
    } catch {
      // Unreadable storage (private mode, quota, a hand-edited value) means
      // the default, not a dead feature.
    }
  }
  return enabledCache
}

/**
 * Tell this module the preference changed, in the same tick the row flips it.
 *
 * The sync-channel subscription below hears about the write too, but a
 * MICROTASK later (`usePersistedState` defers `emitWrite` so a sibling hook's
 * setState cannot land mid-render). That is one tick too late for the Settings
 * row, which flips the switch and immediately fires the tick that demonstrates
 * what the user just turned on — off a stale cache, turning haptics ON is
 * silent, which reads exactly like a broken toggle.
 */
export function setHapticsEnabled(enabled: boolean): void {
  enabledCache = enabled
}

/**
 * Keep the cache honest when a SIBLING window or a cloud hydrate moves the
 * value — the paths `setHapticsEnabled` cannot cover. Subscribing lazily keeps
 * this module free of import-time side effects, which is what lets a test
 * import the pure helpers above without a DOM.
 */
let subscribed = false
function subscribeToPreference(): void {
  if (subscribed) return
  subscribed = true
  const apply = (key: string, value: unknown) => {
    if (key === HAPTICS_PREF_KEY) enabledCache = value === true
  }
  onWrite(apply)
  onHydrate(apply)
}

/**
 * Fire a haptic, if this device has one and the user still wants it.
 *
 * Safe to call from anywhere and on any platform: every arm of the decision
 * fails closed, and the whole thing is a few property reads when it doesn't.
 * Call it from the gesture handler, BEFORE the state change it acknowledges —
 * the tick is meant to answer the finger, not the render.
 */
export function haptic(kind: HapticKind): void {
  const driver = resolveBackend()
  if (driver === null) return

  subscribeToPreference()
  if (!readEnabled()) return

  // A backgrounded tab buzzing a pocket is the worst failure this feature
  // has. The chart keeps streaming while the phone is locked, so this is a
  // real path, not a defensive one.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden')
    return

  // Vibration needs the user to have touched the frame. Sticky activation, so
  // this only ever blocks the pre-first-tap case — which is exactly the one
  // that would otherwise be a console warning per call.
  const activation = navigator.userActivation
  if (activation && !activation.hasBeenActive) return

  const now = performance.now()
  if (!shouldFire(now, lastFiredAt)) return
  lastFiredAt = now

  const pattern = HAPTIC_PATTERNS[kind]
  if (driver === 'vibration') {
    // Copied because the API mutates nothing but is typed as a mutable array,
    // and the table is shared and frozen in spirit.
    navigator.vibrate([...pattern])
    return
  }
  playTaptic(pattern)
}

/**
 * The iOS backend: activate a hidden switch, once per pulse.
 *
 * The element has to be a `<label>` wrapping the input and the click has to
 * land on the LABEL. Clicking the input directly from script does not produce
 * a haptic — WebKit only plays one for the label's forwarded activation — and
 * it cannot be `display:none` or `visibility:hidden` either, because a switch
 * that is not being rendered has nothing to animate and nothing to feel. So it
 * is a 1px, fully transparent, pointer-transparent element parked at the
 * origin, out of the tab order and out of the accessibility tree.
 */
function playTaptic(pattern: ReadonlyArray<number>): void {
  const label = ensureTapticElement()
  if (!label) return

  // A new haptic replaces whatever the last one still had queued — the same
  // thing navigator.vibrate does with a pattern in flight.
  for (const timer of pending) clearTimeout(timer)
  pending = []

  for (const offset of pulseOffsets(pattern)) {
    if (offset === 0) {
      label.click()
      continue
    }
    pending.push(
      setTimeout(() => {
        label.click()
      }, offset),
    )
  }
}

function ensureTapticElement(): HTMLLabelElement | null {
  if (tapticLabel) return tapticLabel
  if (typeof document === 'undefined' || !document.body) return null

  const label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText =
    'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;'

  const input = document.createElement('input')
  input.type = 'checkbox'
  // The whole point of the element, and a no-op attribute anywhere it isn't
  // supported. Set as an attribute rather than a property: it is a content
  // attribute, and no browser reflects it as one we could assign.
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)

  document.body.appendChild(label)
  tapticLabel = label
  return label
}

/** Test seam: drop the memoised backend, preference and element. */
export function resetHapticsForTest(): void {
  backend = undefined
  enabledCache = undefined
  lastFiredAt = null
  for (const timer of pending) clearTimeout(timer)
  pending = []
  tapticLabel?.remove()
  tapticLabel = null
}
