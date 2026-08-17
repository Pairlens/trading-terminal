// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Where each chain keeps its concentrated-liquidity positions.
 *
 * A v3 position is an ERC-721 held by a NonfungiblePositionManager, and the
 * pool it belongs to is derived from the factory. Both addresses are pinned
 * here per chain with the deployment page they came from, because they are NOT
 * the same everywhere: Ethereum, Arbitrum and Polygon share one pair of
 * addresses, Base and BNB Chain each have their own, and reusing the mainnet
 * pair on Base reads an address with no code at it.
 *
 * The pinned factory is still verified against the manager's own `factory()`
 * getter before any pool is resolved (`lp-client`). Same discipline the swap
 * path uses on an aggregator response: a hardcoded address is a claim, and the
 * contract itself is the only thing that can confirm it. A mismatch is
 * reported as an error row rather than followed, because following it would
 * read pool state from a factory we never audited.
 *
 * Solana is deliberately absent. Orca and Raydium keep positions in program
 * accounts, not in an ERC-721, so nothing here transfers: it needs its own
 * client against the Whirlpool program and is not in this pass.
 */

/**
 * PancakeSwap v3 is a Uniswap v3 fork whose pool widened `slot0`'s
 * `feeProtocol` from `uint8` to `uint32` (it packs a per-side fee). Only the
 * first two fields are read here, but a decoder is fed the whole tuple, so the
 * variant picks the matching ABI rather than trusting the widths to line up.
 */
export type LpSlot0Variant = 'uniswap-v3' | 'pancake-v3'

export type LpManagerDeployment = {
  /** Venue label the panes show next to a position. */
  dexName: string
  /** NonfungiblePositionManager — the ERC-721 that holds positions. */
  manager: `0x${string}`
  /** Pool factory, for `getPool(token0, token1, fee)`. */
  factory: `0x${string}`
  slot0: LpSlot0Variant
}

/**
 * Managers per Pairlens market id, in the order a pane lists them.
 *
 * Uniswap first on every chain; BNB Chain also carries PancakeSwap v3, which
 * holds most of that chain's concentrated liquidity and would otherwise read
 * as "no positions" to somebody who has them.
 */
export const LP_MANAGERS: Record<string, ReadonlyArray<LpManagerDeployment>> = {
  // https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments
  ethereum: [
    {
      dexName: 'Uniswap v3',
      manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      slot0: 'uniswap-v3',
    },
  ],
  // https://developers.uniswap.org/docs/protocols/v3/deployments/v3-arbitrum-deployments
  // Same addresses as mainnet — deployed from v3-core@1.0.0 / v3-periphery@1.0.0.
  arbitrum: [
    {
      dexName: 'Uniswap v3',
      manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      slot0: 'uniswap-v3',
    },
  ],
  // https://developers.uniswap.org/docs/protocols/v3/deployments/v3-polygon-deployments
  polygon: [
    {
      dexName: 'Uniswap v3',
      manager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      slot0: 'uniswap-v3',
    },
  ],
  // https://developers.uniswap.org/docs/protocols/v3/deployments/v3-base-deployments
  // Base has its OWN factory and manager, not the mainnet pair.
  base: [
    {
      dexName: 'Uniswap v3',
      manager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
      factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
      slot0: 'uniswap-v3',
    },
  ],
  bsc: [
    // https://developers.uniswap.org/docs/protocols/v3/deployments/v3-bnb-deployments
    {
      dexName: 'Uniswap v3',
      manager: '0x7b8A01B39D58278b5DE7e48c8449c9f4F5170613',
      factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
      slot0: 'uniswap-v3',
    },
    // PancakeSwap V3: Nonfungible Position Manager / Factory, verified on
    // BscScan (PCS-V3-POS, 0x46A1…4364; Factory 0x0BFb…1865). Deployed at the
    // same two addresses on several chains, pinned here only for BNB Chain
    // because that is where the liquidity is.
    {
      dexName: 'PancakeSwap v3',
      manager: '0x46A15B0b27311cedF172AB29E4f4766fbE7F4364',
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      slot0: 'pancake-v3',
    },
  ],
}

/** Managers deployed on a chain, empty for a chain with no v3-family venue. */
export function lpManagersFor(
  market: string,
): ReadonlyArray<LpManagerDeployment> {
  return LP_MANAGERS[market] ?? []
}
