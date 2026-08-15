// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { AssistantSurfaceRegistry } from '../surface-registry'
import { activeToolsFor, buildAssistantToolSet } from '../tools'
import { ASSISTANT_ALL_TOOL_LABELS } from '../tool-labels'
import type { CopilotToolDeps } from '@/lib/copilot/tool-deps'
import type { AssistantDeps } from '../tool-deps'
import { buildMarketTools } from '@/lib/copilot/market-tools'
import { buildContextTools } from '@/lib/copilot/context-tools'
import { buildPortfolioTools } from '@/lib/copilot/portfolio-tools'
import {
  CHART_ACTION_TOOL_NAMES,
  buildChartTools,
} from '@/lib/copilot/chart-tools'
import { buildWorkspaceTools } from '@/lib/copilot/workspace-tools'
import { buildTradingTools } from '@/lib/copilot/trading-tools'
import { buildTimeTools } from '@/lib/copilot/time-tools'
import { buildAssistantTools } from '@/lib/assistant/assistant-tools'
import {
  buildNotificationTools,
  buildWorkflowTools,
} from '@/lib/assistant/automation-tools'

// Tools only touch deps inside execute(), so a shallow stub is enough to
// enumerate the set. The two resolvers below ARE read at build time.
function stubDeps(overrides: Partial<AssistantDeps> = {}): AssistantDeps {
  return {
    pluginManager: {} as AssistantDeps['pluginManager'],
    getMarketData: () => null,
    getChart: () => null,
    getWorkbench: () => null,
    getFocus: () => ({}),
    navigate: () => {},
    registry: new AssistantSurfaceRegistry(),
    ...overrides,
  }
}

describe('the unified tool set', () => {
  test('carries every tool the four old chats had', () => {
    const names = new Set(Object.keys(buildAssistantToolSet(stubDeps())))

    const copilot = {
      ...buildMarketTools({} as CopilotToolDeps),
      ...buildContextTools({} as CopilotToolDeps),
      ...buildPortfolioTools({} as CopilotToolDeps),
      ...buildChartTools({} as CopilotToolDeps),
      ...buildWorkspaceTools({} as CopilotToolDeps),
      ...buildTradingTools({} as CopilotToolDeps),
      ...buildTimeTools({} as CopilotToolDeps),
    }
    for (const name of Object.keys(copilot)) {
      expect(names).toContain(name)
    }

    const script = buildAssistantTools({
      surface: 'indicators',
      getWorkbench: () => null,
      getMarketData: () => null,
      getPython: () => ({}) as never,
      navigate: () => {},
    })
    for (const name of Object.keys(script)) {
      // The one deliberate drop: a single assistant has nowhere to hand off to.
      if (name === 'handoff_to_builder') continue
      expect(names).toContain(name)
    }

    for (const name of Object.keys(buildWorkflowTools())) {
      expect(names).toContain(name)
    }
  })

  test('drops handoff_to_builder', () => {
    const names = Object.keys(buildAssistantToolSet(stubDeps()))
    expect(names).not.toContain('handoff_to_builder')
  })

  test('re-keys the colliding alert step reference instead of losing it', () => {
    // Both automation registries export `get_step_reference` over their own
    // step types. Spread naively, one silently shadows the other.
    const workflow = Object.keys(buildWorkflowTools())
    const notification = Object.keys(
      buildNotificationTools({
        surface: 'notifications',
        getMarketData: () => null,
        navigate: () => {},
      }),
    )
    expect(workflow).toContain('get_step_reference')
    expect(notification).toContain('get_step_reference')

    const names = Object.keys(buildAssistantToolSet(stubDeps()))
    expect(names).toContain('get_step_reference')
    expect(names).toContain('get_alert_step_reference')
  })

  test('adds the tools only a terminal-wide assistant can have', () => {
    const names = Object.keys(buildAssistantToolSet(stubDeps()))
    expect(names).toContain('navigate_to')
    expect(names).toContain('get_screen')
    expect(names).toContain('deep_research')
  })

  test('folds in what the mounted surfaces publish', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'workspace',
      getActions: () => [
        {
          name: 'add_pane',
          description: 'adds a pane',
          inputSchema: z.object({}),
          execute: () => 'ok',
        },
      ],
    })
    const names = Object.keys(buildAssistantToolSet(stubDeps({ registry })))
    expect(names).toContain('add_pane')
  })

  test('every tool has a chip label', () => {
    const names = Object.keys(buildAssistantToolSet(stubDeps()))
    const missing = names.filter((name) => !(name in ASSISTANT_ALL_TOOL_LABELS))
    expect(missing).toEqual([])
  })
})

describe('navigate_to', () => {
  function navigateWith(input: { page: string; target?: string }) {
    const visited: Array<string> = []
    const tools = buildAssistantToolSet(
      stubDeps({ navigate: (to) => visited.push(to) }),
    )
    const result = tools.navigate_to.execute!(input as never, {
      toolCallId: 't',
      messages: [],
    })
    return { visited, result: result as { navigatedTo: string } }
  }

  test('opens the exact record it was given, not just the page', () => {
    const { visited, result } = navigateWith({
      page: 'workflows',
      target: 'wf-42',
    })
    expect(visited).toEqual(['/workflows?workflow=wf-42'])
    expect(result.navigatedTo).toBe('/workflows?workflow=wf-42')
  })

  test('still lands on the page when no target is named', () => {
    expect(navigateWith({ page: 'bots' }).visited).toEqual(['/bots'])
  })

  test('takes the user to a Discovery section by name', () => {
    expect(navigateWith({ page: 'discovery', target: 'perp' }).visited).toEqual(
      ['/?section=perp'],
    )
  })

  test('drops a target that cannot be an id rather than encoding it', () => {
    expect(
      navigateWith({ page: 'workflows', target: '/../accounts' }).visited,
    ).toEqual(['/workflows'])
  })
})

describe('per-step tool gating', () => {
  const allNames = Object.keys(buildAssistantToolSet(stubDeps()))
  const chartTools = new Set<string>(CHART_ACTION_TOOL_NAMES)

  test('hides the chart tools when no chart is mounted', () => {
    const active = activeToolsFor(stubDeps(), allNames, chartTools)
    for (const name of chartTools) {
      expect(active).not.toContain(name)
    }
    // The reads are not gated: a chart tool the model cannot fire is one
    // thing, a market question it cannot answer is another.
    expect(active).toContain('get_market_snapshot')
  })

  test('offers them again once a chart is there', () => {
    const withChart = stubDeps({
      getChart: () => ({}) as never,
    })
    const active = activeToolsFor(withChart, allNames, chartTools)
    expect(active).toContain('add_indicator')
  })

  test('gates the workbench writers on an open workbench', () => {
    const closed = activeToolsFor(stubDeps(), allNames, chartTools)
    expect(closed).not.toContain('update_script')
    expect(closed).not.toContain('set_preview_target')
    // Reading and creating still work from anywhere.
    expect(closed).toContain('list_scripts')
    expect(closed).toContain('create_script')

    const open = activeToolsFor(
      stubDeps({ getWorkbench: () => ({}) as never }),
      allNames,
      chartTools,
    )
    expect(open).toContain('update_script')
  })
})
