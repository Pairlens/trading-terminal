// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { buildMarketTools } from './market-tools'
import { buildContextTools } from './context-tools'
import { buildPortfolioTools } from './portfolio-tools'
import { CHART_ACTION_TOOL_NAMES, buildChartTools } from './chart-tools'
import { NAVIGATION_TOOL_NAMES, buildWorkspaceTools } from './workspace-tools'
import { TRADING_TOOL_NAMES, buildTradingTools } from './trading-tools'
import { SCHEDULE_TOOL_NAMES, buildTimeTools } from './time-tools'
import type { CopilotToolDeps } from './tool-deps'

export type { CopilotToolDeps } from './tool-deps'
export {
  CHART_ACTION_TOOL_NAMES,
  NAVIGATION_TOOL_NAMES,
  TRADING_TOOL_NAMES,
  SCHEDULE_TOOL_NAMES,
}

/**
 * Tool calls whose real effect must run in the terminal (panel onToolCall):
 * chart mutations + navigation + scheduled checks. Data/read tools and the two
 * trading proposals are NOT here — reads resolve in the transport; trades
 * render a confirm card.
 */
export const CLIENT_FORWARDED_TOOL_NAMES = new Set<string>([
  ...CHART_ACTION_TOOL_NAMES,
  ...NAVIGATION_TOOL_NAMES,
  ...SCHEDULE_TOOL_NAMES,
])

/**
 * Build the full copilot tool set. Data/read tools execute in the transport and
 * return values; forwarded action tools return a confirmation string and fire
 * for real in the panel; trading tools return a proposal for user confirmation.
 */
export function buildCopilotTools(deps: CopilotToolDeps) {
  return {
    ...buildMarketTools(deps),
    ...buildContextTools(deps),
    ...buildPortfolioTools(deps),
    ...buildChartTools(deps),
    ...buildWorkspaceTools(deps),
    ...buildTradingTools(deps),
    ...buildTimeTools(deps),
  }
}
