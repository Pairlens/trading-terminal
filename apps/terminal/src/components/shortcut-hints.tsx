// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

import { Kbd } from '@pairlens/ui/components/ui/kbd'

/**
 * Hold-a-modifier shortcut hints.
 *
 * Holding ⌘ (or Ctrl / ⌥) for a beat reveals a badge next to every control
 * that has a keyboard shortcut. <ShortcutHint> is an invisible marker placed
 * inside the control; on reveal, <ShortcutHintListener> measures each
 * marker's parent and renders all badges into one fixed, top-of-stack
 * overlay via a portal. Rendering in an overlay (instead of absolutely
 * positioning badges inside the controls) means no `overflow: hidden`
 * ancestor or sibling stacking context (e.g. the chart canvas) can clip
 * them.
 *
 * While hints are visible a `data-shortcut-hints` attribute also sits on
 * <body>, letting CSS highlight always-visible <Kbd> labels (see
 * styles.css). Quick chords (⌘C, ⌘K…) never show hints: any non-modifier
 * keypress cancels the pending reveal.
 */

const HINT_DELAY_MS = 450

const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt'])

type HintBadge = {
  id: number
  keys: string
  left: number
  top: number
}

/** Measure every mounted marker's parent control, skipping invisible ones. */
function collectBadges(): Array<HintBadge> {
  const badges: Array<HintBadge> = []
  // Some embedded webviews report every viewport measure as 0 even though
  // element rects are real — fall back to "unbounded" so hints still show
  // there instead of all being culled as off-screen.
  const viewportWidth =
    Math.max(document.documentElement.clientWidth, window.innerWidth) ||
    Infinity
  const viewportHeight =
    Math.max(document.documentElement.clientHeight, window.innerHeight) ||
    Infinity
  document
    .querySelectorAll<HTMLElement>('span[data-shortcut-hint]')
    .forEach((marker, index) => {
      const anchor = marker.parentElement
      if (!anchor) return
      const rect = anchor.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      if (
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.top > viewportHeight ||
        rect.left > viewportWidth
      ) {
        return
      }
      badges.push({
        id: index,
        keys: marker.dataset.shortcutHint ?? '',
        // Badge center sits on the control's top-right corner, nudged back
        // into view for controls flush against the viewport edge.
        left: Math.min(rect.right, viewportWidth - 14),
        top: Math.max(rect.top, 10),
      })
    })
  return badges
}

export function ShortcutHintListener() {
  const [badges, setBadges] = useState<Array<HintBadge> | null>(null)

  useEffect(() => {
    let timer: number | null = null
    let shown = false

    const show = () => {
      shown = true
      document.body.setAttribute('data-shortcut-hints', '')
      setBadges(collectBadges())
    }
    const hide = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      if (shown) {
        shown = false
        document.body.removeAttribute('data-shortcut-hints')
        setBadges(null)
      }
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(e.key)) {
        if (timer === null && !shown) {
          timer = window.setTimeout(() => {
            timer = null
            show()
          }, HINT_DELAY_MS)
        }
      } else {
        // A chord is being typed — the user already knows this shortcut.
        hide()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (MODIFIER_KEYS.has(e.key)) hide()
    }
    // Measured positions go stale the moment anything scrolls or resizes.
    const onViewportChange = () => {
      if (shown) hide()
    }

    // Capture phase so components calling stopPropagation can't wedge the
    // hints in a stuck-open state.
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', hide)
    window.addEventListener('resize', onViewportChange)
    document.addEventListener('scroll', onViewportChange, true)
    document.addEventListener('visibilitychange', hide)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', hide)
      window.removeEventListener('resize', onViewportChange)
      document.removeEventListener('scroll', onViewportChange, true)
      document.removeEventListener('visibilitychange', hide)
      hide()
    }
  }, [])

  if (!badges || badges.length === 0) return null

  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[9999]">
      {badges.map((badge) => (
        <Kbd
          key={badge.id}
          data-shortcut-hint="badge"
          style={{ left: badge.left, top: badge.top }}
          className="absolute h-4 min-w-4 -translate-x-2/3 -translate-y-1/2 border border-primary/30 bg-popover px-1 text-[10px] text-primary shadow-md"
        >
          {badge.keys}
        </Kbd>
      ))}
    </div>,
    document.body,
  )
}

/**
 * Invisible marker declaring that its parent control has a keyboard
 * shortcut. Place it as a direct child of the control element.
 */
export function ShortcutHint({
  keys,
}: {
  /** Display label, e.g. `⌘I`, `⌘⇧L`, `⌥T`, `1-9`. */
  keys: string
}) {
  // Unbound commands render no marker at all, so a control the user stripped
  // the shortcut from stops advertising one.
  if (!keys) return null
  return <span hidden data-shortcut-hint={keys} />
}
