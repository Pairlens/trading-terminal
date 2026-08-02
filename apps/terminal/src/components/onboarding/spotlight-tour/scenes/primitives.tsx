// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Shared building blocks for section-tour Remotion scenes.
 *
 * Everything is driven by `useCurrentFrame()` so scenes are deterministic and
 * loop cleanly. Colors come from the design-system CSS variables — the Player
 * renders in the app DOM, so tokens (and theme flips) apply automatically.
 */
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

import type { CSSProperties, PropsWithChildren } from 'react'

export const SCENE_FPS = 30
export const SCENE_WIDTH = 560
export const SCENE_HEIGHT = 315

// ── Motion helpers ──────────────────────────────────────────────────

/** Spring-driven pop-in (scale + fade) starting at `delay` frames. */
export function usePop(delay: number) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.7 },
  })
  return {
    opacity: interpolate(frame - delay, [0, 6], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
    transform: `scale(${0.9 + 0.1 * progress})`,
  }
}

/** Fade + rise starting at `delay` frames. */
export function useRise(delay: number, distance = 14) {
  const frame = useCurrentFrame()
  const t = interpolate(frame - delay, [0, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (x) => 1 - (1 - x) ** 3,
  })
  return { opacity: t, transform: `translateY(${(1 - t) * distance}px)` }
}

export function Pop({
  delay = 0,
  style,
  children,
}: PropsWithChildren<{ delay?: number; style?: CSSProperties }>) {
  const pop = usePop(delay)
  return <div style={{ ...pop, ...style }}>{children}</div>
}

export function Rise({
  delay = 0,
  distance = 14,
  style,
  children,
}: PropsWithChildren<{
  delay?: number
  distance?: number
  style?: CSSProperties
}>) {
  const rise = useRise(delay, distance)
  return <div style={{ ...rise, ...style }}>{children}</div>
}

// ── Layout ──────────────────────────────────────────────────────────

/** Scene root: token-styled stage with breathing room. */
export function Stage({
  children,
  style,
}: PropsWithChildren<{ style?: CSSProperties }>) {
  return (
    <AbsoluteFill
      style={{
        fontFamily: 'var(--font-sans), system-ui, sans-serif',
        color: 'var(--foreground)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 28,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

export function Panel({
  children,
  style,
}: PropsWithChildren<{ style?: CSSProperties }>) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        boxShadow: '0 18px 40px -28px rgba(0,0,0,.6)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

export function Chip({
  children,
  tone = 'neutral',
  style,
}: PropsWithChildren<{
  tone?: 'neutral' | 'primary' | 'up' | 'down'
  style?: CSSProperties
}>) {
  const toneStyles: Record<string, CSSProperties> = {
    neutral: {
      border: '1px solid var(--border)',
      background: 'var(--card)',
      color: 'var(--muted-foreground)',
    },
    primary: {
      border:
        '1px solid color-mix(in oklch, var(--primary) 40%, var(--border))',
      background: 'color-mix(in oklch, var(--primary) 12%, transparent)',
      color: 'var(--primary)',
    },
    up: {
      border: '1px solid color-mix(in oklch, var(--up) 40%, var(--border))',
      background: 'color-mix(in oklch, var(--up) 12%, transparent)',
      color: 'var(--up)',
    },
    down: {
      border: '1px solid color-mix(in oklch, var(--down) 40%, var(--border))',
      background: 'color-mix(in oklch, var(--down) 12%, transparent)',
      color: 'var(--down)',
    },
  }
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 11px',
        borderRadius: 999,
        fontFamily: 'var(--font-mono), monospace',
        fontSize: 11.5,
        whiteSpace: 'nowrap',
        ...toneStyles[tone],
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/** Filled check badge (matches the Spotlight selected treatment). */
export function CheckDot({ size = 18 }: { size?: number }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        width: size,
        height: size,
        borderRadius: '50%',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--primary)',
        color: 'var(--primary-foreground)',
        fontSize: size * 0.55,
        fontWeight: 700,
        flex: '0 0 auto',
      }}
    >
      ✓
    </span>
  )
}

// ── Data viz ────────────────────────────────────────────────────────

/** Deterministic pseudo-price series (no Math.random — loops cleanly). */
export function seriesPoint(i: number, seed: number): number {
  return (
    Math.sin(i * 0.55 + seed) * 0.5 +
    Math.sin(i * 0.21 + seed * 2.3) * 0.3 +
    Math.sin(i * 1.4 + seed * 0.7) * 0.2
  )
}

/** SVG sparkline that draws itself in, then keeps extending. */
export function Sparkline({
  width,
  height,
  seed = 1,
  stroke = 'var(--primary)',
  drawFrames = 40,
  delay = 0,
  rising = true,
}: {
  width: number
  height: number
  seed?: number
  stroke?: string
  drawFrames?: number
  delay?: number
  rising?: boolean
}) {
  const frame = useCurrentFrame()
  const n = 32
  const pts = Array.from({ length: n }, (_, i) => {
    const trend = rising ? i / n : -i / (n * 2)
    const y = 0.5 - trend * 0.32 - seriesPoint(i, seed) * 0.14
    return [
      (i / (n - 1)) * width,
      Math.min(Math.max(y * height, 4), height - 4),
    ] as const
  })
  const d = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const pathLength = width * 1.3
  const drawn = interpolate(frame - delay, [0, drawFrames], [0, pathLength], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength - drawn}
      />
    </svg>
  )
}

/** Mini candle chart: candles grow in one by one. */
export function Candles({
  width,
  height,
  count = 14,
  delay = 0,
  perCandle = 3,
  seed = 2,
}: {
  width: number
  height: number
  count?: number
  delay?: number
  perCandle?: number
  seed?: number
}) {
  const frame = useCurrentFrame()
  const slot = width / count
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {Array.from({ length: count }, (_, i) => {
        const appear = interpolate(
          frame - delay - i * perCandle,
          [0, 8],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        )
        if (appear === 0) return null
        const a = seriesPoint(i, seed)
        const b = seriesPoint(i + 1, seed)
        const up = b >= a
        const mid = height * (0.52 - ((a + b) / 2) * 0.3 - i * 0.012)
        const bodyH = Math.max(Math.abs(b - a) * height * 0.42, 5) * appear
        const wickH = bodyH + 10 * appear
        const x = slot * i + slot / 2
        const color = up ? 'var(--up)' : 'var(--down)'
        return (
          <g key={i} opacity={appear}>
            <line
              x1={x}
              x2={x}
              y1={mid - wickH / 2}
              y2={mid + wickH / 2}
              stroke={color}
              strokeWidth={1.4}
            />
            <rect
              x={x - slot * 0.28}
              width={slot * 0.56}
              y={mid - bodyH / 2}
              height={bodyH}
              rx={1.5}
              fill={color}
            />
          </g>
        )
      })}
    </svg>
  )
}

/** Deterministic ticking price string, e.g. 67,431.20 */
export function TickingPrice({
  base,
  seed = 1,
  decimals = 2,
  style,
}: {
  base: number
  seed?: number
  decimals?: number
  style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  const value = base * (1 + seriesPoint(Math.floor(frame / 6), seed) * 0.004)
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono), monospace',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {value.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  )
}

// ── Cursor ──────────────────────────────────────────────────────────

export type CursorKeyframe = { frame: number; x: number; y: number }

/**
 * Animated pointer following keyframes; renders a click ripple whenever it
 * arrives at a keyframe flagged with `click`.
 */
export function Cursor({
  path,
  clickAt = [],
}: {
  path: Array<CursorKeyframe>
  clickAt?: Array<number>
}) {
  const frame = useCurrentFrame()
  const xs = path.map((p) => p.x)
  const ys = path.map((p) => p.y)
  const frames = path.map((p) => p.frame)
  const x = interpolate(frame, frames, xs, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => t * t * (3 - 2 * t),
  })
  const y = interpolate(frame, frames, ys, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (t) => t * t * (3 - 2 * t),
  })
  const appear = interpolate(
    frame,
    [path[0].frame - 6, path[0].frame],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    },
  )
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate(${x}px, ${y}px)`,
        opacity: appear,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {clickAt.map((clickFrame) => {
        const t = interpolate(frame - clickFrame, [0, 16], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        if (t === 0 || t === 1) return null
        return (
          <span
            key={clickFrame}
            style={{
              position: 'absolute',
              left: -14,
              top: -14,
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1.5px solid var(--primary)',
              opacity: 1 - t,
              transform: `scale(${0.4 + t})`,
            }}
          />
        )
      })}
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        style={{ display: 'block' }}
      >
        <path
          d="M5 3l14 8-6.5 1.5L9 19z"
          fill="var(--foreground)"
          stroke="var(--background)"
          strokeWidth={1.5}
        />
      </svg>
    </div>
  )
}
