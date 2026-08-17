// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The chains this connector bridges, in the one shape both signing families
 * can be reasoned about.
 *
 * A bridge is the only place in the terminal where two chains that sign with
 * different keys meet in a single transaction, so the chain table has to carry
 * the signing family as data rather than leave it implicit in which module
 * imported it. `family` is that field: `evm` legs build calldata and are signed
 * by the EVM key, `svm` legs come back as a serialized Solana transaction and
 * are signed by the Solana key. Everything downstream branches on it once,
 * here, instead of guessing from the shape of a response.
 *
 * EVM facts still come straight from the EVM connector's own config, so the
 * chain id a bridge quote is built for is the chain id a swap on that market
 * would use. Solana is stated locally: its connector is Jupiter, an aggregator
 * rather than a chain module, and it carries no chain config to borrow.
 *
 * `lifiChainId` is the aggregator's own id for the chain, which for EVM is just
 * the EVM chain id and for Solana is a number of its own (verified against
 * `GET https://li.quest/v1/chains?chainTypes=SVM`). It is separate from
 * `EvmChainConfig.chainId` because only one of the two is a real chain id, and
 * collapsing them would put a 1151111081099710 into a field an EVM RPC reads.
 */
import { EVM_CHAINS } from '../evm-dex-connector/chains'
import type { EvmChainConfig } from '../evm-dex-connector/chains'

/** How a leg is signed. The one fact that decides every branch downstream. */
export type BridgeChainFamily = 'evm' | 'svm'

type BridgeChainCommon = {
  /** Pairlens market id. What a pane, a pair key and a saved layout name. */
  market: string
  displayName: string
  nativeSymbol: string
  /** LI.FI's id for this chain, as `/v1/chains` publishes it. */
  lifiChainId: number
}

export type BridgeChain =
  | (BridgeChainCommon & {
      family: 'evm'
      /** Wallet family the terminal provisions. One EVM key covers all of them. */
      walletChain: 'ethereum'
      evm: EvmChainConfig
    })
  | (BridgeChainCommon & {
      family: 'svm'
      walletChain: 'solana'
      /** Endpoint used when the terminal has not pushed one. */
      defaultRpcUrl: string
    })

/**
 * LI.FI's chain id for Solana. Not an EVM chain id and not derived from one:
 * it is the value the aggregator publishes, and every Solana request is built
 * with it.
 */
export const LIFI_SOLANA_CHAIN_ID = 1151111081099710

/**
 * The market id Solana is bridged as.
 *
 * `jupiter` rather than `solana` because that is the market the terminal's
 * chain rail, pair keys and saved layouts already use for Solana: the venue is
 * named after its connector everywhere else, and a bridge that answered on a
 * second id would quote a chain no pane can open.
 */
export const SOLANA_BRIDGE_MARKET = 'jupiter'

const SOLANA: BridgeChain = {
  family: 'svm',
  walletChain: 'solana',
  market: SOLANA_BRIDGE_MARKET,
  displayName: 'Solana',
  nativeSymbol: 'SOL',
  lifiChainId: LIFI_SOLANA_CHAIN_ID,
  defaultRpcUrl: 'https://api.mainnet-beta.solana.com',
}

function fromEvm(evm: EvmChainConfig): BridgeChain {
  return {
    family: 'evm',
    walletChain: 'ethereum',
    market: evm.market,
    displayName: evm.displayName,
    nativeSymbol: evm.nativeSymbol,
    lifiChainId: evm.chainId,
    evm,
  }
}

/** Every chain, ordered as the terminal's chain rail orders them. */
export const BRIDGE_CHAINS: Array<BridgeChain> = [
  SOLANA,
  ...Object.values(EVM_CHAINS).map(fromEvm),
]

const BY_MARKET = new Map(BRIDGE_CHAINS.map((chain) => [chain.market, chain]))

/**
 * Market ids that mean a chain by another name.
 *
 * Only `solana` today, because that is what an assistant call or a hand-written
 * workflow says when it means the chain rather than the aggregator. An alias
 * resolves to the SAME chain object, so nothing downstream has to know there
 * were ever two spellings.
 */
const MARKET_ALIASES: Record<string, string> = {
  solana: SOLANA_BRIDGE_MARKET,
}

/** Resolve a market id (or its alias) to a chain, or null. */
export function bridgeChain(market: string | undefined): BridgeChain | null {
  if (!market) return null
  const key = MARKET_ALIASES[market] ?? market
  return BY_MARKET.get(key) ?? null
}

/** Narrowing helpers, so callers branch on the discriminant and not on a cast. */
export function isEvmChain(
  chain: BridgeChain,
): chain is Extract<BridgeChain, { family: 'evm' }> {
  return chain.family === 'evm'
}

export function isSvmChain(
  chain: BridgeChain,
): chain is Extract<BridgeChain, { family: 'svm' }> {
  return chain.family === 'svm'
}
