// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Section-tour showcase scenes. One looping Remotion composition per tour
 * step, registered in `SCENES` and referenced from `section-tours.ts` by id.
 *
 * Scenes animate stylized mocks of the page's real UI (pair rows, candles,
 * workflow nodes…) so each dialog *shows* what the page does instead of only
 * telling. Keep everything deterministic — no Date.now/Math.random.
 */
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { useTranslation } from 'react-i18next'

import {
  Candles,
  CheckDot,
  Chip,
  Cursor,
  Panel,
  Pop,
  Rise,
  Sparkline,
  Stage,
  TickingPrice,
  seriesPoint,
  usePop,
} from './primitives'

import type { CSSProperties, FC, ReactNode } from 'react'
import type { SectionTourSceneId } from '../../section-tours'

const mono: CSSProperties = {
  fontFamily: 'var(--font-mono), monospace',
  fontVariantNumeric: 'tabular-nums',
}
const muted: CSSProperties = { color: 'var(--muted-foreground)' }

// ── Pairs ───────────────────────────────────────────────────────────

const PAIR_ROWS = [
  { pair: 'BTC-USDT', base: 67431, up: true, delta: '+2.4%' },
  { pair: 'ETH-USDT', base: 3521, up: true, delta: '+1.1%' },
  { pair: 'SOL-USDT', base: 158.4, up: false, delta: '−0.8%' },
  { pair: 'AAPL', base: 226.1, up: true, delta: '+0.6%' },
]

function PairRow({
  row,
  delay,
  starred = false,
  starDelay,
}: {
  row: (typeof PAIR_ROWS)[number]
  delay: number
  starred?: boolean
  starDelay?: number
}) {
  const frame = useCurrentFrame()
  const starOn = starred && starDelay !== undefined ? frame >= starDelay : false
  return (
    <Rise delay={delay}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '10px 14px',
          borderBottom:
            '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: 'color-mix(in oklch, var(--primary) 14%, transparent)',
            color: 'var(--primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            ...mono,
          }}
        >
          {row.pair.slice(0, 1)}
        </span>
        <span style={{ fontWeight: 600, width: 92, ...mono }}>{row.pair}</span>
        <span style={{ flex: 1 }}>
          <Sparkline
            width={120}
            height={22}
            seed={row.base % 7}
            rising={row.up}
            stroke={row.up ? 'var(--up)' : 'var(--down)'}
            delay={delay + 4}
            drawFrames={26}
          />
        </span>
        <TickingPrice
          base={row.base}
          seed={row.base % 5}
          style={{ fontSize: 12.5 }}
        />
        <span
          style={{
            width: 52,
            textAlign: 'right',
            color: row.up ? 'var(--up)' : 'var(--down)',
            fontSize: 12,
            ...mono,
          }}
        >
          {row.delta}
        </span>
        <span
          style={{
            fontSize: 13,
            color: starOn ? 'var(--primary)' : 'var(--muted-foreground)',
            transform: starOn ? 'scale(1.25)' : 'scale(1)',
            transition: 'none',
          }}
        >
          {starOn ? '★' : '☆'}
        </span>
      </div>
    </Rise>
  )
}

/** Rows of live pairs stream in; a cursor sweeps over them. */
const PairsDiscover: FC = () => {
  const { t } = useTranslation()
  return (
    <Stage>
      <Panel style={{ width: 470, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '11px 14px',
            fontSize: 11,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            ...mono,
            ...muted,
          }}
        >
          <span>{t('panes.markets')}</span>
          <span>{t('topCoins.col24h')}</span>
        </div>
        {PAIR_ROWS.map((row, i) => (
          <PairRow key={row.pair} row={row} delay={8 + i * 7} />
        ))}
      </Panel>
      <Cursor
        path={[
          { frame: 42, x: 420, y: 240 },
          { frame: 66, x: 250, y: 128 },
          { frame: 92, x: 250, y: 128 },
        ]}
      />
    </Stage>
  )
}

/** Starring pairs builds a watchlist; mover chips pop in. */
const PairsWatchlist: FC = () => {
  const { t } = useTranslation()
  return (
    <Stage style={{ flexDirection: 'column', gap: 14 }}>
      <Panel style={{ width: 470, overflow: 'hidden' }}>
        <PairRow row={PAIR_ROWS[0]} delay={4} starred starDelay={40} />
        <PairRow row={PAIR_ROWS[2]} delay={10} starred starDelay={58} />
      </Panel>
      <Rise delay={68} style={{ display: 'flex', gap: 8 }}>
        <Chip tone="up">
          ▲ {t('sectionTours.scenes.topMover', { pair: 'SOL', delta: '+9.2%' })}
        </Chip>
        <Chip tone="primary">
          ★ {t('sectionTours.scenes.watchlistCount', { count: 2 })}
        </Chip>
      </Rise>
      <Cursor
        path={[
          { frame: 20, x: 440, y: 250 },
          { frame: 38, x: 448, y: 96 },
          { frame: 50, x: 448, y: 96 },
          { frame: 56, x: 448, y: 140 },
          { frame: 70, x: 448, y: 140 },
        ]}
        clickAt={[40, 58]}
      />
    </Stage>
  )
}

// ── Charts ──────────────────────────────────────────────────────────

/** Candles stream in; a crosshair sweeps across the chart. */
const ChartsCandles: FC = () => {
  const frame = useCurrentFrame()
  const crossX = interpolate(frame, [55, 105], [40, 380], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const crossOpacity = interpolate(frame, [50, 58, 100, 108], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <Stage>
      <Panel style={{ width: 460, padding: 16, position: 'relative' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 8,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13, ...mono }}>
            BTC-USDT · 1h
          </span>
          <TickingPrice
            base={67431}
            style={{ fontSize: 12.5, color: 'var(--up)' }}
          />
        </div>
        <Candles width={424} height={150} delay={6} />
        <div
          style={{
            position: 'absolute',
            top: 44,
            bottom: 18,
            left: crossX,
            width: 1,
            background:
              'color-mix(in oklch, var(--muted-foreground) 45%, transparent)',
            opacity: crossOpacity,
          }}
        />
      </Panel>
    </Stage>
  )
}

/** A candle closes (pulse on the last candle) and signals land in the feed. */
const ChartsSignals: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const candleCount = 16
  const chartWidth = 428
  // The last candle finishes around frame 38 — pulse it, then feed rows land.
  const pulse = interpolate(frame, [40, 50, 66], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const feedRow = (
    delay: number,
    chip: ReactNode,
    label: string,
    market: string,
  ) => (
    <Rise delay={delay}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '9px 16px',
          borderTop:
            '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
          fontSize: 12,
        }}
      >
        {chip}
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{ ...muted, fontSize: 11.5 }}>{market}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, ...mono, ...muted }}>
          {t('sectionTours.scenes.onClose')}
        </span>
      </div>
    </Rise>
  )
  return (
    <Stage>
      <Panel style={{ width: 460, overflow: 'hidden' }}>
        <div style={{ position: 'relative', padding: '14px 16px 8px' }}>
          <Candles
            width={chartWidth}
            height={104}
            delay={0}
            count={candleCount}
            perCandle={2}
          />
          <span
            style={{
              position: 'absolute',
              top: 10,
              bottom: 4,
              left: 16 + chartWidth - chartWidth / candleCount - 2,
              width: chartWidth / candleCount + 4,
              borderRadius: 6,
              background: 'color-mix(in oklch, var(--up) 16%, transparent)',
              boxShadow:
                'inset 0 0 0 1px color-mix(in oklch, var(--up) 55%, transparent)',
              opacity: pulse,
            }}
          />
        </div>
        {feedRow(
          56,
          <Chip tone="up">▲ APPROVE</Chip>,
          t('sectionTours.scenes.signalBreakout'),
          'BTC-USDT · 1h',
        )}
        {feedRow(
          82,
          <Chip tone="primary">● WATCH</Chip>,
          t('sectionTours.scenes.signalPullbackForming'),
          'ETH-USDT · 4h',
        )}
      </Panel>
    </Stage>
  )
}

// ── Notifications ───────────────────────────────────────────────────

/** Price crosses a dashed threshold → alert card slides in. */
const AlertsTrigger: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const flash = interpolate(frame, [56, 62, 84], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <Stage style={{ flexDirection: 'column', gap: 12 }}>
      <Panel style={{ width: 440, padding: 16, position: 'relative' }}>
        <Sparkline width={404} height={90} delay={4} drawFrames={56} seed={3} />
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            top: 40,
            borderTop:
              '1.5px dashed color-mix(in oklch, var(--primary) 65%, transparent)',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: 20,
            top: 26,
            fontSize: 10.5,
            color: 'var(--primary)',
            ...mono,
          }}
        >
          $68,000
        </span>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 14,
            boxShadow: `inset 0 0 0 1.5px color-mix(in oklch, var(--primary) ${Math.round(flash * 70)}%, transparent)`,
          }}
        />
      </Panel>
      <Pop delay={60}>
        <Panel
          style={{
            width: 440,
            padding: '11px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 12.5,
          }}
        >
          <span style={{ fontSize: 15 }}>🔔</span>
          <span style={{ fontWeight: 600, ...mono }}>BTC-USDT</span>
          <span style={muted}>
            {t('sectionTours.scenes.crossedAbovePrice', { price: '$68,000' })}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 11, ...mono, ...muted }}>
            {t('time.justNow')}
          </span>
        </Panel>
      </Pop>
    </Stage>
  )
}

/** Condition chips assemble into a rule. */
const AlertsCompose: FC = () => {
  const { t } = useTranslation()
  return (
    <Stage style={{ flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Pop delay={8}>
          <Chip tone="primary">BTC-USDT</Chip>
        </Pop>
        <Rise delay={22} style={{ ...muted, fontSize: 13 }}>
          +
        </Rise>
        <Pop delay={26}>
          <Chip>{t('sectionTours.scenes.conditionCrossesAbove')}</Chip>
        </Pop>
        <Rise delay={40} style={{ ...muted, fontSize: 13 }}>
          +
        </Rise>
        <Pop delay={44}>
          <Chip tone="up">$68,000</Chip>
        </Pop>
      </div>
      <Rise delay={62} style={{ fontSize: 20 }}>
        ↓
      </Rise>
      <Pop delay={70}>
        <Panel
          style={{
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}
        >
          <span style={{ fontSize: 15 }}>🔔</span>
          <span>{t('sectionTours.scenes.notifyMeDesktopInApp')}</span>
          <CheckDot />
        </Panel>
      </Pop>
    </Stage>
  )
}

// ── Workflows ───────────────────────────────────────────────────────

function FlowNode({
  label,
  sub,
  tone,
  style,
}: {
  label: string
  sub: string
  tone: 'primary' | 'neutral' | 'up'
  style?: CSSProperties
}) {
  return (
    <Panel
      style={{
        padding: '10px 14px',
        width: 128,
        borderColor:
          tone === 'primary'
            ? 'color-mix(in oklch, var(--primary) 45%, var(--border))'
            : tone === 'up'
              ? 'color-mix(in oklch, var(--up) 45%, var(--border))'
              : undefined,
        ...style,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
          ...mono,
          ...muted,
        }}
      >
        {sub}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>
        {label}
      </div>
    </Panel>
  )
}

/** Trigger → condition → action nodes connect with animated edges. */
const WorkflowsGraph: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const edge = (delay: number) =>
    interpolate(frame - delay, [0, 16], [0, 44], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  const runPulse = interpolate(frame, [92, 100, 116], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <Stage>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <Pop delay={6}>
          <FlowNode
            sub={t('sectionTours.scenes.nodeTrigger')}
            label={t('sectionTours.scenes.nodeSignalLabel', {
              signal: t('sectionTours.scenes.signalBreakout'),
            })}
            tone="primary"
          />
        </Pop>
        <svg width={44} height={2} style={{ overflow: 'visible' }}>
          <line
            x1={0}
            y1={1}
            x2={edge(24)}
            y2={1}
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </svg>
        <Pop delay={36}>
          <FlowNode
            sub={t('sectionTours.scenes.nodeCondition')}
            label={t('sectionTours.scenes.nodeVolumeAboveAvg')}
            tone="neutral"
          />
        </Pop>
        <svg width={44} height={2} style={{ overflow: 'visible' }}>
          <line
            x1={0}
            y1={1}
            x2={edge(54)}
            y2={1}
            stroke="var(--primary)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        </svg>
        <Pop delay={66}>
          <div style={{ position: 'relative' }}>
            <FlowNode
              sub={t('sectionTours.scenes.nodeAction')}
              label={t('sectionTours.scenes.nodeAlertAndJournal')}
              tone="up"
            />
            <span
              style={{
                position: 'absolute',
                inset: -4,
                borderRadius: 18,
                border: '1.5px solid var(--up)',
                opacity: runPulse,
                transform: `scale(${1 + runPulse * 0.06})`,
              }}
            />
          </div>
        </Pop>
      </div>
    </Stage>
  )
}

/** Run history fills with green ticks. */
const WorkflowsRuns: FC = () => {
  const { t } = useTranslation()
  const runs = [
    { label: t('sectionTours.scenes.runBreakoutWatcher'), time: '09:32' },
    { label: t('sectionTours.scenes.runDcaBuyer'), time: '10:00' },
    { label: t('sectionTours.scenes.runStopLossGuard'), time: '10:14' },
  ]
  return (
    <Stage>
      <Panel style={{ width: 420, overflow: 'hidden' }}>
        {runs.map((run, i) => (
          <Rise key={run.label} delay={10 + i * 16}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 14px',
                borderBottom:
                  '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
                fontSize: 12.5,
              }}
            >
              <Pop delay={20 + i * 16}>
                <CheckDot />
              </Pop>
              <span style={{ fontWeight: 600 }}>{run.label}</span>
              <span
                style={{ marginLeft: 'auto', ...mono, ...muted, fontSize: 11 }}
              >
                {t('sectionTours.scenes.ranAt', { time: run.time })}
              </span>
            </div>
          </Rise>
        ))}
      </Panel>
    </Stage>
  )
}

// ── Indicators ──────────────────────────────────────────────────────

type CodeToken = { text: string; color?: string }

const PY_KEYWORD = 'var(--primary)'
const PY_STRING = 'var(--up)'

/** Compact Python indicator script, shaped like the real SDK's RSI template. */
const INDICATOR_SCRIPT: Array<Array<CodeToken>> = [
  [
    { text: 'from', color: PY_KEYWORD },
    { text: ' pairlens ' },
    { text: 'import', color: PY_KEYWORD },
    { text: ' indicator, series' },
  ],
  [
    { text: 'meta = indicator(title=' },
    { text: "'RSI'", color: PY_STRING },
    { text: ', pane=' },
    { text: "'sub'", color: PY_STRING },
    { text: ')' },
  ],
  [],
  [{ text: 'def', color: PY_KEYWORD }, { text: ' compute(ctx):' }],
  [{ text: '    rs = gains(ctx.close) / losses(ctx.close)' }],
  [
    { text: '    ' },
    { text: 'return', color: PY_KEYWORD },
    { text: " {'rsi': 100 - 100 / (1 + rs)}" },
  ],
]

/** Syntax-tinted code block that types itself in, caret included. */
function TypedCode({
  lines,
  delay = 0,
  charsPerFrame = 2.4,
}: {
  lines: Array<Array<CodeToken>>
  delay?: number
  charsPerFrame?: number
}) {
  const frame = useCurrentFrame()
  const shown = Math.max(0, (frame - delay) * charsPerFrame)
  const lengths = lines.map((line) =>
    line.reduce((sum, token) => sum + token.text.length, 0),
  )
  const starts: Array<number> = []
  let acc = 0
  for (const length of lengths) {
    starts.push(acc)
    acc += length
  }
  const done = shown >= acc
  // Caret sits on the line being typed; once done it blinks on the last line.
  let caretIndex = lines.findIndex(
    (_, i) => lengths[i] > 0 && shown < starts[i] + lengths[i],
  )
  if (caretIndex === -1) {
    caretIndex =
      lengths.length - 1 - [...lengths].reverse().findIndex((l) => l > 0)
  }
  return (
    <div
      style={{ ...mono, fontSize: 11.5, lineHeight: '17px', whiteSpace: 'pre' }}
    >
      {lines.map((line, li) => {
        const revealed = Math.min(Math.max(shown - starts[li], 0), lengths[li])
        let used = 0
        return (
          <div key={li} style={{ minHeight: 17 }}>
            {line.map((token, ti) => {
              const take = Math.min(
                Math.max(revealed - used, 0),
                token.text.length,
              )
              used += token.text.length
              if (take === 0) return null
              return (
                <span
                  key={ti}
                  style={{ color: token.color ?? 'var(--foreground)' }}
                >
                  {token.text.slice(0, Math.round(take))}
                </span>
              )
            })}
            {li === caretIndex && (
              <span
                style={{
                  display: 'inline-block',
                  width: 6,
                  height: 12,
                  marginLeft: 1,
                  verticalAlign: -1,
                  background: 'var(--primary)',
                  opacity: !done || frame % 32 < 16 ? 0.9 : 0,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

/** RSI-like oscillator with overbought/oversold bands, drawing itself in. */
function RsiStrip({
  width,
  height,
  delay,
  drawFrames = 44,
}: {
  width: number
  height: number
  delay: number
  drawFrames?: number
}) {
  const frame = useCurrentFrame()
  const n = 40
  const pts = Array.from({ length: n }, (_, i) => {
    const osc = Math.sin(i * 0.42 + 1.4) * 0.55 + seriesPoint(i, 5) * 0.35
    const y = height * 0.5 - osc * height * 0.36
    return [
      (i / (n - 1)) * width,
      Math.min(Math.max(y, 4), height - 4),
    ] as const
  })
  const d = pts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const pathLength = width * 1.4
  const drawn = interpolate(frame - delay, [0, drawFrames], [0, pathLength], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  const bands = interpolate(frame - delay, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <line
        x1={0}
        x2={width}
        y1={height * 0.22}
        y2={height * 0.22}
        stroke="var(--down)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.55 * bands}
      />
      <line
        x1={0}
        x2={width}
        y1={height * 0.78}
        y2={height * 0.78}
        stroke="var(--up)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.55 * bands}
      />
      <path
        d={d}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength - drawn}
      />
    </svg>
  )
}

/** A Python script types itself in; the preview strip runs it live. */
const IndicatorsCode: FC = () => {
  const { t } = useTranslation()
  return (
    <Stage>
      <Panel style={{ width: 440, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '9px 14px',
            borderBottom:
              '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
          }}
        >
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 11,
              ...mono,
              ...muted,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: 'var(--primary)',
              }}
            />
            my_rsi.py
          </span>
          <Pop delay={118}>
            <Chip tone="up" style={{ padding: '3px 9px', fontSize: 10.5 }}>
              <CheckDot size={12} /> {t('sectionTours.scenes.runsLocally')}
            </Chip>
          </Pop>
        </div>
        <div style={{ padding: '11px 14px' }}>
          <TypedCode lines={INDICATOR_SCRIPT} delay={8} />
        </div>
        <div
          style={{
            borderTop:
              '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
            padding: '8px 14px 12px',
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              marginBottom: 4,
              ...mono,
              ...muted,
            }}
          >
            Preview · RSI
          </div>
          <RsiStrip width={408} height={52} delay={84} />
        </div>
      </Panel>
    </Stage>
  )
}

/** Indicator line + up/down histogram springing up in a chart sub-pane. */
function OscPane({
  width,
  height,
  delay,
}: {
  width: number
  height: number
  delay: number
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const n = 26
  const slot = width / n
  const mid = height * 0.56
  const linePts = Array.from({ length: n }, (_, i) => {
    const osc = Math.sin(i * 0.5 + 2) * 0.5 + Math.sin(i * 0.23) * 0.5
    return [
      slot * i + slot / 2,
      Math.min(Math.max(mid - osc * height * 0.3, 3), height - 3),
    ] as const
  })
  const d = linePts
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ')
  const pathLength = width * 1.3
  const drawn = interpolate(frame - delay - 8, [0, 36], [0, pathLength], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <line
        x1={0}
        x2={width}
        y1={mid}
        y2={mid}
        stroke="var(--muted-foreground)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.35}
      />
      {linePts.map(([x], i) => {
        const value = seriesPoint(i, 7)
        const grow = spring({
          frame: frame - delay - i * 1.5,
          fps,
          config: { damping: 13, stiffness: 150, mass: 0.6 },
        })
        const barH = Math.abs(value) * height * 0.5 * grow
        return (
          <rect
            key={i}
            x={x - slot * 0.24}
            width={slot * 0.48}
            y={value >= 0 ? mid - barH : mid}
            height={barH}
            rx={1}
            fill={value >= 0 ? 'var(--up)' : 'var(--down)'}
            opacity={0.75}
          />
        )
      })}
      <path
        d={d}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={pathLength}
        strokeDashoffset={pathLength - drawn}
      />
    </svg>
  )
}

/** Picking "Custom" on a chart slides the indicator into its own sub-pane. */
const IndicatorsChart: FC = () => {
  const frame = useCurrentFrame()
  const paneIn = interpolate(frame - 56, [0, 18], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (x) => 1 - (1 - x) ** 3,
  })
  return (
    <Stage>
      <Panel style={{ width: 460, padding: 16 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 13, ...mono }}>
            ETH-USDT · 1h
          </span>
          <Pop delay={26}>
            <Chip tone="primary" style={{ padding: '4px 10px', fontSize: 11 }}>
              ƒ Custom · RSI
            </Chip>
          </Pop>
        </div>
        <Candles width={428} height={92} delay={4} count={16} perCandle={2} />
        <div
          style={{
            height: 68,
            marginTop: 8,
            overflow: 'hidden',
            borderTop:
              '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
          }}
        >
          <div
            style={{
              transform: `translateY(${(1 - paneIn) * 68}px)`,
              opacity: paneIn,
            }}
          >
            <div
              style={{
                fontSize: 9.5,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                padding: '4px 0 3px',
                ...mono,
                ...muted,
              }}
            >
              Custom · RSI
            </div>
            <OscPane width={428} height={46} delay={62} />
          </div>
        </div>
      </Panel>
      <Cursor
        path={[
          { frame: 18, x: 200, y: 262 },
          { frame: 40, x: 436, y: 72 },
          { frame: 64, x: 436, y: 72 },
          { frame: 86, x: 330, y: 228 },
        ]}
        clickAt={[44]}
      />
    </Stage>
  )
}

// ── Accounts ────────────────────────────────────────────────────────

/** Venue connects; the key stays in a local vault. */
const AccountsConnect: FC = () => {
  const { t } = useTranslation()
  return (
    <Stage style={{ flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        {['Coinbase', 'Kraken', 'Jupiter'].map((venue, i) => (
          <Pop key={venue} delay={6 + i * 8}>
            <Chip tone={i === 0 ? 'primary' : 'neutral'}>{venue}</Chip>
          </Pop>
        ))}
      </div>
      <Pop delay={36}>
        <Panel
          style={{
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            fontSize: 12.5,
          }}
        >
          <span style={{ fontSize: 18 }}>🔑</span>
          <span style={{ ...mono, letterSpacing: '.12em', ...muted }}>
            ••••••••••••
          </span>
          <span style={{ fontSize: 16 }}>→</span>
          <span style={{ fontSize: 18 }}>🔒</span>
          <span style={{ fontWeight: 600 }}>
            {t('sectionTours.scenes.osKeychain')}
          </span>
        </Panel>
      </Pop>
      <Rise delay={64}>
        <Chip tone="up">
          <CheckDot size={13} /> {t('sectionTours.scenes.storedOnDevice')}
        </Chip>
      </Rise>
    </Stage>
  )
}

/** Balances fill in across venues. */
const AccountsBalances: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const rows = [
    { venue: 'Coinbase', pct: 0.72, amount: '$12,940' },
    { venue: 'Kraken', pct: 0.44, amount: '$7,215' },
    {
      venue: t('sectionTours.scenes.chainWallet', { chain: 'Solana' }),
      pct: 0.28,
      amount: '$4,530',
    },
  ]
  return (
    <Stage>
      <Panel
        style={{
          width: 420,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 13,
        }}
      >
        {rows.map((row, i) => {
          const grow = interpolate(frame - 12 - i * 12, [0, 24], [0, row.pct], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: (x) => 1 - (1 - x) ** 3,
          })
          return (
            <Rise key={row.venue} delay={8 + i * 12}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  marginBottom: 5,
                }}
              >
                <span style={{ fontWeight: 600 }}>{row.venue}</span>
                <span style={{ ...mono, ...muted }}>{row.amount}</span>
              </div>
              <div
                style={{
                  height: 7,
                  borderRadius: 4,
                  background:
                    'color-mix(in oklch, var(--border) 60%, transparent)',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${grow * 100}%`,
                    borderRadius: 4,
                    background: 'var(--primary)',
                  }}
                />
              </div>
            </Rise>
          )
        })}
      </Panel>
    </Stage>
  )
}

// ── Plugins ─────────────────────────────────────────────────────────

/** OKX logomark — five squares in a checkerboard X. */
function OkxMark() {
  const filled = new Set([0, 2, 4, 6, 8])
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 6px)',
        gridTemplateRows: 'repeat(3, 6px)',
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
    </div>
  )
}

/** Theme swatch — vertical bars of the Nord palette (brand colors). */
function NordSwatch() {
  const palette = ['#2e3440', '#88c0d0', '#a3be8c', '#bf616a']
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {palette.map((color) => (
        <span
          key={color}
          style={{
            width: 4.5,
            height: 17,
            borderRadius: 3,
            background: color,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.14)',
          }}
        />
      ))}
    </div>
  )
}

/** Grid-bot motif — price levels with alternating buy/sell fills. */
function GridBotMark() {
  return (
    <svg width={20} height={18} style={{ display: 'block' }}>
      {[3, 9, 15].map((y, i) => (
        <g key={y}>
          <line
            x1={0}
            x2={20}
            y1={y}
            y2={y}
            stroke="var(--muted-foreground)"
            strokeWidth={1}
            strokeDasharray="2 2"
            opacity={0.6}
          />
          <circle
            cx={i === 1 ? 15 : 5}
            cy={y}
            r={2.6}
            fill={i % 2 ? 'var(--down)' : 'var(--up)'}
          />
        </g>
      ))}
    </svg>
  )
}

/** Store cards pop in; one installs. */
const PluginsStore: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const installed = frame >= 74
  const cards = [
    {
      name: 'OKX Connector',
      kind: t('sectionTours.scenes.pluginKindMarketData'),
      icon: <OkxMark />,
      tile: 'color-mix(in oklch, var(--foreground) 9%, transparent)',
    },
    {
      name: 'Nord Theme',
      kind: t('sectionTours.scenes.pluginKindTheme'),
      icon: <NordSwatch />,
      tile: 'color-mix(in oklch, var(--primary) 10%, transparent)',
    },
    {
      name: 'Grid Bot',
      kind: t('sectionTours.scenes.pluginKindAutomation'),
      icon: <GridBotMark />,
      tile: 'color-mix(in oklch, var(--up) 10%, transparent)',
    },
  ]
  return (
    <Stage>
      <div style={{ display: 'flex', gap: 12 }}>
        {cards.map((card, i) => (
          <Pop key={card.name} delay={8 + i * 10}>
            <Panel style={{ width: 136, padding: 13 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 9,
                  background: card.tile,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 9,
                }}
              >
                {card.icon}
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{card.name}</div>
              <div style={{ fontSize: 10.5, marginTop: 2, ...muted }}>
                {card.kind}
              </div>
              <div
                style={{
                  marginTop: 10,
                  borderRadius: 8,
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '5px 0',
                  background:
                    i === 0 && installed
                      ? 'var(--primary)'
                      : 'color-mix(in oklch, var(--primary) 12%, transparent)',
                  color:
                    i === 0 && installed
                      ? 'var(--primary-foreground)'
                      : 'var(--primary)',
                }}
              >
                {i === 0 && installed
                  ? `✓ ${t('pluginStore.installedLabel')}`
                  : t('pluginStore.install')}
              </div>
            </Panel>
          </Pop>
        ))}
      </div>
      <Cursor
        path={[
          { frame: 40, x: 420, y: 250 },
          { frame: 66, x: 118, y: 218 },
          { frame: 90, x: 118, y: 218 },
        ]}
        clickAt={[72]}
      />
    </Stage>
  )
}

/** Sandbox shield + permission chips. */
const PluginsSandbox: FC = () => {
  const { t } = useTranslation()
  const shield = usePop(10)
  return (
    <Stage style={{ flexDirection: 'column', gap: 16 }}>
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          background: 'color-mix(in oklch, var(--primary) 13%, transparent)',
          ...shield,
        }}
      >
        🛡️
      </div>
      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 400,
        }}
      >
        <Pop delay={30}>
          <Chip tone="up">
            <CheckDot size={13} /> {t('sectionTours.scenes.sandboxedByDefault')}
          </Chip>
        </Pop>
        <Pop delay={44}>
          <Chip tone="up">
            <CheckDot size={13} /> {t('sectionTours.scenes.signedVerified')}
          </Chip>
        </Pop>
        <Pop delay={58}>
          <Chip>{t('sectionTours.scenes.networkAccessApproveHost')}</Chip>
        </Pop>
      </div>
    </Stage>
  )
}

// ── Workspaces ──────────────────────────────────────────────────────

/** Panes snap into a saved layout, then swap arrangements. */
const WorkspacesLayout: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const swap = interpolate(frame, [66, 84], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: (x) => 1 - (1 - x) ** 3,
  })
  const pane = (style: CSSProperties, label: string, delay: number) => (
    <Pop
      delay={delay}
      style={{ position: 'absolute', transition: 'none', ...style }}
    >
      <Panel
        style={{
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
        }}
      >
        {label}
      </Panel>
    </Pop>
  )
  const chartW = 210 - swap * 60
  return (
    <Stage>
      <div style={{ position: 'relative', width: 400, height: 210 }}>
        {pane(
          { left: 0, top: 0, width: chartW, height: 210 - 66 },
          t('panes.chart'),
          8,
        )}
        {pane(
          {
            left: chartW + 10,
            top: 0,
            width: 400 - chartW - 10,
            height: (210 - 66) * (0.5 + swap * 0.5) - swap * 5,
          },
          t('panes.orderBook'),
          20,
        )}
        {swap < 0.5 &&
          pane(
            {
              left: chartW + 10,
              top: (210 - 66) * 0.5 + 5,
              width: 400 - chartW - 10,
              height: (210 - 66) * 0.5 - 5,
            },
            t('panes.trades'),
            32,
          )}
        {pane(
          { left: 0, top: 210 - 56, width: 400, height: 56 },
          t('panes.positions'),
          44,
        )}
      </div>
    </Stage>
  )
}

// ── Workspace Store ─────────────────────────────────────────────────

type ThumbRect = { x: number; y: number; w: number; h: number }

// Pane arrangements in 0..1 space; same rect count so layouts can morph.
// A zero-size rect means "pane not present in this layout" (fades out).
const THUMB_LAYOUTS = {
  scalper: [
    { x: 0, y: 0, w: 0.58, h: 0.64 },
    { x: 0.63, y: 0, w: 0.37, h: 0.29 },
    { x: 0.63, y: 0.35, w: 0.37, h: 0.29 },
    { x: 0, y: 0.72, w: 1, h: 0.28 },
  ],
  swing: [
    { x: 0, y: 0, w: 1, h: 0.62 },
    { x: 0, y: 0.7, w: 0.48, h: 0.3 },
    { x: 0.52, y: 0.7, w: 0.48, h: 0.3 },
    { x: 0.5, y: 0.5, w: 0, h: 0 },
  ],
  dex: [
    { x: 0, y: 0, w: 0.47, h: 0.46 },
    { x: 0, y: 0.54, w: 0.47, h: 0.46 },
    { x: 0.53, y: 0, w: 0.47, h: 1 },
    { x: 0.5, y: 0.5, w: 0, h: 0 },
  ],
} satisfies Record<string, Array<ThumbRect>>

type ThumbLayoutId = keyof typeof THUMB_LAYOUTS

/**
 * Mini workspace-layout preview. Panes draw in staggered; when `morphTo` is
 * set, they glide into the other arrangement — the "switch layouts" beat.
 */
function LayoutThumb({
  layout,
  morphTo,
  morphAt = 0,
  delay = 0,
}: {
  layout: ThumbLayoutId
  morphTo?: ThumbLayoutId
  morphAt?: number
  delay?: number
}) {
  const frame = useCurrentFrame()
  const width = 110
  const height = 54
  const from = THUMB_LAYOUTS[layout]
  const to = morphTo ? THUMB_LAYOUTS[morphTo] : from
  const morph = morphTo
    ? interpolate(frame - morphAt, [0, 16], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: (x) => 1 - (1 - x) ** 3,
      })
    : 0
  return (
    <div
      style={{
        position: 'relative',
        width,
        height,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'color-mix(in oklch, var(--background) 55%, transparent)',
        overflow: 'hidden',
        marginBottom: 9,
      }}
    >
      {from.map((rect, i) => {
        const target = to[i]
        const x = rect.x + (target.x - rect.x) * morph
        const y = rect.y + (target.y - rect.y) * morph
        const w = rect.w + (target.w - rect.w) * morph
        const h = rect.h + (target.h - rect.h) * morph
        const appear = interpolate(frame - delay - i * 4, [0, 10], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })
        if (w <= 0.01 || h <= 0.01) return null
        return (
          <span
            key={i}
            style={{
              position: 'absolute',
              left: 3 + x * (width - 6),
              top: 3 + y * (height - 6),
              width: w * (width - 6) - 2,
              height: h * (height - 6) - 2,
              borderRadius: 3,
              background:
                'color-mix(in oklch, var(--primary) 14%, transparent)',
              boxShadow:
                'inset 0 0 0 1px color-mix(in oklch, var(--primary) 30%, var(--border))',
              opacity: appear,
            }}
          />
        )
      })}
    </div>
  )
}

/** Distinct template layouts; the copied one morphs to show easy switching. */
const StoreTemplates: FC = () => {
  const { t } = useTranslation()
  const frame = useCurrentFrame()
  const copied = frame >= 78
  const communityAuthor = t('workspaceStore.source.community')
  const cards: Array<{
    name: string
    by: string
    layout: ThumbLayoutId
    morphTo?: ThumbLayoutId
  }> = [
    { name: 'Scalper desk', by: 'Pairlens', layout: 'scalper' },
    {
      name: 'Swing setup',
      by: communityAuthor,
      layout: 'swing',
      morphTo: 'scalper',
    },
    { name: 'DEX monitor', by: communityAuthor, layout: 'dex' },
  ]
  return (
    <Stage>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {cards.map((card, i) => (
          <Pop key={card.name} delay={8 + i * 10}>
            <Panel style={{ width: 136, padding: 13 }}>
              <LayoutThumb
                layout={card.layout}
                morphTo={card.morphTo}
                morphAt={92}
                delay={14 + i * 10}
              />
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{card.name}</div>
              <div style={{ fontSize: 10.5, marginTop: 2, ...muted }}>
                {t('workspaceStore.community.by', { author: card.by })}
              </div>
              {i === 1 && copied && (
                <div
                  style={{
                    marginTop: 9,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 11,
                    color: 'var(--up)',
                    fontWeight: 600,
                  }}
                >
                  <CheckDot size={13} />{' '}
                  {t('sectionTours.scenes.copiedToWorkspaces')}
                </div>
              )}
            </Panel>
          </Pop>
        ))}
      </div>
      <Cursor
        path={[
          { frame: 40, x: 100, y: 250 },
          { frame: 68, x: 268, y: 160 },
          { frame: 100, x: 268, y: 160 },
        ]}
        clickAt={[76]}
      />
    </Stage>
  )
}

// ── Registry ────────────────────────────────────────────────────────

// ── Bots ────────────────────────────────────────────────────────────

/** One bot row: venue/pair, mode, and a switch that flicks on. */
function BotRow({
  name,
  pair,
  mode,
  delay,
  live,
}: {
  name: string
  pair: string
  mode: string
  delay: number
  live: boolean
}) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const enter = usePop(delay)
  // The switch travels after the row has settled, so the eye follows the
  // arming gesture rather than the row appearing.
  const knob = spring({
    frame: frame - delay - 22,
    fps,
    config: { damping: 16 },
  })
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 10,
        background: 'color-mix(in oklch, var(--muted) 40%, transparent)',
        ...enter,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: live ? 'var(--up)' : 'var(--muted-foreground)',
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 12 }}>{name}</span>
        <span style={{ fontSize: 10, ...mono, ...muted }}>{pair}</span>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <Chip style={{ padding: '2px 8px', fontSize: 10 }}>{mode}</Chip>
        <div
          style={{
            width: 30,
            height: 17,
            borderRadius: 999,
            padding: 2,
            background: live
              ? `color-mix(in oklch, var(--up) ${knob * 70}%, var(--muted))`
              : 'var(--muted)',
          }}
        >
          <div
            style={{
              width: 13,
              height: 13,
              borderRadius: '50%',
              background: 'var(--background)',
              transform: `translateX(${live ? knob * 13 : 0}px)`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

/** The strategy that was backtested is the one that gets deployed. */
const BotsStrategy: FC = () => {
  const { t } = useTranslation()
  return (
    <Stage>
      <Panel style={{ width: 430, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '9px 14px',
            borderBottom:
              '1px solid color-mix(in oklch, var(--border) 55%, transparent)',
          }}
        >
          <span style={{ fontSize: 11, ...mono, ...muted }}>
            ema_cross.py · backtest
          </span>
          <Pop delay={96}>
            <Chip tone="up" style={{ padding: '3px 9px', fontSize: 10.5 }}>
              <CheckDot size={12} /> {t('sectionTours.scenes.sameCodeGoesLive')}
            </Chip>
          </Pop>
        </div>
        <div style={{ padding: '14px 14px 8px' }}>
          <Sparkline width={400} height={64} delay={6} />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 22,
            padding: '4px 14px 14px',
          }}
        >
          {[
            { label: t('sectionTours.scenes.statNet'), value: '+18.4%' },
            { label: t('botsPage.summaryWinRate'), value: '61%' },
            { label: t('sectionTours.scenes.statMaxDd'), value: '7.2%' },
          ].map((stat, index) => (
            <Rise key={stat.label} delay={54 + index * 10}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    fontSize: 9.5,
                    letterSpacing: '.08em',
                    textTransform: 'uppercase',
                    ...mono,
                    ...muted,
                  }}
                >
                  {stat.label}
                </span>
                <span style={{ fontSize: 13, ...mono }}>{stat.value}</span>
              </div>
            </Rise>
          ))}
        </div>
      </Panel>
    </Stage>
  )
}

/** Bots armed on this machine, one switch each. */
const BotsRunning: FC = () => {
  const { t } = useTranslation()
  const paperMode = t('accounts.paper')
  return (
    <Stage style={{ flexDirection: 'column', gap: 12 }}>
      <Panel style={{ width: 400, padding: 10, display: 'grid', gap: 7 }}>
        <BotRow
          name={t('indicators.names.EMACross')}
          pair="OKX · BTC-USDT · 1h"
          mode={paperMode}
          delay={6}
          live
        />
        <BotRow
          name={t('sectionTours.scenes.botMeanReversion')}
          pair="Binance · ETH-USDT · 15m"
          mode={paperMode}
          delay={20}
          live
        />
        <BotRow
          name={t('sectionTours.scenes.signalBreakout')}
          pair="Kraken · SOL-USD · 4h"
          mode={paperMode}
          delay={34}
          live={false}
        />
      </Panel>
      <Pop delay={68}>
        <Chip>{t('sectionTours.scenes.runsOnYourMachine')}</Chip>
      </Pop>
    </Stage>
  )
}

export type SceneDefinition = {
  component: FC
  durationInFrames: number
}

export const SCENES: Record<SectionTourSceneId, SceneDefinition> = {
  'pairs-discover': { component: PairsDiscover, durationInFrames: 120 },
  'pairs-watchlist': { component: PairsWatchlist, durationInFrames: 120 },
  'charts-candles': { component: ChartsCandles, durationInFrames: 130 },
  'charts-signals': { component: ChartsSignals, durationInFrames: 120 },
  'alerts-trigger': { component: AlertsTrigger, durationInFrames: 120 },
  'alerts-compose': { component: AlertsCompose, durationInFrames: 120 },
  'workflows-graph': { component: WorkflowsGraph, durationInFrames: 130 },
  'workflows-runs': { component: WorkflowsRuns, durationInFrames: 110 },
  'indicators-code': { component: IndicatorsCode, durationInFrames: 150 },
  'indicators-chart': { component: IndicatorsChart, durationInFrames: 140 },
  'accounts-connect': { component: AccountsConnect, durationInFrames: 120 },
  'accounts-balances': { component: AccountsBalances, durationInFrames: 110 },
  'plugins-store': { component: PluginsStore, durationInFrames: 120 },
  'plugins-sandbox': { component: PluginsSandbox, durationInFrames: 110 },
  'workspaces-layout': { component: WorkspacesLayout, durationInFrames: 120 },
  'store-templates': { component: StoreTemplates, durationInFrames: 145 },
  'bots-strategy': { component: BotsStrategy, durationInFrames: 140 },
  'bots-running': { component: BotsRunning, durationInFrames: 130 },
}
