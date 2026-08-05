// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Animated vignettes for the /onboarding story steps. Unlike the section-tour
 * scenes these render on a fully transparent stage — the page's aurora and
 * orb stay the hero; the vignette replaces the static value list.
 *
 * Deterministic (frame-driven) like all Remotion scenes. Copy inside scenes
 * comes from i18n via the global i18next instance.
 */
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { useTranslation } from 'react-i18next'

import {
  Candles,
  CheckDot,
  Chip,
  Panel,
  Pop,
  Rise,
  Sparkline,
  Stage,
  TickingPrice,
} from '../spotlight-tour/scenes/primitives'

import type { CSSProperties, FC } from 'react'

export const STORY_SCENE_WIDTH = 560
export const STORY_SCENE_HEIGHT = 200

const mono: CSSProperties = {
  fontFamily: 'var(--font-mono), monospace',
  fontVariantNumeric: 'tabular-nums',
}
const muted: CSSProperties = { color: 'var(--muted-foreground)' }

// ── One terminal — CEX, DEX and equities rows in a single list ──────

const MARKET_ROWS = [
  { pair: 'BTC-USDT', venue: 'OKX', tag: 'CEX', base: 67431, up: true },
  { pair: 'SOL-USDC', venue: 'Jupiter', tag: 'DEX', base: 158.4, up: true },
  { pair: 'AAPL', venue: 'Alpaca', tag: 'EQ', base: 226.1, up: false },
]

const StoryOneTerminal: FC = () => {
  return (
    <Stage style={{ padding: 12 }}>
      <Panel style={{ width: 470, overflow: 'hidden' }}>
        {MARKET_ROWS.map((row, i) => (
          <Rise key={row.pair} delay={10 + i * 12}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderBottom:
                  i < MARKET_ROWS.length - 1
                    ? '1px solid color-mix(in oklch, var(--border) 55%, transparent)'
                    : 'none',
                fontSize: 13,
              }}
            >
              <span style={{ fontWeight: 600, width: 88, ...mono }}>
                {row.pair}
              </span>
              <span style={{ fontSize: 11.5, width: 62, ...muted }}>
                {row.venue}
              </span>
              <span style={{ flex: 1 }}>
                <Sparkline
                  width={130}
                  height={20}
                  seed={row.base % 7}
                  rising={row.up}
                  stroke={row.up ? 'var(--up)' : 'var(--down)'}
                  delay={14 + i * 12}
                  drawFrames={26}
                />
              </span>
              <TickingPrice
                base={row.base}
                seed={row.base % 5}
                style={{ fontSize: 12 }}
              />
              <span
                style={{
                  width: 34,
                  textAlign: 'right',
                  fontSize: 10,
                  letterSpacing: '.06em',
                  color: 'var(--primary)',
                  ...mono,
                }}
              >
                {row.tag}
              </span>
            </div>
          </Rise>
        ))}
      </Panel>
    </Stage>
  )
}

// ── Privacy — the key drops into the local vault, the cloud gets struck ──

const StoryPrivacy: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  // The key falls from above and lands on the vault's lock. All geometry is
  // fixed/absolute — nothing reflows during the sequence.
  const drop = spring({
    frame: frame - 10,
    fps,
    config: { damping: 13, stiffness: 110, mass: 0.9 },
  })
  const keyAppear = interpolate(frame, [6, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const landed = frame >= 46
  const keyFade = interpolate(frame, [46, 56], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const ringPulse = interpolate(frame, [48, 58, 78], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const strike = interpolate(frame, [66, 82], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <Stage style={{ padding: 12 }}>
      <div style={{ position: 'relative', width: 470, height: 176 }}>
        {/* Device vault */}
        <Pop delay={2} style={{ position: 'absolute', left: 12, top: 56 }}>
          <div style={{ position: 'relative' }}>
            <Panel
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 13,
                borderColor: landed
                  ? 'color-mix(in oklch, var(--up) 45%, var(--border))'
                  : undefined,
                boxShadow:
                  ringPulse > 0
                    ? `0 0 0 ${(4 * ringPulse).toFixed(2)}px color-mix(in oklch, var(--up) ${Math.round(28 * ringPulse)}%, transparent)`
                    : undefined,
              }}
            >
              <span style={{ fontSize: 20 }}>{landed ? '🔒' : '🔓'}</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>
                  {t('onboarding.privacy.scene.device')}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, ...mono, ...muted }}>
                  {t('sectionTours.scenes.osKeychain')}
                </div>
              </div>
            </Panel>
            {landed && (
              <span style={{ position: 'absolute', right: -7, top: -7 }}>
                <CheckDot />
              </span>
            )}
            {/* The falling key — lands on the lock, then sinks into it */}
            <span
              style={{
                position: 'absolute',
                left: 17,
                top: 0,
                fontSize: 18,
                opacity: keyAppear * keyFade,
                transform: `translateY(${(-64 + drop * 76).toFixed(1)}px) rotate(${((1 - drop) * -26).toFixed(1)}deg)`,
                pointerEvents: 'none',
              }}
            >
              🔑
            </span>
          </div>
        </Pop>

        {/* Crossed-out cloud */}
        <Pop delay={10} style={{ position: 'absolute', right: 12, top: 56 }}>
          <div style={{ position: 'relative' }}>
            <Panel
              style={{
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                fontSize: 13,
                opacity: strike > 0 ? 0.45 : 0.65,
              }}
            >
              <span style={{ fontSize: 20 }}>☁️</span>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontWeight: 600 }}>
                  {t('onboarding.privacy.scene.servers')}
                </div>
                <div style={{ fontSize: 11, marginTop: 2, ...mono, ...muted }}>
                  {t('onboarding.privacy.scene.never')}
                </div>
              </div>
            </Panel>
            <svg
              width="100%"
              height="100%"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <line
                x1={10}
                y1={85}
                x2={10 + 80 * strike}
                y2={85 - 70 * strike}
                stroke="var(--down)"
                strokeWidth={2.5}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        </Pop>
      </div>
    </Stage>
  )
}

// ── Direct routing — orders bypass the middleman to real venues ─────

/**
 * Compact venue marks drawn locally — the first-run page must work offline
 * and inside the desktop CSP, so no remote logo CDNs. Brand-inspired
 * stylizations, not exact assets.
 */
function VenueMark({ venue }: { venue: string }) {
  if (venue === 'OKX') {
    // Checkerboard X of five squares
    const filled = new Set([0, 2, 4, 6, 8])
    return (
      <span
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 4px)',
          gridTemplateRows: 'repeat(3, 4px)',
          flex: '0 0 auto',
        }}
      >
        {Array.from({ length: 9 }, (_, i) => (
          <span
            key={i}
            style={{
              background: filled.has(i) ? 'var(--foreground)' : 'transparent',
            }}
          />
        ))}
      </span>
    )
  }
  if (venue === 'Binance') {
    // Five gold diamonds
    const cells: Array<[number, number]> = [
      [5, 0],
      [0, 5],
      [5, 5],
      [10, 5],
      [5, 10],
    ]
    return (
      <span
        style={{
          position: 'relative',
          width: 14,
          height: 14,
          flex: '0 0 auto',
        }}
      >
        {cells.map(([x, y]) => (
          <span
            key={`${x}-${y}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 4,
              height: 4,
              background: '#f3ba2f',
              transform: 'rotate(45deg)',
            }}
          />
        ))}
      </span>
    )
  }
  if (venue === 'Coinbase') {
    return (
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: '50%',
          background: '#0052ff',
          color: '#fff',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8.5,
          fontWeight: 700,
          flex: '0 0 auto',
        }}
      >
        C
      </span>
    )
  }
  // Jupiter — ringed planet
  return (
    <span
      style={{
        position: 'relative',
        width: 13,
        height: 13,
        flex: '0 0 auto',
      }}
    >
      <span
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #19d3aa, #c7f284)',
        }}
      />
      <span
        style={{
          position: 'absolute',
          left: -1,
          right: -1,
          top: 5,
          height: 3,
          borderRadius: '50%',
          border: '1px solid rgba(199, 242, 132, .9)',
          transform: 'rotate(-18deg)',
        }}
      />
    </span>
  )
}

const ROUTE_VENUES = ['OKX', 'Binance', 'Coinbase', 'Jupiter']

const StoryRouting: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const width = 480
  const height = 176
  const startX = 128
  const startY = height / 2
  const endX = width - 112
  const rowH = height / ROUTE_VENUES.length
  return (
    <Stage style={{ padding: 12 }}>
      <div style={{ position: 'relative', width, height }}>
        {/* Edges + traveling order pulses */}
        <svg
          width={width}
          height={height}
          style={{ position: 'absolute', inset: 0 }}
        >
          {ROUTE_VENUES.map((venue, i) => {
            const endY = rowH * i + rowH / 2
            const draw = interpolate(frame - 26 - i * 5, [0, 18], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
            const pathLen = 300
            // Order pulse loops along the edge once drawn.
            const pulseT = ((frame - 52 - i * 9) / 46) % 1
            const showPulse = frame - 52 - i * 9 > 0 && pulseT >= 0
            const cx = startX + (endX - startX) * pulseT
            // Quadratic bezier point (control pulls toward the center row)
            const cyCtrl = startY + (endY - startY) * 0.15
            const py =
              (1 - pulseT) * (1 - pulseT) * startY +
              2 * (1 - pulseT) * pulseT * cyCtrl +
              pulseT * pulseT * endY
            return (
              <g key={venue}>
                <path
                  d={`M ${startX} ${startY} Q ${(startX + endX) / 2} ${cyCtrl} ${endX} ${endY}`}
                  fill="none"
                  stroke="color-mix(in oklch, var(--primary) 55%, transparent)"
                  strokeWidth={1.4}
                  strokeDasharray={`${pathLen}`}
                  strokeDashoffset={pathLen - pathLen * draw}
                />
                {showPulse && draw === 1 && (
                  <circle
                    cx={cx}
                    cy={py}
                    r={3}
                    fill="var(--primary)"
                    opacity={interpolate(
                      pulseT,
                      [0, 0.1, 0.9, 1],
                      [0, 1, 1, 0],
                    )}
                  />
                )}
              </g>
            )
          })}
        </svg>

        {/* Source node — explicitly the user's own machine */}
        <Pop
          delay={6}
          style={{
            position: 'absolute',
            left: 0,
            top: startY - 28,
          }}
        >
          <Panel
            style={{
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              borderColor:
                'color-mix(in oklch, var(--primary) 40%, var(--border))',
            }}
          >
            <span style={{ fontSize: 18 }}>💻</span>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Pairlens</div>
              <div
                style={{
                  fontSize: 10,
                  marginTop: 1,
                  letterSpacing: '.06em',
                  textTransform: 'uppercase',
                  ...mono,
                  ...muted,
                }}
              >
                {t('onboarding.routing.scene.device')}
              </div>
            </div>
          </Panel>
        </Pop>

        {/* Bypassed middleman */}
        <Rise
          delay={78}
          style={{
            position: 'absolute',
            left: '50%',
            top: height - 28,
            transform: 'translateX(-50%)',
          }}
        >
          <Chip
            style={{
              textDecoration: 'line-through',
              textDecorationColor: 'var(--down)',
              opacity: 0.75,
            }}
          >
            {t('onboarding.routing.scene.middleman')}
          </Chip>
        </Rise>

        {/* Venue chips */}
        {ROUTE_VENUES.map((venue, i) => (
          <Pop
            key={venue}
            delay={30 + i * 5}
            style={{
              position: 'absolute',
              right: 0,
              top: rowH * i + rowH / 2 - 14,
            }}
          >
            <Chip style={{ paddingLeft: 8 }}>
              <VenueMark venue={venue} />
              {venue}
            </Chip>
          </Pop>
        ))}
      </div>
    </Stage>
  )
}

// ── Co-pilot — verdicts land, the guardrail you drew holds ──────────

const StoryCopilot: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const guardrailOpacity = interpolate(frame, [30, 44], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <Stage style={{ padding: 12 }}>
      <div style={{ position: 'relative', width: 470, height: 176 }}>
        <Panel style={{ width: '100%', height: '100%', padding: 14 }}>
          <Sparkline
            width={442}
            height={110}
            seed={5}
            delay={4}
            drawFrames={64}
          />
          {/* Guardrail the user just drew */}
          <div
            style={{
              position: 'absolute',
              left: 14,
              right: 14,
              top: 34,
              borderTop:
                '1.5px dashed color-mix(in oklch, var(--down) 60%, transparent)',
              opacity: guardrailOpacity,
            }}
          />
          <span
            style={{
              position: 'absolute',
              right: 20,
              top: 20,
              fontSize: 10,
              color: 'var(--down)',
              opacity: guardrailOpacity,
              ...mono,
            }}
          >
            {t('onboarding.copilot.scene.guardrail')}
          </span>
        </Panel>
        <Pop delay={48} style={{ position: 'absolute', left: 92, top: 96 }}>
          <Chip tone="up">▲ APPROVE</Chip>
        </Pop>
        <Pop delay={70} style={{ position: 'absolute', left: 236, top: 66 }}>
          <Chip tone="primary">● WATCH</Chip>
        </Pop>
        <Pop delay={94} style={{ position: 'absolute', right: 18, top: 40 }}>
          <Chip tone="down">✕ BLOCK</Chip>
        </Pop>
      </div>
    </Stage>
  )
}

// ── Workspaces — one clean pane grows into a full pro desk ──────────

const StoryWorkspaces: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const width = 470
  const paneAreaHeight = 176
  const morph = interpolate(frame, [56, 78], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (x) => 1 - (1 - x) ** 3,
  })
  const sidePop = interpolate(frame, [64, 80], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const bottomPop = interpolate(frame, [72, 88], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const chartWidth = width - morph * (width * 0.38 + 10)
  const chartHeight = paneAreaHeight - morph * 52
  // New panes announce themselves in the flow's own language: the primary
  // "selected" ring flashes on arrival, then settles.
  const arrivalRing = (start: number): string | undefined => {
    const p = interpolate(frame, [start, start + 8, start + 42], [0, 1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
    if (p === 0) return undefined
    return `inset 0 0 0 1.5px color-mix(in oklch, var(--primary) ${Math.round(85 * p)}%, transparent), 0 0 0 4px color-mix(in oklch, var(--primary) ${Math.round(16 * p)}%, transparent), 0 18px 40px -28px rgba(0,0,0,.6)`
  }
  const paneLabel: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10.5,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    ...mono,
    ...muted,
  }
  return (
    <Stage style={{ padding: 12 }}>
      <div style={{ position: 'relative', width, height: paneAreaHeight }}>
        {/* Chart pane — candles keep growing while the desk builds around it */}
        <Pop
          delay={6}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: chartWidth,
            height: chartHeight,
          }}
        >
          <Panel
            style={{
              width: '100%',
              height: '100%',
              padding: '10px 14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 6,
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                fontSize: 10.5,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                ...mono,
                ...muted,
              }}
            >
              {t('panes.chart')}
            </span>
            <Candles
              width={Math.max(chartWidth - 28, 80)}
              height={Math.max(chartHeight - 48, 40)}
              delay={12}
              count={12}
              perCandle={3}
            />
          </Panel>
        </Pop>
        <div
          style={{
            position: 'absolute',
            left: chartWidth + 10,
            top: 0,
            width: width - chartWidth - 10,
            height: chartHeight * 0.55 - 5,
            opacity: sidePop,
          }}
        >
          <Panel style={{ ...paneLabel, boxShadow: arrivalRing(64) }}>
            {t('panes.orderBook')}
          </Panel>
        </div>
        <div
          style={{
            position: 'absolute',
            left: chartWidth + 10,
            top: chartHeight * 0.55 + 5,
            width: width - chartWidth - 10,
            height: chartHeight * 0.45 - 5,
            opacity: sidePop,
          }}
        >
          <Panel style={{ ...paneLabel, boxShadow: arrivalRing(70) }}>
            {t('panes.trades')}
          </Panel>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: chartHeight + 10,
            width,
            height: paneAreaHeight - chartHeight - 10,
            opacity: bottomPop,
            transform: `translateY(${(1 - bottomPop) * 10}px)`,
          }}
        >
          <Panel style={{ ...paneLabel, boxShadow: arrivalRing(78) }}>
            {t('panes.positions')}
          </Panel>
        </div>
      </div>
    </Stage>
  )
}

// ── Registry ────────────────────────────────────────────────────────

export type StorySceneId =
  | 'oneTerminal'
  | 'privacy'
  | 'routing'
  | 'copilot'
  | 'workspaces'

export const STORY_SCENES: Record<
  StorySceneId,
  { component: FC; durationInFrames: number }
> = {
  oneTerminal: { component: StoryOneTerminal, durationInFrames: 130 },
  privacy: { component: StoryPrivacy, durationInFrames: 120 },
  routing: { component: StoryRouting, durationInFrames: 150 },
  copilot: { component: StoryCopilot, durationInFrames: 140 },
  workspaces: { component: StoryWorkspaces, durationInFrames: 150 },
}
