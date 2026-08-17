// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Attaching a headline to a probability move, honestly.
 *
 * The news feed is keyed by TICKER. A prediction question does not have one:
 * "Will the Fed cut rates at the September FOMC meeting?" names no instrument
 * the provider indexes, and there is no free-text search behind it. So the
 * timeline's headline column is available for a minority of questions and
 * absent for the rest, and the pane says so rather than leaving an empty
 * column that reads as "nothing happened".
 *
 * Where a ticker IS recoverable — "Bitcoin above $70k on Aug 31?" — the match
 * is by TIME, not by cause. The article is the last one published while the
 * market was repricing, which is a correlation the reader can check, not a
 * claim about what moved it. Copy on the pane is worded to match.
 */
import type { NewsArticle } from '@pairlens/shared/instrument-types'

/**
 * Words a question can use for an instrument the news feed indexes.
 *
 * Deliberately short and literal. A fuzzy matcher would happily read "Will
 * Congress pass the SOL Act" as Solana and hang a crypto headline off a
 * legislative question, and a wrong headline is far worse than none — it is
 * the pane asserting a cause.
 */
const TICKER_ALIASES: Array<[RegExp, string]> = [
  [/\bbitcoin\b|\bbtc\b/i, 'BTC'],
  [/\bethereum\b|\beth\b/i, 'ETH'],
  [/\bsolana\b/i, 'SOL'],
  [/\bripple\b|\bxrp\b/i, 'XRP'],
  [/\bdogecoin\b/i, 'DOGE'],
  [/\bcardano\b/i, 'ADA'],
  [/\bavalanche\b/i, 'AVAX'],
  [/\bchainlink\b/i, 'LINK'],
  [/\btesla\b|\btsla\b/i, 'TSLA'],
  [/\bnvidia\b|\bnvda\b/i, 'NVDA'],
  [/\bapple\b|\baapl\b/i, 'AAPL'],
]

/**
 * The ticker a question names, or null when it names none we can query.
 *
 * The EARLIEST mention wins, not the first entry in the list above. A question
 * names its subject first and its comparison second ("Will Ethereum flip
 * Bitcoin by 2027?"), so list order would answer with whichever instrument the
 * table happened to define first, which is arbitrary.
 */
export function newsTickerFor(text: string): string | null {
  const trimmed = text?.trim()
  if (!trimmed) return null
  let best: string | null = null
  let bestAt = Infinity
  for (const [pattern, ticker] of TICKER_ALIASES) {
    const match = pattern.exec(trimmed)
    if (!match) continue
    if (match.index < bestAt) {
      best = ticker
      bestAt = match.index
    }
  }
  return best
}

/**
 * The last headline published while the market was repricing, or null.
 *
 * Inclusive at both ends: a move whose window is a single bar would otherwise
 * never match anything, and the boundary is arbitrary either way.
 */
export function headlineDuring(
  articles: Array<NewsArticle>,
  startTs: number,
  endTs: number,
): NewsArticle | null {
  let best: NewsArticle | null = null
  let bestTs = -Infinity
  for (const article of articles) {
    const ts = Date.parse(article.timePublished)
    if (!Number.isFinite(ts)) continue
    if (ts < startTs || ts > endTs) continue
    if (ts > bestTs) {
      best = article
      bestTs = ts
    }
  }
  return best
}
