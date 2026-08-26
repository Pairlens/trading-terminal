// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a panel looks like, before it is on the board.
 *
 * A picker that lists ninety-three names and a one-line description asks the
 * reader to know the product already. The fix people reach for first is
 * screenshots, and screenshots are the wrong answer here: ninety-three panels
 * across eighteen themes and two colour modes is three hundred and thirty-odd
 * images, every one of them stale the week after a redesign, none of them
 * matching the theme the reader is actually looking at.
 *
 * So the picker draws the shape instead. Each panel names an archetype in its
 * manifest — the same contract as `icon`, where the plugin names it and the
 * terminal owns the drawing — and this module renders that shape from the live
 * tokens with sample numbers in it. It is theme-correct for free, it costs
 * nothing to ship, and it cannot drift from the product's colours because it
 * IS the product's colours.
 *
 * What it deliberately does not do is render the real panel. A real panel
 * wants a plugin, a socket and a pair; a picker that mounted one would open
 * ninety-three connections to answer "what does this look like". The sample
 * numbers are constants, marked as such under the frame, and every panel of
 * the same shape draws the same numbers on purpose: the specificity belongs in
 * the description beside it, and a preview that invented a different plausible
 * price per panel would be lying with more effort.
 */
import { memo } from 'react'

import { cn } from '@pairlens/ui'

// ── Archetypes ──────────────────────────────────────────────────────

export const PANE_PREVIEW_ARCHETYPES = [
  'chart',
  'lines',
  'book',
  'depth',
  'tape',
  'table',
  'cards',
  'tokens',
  'feed',
  'agenda',
  'stats',
  'ticket',
  'form',
  'gauge',
  'donut',
  'heat',
  'sparkbar',
  'text',
  'gallery',
  'route',
  'browser',
] as const

export type PanePreviewArchetype = (typeof PANE_PREVIEW_ARCHETYPES)[number]

const ARCHETYPE_SET: ReadonlySet<string> = new Set(PANE_PREVIEW_ARCHETYPES)

/**
 * The shape a panel gets when its manifest names none.
 *
 * Third-party panels are the case this exists for: a plugin written before the
 * field existed still gets a preview, and the category is the best guess
 * available — a charting panel is a chart far more often than it is anything
 * else.
 */
const CATEGORY_FALLBACK: Record<string, PanePreviewArchetype> = {
  charting: 'chart',
  trading: 'ticket',
  discovery: 'table',
  'ai-research': 'text',
}

export function resolvePreviewArchetype(def: {
  preview?: string
  category?: string
}): PanePreviewArchetype {
  if (def.preview && ARCHETYPE_SET.has(def.preview)) {
    return def.preview as PanePreviewArchetype
  }
  return CATEGORY_FALLBACK[def.category ?? ''] ?? 'table'
}

// ── Sample data ─────────────────────────────────────────────────────
//
// Constants, never random: a preview that reshuffled on every keystroke would
// read as live data, which is the one thing it must not claim to be.

const CANDLES: Array<[number, number, number, number]> = [
  // open, high, low, close — normalised 0..1, oldest first
  [0.42, 0.52, 0.38, 0.5],
  [0.5, 0.58, 0.47, 0.46],
  [0.46, 0.49, 0.33, 0.36],
  [0.36, 0.44, 0.34, 0.43],
  [0.43, 0.62, 0.42, 0.6],
  [0.6, 0.66, 0.55, 0.57],
  [0.57, 0.61, 0.5, 0.52],
  [0.52, 0.72, 0.51, 0.7],
  [0.7, 0.78, 0.66, 0.76],
  [0.76, 0.8, 0.62, 0.65],
  [0.65, 0.69, 0.55, 0.58],
  [0.58, 0.75, 0.57, 0.73],
  [0.73, 0.88, 0.71, 0.84],
  [0.84, 0.9, 0.79, 0.82],
]

const ASKS = [
  ['64,218.5', '0.842', 38],
  ['64,217.0', '1.204', 52],
  ['64,215.5', '0.318', 21],
  ['64,214.0', '2.117', 74],
  ['64,212.5', '0.906', 44],
]
const BIDS = [
  ['64,210.0', '1.552', 61],
  ['64,208.5', '0.774', 33],
  ['64,207.0', '2.480', 88],
  ['64,205.5', '0.411', 24],
  ['64,204.0', '1.038', 47],
]

const TAPE = [
  ['12:04:31', '64,211.0', '0.128', 1],
  ['12:04:30', '64,210.5', '0.406', 1],
  ['12:04:29', '64,209.0', '1.240', 0],
  ['12:04:27', '64,209.5', '0.075', 0],
  ['12:04:26', '64,212.0', '0.663', 1],
  ['12:04:24', '64,211.5', '0.219', 1],
  ['12:04:22', '64,208.0', '0.947', 0],
  ['12:04:21', '64,208.5', '0.312', 0],
  ['12:04:19', '64,207.5', '1.806', 0],
  ['12:04:18', '64,210.0', '0.244', 1],
  ['12:04:16', '64,210.5', '0.531', 1],
  ['12:04:15', '64,206.0', '0.098', 0],
] as const

const ROWS = [
  ['BTC', '64,211.0', '+2.41%', 1],
  ['ETH', '3,182.44', '+1.08%', 1],
  ['SOL', '148.62', '-0.74%', 0],
  ['LINK', '17.905', '+4.62%', 1],
  ['AVAX', '31.207', '-1.93%', 0],
  ['ARB', '0.8412', '+0.36%', 1],
  ['OP', '2.0417', '+1.24%', 1],
  ['DOGE', '0.1284', '-2.15%', 0],
  ['SUI', '1.7362', '+3.08%', 1],
  ['TIA', '4.9105', '-0.52%', 0],
] as const

const CARDS = [
  ['Fed cuts in September', 'Kalshi · closes 18 Sep', '68¢', 68],
  ['SOL above $200 by Q4', 'Polymarket · 1.2M vol', '31¢', 31],
  ['ETF inflow week 12', 'Kalshi · closes 04 Oct', '54¢', 54],
  ['BTC new high in 2026', 'Polymarket · 8.4M vol', '77¢', 77],
  ['CPI under 3% in Q1', 'Kalshi · closes 12 Feb', '42¢', 42],
] as const

const TOKENS = [
  ['PONKE', 'Ponke Inu', '$18.4M', 92],
  ['WIFHAT', 'dogwifhat', '$11.2M', 74],
  ['MOODENG', 'Moo Deng', '$6.81M', 58],
  ['GIGA', 'Gigachad', '$4.05M', 41],
  ['RETARDIO', 'Retardio', '$2.37M', 26],
] as const

const FEED = [
  ['ETF desks report a fourth straight week of inflows', 'Coindesk · 12m'],
  [
    'Solana fees hit a monthly high as memecoin volume returns',
    'The Block · 41m',
  ],
  ['Exchange reserves fall to a two-year low', 'Decrypt · 1h'],
  ['Funding flips negative across the majors', 'Blockworks · 2h'],
  ['Layer-2 sequencer revenue doubles quarter on quarter', 'Bankless · 3h'],
] as const

const AGENDA = [
  ['TUE', '12', 'NVDA', 'After close'],
  ['TUE', '12', 'CPI, month on month', '08:30'],
  ['WED', '13', 'AVGO', 'After close'],
  ['THU', '14', 'Initial jobless claims', '08:30'],
  ['FRI', '15', 'COST', 'Before open'],
] as const

/**
 * Deliberately not a coin profile. Eighteen panels draw this shape — a pool, an
 * LP position, a company, a collection, a broker position — and "Market cap
 * $1.27T" on a liquidity position is a sample that argues with the description
 * beside it. These six labels are true of every one of them.
 */
const STATS = [
  ['Value', '$48,210', ''],
  ['24h change', '+2.41%', 'text-up'],
  ['24h volume', '$3.84M', ''],
  ['Liquidity', '$9.12M', ''],
  ['Since', 'Jul 2023', ''],
  ['Updated', '12:04', ''],
] as const

const HOPS = ['USDC', 'WETH', 'ARB'] as const

const HEAT = [
  [62, 41, -18, 74, 12, -55, 33, 8],
  [-27, 58, 21, -9, 66, 30, -44, 51],
  [15, -63, 47, 26, -12, 71, 19, -35],
  [70, 24, -40, 11, 39, -22, 60, 45],
  [-31, 43, 67, -14, 22, 55, -48, 9],
]

const BARS = [
  38, 52, 44, 61, 73, 55, 48, 66, 81, 74, 59, 67, 88, 79, 62, 71, 93, 84, 68,
  76, 58, 49, 63, 71,
]

const LINE_SERIES = [
  [0.62, 0.6, 0.65, 0.71, 0.68, 0.74, 0.79, 0.77, 0.83, 0.86],
  [0.31, 0.34, 0.3, 0.27, 0.29, 0.24, 0.21, 0.23, 0.18, 0.15],
  [0.48, 0.46, 0.5, 0.44, 0.47, 0.42, 0.45, 0.4, 0.38, 0.41],
]

// ── Shared bits ─────────────────────────────────────────────────────

const MONO = 'font-mono tabular-nums'
const HEAD = 'font-mono text-[8.5px] font-semibold uppercase tracking-[.16em]'

function Label({ children }: { children: React.ReactNode }) {
  return <span className={cn(HEAD, 'text-muted-foreground')}>{children}</span>
}

function polyline(values: Array<number>, width: number, height: number) {
  const step = width / (values.length - 1)
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${((1 - v) * height).toFixed(1)}`)
    .join(' ')
}

// ── Archetype renderers ─────────────────────────────────────────────

function ChartPreview() {
  const w = 100
  const h = 46
  const cw = w / CANDLES.length
  return (
    <svg
      viewBox={`0 0 ${w} 60`}
      className="h-full w-full"
      preserveAspectRatio="none"
    >
      {CANDLES.map(([o, high, low, c], i) => {
        const x = i * cw + cw / 2
        const up = c >= o
        const top = (1 - Math.max(o, c)) * h
        const bottom = (1 - Math.min(o, c)) * h
        return (
          <g key={i} className={up ? 'text-up' : 'text-down'}>
            <line
              x1={x}
              x2={x}
              y1={(1 - high) * h}
              y2={(1 - low) * h}
              stroke="currentColor"
              strokeWidth={0.6}
            />
            <rect
              x={x - cw * 0.3}
              y={top}
              width={cw * 0.6}
              height={Math.max(bottom - top, 0.8)}
              fill="currentColor"
            />
            <rect
              x={x - cw * 0.3}
              y={60 - (0.3 + (i % 5) * 0.12) * 24}
              width={cw * 0.6}
              height={(0.3 + (i % 5) * 0.12) * 24}
              fill="currentColor"
              opacity={0.35}
            />
          </g>
        )
      })}
    </svg>
  )
}

function LinesPreview() {
  const w = 100
  const h = 52
  const tone = ['text-primary', 'text-down', 'text-muted-foreground']
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-full w-full"
      preserveAspectRatio="none"
    >
      {LINE_SERIES.map((series, i) => (
        <polyline
          key={i}
          points={polyline(series, w, h)}
          fill="none"
          stroke="currentColor"
          strokeWidth={i === 0 ? 1.4 : 1}
          className={tone[i]}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

function BookRow({
  price,
  size,
  depth,
  side,
}: {
  price: string
  size: string
  depth: number
  side: 'ask' | 'bid'
}) {
  return (
    <div
      className={cn(
        'relative grid grid-cols-3 gap-1 py-px',
        MONO,
        'text-[9px] leading-[13px]',
      )}
    >
      <div
        className={cn(
          'absolute inset-y-0 right-0',
          side === 'ask' ? 'bg-down/15' : 'bg-up/15',
        )}
        style={{ width: `${depth}%` }}
      />
      <span
        className={cn('relative', side === 'ask' ? 'text-down' : 'text-up')}
      >
        {price}
      </span>
      <span className="relative text-right">{size}</span>
      <span className="relative text-right text-muted-foreground">{size}</span>
    </div>
  )
}

function BookPreview() {
  return (
    <div className="flex h-full flex-col justify-center">
      <div
        className={cn(
          'grid grid-cols-3 gap-1 pb-1',
          HEAD,
          'text-muted-foreground',
        )}
      >
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      {ASKS.map(([p, s, d]) => (
        <BookRow
          key={p as string}
          price={p as string}
          size={s as string}
          depth={d as number}
          side="ask"
        />
      ))}
      <div className="my-0.5 flex items-center justify-center gap-2 bg-muted/45 py-0.5">
        <span className={cn(MONO, 'text-[10px] font-medium')}>64,211.0</span>
        <span className={cn(MONO, 'text-[8.5px] text-muted-foreground')}>
          2.5 spread
        </span>
      </div>
      {BIDS.map(([p, s, d]) => (
        <BookRow
          key={p as string}
          price={p as string}
          size={s as string}
          depth={d as number}
          side="bid"
        />
      ))}
    </div>
  )
}

function DepthPreview() {
  const bid = [0.08, 0.16, 0.23, 0.35, 0.44, 0.58, 0.7, 0.86]
  const ask = [0.86, 0.72, 0.61, 0.5, 0.38, 0.3, 0.19, 0.1]
  const half = 50
  const h = 48
  const area = (vals: Array<number>, offset: number) => {
    const step = half / (vals.length - 1)
    const pts = vals
      .map(
        (v, i) =>
          `${(offset + i * step).toFixed(1)},${((1 - v) * h).toFixed(1)}`,
      )
      .join(' ')
    return `${offset},${h} ${pts} ${offset + half},${h}`
  }
  return (
    <svg
      viewBox={`0 0 100 ${h}`}
      className="h-full w-full"
      preserveAspectRatio="none"
    >
      <polygon points={area(bid, 0)} className="fill-up/25" />
      <polyline
        points={polyline(bid, half, h)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1}
        className="text-up"
        vectorEffect="non-scaling-stroke"
      />
      <polygon points={area(ask, half)} className="fill-down/25" />
      <g transform={`translate(${half},0)`}>
        <polyline
          points={polyline(ask, half, h)}
          fill="none"
          stroke="currentColor"
          strokeWidth={1}
          className="text-down"
          vectorEffect="non-scaling-stroke"
        />
      </g>
      <line
        x1={half}
        x2={half}
        y1={0}
        y2={h}
        stroke="currentColor"
        strokeWidth={0.5}
        strokeDasharray="2 2"
        className="text-muted-foreground/50"
      />
    </svg>
  )
}

function TapePreview() {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'grid grid-cols-[auto_1fr_1fr] gap-2 pb-1',
          HEAD,
          'text-muted-foreground',
        )}
      >
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Size</span>
      </div>
      {TAPE.map(([time, price, size, up]) => (
        <div
          key={time}
          className={cn(
            'grid grid-cols-[auto_1fr_1fr] gap-2 py-px',
            MONO,
            'text-[9px] leading-[13px]',
          )}
        >
          <span className="text-muted-foreground">{time}</span>
          <span className={cn('text-right', up ? 'text-up' : 'text-down')}>
            {price}
          </span>
          <span className="text-right">{size}</span>
        </div>
      ))}
    </div>
  )
}

function TablePreview() {
  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'grid grid-cols-[1fr_auto_auto] gap-3 pb-1.5',
          HEAD,
          'text-muted-foreground',
        )}
      >
        <span>Market</span>
        <span className="text-right">Last</span>
        <span className="text-right">24h</span>
      </div>
      {ROWS.map(([sym, last, chg, up]) => (
        <div
          key={sym}
          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-[3px]"
        >
          <span className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded-full bg-muted" />
            <span className="text-[10px] font-medium">{sym}</span>
          </span>
          <span className={cn(MONO, 'text-right text-[10px]')}>{last}</span>
          <span
            className={cn(
              MONO,
              'text-right text-[10px]',
              up ? 'text-up' : 'text-down',
            )}
          >
            {chg}
          </span>
        </div>
      ))}
    </div>
  )
}

function CardsPreview() {
  return (
    <div className="flex h-full flex-col gap-2">
      {CARDS.map(([title, sub, price, pct]) => (
        <div key={title} className="flex items-center gap-2">
          <span className="size-6 shrink-0 rounded-md bg-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10px] font-medium leading-tight">
              {title}
            </span>
            <span className="block truncate text-[9px] text-muted-foreground">
              {sub}
            </span>
            <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary/70"
                style={{ width: `${pct}%` }}
              />
            </span>
          </span>
          <span className={cn(MONO, 'text-[11px] font-medium')}>{price}</span>
        </div>
      ))}
    </div>
  )
}

function TokensPreview() {
  return (
    <div className="flex h-full flex-col gap-2">
      {TOKENS.map(([ticker, name, cap, progress]) => (
        <div key={ticker} className="flex items-center gap-2">
          <span className="size-6 shrink-0 rounded-full bg-muted" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="truncate text-[10.5px] font-medium">
                {ticker}
              </span>
              <span className="truncate text-[9px] text-muted-foreground">
                {name}
              </span>
            </span>
            <span className="mt-1 block h-[3px] w-full overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-up/70"
                style={{ width: `${progress}%` }}
              />
            </span>
          </span>
          <span className="shrink-0 text-right">
            <span className={cn(MONO, 'block text-[10.5px]')}>{cap}</span>
            <span
              className={cn(MONO, 'block text-[9px] text-muted-foreground')}
            >
              {progress}%
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

function FeedPreview() {
  return (
    <div className="flex h-full flex-col gap-2.5">
      {FEED.map(([headline, source]) => (
        <div key={headline} className="flex items-start gap-2">
          <span className="size-7 shrink-0 rounded-md bg-muted" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[10.5px] leading-tight font-medium">
              {headline}
            </span>
            <span
              className={cn(
                MONO,
                'mt-0.5 block text-[9px] text-muted-foreground',
              )}
            >
              {source}
            </span>
          </span>
        </div>
      ))}
    </div>
  )
}

function AgendaPreview() {
  return (
    <div className="flex h-full flex-col gap-2">
      {AGENDA.map(([day, date, title, when], i) => (
        <div key={i} className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 flex-col items-center justify-center rounded-md bg-muted/60">
            <span className={cn(HEAD, 'text-muted-foreground')}>{day}</span>
            <span className={cn(MONO, 'text-[10px] leading-none')}>{date}</span>
          </span>
          <span className="min-w-0 flex-1 truncate text-[10.5px] font-medium">
            {title}
          </span>
          <span
            className={cn(MONO, 'shrink-0 text-[9px] text-muted-foreground')}
          >
            {when}
          </span>
        </div>
      ))}
    </div>
  )
}

function StatsPreview() {
  return (
    <div className="grid h-full grid-cols-2 content-center gap-x-4 gap-y-2">
      {STATS.map(([label, value, tone]) => (
        <div key={label} className="min-w-0">
          <Label>{label}</Label>
          <div className={cn(MONO, 'truncate text-[12px] leading-tight', tone)}>
            {value}
          </div>
        </div>
      ))}
    </div>
  )
}

function TicketPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="grid grid-cols-2 gap-1">
        <span className="rounded-md bg-up/20 py-1 text-center text-[10px] font-medium text-up">
          Buy
        </span>
        <span className="rounded-md bg-muted/60 py-1 text-center text-[10px] font-medium text-muted-foreground">
          Sell
        </span>
      </div>
      {[
        ['Price', '64,211.0'],
        ['Size', '0.250'],
      ].map(([label, value]) => (
        <div
          key={label}
          className="flex items-center justify-between rounded-md bg-muted/40 px-2 py-1.5"
        >
          <Label>{label}</Label>
          <span className={cn(MONO, 'text-[11px]')}>{value}</span>
        </div>
      ))}
      <div className="flex items-center gap-1">
        {['25%', '50%', '75%', 'Max'].map((step) => (
          <span
            key={step}
            className={cn(
              MONO,
              'flex-1 rounded bg-muted/40 py-[3px] text-center text-[9px] text-muted-foreground',
            )}
          >
            {step}
          </span>
        ))}
      </div>
      <div className="rounded-md bg-up py-1.5 text-center text-[10px] font-medium text-background">
        Buy 0.250 BTC
      </div>
    </div>
  )
}

function FormPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      {[
        ['Max position size', '5,000 USDT', true],
        ['Daily loss cap', '250 USDT', true],
        ['Leverage ceiling', '10x', false],
      ].map(([label, value, on]) => (
        <div
          key={label as string}
          className="flex items-center justify-between gap-2"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-medium leading-tight">
              {label}
            </span>
            <span
              className={cn(MONO, 'block text-[9px] text-muted-foreground')}
            >
              {value}
            </span>
          </span>
          <span
            className={cn(
              'flex h-[14px] w-[24px] shrink-0 items-center rounded-full px-[2px]',
              on ? 'justify-end bg-primary' : 'justify-start bg-muted',
            )}
          >
            <span className="size-[10px] rounded-full bg-background" />
          </span>
        </div>
      ))}
      <div className="pt-1">
        <div className="flex items-center justify-between pb-1">
          <Label>Exposure used</Label>
          <span className={cn(MONO, 'text-[10px]')}>62%</span>
        </div>
        <span className="block h-1 w-full overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-[62%] rounded-full bg-primary/70" />
        </span>
      </div>
    </div>
  )
}

function GaugePreview() {
  // A 180° arc, 62 of 100.
  const r = 34
  const cx = 50
  const cy = 42
  const value = 0.62
  const end = Math.PI * (1 - value)
  const x = cx + r * Math.cos(end)
  const y = cy - r * Math.sin(end)
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <svg viewBox="0 0 100 50" className="w-[80%] max-w-[210px]">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeLinecap="round"
          className="text-muted"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={7}
          strokeLinecap="round"
          className="text-up"
        />
      </svg>
      <div className={cn(MONO, '-mt-2 text-[26px] font-medium leading-none')}>
        62
      </div>
      <Label>Greed</Label>
    </div>
  )
}

function DonutPreview() {
  const slices = [
    { name: 'BTC', pct: 42, dot: 'bg-primary', arc: 'text-primary' },
    { name: 'ETH', pct: 27, dot: 'bg-up', arc: 'text-up' },
    { name: 'SOL', pct: 18, dot: 'bg-down', arc: 'text-down' },
    {
      name: 'Cash',
      pct: 13,
      dot: 'bg-muted-foreground',
      arc: 'text-muted-foreground',
    },
  ]
  const circumference = 2 * Math.PI * 30
  let offset = 0
  return (
    <div className="flex h-full items-center justify-center gap-4">
      <svg viewBox="0 0 80 80" className="size-[104px] shrink-0 -rotate-90">
        {slices.map((slice) => {
          const dash = (slice.pct / 100) * circumference
          const el = (
            <circle
              key={slice.name}
              cx={40}
              cy={40}
              r={30}
              fill="none"
              stroke="currentColor"
              strokeWidth={11}
              className={slice.arc}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
            />
          )
          offset += dash
          return el
        })}
      </svg>
      <div className="flex flex-col gap-1">
        {slices.map((slice) => (
          <span key={slice.name} className="flex items-center gap-2">
            <span className={cn('size-2 rounded-full', slice.dot)} />
            <span className="w-9 text-[11px]">{slice.name}</span>
            <span className={cn(MONO, 'text-[11px] text-muted-foreground')}>
              {slice.pct}%
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function HeatPreview() {
  return (
    <div className="flex h-full flex-col gap-[3px]">
      {HEAT.map((row, r) => (
        <div key={r} className="flex min-h-[18px] flex-1 gap-[3px]">
          {row.map((v, c) => (
            <span
              key={c}
              className={cn(
                'flex-1 rounded-[3px]',
                v >= 0 ? 'bg-up' : 'bg-down',
              )}
              style={{ opacity: 0.14 + (Math.abs(v) / 100) * 0.66 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function SparkbarPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="flex min-h-[54px] flex-1 items-end gap-[2px]">
        {BARS.map((v, i) => (
          <span
            key={i}
            className={cn(
              'flex-1 rounded-t-[2px]',
              i > 19 ? 'bg-primary' : 'bg-primary/45',
            )}
            style={{ height: `${v}%` }}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Label>Open interest</Label>
        <span className={cn(MONO, 'text-[10px] text-up')}>+8.4%</span>
      </div>
    </div>
  )
}

function TextPreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <div className="text-[11px] font-medium leading-snug">
        What the contract pays on
      </div>
      <div className="flex flex-col gap-[5px]">
        {[100, 94, 98, 71, 96, 88, 46].map((w, i) => (
          <span
            key={i}
            className="block h-[5px] rounded-full bg-muted-foreground/20"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        <span className="size-3 rounded-full bg-muted" />
        <span className={cn(MONO, 'text-[9px] text-muted-foreground')}>
          Kalshi · 2h ago
        </span>
      </div>
    </div>
  )
}

function GalleryPreview() {
  return (
    <div className="grid h-full grid-cols-4 content-center gap-1.5">
      {[
        '2.41',
        '2.38',
        '2.55',
        '2.29',
        '2.60',
        '2.44',
        '2.31',
        '2.72',
        '2.36',
        '2.81',
        '2.27',
        '2.49',
      ].map((price, i) => (
        <span key={i} className="flex flex-col gap-0.5">
          <span
            className="block aspect-square w-full rounded-md bg-muted"
            style={{ opacity: 0.55 + (i % 4) * 0.15 }}
          />
          <span className={cn(MONO, 'text-[8.5px] text-muted-foreground')}>
            {price} Ξ
          </span>
        </span>
      ))}
    </div>
  )
}

function RoutePreview() {
  return (
    <div className="flex h-full flex-col justify-center gap-2.5">
      <div className="flex items-center gap-1.5">
        {HOPS.map((hop, i) => (
          <span key={hop} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
              <span className="size-3.5 shrink-0 rounded-full bg-muted" />
              <span className="truncate text-[10px] font-medium">{hop}</span>
            </span>
            {i < HOPS.length - 1 && (
              <span className="text-[10px] text-muted-foreground">→</span>
            )}
          </span>
        ))}
      </div>
      <div className="flex flex-col gap-1">
        {[
          ['Rate', '1 USDC = 0.00038 WETH'],
          ['Price impact', '0.06%'],
          ['Network fee', '$0.42'],
        ].map(([label, value]) => (
          <span key={label} className="flex items-center justify-between">
            <Label>{label}</Label>
            <span className={cn(MONO, 'text-[10px]')}>{value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

function BrowserPreview() {
  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1">
        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
        <span className={cn(MONO, 'truncate text-[9px] text-muted-foreground')}>
          tradingview.com
        </span>
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="block h-[6px] w-2/3 rounded-full bg-muted" />
          <span className="block flex-1 rounded-md bg-muted/60" />
        </div>
        <div className="flex w-[30%] flex-col gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="block h-[5px] rounded-full bg-muted" />
          ))}
          <span className="block flex-1 rounded-md bg-muted/40" />
        </div>
      </div>
    </div>
  )
}

const RENDERERS: Record<PanePreviewArchetype, () => React.ReactElement> = {
  chart: ChartPreview,
  lines: LinesPreview,
  book: BookPreview,
  depth: DepthPreview,
  tape: TapePreview,
  table: TablePreview,
  cards: CardsPreview,
  tokens: TokensPreview,
  feed: FeedPreview,
  agenda: AgendaPreview,
  stats: StatsPreview,
  ticket: TicketPreview,
  form: FormPreview,
  gauge: GaugePreview,
  donut: DonutPreview,
  heat: HeatPreview,
  sparkbar: SparkbarPreview,
  text: TextPreview,
  gallery: GalleryPreview,
  route: RoutePreview,
  browser: BrowserPreview,
}

/** The trailing metric the shell's header slot would carry, per shape. */
const HEADER_METRIC: Record<PanePreviewArchetype, string> = {
  chart: '1h',
  lines: '1h',
  book: '0.5',
  depth: '±2%',
  tape: 'live',
  table: '24h',
  cards: '4',
  tokens: 'Live',
  feed: '12m',
  agenda: 'This week',
  stats: '24h',
  ticket: 'Limit',
  form: 'On',
  gauge: 'Daily',
  donut: '$48.2k',
  heat: '24h',
  sparkbar: '24h',
  text: '2h ago',
  gallery: '8',
  route: 'Best',
  browser: '',
}

// ── The frame ───────────────────────────────────────────────────────

/**
 * The panel drawn as the board would draw it: ground, one column card, the
 * shell's own 20px header with the title and a trailing metric, then the
 * shape. Matching the real chrome is the point — the reader is being shown
 * where this thing will land, not an illustration of it.
 */
export const PanePreview = memo(function PanePreview({
  archetype,
  title,
  className,
}: {
  archetype: PanePreviewArchetype
  title: string
  className?: string
}) {
  const Body = RENDERERS[archetype]
  const metric = HEADER_METRIC[archetype]

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none overflow-hidden rounded-[12px] border bg-background p-2 select-none',
        className,
      )}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[10px] bg-card p-2.5 ring-1 ring-inset ring-border/60">
        <div className="flex h-4 shrink-0 items-center justify-between gap-2">
          <span className="truncate text-[11px] leading-none font-medium tracking-[-0.005em]">
            {title}
          </span>
          {metric && (
            <span
              className={cn(MONO, 'shrink-0 text-[9px] text-muted-foreground')}
            >
              {metric}
            </span>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden pt-2">
          <Body />
        </div>
      </div>
    </div>
  )
})
