// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Shared DEX token directory — a process-wide registry mapping
 * (network, symbol) → token address/decimals.
 *
 * DEX connectors (Jupiter, EVM) register the exact token a user discovered or
 * searched for; wildcard data providers (DexPaprika, GeckoTerminal) consult it
 * so the pool they chart belongs to the SAME token the user is trading — not
 * just the first token that shares a symbol. Memecoin symbols collide
 * constantly; the address, not the symbol, is the identity.
 */

export type DirectoryToken = {
  /** Network slug: 'solana', 'ethereum', 'base', 'arbitrum', 'bsc', ... */
  network: string
  symbol: string
  /** Mint address (Solana) or contract address (EVM). */
  address: string
  decimals?: number
  name?: string
}

const directory = new Map<string, DirectoryToken>()

function key(network: string, symbol: string): string {
  return `${network}:${symbol.toUpperCase()}`
}

export function registerToken(token: DirectoryToken): void {
  directory.set(key(token.network, token.symbol), token)
}

export function lookupToken(
  network: string,
  symbol: string,
): DirectoryToken | null {
  return directory.get(key(network, symbol)) ?? null
}

export function clearTokenDirectory(): void {
  directory.clear()
}

/**
 * Address shape predicates live in `@pairlens/shared/market-ref`, because the
 * routing layer needs them to decide whether a `/dex/...` id segment is an
 * address or a symbol, and a second copy of these regexes is a second thing to
 * get wrong. Re-exported here so connectors keep their existing import.
 */
export {
  isEvmAddress,
  isSolanaAddress,
  isTokenAddress,
} from '@pairlens/shared/market-ref'
