// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fuzzy matcher for the omni search palette.
 *
 * VS Code-style scoring: multi-word queries match tokens in any order,
 * each token matches by substring (preferred) or in-order subsequence,
 * with bonuses for word-boundary and prefix hits. Returns character
 * ranges so the UI can highlight what matched.
 */

export type FuzzyMatch = {
  score: number
  /** Matched [start, end) index ranges in the target string. */
  ranges: Array<[number, number]>
}

export type RankedItem<T> = {
  item: T
  score: number
  ranges: Array<[number, number]>
}

// Word boundary = string start, after a separator, or a camelCase hump.
function isWordBoundary(target: string, index: number): boolean {
  if (index === 0) return true
  const prev = target[index - 1]
  if (
    prev === ' ' ||
    prev === '-' ||
    prev === '_' ||
    prev === '/' ||
    prev === '.' ||
    prev === ':' ||
    prev === '(' ||
    prev === '['
  ) {
    return true
  }
  const cur = target[index]
  return (
    cur >= 'A' &&
    cur <= 'Z' &&
    ((prev >= 'a' && prev <= 'z') || (prev >= '0' && prev <= '9'))
  )
}

/** Best substring occurrence of `token` in `target` (both lowercase). */
function substringMatch(
  token: string,
  target: string,
  targetLower: string,
): FuzzyMatch | null {
  let best: FuzzyMatch | null = null
  let from = 0
  while (from <= targetLower.length - token.length) {
    const idx = targetLower.indexOf(token, from)
    if (idx === -1) break

    let score = 20 + token.length * 2
    if (idx === 0) score += 12
    else if (isWordBoundary(target, idx)) score += 8
    // Earlier occurrences read as more relevant.
    score -= Math.min(idx, 20) * 0.25

    if (!best || score > best.score) {
      best = { score, ranges: [[idx, idx + token.length]] }
    }
    from = idx + 1
  }
  return best
}

/** Greedy in-order subsequence match of `token` in `target`. */
function subsequenceMatch(
  token: string,
  target: string,
  targetLower: string,
): FuzzyMatch | null {
  const ranges: Array<[number, number]> = []
  let score = 0
  let ti = 0
  let prevMatch = -2

  for (const ch of token) {
    // Prefer the next word-boundary occurrence over the next raw occurrence
    // so "op" hits "**O**pen **P**alette"-style targets cleanly.
    let found = -1
    for (let i = ti; i < targetLower.length; i++) {
      if (targetLower[i] !== ch) continue
      if (found === -1) found = i
      if (isWordBoundary(target, i)) {
        // A boundary hit close by beats a raw hit; a distant one does not.
        if (i - found <= 12) found = i
        break
      }
      if (found !== -1) break
    }
    if (found === -1) return null

    if (found === prevMatch + 1) {
      score += 4 // consecutive run
    } else if (isWordBoundary(target, found)) {
      score += 6
    } else {
      score += 1
    }
    if (found === 0) score += 6

    // Gap penalty, capped so long labels are not unfairly punished.
    if (prevMatch >= 0 && found > prevMatch + 1) {
      score -= Math.min(found - prevMatch - 1, 6) * 0.5
    }

    const last = ranges[ranges.length - 1]
    if (last && last[1] === found) last[1] = found + 1
    else ranges.push([found, found + 1])

    prevMatch = found
    ti = found + 1
  }

  return { score, ranges }
}

function matchToken(
  token: string,
  target: string,
  targetLower: string,
): FuzzyMatch | null {
  const sub = substringMatch(token, target, targetLower)
  if (sub) return sub
  // Subsequence fallback only for tokens with enough signal to avoid
  // matching scattered single letters across long labels.
  if (token.length < 2) return null
  return subsequenceMatch(token, target, targetLower)
}

function mergeRanges(ranges: Array<[number, number]>): Array<[number, number]> {
  if (ranges.length <= 1) return ranges
  const sorted = [...ranges].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    const cur = sorted[i]
    if (cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1])
    else merged.push([cur[0], cur[1]])
  }
  return merged
}

/**
 * Match a (possibly multi-word) query against a target string.
 * Every whitespace-separated query token must match; token order is free,
 * so "settings open" still hits "Open settings".
 */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null
  const targetLower = target.toLowerCase()

  let score = 0
  const allRanges: Array<[number, number]> = []
  for (const token of tokens) {
    const m = matchToken(token, target, targetLower)
    if (!m) return null
    score += m.score
    allRanges.push(...m.ranges)
  }
  // Slight bonus for covering more of the target (short labels rank higher).
  score += Math.max(0, 8 - target.length * 0.1)

  return { score, ranges: mergeRanges(allRanges) }
}

type RankAccessors<T> = {
  /** Main label — matches here score full and produce highlight ranges. */
  primary: (item: T) => string
  /** Description / subtitle — matches score at half weight, no ranges. */
  secondary?: (item: T) => string | undefined
  /** Hidden aliases — matches score at 0.7 weight, no ranges. */
  keywords?: (item: T) => Array<string> | undefined
}

/**
 * Filter + rank items against a query. Returns matches sorted by score
 * (descending, stable). Empty/blank queries return no matches — callers
 * handle the browse state themselves.
 */
export function rankItems<T>(
  query: string,
  items: Array<T>,
  accessors: RankAccessors<T>,
): Array<RankedItem<T>> {
  const q = query.trim()
  if (!q) return []

  const ranked: Array<RankedItem<T> & { index: number }> = []
  items.forEach((item, index) => {
    let best: RankedItem<T> | null = null

    const primary = fuzzyMatch(q, accessors.primary(item))
    if (primary) {
      best = { item, score: primary.score, ranges: primary.ranges }
    }

    const secondaryText = accessors.secondary?.(item)
    if (secondaryText) {
      const m = fuzzyMatch(q, secondaryText)
      if (m && m.score * 0.5 > (best?.score ?? 0)) {
        best = { item, score: m.score * 0.5, ranges: best?.ranges ?? [] }
      }
    }

    for (const keyword of accessors.keywords?.(item) ?? []) {
      const m = fuzzyMatch(q, keyword)
      if (m && m.score * 0.7 > (best?.score ?? 0)) {
        best = { item, score: m.score * 0.7, ranges: best?.ranges ?? [] }
      }
    }

    if (best) ranked.push({ ...best, index })
  })

  ranked.sort((a, b) => b.score - a.score || a.index - b.index)
  return ranked.map(({ item, score, ranges }) => ({ item, score, ranges }))
}
