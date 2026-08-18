// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Every chain the terminal can draw a DEX pane for, whether or not its
 * connector is installed.
 *
 * The chain rail shows both: a chain with a connector is selectable, a chain
 * without one is dimmed and carries an install link. That is the README's "no
 * connector, no row" rule read the useful way round — a dimmed row with a way
 * to fix it beats a live-looking row that opens a dead chart.
 *
 * EVM entries come straight from the connector's own config so the rail can
 * never disagree with what a swap would actually use (RPC, quote token,
 * explorer). Solana is stated here because its connector is Jupiter, an
 * aggregator rather than a chain module, and carries no chain config of its own.
 */
import { EVM_CHAINS } from '@pairlens/plugins/evm-dex-connector/chains'

export type DexChain = {
  /** Pairlens market id — the venue a pane and a pair key are bound to. */
  market: string
  displayName: string
  abbr: string
  /** GeckoTerminal network slug, for correlating provider rows to this chain. */
  geckoNetwork: string
  iconUrl: string
  nativeSymbol: string
  /** Canonical USD-stable quote leg for pairs generated on this chain. */
  quoteSymbol: string
  explorerUrl: string
  /** Bundled connector that trades this chain. */
  connectorPluginId: string
  /** Whether gas is quoted per unit (EVM) or not published at all (Solana). */
  hasGasPrice: boolean
  /** Wallet family that signs on this chain. One EVM key covers every EVM chain. */
  walletChain: 'solana' | 'ethereum'
}

const SOLANA: DexChain = {
  market: 'jupiter',
  displayName: 'Solana',
  abbr: 'SOL',
  geckoNetwork: 'solana',
  iconUrl:
    'https://coin-images.coingecko.com/coins/images/4128/small/solana.png',
  nativeSymbol: 'SOL',
  quoteSymbol: 'USDC',
  explorerUrl: 'https://solscan.io',
  connectorPluginId: 'jupiter-dex-connector',
  walletChain: 'solana',
  // Solana's fee is a base charge plus a priority bid decided at send time.
  // There is no standing gas price to quote, so the rail shows a dash rather
  // than a number that would be wrong the moment it mattered.
  hasGasPrice: false,
}

/** Ordered for the rail: Solana first, then EVM chains by config order. */
export const DEX_CHAINS: Array<DexChain> = [
  SOLANA,
  ...Object.values(EVM_CHAINS).map((chain) => ({
    market: chain.market,
    displayName: chain.displayName,
    abbr: chain.abbr,
    geckoNetwork: chain.geckoNetwork,
    iconUrl: chain.iconUrl,
    nativeSymbol: chain.nativeSymbol,
    quoteSymbol: chain.quote.symbol,
    explorerUrl: chain.explorerUrl,
    connectorPluginId: `${chain.market}-dex-connector`,
    hasGasPrice: true,
    walletChain: 'ethereum' as const,
  })),
]

const BY_MARKET = new Map(DEX_CHAINS.map((c) => [c.market, c]))

export function dexChain(market: string | undefined): DexChain | null {
  return market ? (BY_MARKET.get(market) ?? null) : null
}

const BY_NETWORK = new Map(DEX_CHAINS.map((c) => [c.geckoNetwork, c]))

/**
 * A chain by its NETWORK slug rather than its market id.
 *
 * Token rows carry the network ('solana', 'base'), which is the same string
 * as the market on every EVM chain and a different one on Solana, whose
 * connector is Jupiter. A row that says "solana" and a rail that says
 * "jupiter" are the same chain, and only this lookup knows it.
 */
export function dexChainByNetwork(
  network: string | undefined,
): DexChain | null {
  return network ? (BY_NETWORK.get(network.toLowerCase()) ?? null) : null
}

/**
 * A transaction's page on the chain's explorer.
 *
 * Solscan paths transactions under `/tx/` like the EVM scanners do, so one
 * shape covers both; an unknown chain returns null and the tape renders the
 * hash without a link rather than a link that 404s.
 */
export function explorerTxUrl(
  market: string | undefined,
  txHash: string | null,
): string | null {
  const chain = dexChain(market)
  if (!chain || !txHash) return null
  return `${chain.explorerUrl}/tx/${txHash}`
}

/** A wallet's page on the chain's explorer. */
export function explorerAddressUrl(
  market: string | undefined,
  address: string | null,
): string | null {
  const chain = dexChain(market)
  if (!chain || !address) return null
  const segment = chain.market === 'jupiter' ? 'account' : 'address'
  return `${chain.explorerUrl}/${segment}/${address}`
}
