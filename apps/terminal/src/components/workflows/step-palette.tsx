// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@pairlens/ui'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'
import type { DragEvent } from 'react'

import type { WorkflowStepTypeDefinition } from '@pairlens/workflow-engine/step-registry'

import { useMarketData } from '@/lib/market-data-provider'
import { isStandalone } from '@/lib/platform'
import { useWorkflowStepRegistry } from '@/lib/workflows/workflow-step-registry'
import {
  FallbackStepIcon,
  getWorkflowStepIcon,
} from '@/lib/workflows/workflow-icons'

// Module-level variable to pass drag data — Tauri's WebKit webview
// intercepts native drag events so dataTransfer.getData() returns empty.
let pendingDragStepType: string | null = null

export function getDragStepType(): string | null {
  return pendingDragStepType
}

export function clearDragStepType(): void {
  pendingDragStepType = null
}

const CATEGORY_ORDER = ['entry', 'order', 'exit', 'logic', 'custom'] as const

const CATEGORY_LABELS: Record<string, string> = {
  entry: 'Entry',
  order: 'Orders',
  exit: 'Exit Strategies',
  logic: 'Logic',
  custom: 'Custom',
}

type StepPaletteProps = {
  onAddStep?: (stepType: string) => void
}

/** Tooltip note for steps gated on venue capabilities: shows the
 * requirement plus which of the connected markets can(not) run it. */
function StepCompatNote({ def }: { def: WorkflowStepTypeDefinition }) {
  const { availableMarkets } = useMarketData()
  if (!def.compat) return null

  const unsupported = availableMarkets.filter(
    (m) => def.compat!.check(m) !== null,
  )

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Info className="ml-auto size-3 shrink-0 text-muted-foreground/60" />
        }
      />
      <TooltipContent side="left" className="max-w-64">
        <p className="text-xs">Requires: {def.compat.requires}</p>
        {unsupported.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            Not available on{' '}
            {unsupported.map((m) => m.displayName ?? m.marketId).join(', ')}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export function StepPalette({ onAddStep }: StepPaletteProps) {
  const registry = useWorkflowStepRegistry()
  const stepTypes = registry.getAllDefinitions()

  // Group by category
  const grouped = new Map<string, Array<WorkflowStepTypeDefinition>>()
  for (const st of stepTypes) {
    const existing = grouped.get(st.category) ?? []
    existing.push(st)
    grouped.set(st.category, existing)
  }

  const onDragStart = useCallback((event: DragEvent, stepType: string) => {
    pendingDragStepType = stepType
    event.dataTransfer.setData('application/workflow-step-type', stepType)
    event.dataTransfer.effectAllowed = 'move'
  }, [])

  const handleClick = useCallback(
    (stepType: string) => {
      onAddStep?.(stepType)
    },
    [onAddStep],
  )

  return (
    <div className="flex w-56 shrink-0 flex-col border-l border-border bg-background">
      <div className="border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Add Step
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-1.5">
        {CATEGORY_ORDER.map((cat) => {
          const items = grouped.get(cat)
          if (!items?.length) return null
          return (
            <div key={cat} className="mb-3">
              <p className="mb-1 px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[cat] ?? cat}
              </p>
              {items.map((st) => {
                const CustomIcon = registry.getIconComponent(st.type)
                const LucideIcon = getWorkflowStepIcon(st.icon)
                const Icon = CustomIcon ?? LucideIcon ?? FallbackStepIcon
                // Trigger is auto-created — show disabled
                const isDisabled = st.type === 'trigger'
                return (
                  <div
                    key={st.type}
                    draggable={!isDisabled && !isStandalone}
                    onDragStart={
                      isDisabled || isStandalone
                        ? undefined
                        : (e) => onDragStart(e, st.type)
                    }
                    onClick={
                      isDisabled ? undefined : () => handleClick(st.type)
                    }
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                      'transition-colors',
                      isDisabled
                        ? 'cursor-not-allowed opacity-40'
                        : 'cursor-pointer text-muted-foreground hover:bg-muted hover:text-foreground active:bg-accent',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span>{st.label}</span>
                    <StepCompatNote def={st} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
