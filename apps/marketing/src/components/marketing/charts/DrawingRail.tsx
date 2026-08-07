// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The tool rail down the left edge of the hero chart. Nine of the engine's 42
// drawing tools, plus undo and clear. Like every other control on this page it
// is plain HTML over a plain library prop — the engine ships no toolbar, so
// this is what a host app writes, and writing it here is the point.
//
// Icons are inline SVG: /charts has no icon package, and nine 24px glyphs are
// cheaper than adding one.
import { DRAWING_TOOLS } from './chart-kit'
import type { ReactNode } from 'react'
import type { DrawingToolType } from '@pairlens/fast-financial-charts/types'
import type { ChartSkin } from './chart-kit'

const ICONS: Record<string, ReactNode> = {
  select: <path d="M5.5 3.5 19 11l-6.2 1.9L11 19z" />,
  line: (
    <>
      <path d="M7.9 16.1 16.1 7.9" />
      <circle cx="5.5" cy="18.5" r="2.1" />
      <circle cx="18.5" cy="5.5" r="2.1" />
    </>
  ),
  hline: (
    <>
      <path d="M2.5 12h12" />
      <rect x="16" y="9.4" width="6" height="5.2" rx="1.6" />
    </>
  ),
  rectangle: <rect x="3.4" y="6" width="17.2" height="12" rx="1.6" />,
  fibonacci: (
    <>
      <path d="M3 5h18M3 10h18M3 14h18M3 19h18" />
      <path d="M7 19 17 5" />
    </>
  ),
  'long-position': (
    <>
      <path d="M3.5 20h17M3.5 12h17M3.5 4h17" />
      <path d="M12 18.5V7M8.8 10.2 12 7l3.2 3.2" />
    </>
  ),
  measure: (
    <>
      <path d="M12 3.5v17M8.6 6.9 12 3.5l3.4 3.4M8.6 17.1 12 20.5l3.4-3.4" />
      <path d="M6.5 12h11" />
    </>
  ),
  brush: <path d="M3.5 15.5c3.2-6.6 5.4 4.2 8.6-1.8s4.2 2.2 8.4-4.2" />,
  arrow: (
    <>
      <path d="M4 20 19 5" />
      <path d="M11.5 5H19v7.5" />
    </>
  ),
  undo: (
    <>
      <path d="M4 10.5h9.5a5 5 0 0 1 0 10H10" />
      <path d="m8 6.5-4 4 4 4" />
    </>
  ),
  clear: (
    <>
      <path d="M4 6.8h16M9.4 6.8V5a1.2 1.2 0 0 1 1.2-1.2h2.8A1.2 1.2 0 0 1 14.6 5v1.8" />
      <path d="m6.2 6.8 1 12.1a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9l1-12.1" />
    </>
  ),
}

const BUTTON =
  'flex size-[30px] cursor-pointer items-center justify-center rounded-[9px] border transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent'

function Glyph({ name }: { name: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-[16px]"
    >
      {ICONS[name]}
    </svg>
  )
}

type DrawingRailProps = {
  active: DrawingToolType | null
  skin: ChartSkin
  /** Off while the chart holds nothing the visitor could undo or clear. */
  canUndo: boolean
  canClear: boolean
  onPick: (tool: DrawingToolType | null) => void
  onUndo: () => void
  onClear: () => void
}

export function DrawingRail({
  active,
  skin,
  canUndo,
  canClear,
  onPick,
  onUndo,
  onClear,
}: DrawingRailProps) {
  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      aria-orientation="vertical"
      className="flex w-[46px] shrink-0 flex-col items-center gap-[3px] border-r border-border py-2.5"
      style={{
        background: 'color-mix(in oklch, var(--background) 55%, transparent)',
      }}
    >
      {DRAWING_TOOLS.map(({ tool, label, hint, tone }) => {
        // `select` is the resting state, so a disarmed rail lights the cursor.
        const on = tool === 'select' ? active === null : active === tool
        const tint = skin[tone]
        return (
          <button
            key={String(tool)}
            type="button"
            aria-pressed={on}
            title={`${label} — ${hint}`}
            // Clicking the armed tool puts the cursor back, so the rail is a
            // way out of a tool as well as a way into one.
            onClick={() => onPick(on || tool === 'select' ? null : tool)}
            className={BUTTON}
            style={{
              borderColor: on
                ? `color-mix(in oklch, ${tint} 42%, transparent)`
                : 'transparent',
              background: on
                ? `color-mix(in oklch, ${tint} 15%, transparent)`
                : 'none',
              color: on ? tint : 'var(--muted-foreground)',
            }}
          >
            <Glyph name={String(tool)} />
            <span className="sr-only">{label}</span>
          </button>
        )
      })}

      <span aria-hidden="true" className="my-1.5 h-px w-5 bg-border" />

      <button
        type="button"
        title="Undo the last drawing"
        disabled={!canUndo}
        onClick={onUndo}
        className={BUTTON}
        style={{ borderColor: 'transparent', color: 'var(--muted-foreground)' }}
      >
        <Glyph name="undo" />
        <span className="sr-only">Undo</span>
      </button>
      <button
        type="button"
        title="Clear every drawing"
        disabled={!canClear}
        onClick={onClear}
        className={BUTTON}
        style={{ borderColor: 'transparent', color: 'var(--muted-foreground)' }}
      >
        <Glyph name="clear" />
        <span className="sr-only">Clear drawings</span>
      </button>
    </div>
  )
}
