// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ---------------------------------------------------------------------------
// Pure parsers for the structured bold-key lines the research prompt asks the
// model to emit (`**Key**: value`). Section renderers use these to upgrade
// prose into components (trade-setup card, sparkline level overlays) and fall
// back to plain markdown when the model drifted from the format.
// ---------------------------------------------------------------------------

const KEY_LINE_RE = /^\s*[-*]?\s*\*\*([^*]+)\*\*\s*:\s*(.+?)\s*$/

/** Extract `**Key**: value` lines into a lowercase-keyed map. */
export function parseKeyLines(body: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of body.split('\n')) {
    const m = line.match(KEY_LINE_RE)
    if (m) out.set(m[1].trim().toLowerCase(), m[2].trim())
  }
  return out
}

/** Remove the `**Key**: value` lines for the given (lowercase) keys. */
export function stripKeyLines(body: string, keys: Set<string>): string {
  return body
    .split('\n')
    .filter((line) => {
      const m = line.match(KEY_LINE_RE)
      return !(m && keys.has(m[1].trim().toLowerCase()))
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Pull dollar amounts (or bare numbers) out of a value like "T1 $68,500, T2 $72k". */
export function parsePrices(value: string): Array<number> {
  const prices: Array<number> = []
  const re = /\$\s?([\d,]+(?:\.\d+)?)\s*(k|K|m|M)?/g
  for (const m of value.matchAll(re)) {
    let n = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isNaN(n)) continue
    if (m[2]?.toLowerCase() === 'k') n *= 1_000
    if (m[2]?.toLowerCase() === 'm') n *= 1_000_000
    prices.push(n)
  }
  return prices
}

export type TradeSetupDetails = {
  bias: 'long' | 'short' | 'flat' | null
  entry: string | null
  invalidation: string | null
  targets: string | null
  riskReward: string | null
}

export const TRADE_SETUP_KEYS = new Set([
  'bias',
  'entry',
  'invalidation',
  'targets',
  'r:r',
])

/** Parse the Trade Setup key lines. Missing keys stay null. */
export function parseTradeSetup(body: string): TradeSetupDetails {
  const lines = parseKeyLines(body)
  const biasRaw = lines.get('bias')?.toLowerCase() ?? ''
  const bias = biasRaw.includes('long')
    ? ('long' as const)
    : biasRaw.includes('short')
      ? ('short' as const)
      : biasRaw.includes('flat')
        ? ('flat' as const)
        : null
  return {
    bias,
    entry: lines.get('entry') ?? null,
    invalidation: lines.get('invalidation') ?? null,
    targets: lines.get('targets') ?? null,
    riskReward: lines.get('r:r') ?? null,
  }
}

export type ParsedLevels = {
  support: Array<number>
  resistance: Array<number>
}

/** Parse `**Support**:` / `**Resistance**:` lines into price arrays. */
export function parseLevels(body: string): ParsedLevels {
  const lines = parseKeyLines(body)
  return {
    support: parsePrices(lines.get('support') ?? ''),
    resistance: parsePrices(lines.get('resistance') ?? ''),
  }
}
