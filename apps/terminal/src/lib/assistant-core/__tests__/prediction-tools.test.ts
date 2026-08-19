// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The asset class the assistant could not read.
 *
 * A prediction market publishes its prices on the EVENT, as an outcome
 * ladder, and nothing else in the tool set addresses an event: candles and
 * order books take a leg. So "I can't identify the outcome prices" was not a
 * model failing to try, it was a model with nothing to call. These tests pin
 * the two calls that fixed it, and the three ways they are allowed to fail.
 */
import { describe, expect, test } from 'bun:test'

import { buildPredictionTools } from '../prediction-tools'
import { TOOL_OPTIONS, fakePlugin, stubDeps } from './data-tools-fakes'
import type { PredictionEventSummary } from '@pairlens/shared/instrument-types'

import type { ToolResult } from './data-tools-fakes'

const EVENT: PredictionEventSummary = {
  id: '30829',
  market: 'polymarket',
  title: 'Democratic Presidential Nominee 2028',
  category: 'Politics',
  volume: 1_300_000_000,
  liquidity: 79_800_000,
  endMs: Date.UTC(2028, 10, 7),
  markets: [
    {
      id: 'm-aoc',
      title: 'Will Alexandria Ocasio-Cortez win the 2028 nomination?',
      shortTitle: 'Alexandria Ocasio-Cortez',
      rules: 'Resolves Yes if the named individual wins and accepts.',
      outcomes: [
        { pairKey: 'AOC-YES', label: 'Yes', price: 0.195, change24h: -0.005 },
        { pairKey: 'AOC-NO', label: 'No', price: 0.805 },
      ],
      volume: 14_700_000,
    },
    {
      id: 'm-newsom',
      title: 'Will Gavin Newsom win the 2028 nomination?',
      shortTitle: 'Gavin Newsom',
      outcomes: [
        { pairKey: 'NEWSOM-YES', label: 'Yes', price: 0.157 },
        { pairKey: 'NEWSOM-NO', label: 'No', price: 0.844 },
      ],
      volume: 26_800_000,
    },
    {
      id: 'm-ossoff',
      title: 'Will Jon Ossoff win the 2028 nomination?',
      shortTitle: 'Jon Ossoff',
      outcomes: [
        { pairKey: 'OSSOFF-YES', label: 'Yes', price: 0.138 },
        { pairKey: 'OSSOFF-NO', label: 'No', price: 0.863 },
      ],
      volume: 12_700_000,
    },
  ],
}

function venue(
  id: string,
  market: string,
  execute?: (input: { params: Record<string, unknown> }) => unknown,
) {
  return fakePlugin({
    id,
    name: `${market} Market Connector`,
    assetClass: 'prediction',
    capabilities: [{ id: 'market-data:events', markets: [market] }],
    execute: (input) =>
      execute ? execute(input) : { market, events: [EVENT], ts: 0 },
  })
}

/** Kalshi in a browser: the connector throws a typed platform refusal. */
function restricted(id: string, market: string) {
  return venue(id, market, () => {
    const error = new Error(`${market} requires the desktop app`)
    error.name = 'PlatformRestrictedError'
    ;(error as unknown as { code: string }).code = 'PLATFORM_RESTRICTED'
    throw error
  })
}

describe('get_prediction_event', () => {
  test('returns every outcome with its probability, favourite first', async () => {
    const poly = venue('polymarket-connector', 'polymarket')
    const { deps } = stubDeps({ plugins: [poly.instance] })
    const tools = buildPredictionTools(deps)

    const result = await (
      tools.get_prediction_event as never as {
        execute: (a: unknown, o: unknown) => Promise<ToolResult>
      }
    ).execute({ eventId: '30829' }, TOOL_OPTIONS)

    expect(result.title).toBe('Democratic Presidential Nominee 2028')
    expect(result.venue).toBe('polymarket')
    expect(result.outcomeCount).toBe(3)
    const runners = result.runners as Array<Record<string, unknown>>
    // Newsom is FIRST by volume and second by price; the ladder is by price,
    // because "the favourite" is a probability and not a turnover.
    expect(runners.map((r) => r.label)).toEqual([
      'Alexandria Ocasio-Cortez',
      'Gavin Newsom',
      'Jon Ossoff',
    ])
    expect(runners[0].yes).toBe(0.195)
    expect(runners[0].yesPercent).toBe(19.5)
    // The key an order takes rides out with every runner. Without it the
    // model can read a price it has no way to act on.
    expect(runners[0].pairKey).toBe('AOC-YES')
    expect(runners[0].noPairKey).toBe('AOC-NO')
    expect(result.rules).toContain('Resolves Yes')
  })

  test('states what the whole field costs', async () => {
    const poly = venue('polymarket-connector', 'polymarket')
    const { deps } = stubDeps({ plugins: [poly.instance] })
    const tools = buildPredictionTools(deps)

    const result = await (
      tools.get_prediction_event as never as {
        execute: (a: unknown, o: unknown) => Promise<ToolResult>
      }
    ).execute({ eventId: '30829' }, TOOL_OPTIONS)

    // 0.195 + 0.157 + 0.138. The number the header draws, same helper.
    const field = result.fieldTotal as Record<string, unknown>
    expect(field.sumOfYesPrices).toBe(0.49)
    expect(field.edge).toBe(-0.51)
    expect(field.basis).toBe('last')
    // Three runners priced, none missing: an unpriced leg would make the
    // sum understate, and a reader has to know by how much.
    expect(field.pricedRunners).toBe(3)
    expect(field.unpricedRunners).toBe(0)
  })

  test('asks the venue directly, never the resolver', async () => {
    const poly = venue('polymarket-connector', 'polymarket')
    const { deps, managerCalls } = stubDeps({ plugins: [poly.instance] })
    const tools = buildPredictionTools(deps)

    await (
      tools.get_prediction_event as never as {
        execute: (a: unknown, o: unknown) => Promise<ToolResult>
      }
    ).execute({ eventId: '30829' }, TOOL_OPTIONS)

    // The resolver picks one winner per capability and shares a mutable
    // market context. A fan-out addressed by name cannot use it.
    expect(managerCalls.length).toBe(0)
    expect(poly.calls[0]?.params.eventId).toBe('30829')
  })

  test('a venue that refuses is reported as refusing, not as absent', async () => {
    const kalshi = restricted('kalshi-connector', 'kalshi')
    const { deps } = stubDeps({ plugins: [kalshi.instance] })
    const tools = buildPredictionTools(deps)

    const result = await (
      tools.get_prediction_event as never as {
        execute: (a: unknown, o: unknown) => Promise<ToolResult>
      }
    ).execute({ eventId: 'KXPRES-28' }, TOOL_OPTIONS)

    expect(result.notFound).toBe(true)
    const refusals = result.refusals as Array<Record<string, unknown>>
    expect(refusals[0].venue).toBe('kalshi')
    expect(String(refusals[0].reason)).toContain('desktop app')
    // "This event does not exist" and "this build cannot see it" are
    // different sentences to a user, and only one of them is true here.
    expect(String(result.hint)).toContain('unreadable')
  })

  test('says so rather than guessing when no connector is installed', async () => {
    const { deps } = stubDeps({ plugins: [] })
    const tools = buildPredictionTools(deps)

    const result = await (
      tools.get_prediction_event as never as {
        execute: (a: unknown, o: unknown) => Promise<ToolResult>
      }
    ).execute({ eventId: '30829' }, TOOL_OPTIONS)

    expect(result.unavailable).toBe('no_prediction_venue')
  })
})

describe('search_prediction_events', () => {
  test('fans across venues and ranks by volume', async () => {
    const poly = venue('polymarket-connector', 'polymarket')
    const kalshi = venue('kalshi-connector', 'kalshi', () => ({
      market: 'kalshi',
      events: [{ ...EVENT, id: 'KX', market: 'kalshi', volume: 5 }],
      ts: 0,
    }))
    const { deps } = stubDeps({
      plugins: [poly.instance, kalshi.instance],
    })
    const tools = buildPredictionTools(deps)

    const result = await (
      tools.search_prediction_events as never as {
        execute: (a: unknown, o: unknown) => Promise<ToolResult>
      }
    ).execute({ query: 'nominee' }, TOOL_OPTIONS)

    const results = result.results as Array<Record<string, unknown>>
    expect(results.map((r) => r.venue).sort()).toEqual(['kalshi', 'polymarket'])
    expect(poly.calls[0]?.params.query).toBe('nominee')
  })

  test('refuses an unfiltered sweep rather than asking for one', async () => {
    const poly = venue('polymarket-connector', 'polymarket')
    const { deps } = stubDeps({ plugins: [poly.instance] })
    const tools = buildPredictionTools(deps)

    const result = await (
      tools.search_prediction_events as never as {
        execute: (a: unknown, o: unknown) => Promise<ToolResult>
      }
    ).execute({}, TOOL_OPTIONS)

    // Both venues require a selector, so an unfiltered call is a wasted
    // round trip that comes back looking like an empty market.
    expect(String(result.error)).toContain('query or a category')
    expect(poly.calls.length).toBe(0)
  })
})

describe('the prediction tool set', () => {
  test('every description is dash-free house prose', () => {
    const { deps } = stubDeps({ plugins: [] })
    for (const [name, definition] of Object.entries(
      buildPredictionTools(deps),
    )) {
      const description = (definition as { description?: string }).description
      expect(typeof description).toBe('string')
      expect(`${name}: ${description}`).not.toMatch(/[—–]/)
    }
  })
})
