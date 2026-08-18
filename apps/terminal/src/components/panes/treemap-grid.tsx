// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A treemap of tinted tiles: area for size, colour for direction.
 *
 * Built as a sibling of the crypto heatmap rather than by generalising it. The
 * two want different things from the same recharts primitive — that one paints
 * hand-mixed HSL over a logo and a ticker, this one paints design tokens under
 * two or three lines of typography and has to survive a pane a fifth the size.
 * Merging them would have produced a component with a flag for every
 * difference; the ideas worth keeping (flat treemap, custom SVG tile, size-
 * driven disclosure, animation off) were copied instead.
 *
 * Everything the caller owns is a function of the item: its area, its tint, its
 * identity, and what it says at a given box size. The identity one matters
 * most — `keyOf` must be a real id, not a display label, or two rows that
 * happen to share a ticker collapse into one tile.
 *
 * SVG text cannot ellipsize, so lines are truncated here against a monospace
 * character-width estimate. It is an estimate on purpose: measuring text per
 * tile per frame is a layout thrash, and a tile is allowed to end a character
 * early far more cheaply than it is allowed to spill over its own edge.
 */
import { useMemo } from 'react'
import { ArrowUpRight, ChevronRight } from 'lucide-react'
import { ResponsiveContainer, Treemap } from 'recharts'

import { cn } from '@pairlens/ui/lib/utils'

/** What a tile says at its current size. The caller decides; this draws it. */
export type TreemapTileLines = {
  /** Primary label, mono. */
  title: string
  /** Muted qualifier under the title. Null drops the line. */
  subtitle?: string | null
  /** The emphasised figure. Null drops it. */
  value?: string | null
  /** Which token colours the value. */
  tone?: 'up' | 'down' | 'muted'
  /** `row` puts title and value on one baseline, for wide short tiles. */
  layout?: 'stack' | 'row'
}

export type TreemapGridProps<T> = {
  data: ReadonlyArray<T>
  /** Tile area. Callers drop zero-size items before passing them in. */
  sizeOf: (item: T) => number
  /** Any CSS colour. Tokens and `color-mix` both resolve inside SVG. */
  tintFor: (item: T) => string
  /** Stable identity. Never a display label. */
  keyOf: (item: T) => string
  lines: (item: T, width: number, height: number) => TreemapTileLines
  /** `keyOf` of the selected item, if any. */
  selected?: string | null
  onSelect?: (item: T) => void
  /** Double click. The commitment, where select is the cheap look. */
  onActivate?: (item: T) => void
  /** A tile-shaped way out of the map, drawn under it. */
  footerTile?: { label: string; onClick: () => void } | null
  className?: string
}

type TileDatum<T> = {
  size: number
  tileKey: string
  tint: string
  item: T
}

/** Gutter between tiles, in px, split either side of the rect. */
const GAP = 2
const PAD_X = 9
const PAD_Y = 8
/** Mono glyphs run about this fraction of their font size wide. */
const MONO_ASPECT = 0.62

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Type scale from the tile box.
 *
 * Driven by the smaller dimension so a tall thin tile does not get headline
 * type it has no width for.
 */
function typeScale(width: number, height: number) {
  const scale = Math.min(width, height)
  return {
    title: clamp(10, 15, 8 + scale * 0.03),
    value: clamp(11, 22, 8 + scale * 0.06),
    subtitle: clamp(9, 11, 8 + scale * 0.012),
  }
}

/** Cut a label to what the box can hold, with an ellipsis where it was cut. */
export function fitText(
  text: string,
  boxWidth: number,
  fontSize: number,
): string {
  const budget = Math.floor(boxWidth / (fontSize * MONO_ASPECT))
  if (budget <= 0) return ''
  if (text.length <= budget) return text
  if (budget <= 1) return '…'
  return `${text.slice(0, budget - 1)}…`
}

const TONE_FILL = {
  up: 'var(--up)',
  down: 'var(--down)',
  muted: 'var(--muted-foreground)',
} as const

function Tile<T>(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  tileKey?: string
  tint?: string
  /**
   * The item itself, carried on the datum rather than looked up by index.
   * Recharts lays a treemap out by sorting nodes on their value, and the
   * `index` it injects is the position AFTER that sort — indexing the source
   * array with it would label every tile with a different pool's name.
   */
  item?: T
  lines?: TreemapGridProps<T>['lines']
  selected?: string | null
  onSelect?: (item: T) => void
  onActivate?: (item: T) => void
}) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    tileKey,
    tint,
    item,
    lines,
    selected,
    onSelect,
    onActivate,
  } = props

  if (!item || !lines || !tileKey || width <= 0 || height <= 0) return null

  const innerW = Math.max(0, width - GAP * 2)
  const innerH = Math.max(0, height - GAP * 2)
  if (innerW < 8 || innerH < 8) return null

  const left = x + GAP
  const top = y + GAP
  const textW = Math.max(0, innerW - PAD_X * 2)

  const spec = lines(item, innerW, innerH)
  const type = typeScale(innerW, innerH)
  const isSelected = selected === tileKey
  const valueFill = TONE_FILL[spec.tone ?? 'muted']

  // A tile that cannot hold its own title draws as colour alone. Still
  // clickable: the tint and the area are already carrying information, and a
  // dead rectangle in the corner of a map is worse than a small live one.
  const showTitle = innerH >= 20 && innerW >= 34
  const row = spec.layout === 'row'
  const showValue = Boolean(
    spec.value && (row ? innerW >= 76 : innerH >= 38 && innerW >= 40),
  )
  const showSubtitle = Boolean(spec.subtitle && !row && innerH >= 62)

  return (
    <g
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect?.(item)}
      onDoubleClick={() => onActivate?.(item)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={left}
        y={top}
        width={innerW}
        height={innerH}
        rx={7}
        fill={tint}
        stroke={isSelected ? 'var(--primary)' : 'transparent'}
        strokeWidth={isSelected ? 1.5 : 0}
      />

      {row ? (
        <>
          {showTitle && (
            <text
              x={left + PAD_X}
              y={top + innerH / 2}
              dominantBaseline="central"
              fill="var(--foreground)"
              fontFamily="var(--font-mono)"
              fontSize={type.title}
              fontWeight={600}
            >
              {fitText(
                spec.title,
                showValue ? textW * 0.62 : textW,
                type.title,
              )}
            </text>
          )}
          {showValue && (
            <text
              x={left + innerW - PAD_X}
              y={top + innerH / 2}
              textAnchor="end"
              dominantBaseline="central"
              fill={valueFill}
              fontSize={type.value}
              fontWeight={600}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {spec.value}
            </text>
          )}
        </>
      ) : (
        <>
          {showTitle && (
            <text
              x={left + PAD_X}
              y={top + PAD_Y + type.title * 0.8}
              fill="var(--foreground)"
              fontFamily="var(--font-mono)"
              fontSize={type.title}
              fontWeight={600}
            >
              {fitText(spec.title, textW, type.title)}
            </text>
          )}
          {showSubtitle && (
            <text
              x={left + PAD_X}
              y={top + PAD_Y + type.title * 0.8 + type.subtitle + 5}
              fill="var(--muted-foreground)"
              fontSize={type.subtitle}
            >
              {fitText(spec.subtitle!, textW, type.subtitle)}
            </text>
          )}
          {showValue && (
            <text
              x={left + PAD_X}
              y={top + innerH - PAD_Y}
              fill={valueFill}
              fontSize={type.value}
              fontWeight={600}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {spec.value}
            </text>
          )}
        </>
      )}

      {/* The selected tile is the one the board is describing elsewhere, so it
          is also the one that earns an explicit way out to the chart. */}
      {isSelected && innerW >= 52 && innerH >= 34 && (
        <ArrowUpRight
          x={left + innerW - 17}
          y={top + 5}
          width={12}
          height={12}
          color="var(--muted-foreground)"
          aria-hidden="true"
        />
      )}
    </g>
  )
}

export function TreemapGrid<T>({
  data,
  sizeOf,
  tintFor,
  keyOf,
  lines,
  selected = null,
  onSelect,
  onActivate,
  footerTile = null,
  className,
}: TreemapGridProps<T>) {
  // Recharts hands the tile renderer every field of the datum it is drawing,
  // so identity, colour and the item itself ride along on the node. The item
  // travels with its own tile rather than being looked up by the injected
  // `index`, which is a post-sort position and does not index `data`.
  const tiles = useMemo(
    () =>
      data.map(
        (item): TileDatum<T> => ({
          size: sizeOf(item),
          tileKey: keyOf(item),
          tint: tintFor(item),
          item,
        }),
      ),
    [data, sizeOf, keyOf, tintFor],
  )

  // `content` takes an ELEMENT, which recharts clones once per node with the
  // datum's fields and the computed box merged in. Memoized so a parent
  // re-render with stable callbacks does not hand the treemap a new element
  // and force a full relayout.
  const tile = useMemo(
    () => (
      <Tile<T>
        lines={lines}
        selected={selected}
        onSelect={onSelect}
        onActivate={onActivate}
      />
    ),
    [lines, selected, onSelect, onActivate],
  )

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-1 p-1.5', className)}>
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={tiles}
            dataKey="size"
            type="flat"
            isAnimationActive={false}
            content={tile}
          />
        </ResponsiveContainer>
      </div>

      {footerTile ? (
        <button
          type="button"
          onClick={footerTile.onClick}
          className="flex shrink-0 items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <span className="truncate">{footerTile.label}</span>
          <ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
