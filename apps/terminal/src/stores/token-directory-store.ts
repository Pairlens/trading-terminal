// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a token ref MEANS — the persisted half of the token directory.
 *
 * `market-engine`'s `token-directory` already pins `(network, symbol) →
 * address` for the connectors, and that is the right shape for them: they hold
 * a pair key and need an address. It is a module-level Map, so it dies on
 * reload, and it is keyed by SYMBOL, so it cannot answer the question a
 * watchlist asks.
 *
 * A watchlist entry is stored by address, because there are hundreds of tokens
 * named PEPE and the row has to survive naming one of them. That leaves the
 * opposite lookup: given an address, what did the user see when they picked
 * it? Nothing else can answer. The instrument catalog is symbol-keyed, and
 * re-resolving a symbol after display is the exact rule
 * `TokenInstrument` forbids.
 *
 * This is the prediction directory's design, applied to the other venue-bound
 * arm, and for the reason that store's own header gives: a watchlist survives
 * a reload, and a row that turned back into `0x532f…` overnight is a bug the
 * user cannot fix. Same two departures from the connector-side directory:
 *
 *  - A zustand store rather than a Map, because rows render before the pin
 *    lands and must repaint when it does.
 *  - Persisted, because the thing it labels is persisted.
 *
 * It stays terminal-side rather than moving into `market-engine`, which the
 * CLI also loads and which has no localStorage. `pinSelectedEntry` writes both.
 */
import { create } from 'zustand'

import { normalizeInstrumentId } from '@pairlens/shared/market-ref'

import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'

export type TokenDirectoryEntry = {
  /** Chain slug, which is also the Pairlens market id for that DEX venue. */
  chain: string
  /** Contract address or mint. Lowercased for EVM, verbatim for base58. */
  address: string
  /** Ticker as the row displayed it. Display only — never identity. */
  symbol: string
  /** Token name, for the second line of a row. */
  name?: string
  decimals?: number
}

const STORAGE_KEY = `${STORAGE_PREFIX}token-directory`

/**
 * Long-tail tokens are effectively unbounded, so the map is capped and evicts
 * in insertion order. Generous next to any plausible watchlist.
 */
const MAX_ENTRIES = 500

/** `base:0x532f…` — chain plus address, which is the token's identity. */
export function tokenDirectoryKey(chain: string, address: string): string {
  return `${chain.toLowerCase()}:${normalizeInstrumentId('dex', address)}`
}

function readStored(): Record<string, TokenDirectoryEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, TokenDirectoryEntry>
  } catch {
    return {}
  }
}

function writeStored(entries: Record<string, TokenDirectoryEntry>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // A full or unavailable store degrades to session-only memory, which is
    // still better than refusing the pin the row depends on.
  }
}

type TokenDirectoryStore = {
  entries: Record<string, TokenDirectoryEntry>
  register: (entry: TokenDirectoryEntry) => void
  clear: () => void
}

export const useTokenDirectoryStore = create<TokenDirectoryStore>((set) => ({
  entries: readStored(),
  register: (entry) =>
    set((s) => {
      if (!entry.chain || !entry.address) return s
      const key = tokenDirectoryKey(entry.chain, entry.address)
      const existing = s.entries[key]
      // Identical re-pins are common (the same row selected twice); handing
      // back the same object keeps subscribed rows from re-rendering.
      if (existing && shallowEqual(existing, entry)) return s
      const next = { ...s.entries, [key]: entry }
      const keys = Object.keys(next)
      if (keys.length > MAX_ENTRIES) {
        for (const stale of keys.slice(0, keys.length - MAX_ENTRIES)) {
          delete next[stale]
        }
      }
      writeStored(next)
      return { entries: next }
    }),
  clear: () =>
    set(() => {
      writeStored({})
      return { entries: {} }
    }),
}))

function shallowEqual(a: TokenDirectoryEntry, b: TokenDirectoryEntry): boolean {
  return (
    a.chain === b.chain &&
    a.address === b.address &&
    a.symbol === b.symbol &&
    a.name === b.name &&
    a.decimals === b.decimals
  )
}

/** Pin a token from outside React (selection handlers). */
export function registerDisplayToken(entry: TokenDirectoryEntry): void {
  useTokenDirectoryStore.getState().register(entry)
}

/** Non-reactive read: what this chain+address showed as. */
export function lookupDisplayToken(
  chain: string,
  address: string,
): TokenDirectoryEntry | null {
  return (
    useTokenDirectoryStore.getState().entries[
      tokenDirectoryKey(chain, address)
    ] ?? null
  )
}

/** Reactive read for a row that must repaint when the pin lands. */
export function useDisplayToken(
  chain: string | undefined,
  address: string | undefined,
): TokenDirectoryEntry | null {
  return useTokenDirectoryStore((s) =>
    chain && address
      ? (s.entries[tokenDirectoryKey(chain, address)] ?? null)
      : null,
  )
}
