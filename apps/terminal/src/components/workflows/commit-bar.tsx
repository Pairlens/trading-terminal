// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
      toast.error(t('workflows.commitBar.saveErrorTitle'), {
        description: t('workflows.commitBar.saveErrorCycleBody'),
      })
      return
    }
    if (invalid) {
      toast.error(t('workflows.commitBar.saveErrorTitle'), {
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
    toast.success(t('workflows.commitBar.saveSuccess'))
  }

  return (
    <>
      {/* The column's footer: one hairline over the canvas well above it. */}
      <div className="flex shrink-0 items-center justify-between border-t border-(--pane-rule) px-3 py-2">
        <div className="flex items-center gap-2">
          {hasCycles && (
            <Badge
              variant="outline"
              className="h-5 border-red-500/30 bg-red-500/10 px-1.5 text-[10px] text-red-600 dark:text-red-400"
            >
              <AlertTriangle className="mr-1 size-3" />
              {t('workflows.commitBar.cycleDetected')}
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
                    {t('workflows.commitBar.issue', {
                      count: validationErrors.length,
                    })}
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
              {t('workflows.commitBar.pendingChange', { count: changeCount })}
            </Badge>
          ) : (
            !hasCycles && (
              <span className="text-xs text-muted-foreground">
                {t('workflows.commitBar.noChanges')}
              </span>
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
              {t('workflows.commitBar.review')}
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
            {t('workflows.commitBar.discard')}
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 text-xs"
            disabled={!hasChanges || hasCycles || invalid}
            onClick={handleCommit}
          >
            <Check className="size-3" />
            {t('workflows.commitBar.commit')}
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
