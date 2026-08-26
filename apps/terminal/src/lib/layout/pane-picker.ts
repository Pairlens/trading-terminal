// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Finding a panel among ninety-three, and saying what it needs.
 *
 * Pure functions, deliberately: the picker's ranking is the part that decides
 * whether typing "fund" lands on Funding Matrix or on a panel whose
 * description happens to contain the word, and that is worth a test rather
 * than a screenshot.
 */
import type { PaneDefinition } from './types'

// ── Search ──────────────────────────────────────────────────────────

export type PanePickerEntry = {
  type: string
  def: PaneDefinition
  /** Translated display name — what the reader is most likely typing. */
  label: string
  /** Translated one-liner. */
  description: string
  /** Translated category name, so "trading" finds the trading panels. */
  categoryLabel: string
  /** The owning plugin's display name, so "nft" finds everything NFT. */
  sourceLabel: string
}

/**
 * Field weights. The spread between them is what stops a description match
 * outranking a name match: typing "book" must put Order Book above the four
 * panels whose descriptions mention a book.
 */
const WEIGHT = {
  labelExact: 1000,
  labelPrefix: 400,
  labelWordPrefix: 240,
  labelContains: 120,
  typeContains: 90,
  descriptionContains: 40,
  categoryContains: 20,
  sourceContains: 16,
}

function scoreField(haystack: string, token: string): number {
  if (!haystack) return 0
  if (haystack === token) return WEIGHT.labelExact
  if (haystack.startsWith(token)) return WEIGHT.labelPrefix
  const idx = haystack.indexOf(token)
  if (idx < 0) return 0
  // A match right after a space or a separator reads as "the word starts here".
  const before = haystack[idx - 1]
  if (before === ' ' || before === '-' || before === '/' || before === '&') {
    return WEIGHT.labelWordPrefix
  }
  return WEIGHT.labelContains
}

function scoreEntry(entry: PanePickerEntry, token: string): number {
  const label = scoreField(entry.label.toLowerCase(), token)
  if (label) return label

  const type = entry.type.toLowerCase().includes(token)
    ? WEIGHT.typeContains
    : 0
  if (type) return type

  if (entry.description.toLowerCase().includes(token)) {
    return WEIGHT.descriptionContains
  }
  if (entry.categoryLabel.toLowerCase().includes(token)) {
    return WEIGHT.categoryContains
  }
  if (entry.sourceLabel.toLowerCase().includes(token)) {
    return WEIGHT.sourceContains
  }
  return 0
}

/**
 * Rank the catalogue against a query.
 *
 * Every token has to match something — "funding matrix" must not return every
 * panel that mentions funding — and the total is the sum of each token's best
 * field, so a query that hits two names beats one that grazes a description
 * twice. An empty query returns the list untouched, which is what keeps the
 * unsearched picker in its authored order.
 */
export function rankPanes(
  entries: Array<PanePickerEntry>,
  query: string,
): Array<PanePickerEntry> {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return entries

  const scored: Array<{ entry: PanePickerEntry; score: number; at: number }> =
    []
  entries.forEach((entry, at) => {
    let total = 0
    for (const token of tokens) {
      const score = scoreEntry(entry, token)
      if (score === 0) return
      total += score
    }
    scored.push({ entry, score: total, at })
  })

  scored.sort((a, b) => b.score - a.score || a.at - b.at)
  return scored.map((s) => s.entry)
}

// ── Requirements ────────────────────────────────────────────────────

/**
 * What a panel needs before it can show anything, as facts rather than prose.
 *
 * Derived from the manifest, never authored per panel: ninety-three hand-
 * written "how to use" paragraphs would be ninety-three more strings across
 * seventeen catalogs, and they would say the same four things. The four things
 * are already declared — `requires`, `requiresDesktop`, `singleton`,
 * `requiredAccessLevel` — so the picker reads them out.
 */
export type PaneRequirement =
  | { kind: 'pair' }
  | { kind: 'wallet' }
  | { kind: 'desktop' }
  | { kind: 'singleton' }
  | { kind: 'access'; level: string }
  | { kind: 'capability'; capability: string }

export function paneRequirements(def: PaneDefinition): Array<PaneRequirement> {
  const out: Array<PaneRequirement> = []

  for (const need of def.requires ?? []) {
    if (need === 'workspace:active-pair') out.push({ kind: 'pair' })
    else if (need === 'workspace:active-wallet') out.push({ kind: 'wallet' })
    else out.push({ kind: 'capability', capability: need })
  }

  if (def.requiresDesktop) out.push({ kind: 'desktop' })
  if (def.singleton) out.push({ kind: 'singleton' })
  if (def.requiredAccessLevel) {
    out.push({ kind: 'access', level: def.requiredAccessLevel })
  }

  return out
}

/** The catalog key for a requirement's one-line explanation. */
export function requirementKey(req: PaneRequirement): string {
  switch (req.kind) {
    case 'pair':
      return 'addPaneDialog.needs.pair'
    case 'wallet':
      return 'addPaneDialog.needs.wallet'
    case 'desktop':
      return 'addPaneDialog.needs.desktop'
    case 'singleton':
      return 'addPaneDialog.needs.singleton'
    case 'access':
      return 'addPaneDialog.needs.access'
    case 'capability':
      return 'addPaneDialog.needs.capability'
  }
}
