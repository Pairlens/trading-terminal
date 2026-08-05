// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import {
  Circle,
  CircleCheck,
  CircleMinus,
  CircleX,
  Loader2,
} from 'lucide-react'

import type {
  StepExecutionResult,
  WorkflowExecutionResult,
} from '@pairlens/workflow-engine/types'

import { stepTypeLabelById } from '@/lib/registry-labels'

// ── Status Indicators ────────────────────────────────────────────────

function StatusIcon({ status }: { status: StepExecutionResult['status'] }) {
  switch (status) {
    case 'executed':
      return <CircleCheck className="size-3.5 text-emerald-500" />
    case 'skipped':
      return <CircleMinus className="size-3.5 text-muted-foreground" />
    case 'failed':
      return <CircleX className="size-3.5 text-red-500" />
    default:
      return <Circle className="size-3.5 text-muted-foreground" />
  }
}

function statusLabel(
  status: StepExecutionResult['status'],
  t: (key: string) => string,
): string {
  switch (status) {
    case 'executed':
      return t('workflows.execution.statusExecuted')
    case 'skipped':
      return t('workflows.execution.statusSkipped')
    case 'failed':
      return t('workflows.execution.statusFailed')
  }
}

// ── Live Toast Content ───────────────────────────────────────────────

type LiveToastProps = {
  workflowName: string
  resultRef: React.RefObject<Array<StepExecutionResult>>
  finalResultRef: React.RefObject<WorkflowExecutionResult | null>
}

function LiveWorkflowToast({
  workflowName,
  resultRef,
  finalResultRef,
}: LiveToastProps) {
  const { t } = useTranslation()
  const [results, setResults] = useState<Array<StepExecutionResult>>([])
  const [finalResult, setFinalResult] =
    useState<WorkflowExecutionResult | null>(null)

  // Poll the refs to pick up new results
  useEffect(() => {
    const interval = setInterval(() => {
      const current = resultRef.current
      if (current && current.length !== results.length) {
        setResults([...current])
      }
      if (finalResultRef.current && !finalResult) {
        setFinalResult(finalResultRef.current)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [resultRef, finalResultRef, results.length, finalResult])

  const isRunning = !finalResult
  const executed = results.filter((r) => r.status === 'executed').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const failed = results.filter((r) => r.status === 'failed').length

  const borderColor = isRunning
    ? 'border-primary/30'
    : finalResult?.status === 'completed'
      ? 'border-emerald-500/30'
      : finalResult?.status === 'partial'
        ? 'border-amber-500/30'
        : finalResult?.status === 'cancelled'
          ? 'border-border'
          : 'border-red-500/30'

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.3, duration: 0.5 }}
      className={`w-80 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg ${borderColor}`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        {isRunning && <Loader2 className="size-3 animate-spin text-primary" />}
        <p className="text-xs font-semibold">{workflowName}</p>
      </div>

      {/* Step list */}
      <div className="space-y-0.5">
        {results.map((r, i) => (
          <motion.div
            key={r.stepId}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.2 }}
          >
            <div className="flex items-center gap-2 py-0.5">
              <StatusIcon status={r.status} />
              <span className="min-w-0 flex-1 truncate text-xs">
                {stepTypeLabelById(t, 'workflows', r.stepType, r.stepLabel)}
              </span>
              <span
                className={`text-[10px] ${
                  r.status === 'executed'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : r.status === 'failed'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground'
                }`}
              >
                {statusLabel(r.status, t)}
              </span>
            </div>
            {r.status === 'failed' && r.error && (
              <p className="ml-5.5 text-[10px] text-red-500">{r.error}</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* Summary — only show when complete */}
      {finalResult && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-2 border-t border-border pt-2"
        >
          <p className="text-[10px] text-muted-foreground">
            {executed > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400">
                {t('workflows.execution.summaryExecuted', { count: executed })}
              </span>
            )}
            {skipped > 0 && (
              <>
                {executed > 0 && <span> · </span>}
                <span>
                  {t('workflows.execution.summarySkipped', { count: skipped })}
                </span>
              </>
            )}
            {failed > 0 && (
              <>
                {(executed > 0 || skipped > 0) && <span> · </span>}
                <span className="text-red-600 dark:text-red-400">
                  {t('workflows.execution.summaryFailed', { count: failed })}
                </span>
              </>
            )}
          </p>
        </motion.div>
      )}
    </motion.div>
  )
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Show a live workflow execution toast that updates in real-time.
 * Returns an `onStepComplete` callback to feed into the executor.
 */
export function showLiveWorkflowToast(workflowName: string): {
  onStepComplete: (result: StepExecutionResult) => void
  onComplete: (result: WorkflowExecutionResult) => void
} {
  const resultsRef: { current: Array<StepExecutionResult> } = { current: [] }
  const finalRef: { current: WorkflowExecutionResult | null } = {
    current: null,
  }

  const toastId = toast.custom(
    () => (
      <LiveWorkflowToast
        workflowName={workflowName}
        resultRef={resultsRef as React.RefObject<Array<StepExecutionResult>>}
        finalResultRef={
          finalRef as React.RefObject<WorkflowExecutionResult | null>
        }
      />
    ),
    { duration: Infinity, id: `workflow-${Date.now()}` },
  )

  return {
    onStepComplete: (result: StepExecutionResult) => {
      resultsRef.current = [...resultsRef.current, result]
    },
    onComplete: (result: WorkflowExecutionResult) => {
      finalRef.current = result
      // Auto-dismiss after 6s once complete
      setTimeout(() => toast.dismiss(toastId), 6000)
    },
  }
}
