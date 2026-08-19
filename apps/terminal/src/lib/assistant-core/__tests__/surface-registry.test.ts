// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { z } from 'zod'

import { AssistantSurfaceRegistry } from '../surface-registry'
import { buildSurfaceTools, runSurfaceAction } from '../surface-tools'
import {
  buildScreenContextBlock,
  buildSurfaceActionBlock,
} from '../screen-context'
import type { AssistantAction } from '../types'

function action(
  name: string,
  execute: (args: unknown) => unknown = () => 'ok',
  needsApproval = false,
): AssistantAction {
  return {
    name,
    description: `does ${name}`,
    inputSchema: z.object({}),
    execute: execute as AssistantAction['execute'],
    needsApproval,
  }
}

describe('AssistantSurfaceRegistry', () => {
  test('unregisters exactly what it registered', () => {
    const registry = new AssistantSurfaceRegistry()
    const off = registry.register({
      id: 'chart',
      getContext: () => ({ summary: 'a chart' }),
    })
    expect(registry.getContexts()).toHaveLength(1)
    off()
    expect(registry.getContexts()).toHaveLength(0)
  })

  test('a remount under the same id survives the old cleanup', () => {
    const registry = new AssistantSurfaceRegistry()
    const offFirst = registry.register({
      id: 'chart',
      getContext: () => ({ summary: 'first' }),
    })
    registry.register({
      id: 'chart',
      getContext: () => ({ summary: 'second' }),
    })
    // React runs the previous effect's cleanup after the new effect in a
    // few paths; a naive delete-by-id would drop the live registration.
    offFirst()
    expect(registry.getContexts().map((c) => c.summary)).toEqual(['second'])
  })

  test('ranks contexts by priority, newest first within a priority', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'route',
      getPriority: () => -100,
      getContext: () => ({ summary: 'the page' }),
    })
    registry.register({
      id: 'chart-a',
      getPriority: () => 50,
      getContext: () => ({ summary: 'chart a' }),
    })
    registry.register({
      id: 'chart-b',
      getPriority: () => 50,
      getContext: () => ({ summary: 'chart b' }),
    })
    expect(registry.getContexts().map((c) => c.summary)).toEqual([
      'chart b',
      'chart a',
      'the page',
    ])
  })

  test('the highest-priority surface wins an action name collision', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'background-chart',
      getPriority: () => 10,
      getActions: () => [action('add_indicator', () => 'background')],
    })
    registry.register({
      id: 'focused-chart',
      getPriority: () => 100,
      getActions: () => [action('add_indicator', () => 'focused')],
    })

    const actions = registry.getActions()
    expect(actions).toHaveLength(1)
    expect(actions[0].execute({})).toBe('focused')
    expect(registry.getAction('add_indicator')?.execute({})).toBe('focused')
  })

  test('a surface that throws while describing itself is skipped, not fatal', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'broken',
      // Throws while RANKING too, which is on the path of all three
      // reads below.
      getPriority: () => {
        throw new Error('boom')
      },
      getContext: () => {
        throw new Error('boom')
      },
      getSuggestion: () => {
        throw new Error('boom')
      },
      getActions: () => {
        throw new Error('boom')
      },
    })
    registry.register({
      id: 'fine',
      getContext: () => ({ summary: 'still here' }),
      getSuggestion: () => ({ key: 'suggest.fine' }),
      getActions: () => [action('works')],
    })

    expect(registry.getContexts().map((c) => c.summary)).toEqual(['still here'])
    expect(registry.getSuggestion()).toEqual({ key: 'suggest.fine' })
    expect(registry.getActions().map((a) => a.name)).toEqual(['works'])
  })

  test('the suggestion comes from the leading surface that offers one', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'route',
      getPriority: () => -100,
      getSuggestion: () => ({ key: 'suggest.page' }),
    })
    registry.register({
      id: 'chart',
      getPriority: () => 50,
      // Mounted but with nothing to suggest: the page's line should win
      // rather than the orb falling silent.
      getSuggestion: () => null,
    })
    expect(registry.getSuggestion()).toEqual({ key: 'suggest.page' })
  })

  test('the version moves on mount and unmount', () => {
    const registry = new AssistantSurfaceRegistry()
    const seen: Array<number> = []
    registry.subscribe(() => seen.push(registry.getSnapshot()))

    const off = registry.register({ id: 'one' })
    off()
    expect(seen).toHaveLength(2)
    expect(seen[1]).toBeGreaterThan(seen[0])
  })
})

describe('surface tools', () => {
  test('an approval-gated action is declared without an execute', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'trade',
      getActions: () => [
        action('safe_read'),
        action('destructive', () => 'ran', true),
      ],
    })

    const tools = buildSurfaceTools(registry)
    // No execute means the AI SDK parks the call in `input-available`,
    // which is what lets the chat render an approval card.
    expect(tools.safe_read.execute).toBeDefined()
    expect(tools.destructive.execute).toBeUndefined()
  })

  test('a withdrawn action reports itself gone instead of throwing', async () => {
    const registry = new AssistantSurfaceRegistry()
    const off = registry.register({
      id: 'chart',
      getActions: () => [action('add_indicator')],
    })
    off()

    const result = (await runSurfaceAction(registry, 'add_indicator', {})) as {
      error?: string
    }
    expect(result.error).toContain('no longer open')
  })

  test('a failing action comes back as a value the model can read', async () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'chart',
      getActions: () => [
        action('add_indicator', () => {
          throw new Error('no chart mounted')
        }),
      ],
    })

    const result = (await runSurfaceAction(registry, 'add_indicator', {})) as {
      error?: string
    }
    expect(result.error).toBe('no chart mounted')
  })
})

describe('screen context block', () => {
  test('is null when nothing has anything to say', () => {
    const registry = new AssistantSurfaceRegistry()
    expect(buildScreenContextBlock(registry)).toBeNull()
    expect(buildSurfaceActionBlock(registry)).toBeNull()
  })

  test('renders best-first with detail inline', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'route',
      getPriority: () => -100,
      getContext: () => ({ summary: 'On the bots page.' }),
    })
    registry.register({
      id: 'chart',
      getPriority: () => 50,
      getContext: () => ({
        summary: 'A chart showing BTC-USDT.',
        detail: { timeframe: '1h' },
      }),
      getActions: () => [action('add_indicator')],
    })

    const block = buildScreenContextBlock(registry)
    expect(block).toContain('A chart showing BTC-USDT.')
    expect(block).toContain('{"timeframe":"1h"}')
    expect(block!.indexOf('A chart')).toBeLessThan(
      block!.indexOf('On the bots page.'),
    )
    expect(buildSurfaceActionBlock(registry)).toContain('add_indicator')
  })

  test('truncates a surface that dumps too much detail', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'noisy',
      getContext: () => ({
        summary: 'Noisy pane.',
        detail: { blob: 'x'.repeat(5000) },
      }),
    })
    const block = buildScreenContextBlock(registry)!
    expect(block).toContain('(truncated)')
    expect(block.length).toBeLessThan(2000)
  })
})

// ── What "this pair" means ───────────────────────────────────────────
//
// The focus is what the market tools default their arguments to when the
// user names no instrument, so getting it wrong is not a missing answer,
// it is a confident answer about a different market. Before surfaces
// published one, a board with no candle chart on it (a prediction event,
// whose chart is a probability chart) left the tools with nothing and
// they fell back to BTC-USDT on okx.

describe('registry focus', () => {
  test('the leading surface names the instrument', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'route',
      getPriority: () => -100,
      getFocus: () => ({ market: 'polymarket', pair: '30829' }),
    })
    registry.register({
      id: 'prediction-desk',
      getPriority: () => 120,
      getFocus: () => ({ market: 'polymarket', pair: 'AOC-YES' }),
    })

    // The address names the EVENT and the desk names the LEG. Only the leg
    // has a book, a tape and a ticket, so only the leg is a tool argument.
    expect(registry.getFocus()).toEqual({
      market: 'polymarket',
      pair: 'AOC-YES',
    })
  })

  test('falls through a surface that names nothing', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'route',
      getPriority: () => -100,
      getFocus: () => ({ market: 'okx', pair: 'BTC-USDT' }),
    })
    registry.register({
      id: 'page:discovery',
      getPriority: () => 30,
      getContext: () => ({ summary: 'discovery' }),
    })
    // A half-built surface that returns an empty object must not blank out
    // the address underneath it.
    registry.register({
      id: 'half-built',
      getPriority: () => 90,
      getFocus: () => ({}),
    })

    expect(registry.getFocus()).toEqual({ market: 'okx', pair: 'BTC-USDT' })
  })

  test('a throwing surface does not take the focus down with it', () => {
    const registry = new AssistantSurfaceRegistry()
    registry.register({
      id: 'broken',
      getPriority: () => 100,
      getFocus: () => {
        throw new Error('boom')
      },
    })
    registry.register({
      id: 'route',
      getPriority: () => -100,
      getFocus: () => ({ market: 'kalshi', pair: 'KXPRES-28' }),
    })

    expect(registry.getFocus()).toEqual({
      market: 'kalshi',
      pair: 'KXPRES-28',
    })
  })

  test('nothing mounted means no focus, not a default pair', () => {
    expect(new AssistantSurfaceRegistry().getFocus()).toBeNull()
  })
})
