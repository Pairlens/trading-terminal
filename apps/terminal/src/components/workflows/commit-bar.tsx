// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { AlertTriangle, Check, Eye, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { validateWorkflow } from '@pairlens/workflow-engine/validator'

import { DiffPanel } from './diff-panel'
import { useWorkflowStore } from '@/stores/workflow-store'

type CommitBarProps = {
  hasCycles?: boolean
  onBeforeCommit?: () => void
}

export function CommitBar({ hasCycles, onBeforeCommit }: CommitBarProps) {
  const draft = useWorkflowStore((s) => s.draft)
  const hasPendingChanges = useWorkflowStore((s) => s.hasPendingChanges)
  const commitDraft = useWorkflowStore((s) => s.commitDraft)
  const discardDraft = useWorkflowStore((s) => s.discardDraft)
  const getPendingDiff = useWorkflowStore((s) => s.getPendingDiff)

  const [diffOpen, setDiffOpen] = useState(false)

  // Full structural + per-step validation, recomputed as the draft changes.
  // Cycles are surfaced separately by the canvas (red edges), so they're
  // filtered out of this list to avoid double-reporting.
  const validationErrors = useMemo(() => {
    if (!draft) return []
    const result = validateWorkflow({
      ...draft.baseSnapshot,
      steps: draft.currentSteps,
      edges: draft.currentEdges,
    })
    return result.errors.filter((e) => !e.message.includes('cycle'))
  }, [draft])

  if (!draft) return null

  const hasChanges = hasPendingChanges()
  const changeCount = draft.pendingChanges.length
  const invalid = validationErrors.length > 0

  const handleCommit = () => {
    if (hasCycles) {
      toast.error('Cannot save workflow', {
        description:
          'The workflow contains a circular dependency. Remove the cycle (red edges) before saving.',
      })
      return
    }
    if (invalid) {
      toast.error('Cannot save workflow', {
        description: validationErrors
          .slice(0, 4)
          .map((e) => e.message)
          .join(' · '),
      })
      return
    }
    // Ensure all canvas state is synced to store before committing
    onBeforeCommit?.()
    commitDraft()
    toast.success('Workflow saved')
  }

  return (
    <>
      <div className="flex items-center justify-between border-t border-border bg-background px-3 py-2">
        <div className="flex items-center gap-2">
          {hasCycles && (
            <Badge
              variant="outline"
              className="h-5 border-red-500/30 bg-red-500/10 px-1.5 text-[10px] text-red-600 dark:text-red-400"
            >
              <AlertTriangle className="mr-1 size-3" />
              Cycle detected
            </Badge>
          )}
          {invalid && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge
                    variant="outline"
                    className="h-5 cursor-default border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-600 dark:text-amber-400"
                  >
                    <AlertTriangle className="mr-1 size-3" />
                    {validationErrors.length}{' '}
                    {validationErrors.length === 1 ? 'issue' : 'issues'}
                  </Badge>
                }
              />
              <TooltipContent side="top" className="max-w-72">
                <ul className="list-disc space-y-0.5 pl-3 text-xs">
                  {validationErrors.slice(0, 6).map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                  {validationErrors.length > 6 && (
                    <li>…and {validationErrors.length - 6} more</li>
                  )}
                </ul>
              </TooltipContent>
            </Tooltip>
          )}
          {hasChanges ? (
            <Badge
              variant="outline"
              className="h-5 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-600 dark:text-amber-400"
            >
              {changeCount} pending {changeCount === 1 ? 'change' : 'changes'}
            </Badge>
          ) : (
            !hasCycles && (
              <span className="text-xs text-muted-foreground">No changes</span>
            )
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {hasChanges && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setDiffOpen(true)}
            >
              <Eye className="size-3" />
              Review
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            disabled={!hasChanges}
            onClick={discardDraft}
          >
            <RotateCcw className="size-3" />
            Discard
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!hasChanges || hasCycles || invalid}
            onClick={handleCommit}
          >
            <Check className="size-3" />
            Commit
          </Button>
        </div>
      </div>

      <DiffPanel
        open={diffOpen}
        onOpenChange={setDiffOpen}
        diff={getPendingDiff()}
      />
    </>
  )
}
