// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What an NFT collection ref MEANS.
 *
 * A collection is identified by chain plus contract, which is right (a contract
 * is the only thing two marketplaces will agree on) and unreadable: a watchlist
 * row, a recents entry and a cold link all arrive holding `0xbd35…2cf8` and
 * nothing else. Re-resolving the name by asking a provider is a request per
 * row, on a board that may show fifty of them, for a string that does not
 * change.
 *
 * So the row teaches the directory on the way out, and everything downstream
 * reads it. Same design as the token and prediction directories, and for the
 * same reason theirs give: a watchlist survives a reload, and an entry that
 * turned back into an address overnight is a bug the user cannot fix.
 *
 * Persisted, capped, and evicting in insertion order. Display only: nothing
 * here is ever identity, and a stale name never changes which contract a
 * request goes to.
 */
import { create } from 'zustand'

import { normalizeInstrumentId } from '@pairlens/shared/market-ref'
import type { NftChain, NftCollectionSummary } from '@pairlens/shared/nft-types'

import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'

export type NftDirectoryEntry = {
  chain: NftChain
  /** Contract address or slug. Lowercased for EVM, verbatim for base58. */
  contract: string
  name: string
  imageUrl?: string
  /** Settlement currency ticker, so a cold board labels its axis correctly. */
  priceCurrency?: string
  slug?: string
  verified?: boolean
}

const STORAGE_KEY = `${STORAGE_PREFIX}nft-directory`

/** Generous next to any plausible watchlist, small next to the long tail. */
const MAX_ENTRIES = 300

/** `ethereum:0xbd35…` — chain plus contract, which is the collection's identity. */
export function nftDirectoryKey(chain: string, contract: string): string {
  return `${chain.toLowerCase()}:${normalizeInstrumentId('nft', contract)}`
}

function readStored(): Record<string, NftDirectoryEntry> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      return {}
    return parsed as Record<string, NftDirectoryEntry>
  } catch {
    return {}
  }
}

function writeStored(entries: Record<string, NftDirectoryEntry>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // A full or unavailable store degrades to session-only memory, which is
    // still better than refusing the pin the row depends on.
  }
}

type NftDirectoryStore = {
  entries: Record<string, NftDirectoryEntry>
  register: (entry: NftDirectoryEntry) => void
  clear: () => void
}

export const useNftDirectoryStore = create<NftDirectoryStore>((set) => ({
  entries: readStored(),
  register: (entry) =>
    set((s) => {
      if (!entry.chain || !entry.contract || !entry.name) return s
      const key = nftDirectoryKey(entry.chain, entry.contract)
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

function shallowEqual(a: NftDirectoryEntry, b: NftDirectoryEntry): boolean {
  return (
    a.chain === b.chain &&
    a.contract === b.contract &&
    a.name === b.name &&
    a.imageUrl === b.imageUrl &&
    a.priceCurrency === b.priceCurrency &&
    a.slug === b.slug &&
    a.verified === b.verified
  )
}

/** Pin a collection from outside React (selection handlers). */
export function registerNftCollection(
  chain: NftChain,
  contract: string,
  summary: NftCollectionSummary,
): void {
  useNftDirectoryStore.getState().register({
    chain,
    contract,
    name: summary.name,
    imageUrl: summary.imageUrl,
    priceCurrency: summary.priceCurrency,
    slug: summary.slug,
    verified: summary.verified,
  })
}

/** Non-reactive read: what this chain+contract showed as. */
export function lookupNftCollection(
  chain: string,
  contract: string,
): NftDirectoryEntry | null {
  return (
    useNftDirectoryStore.getState().entries[nftDirectoryKey(chain, contract)] ??
    null
  )
}

/** Reactive read, for a header that must repaint when the pin lands. */
export function useNftDirectoryEntry(
  chain: string | undefined,
  contract: string | undefined,
): NftDirectoryEntry | null {
  return useNftDirectoryStore((s) =>
    chain && contract
      ? (s.entries[nftDirectoryKey(chain, contract)] ?? null)
      : null,
  )
}
