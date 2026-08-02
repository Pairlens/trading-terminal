// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Market Compatibility ─────────────────────────────────────────────
//
// Checks a workflow's steps against a specific market's capabilities.
// Step types declare requirements via `compat` in their definition
// (see step-registry.ts); this module evaluates those gates so the
// editor can warn ahead of time and the trade panel can refuse to run
// a workflow whose steps the current venue cannot execute.

import { getStepType } from './step-registry'
import type { WorkflowMarketInfo } from './step-registry'
import type { WorkflowDSL } from './types'

export type MarketCompatIssue = {
  stepId: string
  stepType: string
  stepLabel: string
  /** Human-readable reason the step cannot run on this market. */
  reason: string
}

/**
 * Returns one issue per step that cannot run on `market`. An empty
 * array means every step in the workflow is compatible. Steps with no
 * registered definition are skipped — structural validation reports
 * unknown step types separately.
 */
export function checkWorkflowMarketCompat(
  workflow: Pick<WorkflowDSL, 'steps'>,
  market: WorkflowMarketInfo,
): Array<MarketCompatIssue> {
  const issues: Array<MarketCompatIssue> = []
  for (const step of workflow.steps) {
    const def = getStepType(step.type)
    if (!def?.compat) continue
    const reason = def.compat.check(market)
    if (reason) {
      issues.push({
        stepId: step.id,
        stepType: step.type,
        stepLabel: def.label,
        reason,
      })
    }
  }
  return issues
}
