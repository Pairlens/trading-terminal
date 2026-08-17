// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A wallet's concentrated-liquidity positions, read straight off the chain.
 *
 * There is no indexer behind this and no API key: everything comes from the
 * chain's own RPC through the same viem client the balance reader uses. The
 * walk is fixed —
 *
 *   1. `balanceOf(owner)` on every v3-family position manager on the chain,
 *      plus each manager's `factory()` so the pinned factory can be verified,
 *   2. `tokenOfOwnerByIndex(owner, i)` for the ids the wallet holds,
 *   3. `positions(tokenId)` for tokens, fee, bounds, liquidity, tokens owed,
 *   4. `symbol()` / `decimals()` for every distinct token,
 *   5. `getPool(token0, token1, fee)` for every distinct pool,
 *   6. `slot0()` for the current tick and price,
 *   7. a static `collect(...)` per position for the uncollected fees.
 *
 * Steps 1 through 6 are Multicall3 batches, so their cost grows with the number
 * of BATCHES rather than with the number of positions, and a wallet holding
 * nothing stops after step 1. Step 7 cannot be batched at all: the manager's
 * `collect` is guarded by `isAuthorizedForToken`, and inside a multicall
 * `msg.sender` is the Multicall3 contract, so each simulation has to be its own
 * `eth_call` sent `from` the owner. That asymmetry is why there are two caps
 * (see below) and why the simulations run only a few at a time.
 *
 * READ ONLY, and structurally so. Nothing here takes a `getPrivateKey`, builds
 * calldata or reaches a wallet slot. `collect` is a state-changing function
 * invoked through `simulateContract`, which is an `eth_call`: the chain
 * computes what WOULD be collected and discards it. Its `recipient` is the
 * owner rather than anything the caller chose, so even a mis-wired call could
 * not name a different beneficiary.
 *
 * The wallet address is a parameter because it is public information and the
 * panes have it before the vault is unlocked. A sealed vault means no signing
 * key, but it must not mean an LP pane that cannot show what the chain already
 * publishes about an address.
 */
import { getViemChain } from './chains'
import { lpManagersFor } from './lp-deployments'
import {
  descaleAmount,
  feeTierFraction,
  isInRange,
  positionAmounts,
  sqrtPriceX96ToPrice,
  tickToPrice,
} from './lp-math'
import { resolveToken } from './token-client'
import type { EvmChainConfig } from './chains'
import type { LpManagerDeployment } from './lp-deployments'
import type {
  LpPositionEntry,
  LpPositionToken,
  LpPositionsResponse,
} from '@pairlens/shared/instrument-types'

/**
 * Two caps, because the expensive step is not the one you would guess.
 *
 * Enumerating ids and reading their state are multicall batches and stay cheap
 * per position; simulating a `collect` is one `eth_call` each and does not
 * batch at all. So the walk inspects up to `LP_ENUMERATION_CAP` NFTs and only
 * then caps the LIVE ones at `LP_POSITION_CAP`.
 *
 * That ordering is not a nicety. A closed position keeps its NFT, and
 * `tokenOfOwnerByIndex` returns them in storage order, not chronological order:
 * a real mainnet wallet checked during this work held 37 NFTs of which the
 * first 24 by index were all spent receipts. Capping the enumeration at 24
 * reported "no positions" to somebody who had one.
 */
export const LP_ENUMERATION_CAP = 120

/** Live positions fully priced per chain, and the ceiling on `collect` calls. */
export const LP_POSITION_CAP = 24

/** Concurrent `collect` simulations. Polite to public RPCs, still quick. */
const FEE_SIMULATION_CONCURRENCY = 6

const MAX_UINT128 = (1n << 128n) - 1n

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/

const NFPM_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'factory',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenOfOwnerByIndex',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
  },
  {
    // Static-called only. Payable on chain; a simulation sends no value.
    type: 'function',
    name: 'collect',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const

const FACTORY_ABI = [
  {
    type: 'function',
    name: 'getPool',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenA', type: 'address' },
      { name: 'tokenB', type: 'address' },
      { name: 'fee', type: 'uint24' },
    ],
    outputs: [{ type: 'address' }],
  },
] as const

const ERC20_METADATA_ABI = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

/** Uniswap v3's `slot0`. Only the first two fields are read. */
const UNISWAP_SLOT0_ABI = [
  {
    type: 'function',
    name: 'slot0',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint8' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
] as const

/** PancakeSwap v3 widened `feeProtocol` to `uint32`; same first two fields. */
const PANCAKE_SLOT0_ABI = [
  {
    type: 'function',
    name: 'slot0',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'observationIndex', type: 'uint16' },
      { name: 'observationCardinality', type: 'uint16' },
      { name: 'observationCardinalityNext', type: 'uint16' },
      { name: 'feeProtocol', type: 'uint32' },
      { name: 'unlocked', type: 'bool' },
    ],
  },
] as const

/** Raw `positions()` fields plus where they came from. */
export type RawLpPosition = {
  manager: LpManagerDeployment
  tokenId: bigint
  token0: string
  token1: string
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: bigint
  tokensOwed0: bigint
  tokensOwed1: bigint
}

/** Live pool state for one pool address. */
export type PoolState = {
  sqrtPriceX96: bigint
  tick: number
}

/**
 * A position worth listing.
 *
 * A closed position keeps its NFT until it is burned, so a wallet that has ever
 * provided liquidity accumulates rows of zeroes. Anything with no liquidity AND
 * nothing owed is dropped: it is a receipt, not a position.
 */
export function isListablePosition(position: {
  liquidity: bigint
  tokensOwed0: bigint
  tokensOwed1: bigint
}): boolean {
  return (
    position.liquidity > 0n ||
    position.tokensOwed0 > 0n ||
    position.tokensOwed1 > 0n
  )
}

/**
 * Fold raw chain reads into the wire shape the panes read.
 *
 * Split out from the RPC walk so the parsing has tests: every field a pane
 * prints is derived here, and a mistranslated tick is a range drawn around the
 * wrong price. Missing pool state degrades to nulls rather than to zeroes —
 * "unread" and "empty" are different rows.
 */
export function buildPositionEntry(opts: {
  market: string
  raw: RawLpPosition
  token0: LpPositionToken
  token1: LpPositionToken
  poolAddress: string | null
  poolState: PoolState | null
  /** Uncollected fees in raw units, or null when the simulation did not run. */
  fees: { amount0: bigint; amount1: bigint } | null
  /** Pair-leg addresses the caller asked about, lowercase, or null. */
  pairAddresses: readonly [string, string] | null
}): LpPositionEntry {
  const { raw, token0, token1, poolState } = opts
  const amounts = poolState
    ? positionAmounts({
        liquidity: raw.liquidity,
        sqrtPriceX96: poolState.sqrtPriceX96,
        currentTick: poolState.tick,
        tickLower: raw.tickLower,
        tickUpper: raw.tickUpper,
        decimals0: token0.decimals,
        decimals1: token1.decimals,
      })
    : null

  // Fees the manager has already booked are part of what a collect returns, so
  // the simulation is authoritative when it ran. `tokensOwed` alone is the
  // floor, and it is what a failed simulation falls back to rather than null:
  // it is a real claim the chain has recorded, just not the whole one.
  const fees = opts.fees
    ? {
        amount0: descaleAmount(opts.fees.amount0, token0.decimals),
        amount1: descaleAmount(opts.fees.amount1, token1.decimals),
      }
    : null

  return {
    market: opts.market,
    managerAddress: raw.manager.manager,
    tokenId: raw.tokenId.toString(),
    dexName: raw.manager.dexName,
    poolAddress: opts.poolAddress,
    fee: raw.fee,
    feeTier: feeTierFraction(raw.fee),
    token0,
    token1,
    liquidity: raw.liquidity.toString(),
    tickLower: raw.tickLower,
    tickUpper: raw.tickUpper,
    currentTick: poolState?.tick ?? null,
    sqrtPriceX96: poolState ? poolState.sqrtPriceX96.toString() : null,
    inRange: poolState
      ? isInRange(poolState.tick, raw.tickLower, raw.tickUpper)
      : null,
    amount0: amounts?.amount0 ?? null,
    amount1: amounts?.amount1 ?? null,
    fees0: fees?.amount0 ?? null,
    fees1: fees?.amount1 ?? null,
    priceLower: tickToPrice(raw.tickLower, token0.decimals, token1.decimals),
    priceUpper: tickToPrice(raw.tickUpper, token0.decimals, token1.decimals),
    priceCurrent: poolState
      ? sqrtPriceX96ToPrice(
          poolState.sqrtPriceX96,
          token0.decimals,
          token1.decimals,
        )
      : null,
    matchesPair: matchesPair([raw.token0, raw.token1], opts.pairAddresses),
  }
}

/**
 * Does this position's pool hold exactly the pair the pane is showing?
 *
 * Matched on ADDRESSES, never on symbols. Every chain carries several tokens
 * calling themselves USDC, and filtering a position list by ticker is how a
 * bridged-token position ends up presented as the canonical one. Null when the
 * caller gave no pair or a leg would not resolve — undeterminable, which the
 * pane renders as an unfiltered list.
 */
export function matchesPair(
  positionTokens: readonly [string, string],
  pairAddresses: readonly [string, string] | null,
): boolean | null {
  if (!pairAddresses) return null
  const have = new Set(positionTokens.map((a) => a.toLowerCase()))
  return pairAddresses.every((address) => have.has(address.toLowerCase()))
}

/** True for a syntactically valid EVM address. Anything else is refused. */
export function isEvmAddress(value: unknown): value is string {
  return typeof value === 'string' && ADDRESS_RE.test(value)
}

/**
 * Read every v3-family position the wallet holds on this chain.
 *
 * Errors are data. A chain whose RPC is down, a manager whose factory does not
 * match the pinned one, a pool that will not answer — each becomes an error row
 * or a null field, and the positions that DID read still come back. A positions
 * pane that blanks because one of five chains timed out is worse than one that
 * says which chain timed out.
 */
export async function fetchLpPositions(opts: {
  chain: EvmChainConfig
  owner: string
  rpcUrl: string
  /** Pair key on screen, so entries can be marked as this pool's. */
  pair?: string | null
  /** Live positions to price. Defaults to `LP_POSITION_CAP`. */
  cap?: number
  /** NFTs to inspect before filtering. Defaults to `LP_ENUMERATION_CAP`. */
  enumerationCap?: number
}): Promise<LpPositionsResponse> {
  const cap = opts.cap ?? LP_POSITION_CAP
  const enumerationCap = opts.enumerationCap ?? LP_ENUMERATION_CAP
  const base: LpPositionsResponse = {
    market: opts.chain.market,
    owner: opts.owner,
    positions: [],
    totalFound: 0,
    enumerated: 0,
    listable: 0,
    cap,
    errors: [],
    ts: Date.now(),
  }

  if (!isEvmAddress(opts.owner)) {
    return { ...base, errors: [{ manager: '', message: 'Invalid address' }] }
  }
  const managers = lpManagersFor(opts.chain.market)
  if (managers.length === 0) return base

  const owner = opts.owner as `0x${string}`
  const errors: Array<{ manager: string; message: string }> = []

  try {
    const { createPublicClient, http } = await import('viem')
    const viemChain = await getViemChain(opts.chain.market)
    const client = createPublicClient({
      chain: viemChain,
      transport: http(opts.rpcUrl),
    })

    // ── 1. Holdings per manager, and each manager's own factory ──
    const inventory = await client.multicall({
      contracts: managers.flatMap((manager) => [
        {
          address: manager.manager,
          abi: NFPM_ABI,
          functionName: 'balanceOf' as const,
          args: [owner] as const,
        },
        {
          address: manager.manager,
          abi: NFPM_ABI,
          functionName: 'factory' as const,
        },
      ]),
      allowFailure: true,
    })

    let totalFound = 0
    const active: Array<{
      manager: LpManagerDeployment
      count: number
    }> = []
    managers.forEach((manager, index) => {
      const balance = inventory[index * 2]
      const factory = inventory[index * 2 + 1]
      if (balance?.status !== 'success') {
        // Not an error worth showing: a chain can simply have no deployment at
        // the pinned address, and the pane would blame the wallet for it.
        return
      }
      const count = Number(balance.result as bigint)
      if (!Number.isFinite(count) || count <= 0) return
      if (
        factory?.status !== 'success' ||
        String(factory.result).toLowerCase() !== manager.factory.toLowerCase()
      ) {
        // Fail closed. The pinned factory is what resolves every pool below;
        // if the manager disagrees, our address table is stale and the pool
        // state we would show belongs to a contract nobody verified.
        errors.push({
          manager: manager.dexName,
          message: 'Pinned factory does not match the position manager',
        })
        return
      }
      totalFound += count
      active.push({ manager, count })
    })

    if (active.length === 0) {
      return { ...base, totalFound, errors, ts: Date.now() }
    }

    // ── 2. Token ids, bounded by the ENUMERATION cap ──
    // Deliberately generous: this and step 3 are multicall batches, and a wallet
    // whose spent receipts outnumber its live ranges (the common case) is only
    // found by looking past the first handful.
    let remaining = enumerationCap
    const idRequests: Array<{ manager: LpManagerDeployment; index: number }> =
      []
    for (const entry of active) {
      const take = Math.min(entry.count, remaining)
      for (let i = 0; i < take; i++) {
        idRequests.push({ manager: entry.manager, index: i })
      }
      remaining -= take
      if (remaining <= 0) break
    }

    const idResults = await client.multicall({
      contracts: idRequests.map((request) => ({
        address: request.manager.manager,
        abi: NFPM_ABI,
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [owner, BigInt(request.index)] as const,
      })),
      allowFailure: true,
    })

    const ids: Array<{ manager: LpManagerDeployment; tokenId: bigint }> = []
    idResults.forEach((result, index) => {
      if (result.status !== 'success') return
      ids.push({
        manager: idRequests[index].manager,
        tokenId: result.result,
      })
    })
    const enumerated = ids.length
    if (enumerated === 0) {
      return { ...base, totalFound, errors, ts: Date.now() }
    }

    // ── 3. Position state ──
    const positionResults = await client.multicall({
      contracts: ids.map((id) => ({
        address: id.manager.manager,
        abi: NFPM_ABI,
        functionName: 'positions' as const,
        args: [id.tokenId] as const,
      })),
      allowFailure: true,
    })

    const listable: Array<RawLpPosition> = []
    positionResults.forEach((result, index) => {
      if (result.status !== 'success') return
      const tuple = result.result as readonly [
        bigint,
        string,
        string,
        string,
        number,
        number,
        number,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ]
      const raw: RawLpPosition = {
        manager: ids[index].manager,
        tokenId: ids[index].tokenId,
        token0: tuple[2],
        token1: tuple[3],
        fee: Number(tuple[4]),
        tickLower: Number(tuple[5]),
        tickUpper: Number(tuple[6]),
        liquidity: tuple[7],
        tokensOwed0: tuple[10],
        tokensOwed1: tuple[11],
      }
      if (isListablePosition(raw)) listable.push(raw)
    })
    // The LIVE ones are what the remaining steps cost money for, so the second
    // cap lands here rather than on the enumeration above.
    const raws = listable.slice(0, cap)
    if (raws.length === 0) {
      return {
        ...base,
        totalFound,
        enumerated,
        listable: listable.length,
        errors,
        ts: Date.now(),
      }
    }

    // ── 4. Token metadata, one entry per distinct address ──
    const tokenAddresses = [
      ...new Set(raws.flatMap((raw) => [raw.token0, raw.token1])),
    ]
    const metadata = await client.multicall({
      contracts: tokenAddresses.flatMap((address) => [
        {
          address: address as `0x${string}`,
          abi: ERC20_METADATA_ABI,
          functionName: 'symbol' as const,
        },
        {
          address: address as `0x${string}`,
          abi: ERC20_METADATA_ABI,
          functionName: 'decimals' as const,
        },
      ]),
      allowFailure: true,
    })

    const tokens = new Map<string, LpPositionToken>()
    tokenAddresses.forEach((address, index) => {
      const symbol = metadata[index * 2]
      const decimals = metadata[index * 2 + 1]
      tokens.set(address.toLowerCase(), {
        address,
        // A handful of pre-standard tokens return a bytes32 symbol that will
        // not decode as a string. The address stands in rather than an empty
        // cell, because the row still has to identify which token it is.
        symbol:
          symbol?.status === 'success' && typeof symbol.result === 'string'
            ? symbol.result
            : shortAddress(address),
        decimals: decimals?.status === 'success' ? Number(decimals.result) : 18,
      })
    })

    // ── 5. Pool addresses, one lookup per distinct pool ──
    // The MANAGER is part of the key, not just the pair and the fee. On BNB
    // Chain a wallet can hold a Uniswap v3 and a PancakeSwap v3 position on the
    // same pair at the same fee tier, and a key without the manager in it would
    // resolve both through one factory and hand one of them the other's pool.
    const poolRequests = new Map<string, RawLpPosition>()
    for (const raw of raws) {
      poolRequests.set(poolKeyOf(raw), raw)
    }
    const poolEntries = [...poolRequests.entries()].map(([key, raw]) => ({
      key,
      raw,
    }))
    const poolResults = await client.multicall({
      contracts: poolEntries.map((request) => ({
        address: request.raw.manager.factory,
        abi: FACTORY_ABI,
        functionName: 'getPool' as const,
        args: [
          request.raw.token0 as `0x${string}`,
          request.raw.token1 as `0x${string}`,
          request.raw.fee,
        ] as const,
      })),
      allowFailure: true,
    })
    const poolByKey = new Map<string, string>()
    poolResults.forEach((result, index) => {
      if (result.status !== 'success') return
      const address = String(result.result)
      if (!isEvmAddress(address) || /^0x0{40}$/.test(address)) return
      poolByKey.set(poolEntries[index].key, address)
    })

    // ── 6. Pool state, split by slot0 variant ──
    const poolVariants = new Map<string, LpManagerDeployment>()
    for (const request of poolEntries) {
      const address = poolByKey.get(request.key)
      if (address) poolVariants.set(address, request.raw.manager)
    }
    const poolAddresses = [...poolVariants.keys()]
    const stateResults = await client.multicall({
      contracts: poolAddresses.map((address) => ({
        address: address as `0x${string}`,
        abi:
          poolVariants.get(address)!.slot0 === 'pancake-v3'
            ? PANCAKE_SLOT0_ABI
            : UNISWAP_SLOT0_ABI,
        functionName: 'slot0' as const,
      })),
      allowFailure: true,
    })
    const stateByPool = new Map<string, PoolState>()
    stateResults.forEach((result, index) => {
      if (result.status !== 'success') return
      const tuple = result.result as readonly [
        bigint,
        number,
        ...Array<unknown>,
      ]
      stateByPool.set(poolAddresses[index].toLowerCase(), {
        sqrtPriceX96: tuple[0],
        tick: Number(tuple[1]),
      })
    })

    // ── 7. Uncollected fees, one simulation per position ──
    const feeResults = await mapWithConcurrency(
      raws,
      FEE_SIMULATION_CONCURRENCY,
      async (raw) => {
        try {
          const { result } = await client.simulateContract({
            address: raw.manager.manager,
            abi: NFPM_ABI,
            functionName: 'collect',
            args: [
              {
                tokenId: raw.tokenId,
                // The owner, always. A collect simulation cannot be pointed at
                // an address the caller supplied for a recipient.
                recipient: owner,
                amount0Max: MAX_UINT128,
                amount1Max: MAX_UINT128,
              },
            ],
            account: owner,
          })
          const [amount0, amount1] = result as readonly [bigint, bigint]
          return { amount0, amount1 }
        } catch {
          // The simulation is a courtesy read; a node that refuses it must not
          // cost the position its row. `tokensOwed` is the recorded floor.
          return { amount0: raw.tokensOwed0, amount1: raw.tokensOwed1 }
        }
      },
    )

    const pairAddresses = await resolvePairAddresses(opts.chain, opts.pair)

    const positions = raws.map((raw, index) => {
      const poolAddress = poolByKey.get(poolKeyOf(raw)) ?? null
      return buildPositionEntry({
        market: opts.chain.market,
        raw,
        token0: tokens.get(raw.token0.toLowerCase())!,
        token1: tokens.get(raw.token1.toLowerCase())!,
        poolAddress,
        poolState: poolAddress
          ? (stateByPool.get(poolAddress.toLowerCase()) ?? null)
          : null,
        fees: feeResults[index],
        pairAddresses,
      })
    })

    return {
      ...base,
      positions,
      totalFound,
      enumerated,
      listable: listable.length,
      errors,
      ts: Date.now(),
    }
  } catch (error) {
    return {
      ...base,
      errors: [
        ...errors,
        {
          manager: '',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
      ts: Date.now(),
    }
  }
}

/**
 * The pair key's two legs as contract addresses, or null.
 *
 * Null is the honest answer whenever either leg will not resolve: the caller
 * then gets `matchesPair: null` and shows everything, which beats filtering a
 * list against half a pair.
 */
async function resolvePairAddresses(
  chain: EvmChainConfig,
  pair: string | null | undefined,
): Promise<readonly [string, string] | null> {
  if (!pair) return null
  const at = pair.lastIndexOf('-')
  if (at <= 0) return null
  const base = pair.slice(0, at)
  const quote = pair.slice(at + 1)
  try {
    const [baseToken, quoteToken] = await Promise.all([
      resolveToken(chain, base),
      resolveToken(chain, quote),
    ])
    if (!baseToken || !quoteToken) return null
    return [baseToken.address, quoteToken.address] as const
  } catch {
    return null
  }
}

/**
 * A position's pool identity: the manager that issued it plus the pool's own
 * three parameters. Two positions share a key exactly when they share a pool.
 */
export function poolKeyOf(raw: RawLpPosition): string {
  return [
    raw.manager.manager.toLowerCase(),
    raw.token0.toLowerCase(),
    raw.token1.toLowerCase(),
    raw.fee,
  ].join(':')
}

/** `0x1234…abcd`, for a token whose own symbol will not decode. */
function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

/** Map with a ceiling on in-flight work, preserving input order. */
async function mapWithConcurrency<T, TResult>(
  items: ReadonlyArray<T>,
  limit: number,
  worker: (item: T) => Promise<TResult>,
): Promise<Array<TResult>> {
  const results = new Array<TResult>(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, () =>
    (async () => {
      for (;;) {
        const index = cursor++
        if (index >= items.length) return
        results[index] = await worker(items[index])
      }
    })(),
  )
  await Promise.all(runners)
  return results
}
