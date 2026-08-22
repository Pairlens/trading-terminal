// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The assistant's tool set ─────────────────────────────────────────
//
// The union of what used to be four separate chats: the trading
// copilot, the research panel, the script and bot builder, and the
// automation builder. A user asking "alert me when this breaks out"
// never cared which of those they were talking to, and now there is
// nothing to care about.
//
// Every tool module is reused as it stands. This module owns only the
// composition: resolving the two name collisions the union creates,
// dropping the handoff tool that a single assistant has no use for,
// and folding in whatever the mounted surfaces are publishing.

import { buildNavigationTools, buildResearchTools } from './terminal-tools'
import { buildDataTools } from './data-tools'
import { buildNftTools } from './nft-tools'
import { buildPredictionTools } from './prediction-tools'
import { buildSurfaceTools } from './surface-tools'
import { toAutomationDeps, toCopilotDeps, toScriptDeps } from './tool-deps'
import type { AssistantDeps } from './tool-deps'
import type { ToolSet } from 'ai'
import { listSpotlightTargets } from '@/stores/ai-spotlight-store'
import { buildMarketTools } from '@/lib/copilot/market-tools'
import { buildContextTools } from '@/lib/copilot/context-tools'
import { buildPortfolioTools } from '@/lib/copilot/portfolio-tools'
import { buildChartTools } from '@/lib/copilot/chart-tools'
import { buildWorkspaceTools } from '@/lib/copilot/workspace-tools'
import { buildTradingTools } from '@/lib/copilot/trading-tools'
import { buildTimeTools } from '@/lib/copilot/time-tools'
import { buildAssistantTools } from '@/lib/assistant/assistant-tools'
import {
  buildNotificationTools,
  buildWorkflowTools,
} from '@/lib/assistant/automation-tools'

/**
 * Chart tools whose effect has to land on the live chart component.
 * They are declared on every turn so the model can still reach for one
 * right after navigating, but they are only offered to the model while
 * a chart is actually mounted. See `activeToolsFor`.
 */
export { CHART_ACTION_TOOL_NAMES } from '@/lib/copilot/chart-tools'

/** Script tools that need the workbench open to have anywhere to write. */
const WORKBENCH_TOOL_NAMES = new Set([
  'update_script',
  'delete_file',
  'set_preview_target',
])

export function buildAssistantToolSet(deps: AssistantDeps): ToolSet {
  const copilotDeps = toCopilotDeps(deps)
  const scriptDeps = toScriptDeps(deps)
  const automationDeps = toAutomationDeps(deps)

  // `handoff_to_builder` existed to move the user between four separate
  // builder chats. There is one chat now, so the handoff is a no-op the
  // model would only trip over.
  const { handoff_to_builder: _handoff, ...scriptTools } =
    buildAssistantTools(scriptDeps)

  // Both automation registries expose `get_step_reference` over their
  // own step types. Merged into one set they would silently shadow each
  // other, so the alert one is re-keyed rather than lost.
  const { get_step_reference: alertStepReference, ...notificationTools } =
    buildNotificationTools(automationDeps)

  return {
    ...buildMarketTools(copilotDeps),
    ...buildContextTools(copilotDeps),
    ...buildPortfolioTools(copilotDeps),
    ...buildChartTools(copilotDeps),
    ...buildWorkspaceTools(copilotDeps),
    ...buildTradingTools(copilotDeps),
    ...buildTimeTools(copilotDeps),
    ...scriptTools,
    ...buildWorkflowTools(),
    ...notificationTools,
    get_alert_step_reference: alertStepReference,
    ...buildNavigationTools(deps),
    ...buildResearchTools(deps),
    // The hosted and on-chain data layers: calendars, fundamentals,
    // listings, liquidations, funding, pool state, bridge quotes. Not
    // surface-bound, so unlike the chart tools they are always offered.
    ...buildDataTools(deps),
    // Prediction markets. Their prices live on the EVENT rather than on a
    // pair, so no amount of candles or order books could reach them: an
    // outcome ladder is the only place a probability is published.
    ...buildPredictionTools(deps),
    // NFT collections. A floor is a min over a listing set rather than a
    // last trade, so no candle or ticker tool could reach it, and the
    // ladder is the only read that says whether the floor is liquid.
    ...buildNftTools(deps),
    // Surface-published actions last: a pane that publishes a name the
    // core set already uses is deliberately allowed to specialise it.
    ...buildSurfaceTools(deps.registry),
  }
}

/**
 * Which tools the model is offered for a given step. The full set is
 * always declared, because `streamText` fixes its tools for the whole
 * run and the model may navigate mid-run; this narrows what it can
 * actually reach for, so it is never offered 27 chart tools with no
 * chart on screen.
 */
export function activeToolsFor(
  deps: AssistantDeps,
  allToolNames: Array<string>,
  chartToolNames: Set<string>,
): Array<string> {
  const hasChart = deps.getChart() !== null
  const hasWorkbench = deps.getWorkbench() !== null
  // The phone publishes no spotlight targets: its shell is a different
  // tree, and there is nothing on a five-tab surface a glow would tell
  // you that the tab bar does not. Offering a tool with nowhere to
  // point invites the model to narrate a glow nobody saw.
  const hasSpotlightTargets = listSpotlightTargets().length > 0

  return allToolNames.filter((name) => {
    if (!hasChart && chartToolNames.has(name)) return false
    if (!hasWorkbench && WORKBENCH_TOOL_NAMES.has(name)) return false
    if (!hasSpotlightTargets && name === 'highlight_ui') return false
    return true
  })
}
