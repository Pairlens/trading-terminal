// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef } from 'react'

import { cn } from '../../lib/utils'

const SIZE_THRESHOLD_SMALL = 50
const SIZE_THRESHOLD_TINY = 30
const SIZE_THRESHOLD_MEDIUM = 100

export type AiOrbProps = {
  /** CSS size value, e.g. "28px", "192px" */
  size?: string
  className?: string
  /** Override the design-system orb colors */
  colors?: {
    bg?: string
    c1?: string
    c2?: string
    c3?: string
  }
  /** Animation cycle duration in seconds */
  animationDuration?: number
  /**
   * Visual state:
   * - `idle` — a calm ball, turning once every `animationDuration`.
   * - `thinking` — the same ball, five times faster, with a glow.
   * - `detached` — the AI is somewhere else on screen (its panel is open),
   *   so the ball opens into a ring, dims, and slows almost to a stop. The
   *   socket it left behind, not a second copy of it.
   */
  state?: 'idle' | 'thinking' | 'detached'
}

function computeParams(sizeValue: number) {
  const isSmall = sizeValue < SIZE_THRESHOLD_SMALL

  const blur = isSmall
    ? Math.max(sizeValue * 0.008, 1)
    : Math.max(sizeValue * 0.015, 4)

  const contrast = isSmall
    ? Math.max(sizeValue * 0.004, 1.2)
    : Math.max(sizeValue * 0.008, 1.5)

  const dotSize = isSmall
    ? Math.max(sizeValue * 0.004, 0.05)
    : Math.max(sizeValue * 0.008, 0.1)

  const shadow = isSmall
    ? Math.max(sizeValue * 0.004, 0.5)
    : Math.max(sizeValue * 0.008, 2)

  let maskRadius: string
  if (sizeValue < SIZE_THRESHOLD_TINY) maskRadius = '0%'
  else if (sizeValue < SIZE_THRESHOLD_SMALL) maskRadius = '5%'
  else if (sizeValue < SIZE_THRESHOLD_MEDIUM) maskRadius = '15%'
  else maskRadius = '25%'

  let finalContrast: number
  if (sizeValue < SIZE_THRESHOLD_TINY) finalContrast = 1.1
  else if (sizeValue < SIZE_THRESHOLD_SMALL)
    finalContrast = Math.max(contrast * 1.2, 1.3)
  else finalContrast = contrast

  return { blur, finalContrast, dotSize, shadow, maskRadius }
}

const IDLE_RATE = 1
const THINKING_RATE = 5
// Not zero. A frozen ring reads as a broken orb; a barely-turning one reads
// as the same living thing, waiting somewhere else.
const DETACHED_RATE = 0.22
const TRANSITION_MS = 600

const PLAYBACK_RATE = {
  idle: IDLE_RATE,
  thinking: THINKING_RATE,
  detached: DETACHED_RATE,
} as const

// WebKit proper (Safari, Tauri's WKWebView) — not Chromium, whose UA also
// claims AppleWebKit. WebKit needs the .ai-orb--webkit substitute styling:
// it drops the rounded overflow clip on filtered children and never
// composites the ::after backdrop-filter gloss.
const IS_WEBKIT =
  typeof navigator !== 'undefined' &&
  /AppleWebKit/i.test(navigator.userAgent) &&
  !/Chrom/i.test(navigator.userAgent)

export function AiOrb({
  size = '192px',
  className,
  colors,
  animationDuration = 20,
  state = 'idle',
}: AiOrbProps) {
  const sizeValue = Number.parseInt(size.replace('px', ''), 10)
  const { blur, finalContrast, dotSize, shadow, maskRadius } =
    computeParams(sizeValue)

  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const rateRef = useRef(IDLE_RATE)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const targetRate = PLAYBACK_RATE[state]
    // Filter to CSSAnimation only — excludes CSS transitions on box-shadow/filter
    const animations = el
      .getAnimations({ subtree: true })
      .filter((a) => a instanceof CSSAnimation)
    if (animations.length === 0) return

    const startRate = rateRef.current
    if (startRate === targetRate) return

    const startTime = performance.now()

    function step(now: number) {
      const elapsed = now - startTime
      const t = Math.min(elapsed / TRANSITION_MS, 1)
      // ease-in-out cubic
      const eased = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
      const rate = startRate + (targetRate - startRate) * eased

      rateRef.current = rate
      for (const anim of animations) {
        anim.updatePlaybackRate(rate)
      }

      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      }
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [state])

  return (
    <div
      ref={ref}
      data-orb-state={state}
      className={cn(
        'ai-orb',
        IS_WEBKIT && 'ai-orb--webkit',
        state === 'thinking' && 'ai-orb--thinking',
        state === 'detached' && 'ai-orb--detached',
        className,
      )}
      style={
        {
          width: size,
          height: size,
          '--orb-bg-local': colors?.bg ?? 'var(--orb-bg)',
          '--orb-c1-local': colors?.c1 ?? 'var(--orb-c1)',
          '--orb-c2-local': colors?.c2 ?? 'var(--orb-c2)',
          '--orb-c3-local': colors?.c3 ?? 'var(--orb-c3)',
          '--orb-duration': `${animationDuration}s`,
          '--orb-blur': `${blur}px`,
          '--orb-contrast': finalContrast,
          '--orb-dot': `${dotSize}px`,
          '--orb-shadow': `${shadow}px`,
          '--orb-mask': maskRadius,
        } as React.CSSProperties
      }
    />
  )
}
