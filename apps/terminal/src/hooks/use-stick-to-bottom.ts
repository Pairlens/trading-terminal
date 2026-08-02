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
 * Attach `contentRef` (a callback ref) to the growing content element. The
 * scrollable ancestor — a plain `overflow-y-auto` div or a base-ui ScrollArea
 * viewport — is resolved automatically, so this works with both.
 */
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

  // Distance-from-bottom (px) still counted as "parked at the bottom".
  const THRESHOLD = 48

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
      el.scrollTo({ top: el.scrollHeight, behavior })
    },
    [resolveScrollEl],
  )

  // Track the user's scroll position → pin when parked at the bottom, release
  // the instant they scroll up.
  useEffect(() => {
    if (!contentEl) return
    const el = resolveScrollEl()
    if (!el) return
    const onScroll = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight
      const pinned = dist <= THRESHOLD
      pinnedRef.current = pinned
      setIsPinned(pinned)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [contentEl, resolveScrollEl])

  // Follow content growth (streaming text, async cards, images) while pinned.
  // A ResizeObserver catches every height change — not just React re-renders —
  // so late-loading content (sparklines, favicons) stays in view too.
  useEffect(() => {
    if (!contentEl) return
    const obs = new ResizeObserver(() => {
      if (!enabledRef.current || !pinnedRef.current) return
      const el = resolveScrollEl()
      if (el) el.scrollTop = el.scrollHeight
    })
    obs.observe(contentEl)
    return () => obs.disconnect()
  }, [contentEl, resolveScrollEl])

  return { contentRef, scrollToBottom, isPinned }
}
