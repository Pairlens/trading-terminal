// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── One dependency contract for one assistant ────────────────────────
//
// The three old chats each had their own deps object, shaped by the pane
// that hosted them. This one is shaped by the terminal instead: it is
// assembled once, above the routed content, and every resolver is a
// getter so a tool reads the terminal as it is at the moment it runs
// rather than as it was when the turn started.
//
// Handles that live below the routed content (the chart, the indicator
// workbench) arrive through the ServiceRegistry, which is mounted above
// it. A null handle is a normal state, not an error: it means that
// surface simply is not open, and the tool says so.

import type { PluginManager } from '@pairlens/plugin-system'

import type {
  CopilotContextInfo,
  CopilotMarketContext,
  CopilotMarketDataHandle,
  CopilotToolDeps,
} from '@/lib/copilot/tool-deps'
import type {
  AssistantToolDeps,
  AssistantWorkbenchBridge,
} from '@/lib/assistant/assistant-tools'
import type { AutomationToolDeps } from '@/lib/assistant/automation-tools'
import type { ChartServiceHandle } from './chart-service'
import type { AssistantSurfaceRegistry } from './surface-registry'
import { getPythonRuntime } from '@/lib/python/python-runtime'
import { pageLink } from '@/lib/routing/pages'

/** Where the assistant should act when the user does not name a target. */
export type AssistantFocus = CopilotContextInfo

export type AssistantDeps = {
  pluginManager: PluginManager
  /** MarketDataProvider, narrowed. Null before the plugins are ready. */
  getMarketData: () => CopilotMarketDataHandle | null
  /** The chart the user is looking at, or null when none is open. */
  getChart: () => ChartServiceHandle | null
  /** The indicator workbench, or null when it is not open. */
  getWorkbench: () => AssistantWorkbenchBridge | null
  /** Pair, venue and timeframe to default tool arguments to. */
  getFocus: () => AssistantFocus
  /** Router navigation, injected so the tool modules stay router-free. */
  navigate: (to: string) => void
  /** Surfaces publishing context and actions right now. */
  registry: AssistantSurfaceRegistry
  /** Arms a follow-up turn. Owned by the dock, which survives navigation. */
  scheduleCheck?: (minutes: number, instruction: string) => void
}

// ── Adapters onto the existing tool modules ──────────────────────────

/**
 * Live candles and ticker for the on-screen pair, when a chart is open.
 * Without one the market tools fall back to fetching history, which is
 * a slower path to the same answer rather than a missing one.
 */
function marketContextOf(deps: AssistantDeps): CopilotMarketContext | null {
  return deps.getChart()?.getMarketContext?.() ?? null
}

export function toCopilotDeps(deps: AssistantDeps): CopilotToolDeps {
  return {
    getCtx: () => marketContextOf(deps),
    getContextInfo: () => deps.getFocus(),
    getMarketData: () => deps.getMarketData(),
    pluginManager: deps.pluginManager,
    getChartSnapshot: () => deps.getChart()?.getSnapshot?.() ?? null,
  }
}

/**
 * The script and bot tools branch on `surface` in one place: the preview
 * target can only be re-pointed when a workbench is actually open to
 * re-point. Deriving it from the live handle keeps that check honest now
 * that there is no per-page chat to carry the answer.
 */
export function toScriptDeps(deps: AssistantDeps): AssistantToolDeps {
  return {
    surface: deps.getWorkbench() ? 'indicators' : 'bots',
    getWorkbench: () => deps.getWorkbench(),
    getMarketData: () => deps.getMarketData(),
    getPython: () => getPythonRuntime(),
    navigate: (route) => deps.navigate(routeForBuilder(route)),
  }
}

export function toAutomationDeps(deps: AssistantDeps): AutomationToolDeps {
  return {
    surface: 'notifications',
    getMarketData: () => deps.getMarketData(),
    navigate: (route) => deps.navigate(routeForBuilder(route)),
  }
}

function routeForBuilder(route: { to: string; scriptId?: string }): string {
  if (route.to === 'indicators') return pageLink('indicators', route.scriptId)
  return `/${route.to}`
}
