// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Flame, PieChart } from 'lucide-react'
import { cn } from '@pairlens/ui'
import type { LucideIcon } from 'lucide-react'

import type { TerminalLayout } from '@/lib/layout/types'
import { getPaneIcon } from '@/lib/layout/pane-icons'
import { paneMeta } from '@/lib/workspace-store/dependency-analysis'

// getPaneIcon covers most pane icons; fill the couple it doesn't so previews
// stay faithful without touching the shared pane-icon map.
const EXTRA_ICONS: Record<string, LucideIcon> = { PieChart, Flame }

function resolvePaneIcon(name?: string): LucideIcon {
  if (name && EXTRA_ICONS[name]) return EXTRA_ICONS[name]
  return getPaneIcon(name)
}

type Props = {
  layout: TerminalLayout
  /** Show pane labels (dialog) vs. icon-only tiles (card thumbnail). */
  detailed?: boolean
  className?: string
}

/**
 * A schematic of a workspace layout — columns and stacked cells rendered to
 * scale from the persisted width/height percentages, each tile hinting at the
 * pane it holds. Purely decorative; not interactive.
 */
export function WorkspaceLayoutPreview({ layout, detailed, className }: Props) {
  return (
    <div
      className={cn(
        'flex w-full gap-1 overflow-hidden rounded-md border bg-background/40 p-1',
        className,
      )}
      aria-hidden
    >
      {layout.columns.map((col) => (
        <div
          key={col.id}
          className="flex min-w-0 flex-col gap-1"
          style={{ flexGrow: col.widthPercent, flexShrink: 1, flexBasis: 0 }}
        >
          {col.cells.map((cell) => {
            const primary = cell.panes[0]
            const meta = primary ? paneMeta(primary.type) : null
            const Icon = resolvePaneIcon(meta?.icon)
            const extra = cell.panes.length - 1
            return (
              <div
                key={cell.id}
                className="flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-sm bg-muted/70 px-1 text-muted-foreground ring-1 ring-inset ring-border/50"
                style={{
                  flexGrow: cell.heightPercent,
                  flexShrink: 1,
                  flexBasis: 0,
                }}
              >
                {primary ? (
                  <>
                    <Icon
                      className={cn(
                        'shrink-0',
                        detailed ? 'size-4' : 'size-3.5',
                      )}
                    />
                    {detailed ? (
                      <span className="w-full truncate text-center text-[10px] leading-tight">
                        {meta?.label ?? primary.type}
                        {extra > 0 ? ` +${extra}` : ''}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
