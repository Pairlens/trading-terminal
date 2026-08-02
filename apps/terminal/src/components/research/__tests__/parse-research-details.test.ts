// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import {
  TRADE_SETUP_KEYS,
  parseKeyLines,
  parseLevels,
  parsePrices,
  parseTradeSetup,
  stripKeyLines,
} from '../parse-research-details'

const SETUP_BODY = [
  '**Bias**: Long',
  '**Entry**: $66,800–$67,400 on a retest',
  '**Invalidation**: $64,900 (below the range low)',
  '**Targets**: T1 $70,200, T2 $73k',
  '**R:R**: ~2.8',
  '',
  'Wait for the retest before committing size.',
].join('\n')

describe('parseKeyLines', () => {
  it('parses bold key-value lines, tolerating list markers', () => {
    const lines = parseKeyLines('- **Bias**: Long\n* **Entry**: $67,000\ntext')
    expect(lines.get('bias')).toBe('Long')
    expect(lines.get('entry')).toBe('$67,000')
    expect(lines.size).toBe(2)
  })

  it('ignores inline bold that is not a key line', () => {
    const lines = parseKeyLines('The move was **strong**: momentum held.')
    // A bold word at line start followed by colon still parses — but bold
    // mid-sentence must not.
    expect(lines.has('the move was **strong')).toBe(false)
  })
})

describe('parsePrices', () => {
  it('extracts dollar amounts with commas, decimals and k/m suffixes', () => {
    expect(parsePrices('T1 $70,200.50, T2 $73k, then $1.2m')).toEqual([
      70200.5, 73000, 1200000,
    ])
  })

  it('returns empty for prose without dollar prices', () => {
    expect(parsePrices('no levels here')).toEqual([])
  })
})

describe('parseTradeSetup', () => {
  it('parses the full setup block', () => {
    const setup = parseTradeSetup(SETUP_BODY)
    expect(setup.bias).toBe('long')
    expect(setup.entry).toContain('$66,800')
    expect(setup.invalidation).toContain('$64,900')
    expect(setup.targets).toContain('T2 $73k')
    expect(setup.riskReward).toBe('~2.8')
  })

  it('returns nulls when the model drifted from the format', () => {
    const setup = parseTradeSetup('Just prose, no keys.')
    expect(setup).toEqual({
      bias: null,
      entry: null,
      invalidation: null,
      targets: null,
      riskReward: null,
    })
  })
})

describe('stripKeyLines', () => {
  it('removes parsed lines and keeps the commentary', () => {
    const rest = stripKeyLines(SETUP_BODY, TRADE_SETUP_KEYS)
    expect(rest).toBe('Wait for the retest before committing size.')
  })
})

describe('parseLevels', () => {
  it('parses support and resistance price lists', () => {
    const levels = parseLevels(
      '**Support**: $65,000, $62,400\n**Resistance**: $69,800\nprose',
    )
    expect(levels.support).toEqual([65000, 62400])
    expect(levels.resistance).toEqual([69800])
  })

  it('is empty when lines are absent', () => {
    expect(parseLevels('no levels')).toEqual({ support: [], resistance: [] })
  })
})
