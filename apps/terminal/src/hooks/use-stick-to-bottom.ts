// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * "Stick to bottom" autoscroll for streaming panels (copilot chat, research
 * report). Follows growing content while the user is parked at the bottom, and
 * — crucially — *yields* the moment they scroll up so reading isn't interrupted.
 *
 * Why not `scrollIntoView({ behavior: 'smooth' })`? Smooth scroll animations
 * fight each other during streaming (each delta re-targets a moving anchor) and
 * yank the user back down when they try to scroll up. This tracks intent
 * instead: it only auto-scrolls when `pinned`, and pins/unpins from real scroll
 * events.
 *
 * Attach `contentRef` (a callback ref) to the growing content element — the
 * INNER element whose height changes, never the scroller itself. The
 * scrollable ancestor (a plain `overflow-y-auto` div or a base-ui ScrollArea
 * viewport) is resolved by walking up from there, so putting the ref on the
 * scroller silently breaks both halves: the walk starts above it and finds
 * the wrong element, and the ResizeObserver watches a flex-sized box whose
 * height never changes, so growth never fires.
 */
/** Distance-from-bottom (px) still counted as "parked at the bottom". */
const THRESHOLD = 48

/**
 * The scroll handler's whole decision, as a pure function so it can be
 * tested. It has been wrong twice in ways no synthetic growth test caught,
 * so the reasoning lives here with it:
 *
 * `keep` is the case that matters. Being far from the bottom is NOT enough
 * to conclude the reader walked away, because this hook's own jump produces
 * exactly that reading: it scrolls to the bottom as it stands, React commits
 * another few hundred pixels of message, and the resulting scroll event is
 * measured against the taller content. Only a scroll that actually went UP
 * is a reader leaving.
 */
export function decideScrollPin({
  top,
  lastTop,
  scrollHeight,
  clientHeight,
}: {
  top: number
  lastTop: number
  scrollHeight: number
  clientHeight: number
}): 'pin' | 'unpin' | 'keep' {
  const dist = scrollHeight - top - clientHeight
  if (dist <= THRESHOLD) return 'pin'
  // 1px of slack: sub-pixel positions must not read as intent.
  return top < lastTop - 1 ? 'unpin' : 'keep'
}

/**
 * The furthest an element can actually be scrolled. Recording anything
 * larger than this as a previous position (`scrollHeight`, say) leaves the
 * next scroll event looking like a viewport-sized jump upwards.
 */
export function maxScrollTop(el: {
  scrollHeight: number
  clientHeight: number
}): number {
  return Math.max(0, el.scrollHeight - el.clientHeight)
}

export function useStickToBottom<T extends HTMLElement = HTMLDivElement>({
  enabled,
}: {
  /** Follow content growth (true while streaming). When false, the existing
   * scroll position is left untouched — a completed/cached report opens where
   * it is rather than jumping to the end. */
  enabled: boolean
}) {
  // Content element is stored in state (via a callback ref) so the observers
  // below re-attach when it mounts later — copilot only renders the scroll
  // container once the first message exists.
  const [contentEl, setContentEl] = useState<T | null>(null)
  const scrollElRef = useRef<HTMLElement | null>(null)
  const pinnedRef = useRef(true)
  const enabledRef = useRef(enabled)
  const [isPinned, setIsPinned] = useState(true)
  /** Content arrived below the fold while the user was reading further up. */
  const [hasUnseen, setHasUnseen] = useState(false)
  const lastHeightRef = useRef(0)
  /** Previous scrollTop, so a scroll event knows which way it went. */
  const lastTopRef = useRef(0)

  enabledRef.current = enabled

  const contentRef = useCallback((node: T | null) => {
    setContentEl(node)
  }, [])

  const resolveScrollEl = useCallback((): HTMLElement | null => {
    if (scrollElRef.current?.isConnected) return scrollElRef.current
    let node: HTMLElement | null = contentEl?.parentElement ?? null
    while (node) {
      if (node.matches('[data-slot="scroll-area-viewport"]')) break
      const oy = getComputedStyle(node).overflowY
      if (oy === 'auto' || oy === 'scroll' || oy === 'overlay') break
      node = node.parentElement
    }
    scrollElRef.current = node
    return node
  }, [contentEl])

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'auto') => {
      const el = resolveScrollEl()
      if (!el) return
      pinnedRef.current = true
      setIsPinned(true)
      setHasUnseen(false)
      // The CLAMPED target, not scrollHeight: see maxScrollTop. `scrollTo`
      // clamps for us anyway; the point is that both agree on the number.
      const target = maxScrollTop(el)
      lastTopRef.current = target
      el.scrollTo({ top: target, behavior })
    },
    [resolveScrollEl],
  )

  // Track the user's scroll position → pin when parked at the bottom, release
  // the instant they scroll up.
  useEffect(() => {
    if (!contentEl) return
    const el = resolveScrollEl()
    if (!el) return
    lastTopRef.current = el.scrollTop
    const onScroll = () => {
      const top = el.scrollTop
      const verdict = decideScrollPin({
        top,
        lastTop: lastTopRef.current,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      })
      lastTopRef.current = top
      if (verdict === 'keep') return
      const pinned = verdict === 'pin'
      pinnedRef.current = pinned
      setIsPinned(pinned)
      // Scrolling back down IS reading it, however they got there.
      if (pinned) setHasUnseen(false)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [contentEl, resolveScrollEl])

  // Follow content growth (streaming text, async cards, images) while pinned.
  // A ResizeObserver catches every height change — not just React re-renders —
  // so late-loading content (sparklines, favicons) stays in view too.
  useEffect(() => {
    if (!contentEl) return
    lastHeightRef.current = contentEl.scrollHeight
    const obs = new ResizeObserver(() => {
      const height = contentEl.scrollHeight
      const grew = height > lastHeightRef.current
      lastHeightRef.current = height

      if (pinnedRef.current) {
        // Follow, but only while something is actually arriving. A
        // completed thread that reflows (a window resize, a card
        // expanding) should stay where the reader left it.
        if (enabledRef.current) {
          const el = resolveScrollEl()
          if (el) el.scrollTop = el.scrollHeight
        }
        return
      }

      // Parked up the thread and the answer landed below them. Growth is
      // the signal rather than message count: an answer streams in as one
      // message that keeps getting taller, so counting messages would
      // announce the turn once and then go quiet for the whole answer.
      if (grew) setHasUnseen(true)
    })
    obs.observe(contentEl)
    return () => obs.disconnect()
  }, [contentEl, resolveScrollEl])

  return { contentRef, scrollToBottom, isPinned, hasUnseen }
}
