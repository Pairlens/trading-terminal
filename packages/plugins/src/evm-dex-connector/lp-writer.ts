// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three signed transactions a concentrated-liquidity position accepts:
 * claim the fees, burn part of the range, add to it.
 *
 * This is the write half of `lp-client`, and the split is deliberate: that
 * module is structurally read-only (no key, no calldata, no wallet slot) and
 * has to stay that way, because it runs on every LP pane with the vault sealed.
 * Everything that signs lives here.
 *
 * WHAT IS CHECKED BEFORE ANYTHING IS SIGNED, in order, all fail closed:
 *
 *   1. The action is one of the three. Nothing else reaches this module.
 *   2. `manager` is one of the PINNED deployments for the chain
 *      (`lp-deployments.ts`). The caller supplies it — a pane read it off a
 *      position row — and it is also the only address an ERC-20 approval is
 *      ever granted to, so an unknown manager is refused rather than trusted.
 *   3. The manager's own `factory()` matches the pinned factory. Same rule the
 *      read path applies: a hardcoded address is a claim, and only the contract
 *      can confirm it. A mismatch means our table is stale, and a stale table is
 *      not something to sign against.
 *   4. `ownerOf(tokenId)` is the wallet. A position manager would reject a write
 *      from a non-owner anyway; refusing here costs no gas and says why.
 *   5. The derived signing account matches the wallet slot's address, exactly as
 *      `swap-executor` checks it. Only then is the private key used.
 *
 * The private key is fetched AFTER the chain reads, so every refusal above
 * happens without touching the vault.
 *
 * WHY DECREASE IS A MULTICALL. `decreaseLiquidity` moves the burnt amounts into
 * the position's `tokensOwed` and transfers nothing. On its own it looks like a
 * removal that lost the funds, and the user has to send a second transaction to
 * see them. The atomic idiom is one `multicall([decreaseLiquidity, collect])`,
 * which is what the protocol's own interface ships `multicall` for.
 *
 * MINIMUMS. `amount0Min`/`amount1Min` are the only protection a decrease has
 * against the pool being moved between signing and inclusion, so they are
 * derived HERE from freshly read chain state rather than accepted from the
 * caller: a pane that computed them from a 60-second-old position read would set
 * a floor around a price that no longer exists.
 */
import { scaleAmount } from '@pairlens/market-engine/amount'
import { getViemChain } from './chains'
import {
  FACTORY_ABI,
  PANCAKE_SLOT0_ABI,
  UNISWAP_SLOT0_ABI,
  isEvmAddress,
} from './lp-client'
import { lpManagersFor } from './lp-deployments'
import { rawAmountsForLiquidity } from './lp-math'
import { ERC20_ABI } from './swap-executor'
import type { EvmChainConfig } from './chains'
import type { LpManagerDeployment } from './lp-deployments'
import type {
  LpWriteAction,
  LpWriteResult,
} from '@pairlens/shared/instrument-types'

/** Collect with no ceiling: the position pays out everything it owes. */
const MAX_UINT128 = (1n << 128n) - 1n

/**
 * Default tolerance on a removal, in basis points.
 *
 * Tighter than the swap default (100 bps) on purpose: a burn is not a trade
 * through a book, so the only thing that can move the payout is the pool price
 * drifting between signing and inclusion. 50 bps covers a block or two of drift
 * on a normal pool and still refuses a sandwich.
 */
export const LP_DEFAULT_SLIPPAGE_BPS = 50

/** Ceiling on the tolerance. Above this a minimum stops being a protection. */
export const LP_MAX_SLIPPAGE_BPS = 2_500

/** Deadline window. Long enough for a congested block, short enough to expire. */
export const LP_DEADLINE_SECONDS = 600

/**
 * Write entries on the v3-family NonfungiblePositionManager.
 *
 * Verified against Uniswap's published `INonfungiblePositionManager` (v3-periphery
 * 1.0.0) and `IMulticall`, and their PancakeSwap v3 fork, which reuses both
 * interfaces unchanged: the `slot0` widening that `lp-deployments` records is a
 * POOL difference, not a manager one. The struct field order is pinned by the
 * selector test in `__tests__/lp-writer.test.ts` — a reordered or retyped tuple
 * changes the selector, so a transcription error cannot reach a chain.
 */
export const NFPM_WRITE_ABI = [
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'address' }],
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
  {
    type: 'function',
    name: 'decreaseLiquidity',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'liquidity', type: 'uint128' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'increaseLiquidity',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount0Desired', type: 'uint256' },
          { name: 'amount1Desired', type: 'uint256' },
          { name: 'amount0Min', type: 'uint256' },
          { name: 'amount1Min', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
    ],
    outputs: [
      { name: 'liquidity', type: 'uint128' },
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'multicall',
    stateMutability: 'payable',
    inputs: [{ name: 'data', type: 'bytes[]' }],
    outputs: [{ name: 'results', type: 'bytes[]' }],
  },
] as const

/** `decimals()` only. The write path never displays a symbol. */
const ERC20_DECIMALS_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
] as const

// ── Pure math and validation ────────────────────────────────────────────
// Everything below this line is deterministic and tested. The RPC walk further
// down does nothing a test could meaningfully simulate; these are the parts
// where a wrong answer signs the wrong transaction.

/** True for the three actions this module implements. */
export function isLpWriteAction(action: unknown): action is LpWriteAction {
  return (
    action === 'lp-collect' ||
    action === 'lp-decrease' ||
    action === 'lp-increase'
  )
}

/**
 * The pinned deployment matching a caller-supplied manager address, or null.
 *
 * Null is a refusal, never a fallback to the chain's first manager: signing a
 * burn against a manager the user did not name would target somebody else's
 * position id, and approving one would hand tokens to an unaudited contract.
 */
export function resolveLpManager(
  market: string,
  manager: unknown,
): LpManagerDeployment | null {
  if (!isEvmAddress(manager)) return null
  const wanted = manager.toLowerCase()
  return (
    lpManagersFor(market).find((m) => m.manager.toLowerCase() === wanted) ??
    null
  )
}

/** A position id as the manager stores it: a non-negative decimal integer. */
export function parseTokenId(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null
  try {
    return BigInt(value)
  } catch {
    return null
  }
}

/**
 * The slice of liquidity a percentage removes, exactly.
 *
 * Integer math on the `uint128` the position stores, so 100% burns the position
 * to zero with no dust left behind and no rounding that could exceed what it
 * holds. Null for anything that is not a whole percentage in 1..100 — a
 * fractional or out-of-range percentage is a caller bug, and clamping it would
 * quietly burn a different amount than the one confirmed on screen.
 */
export function liquidityForPercent(
  liquidity: bigint,
  pct: number,
): bigint | null {
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) return null
  if (liquidity <= 0n) return null
  if (pct === 100) return liquidity
  return (liquidity * BigInt(pct)) / 100n
}

/** Tolerance in bps, or null when the caller sent something unusable. */
export function normalizeSlippageBps(value: unknown): number | null {
  if (value === undefined || value === null) return LP_DEFAULT_SLIPPAGE_BPS
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const bps = Math.round(value)
  if (bps < 0 || bps > LP_MAX_SLIPPAGE_BPS) return null
  return bps
}

/**
 * An amount reduced by a tolerance, rounded DOWN.
 *
 * Down is the only safe direction for a floor: rounding up would set a minimum
 * the pool cannot meet and revert a transaction the user already paid for.
 */
export function applySlippageFloor(
  amount: bigint,
  slippageBps: number,
): bigint {
  if (amount <= 0n) return 0n
  const bps = BigInt(Math.min(Math.max(Math.round(slippageBps), 0), 10_000))
  return (amount * (10_000n - bps)) / 10_000n
}

/** A float amount of raw token units as an integer, floored, never negative. */
export function floorToBigInt(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) return 0n
  return BigInt(Math.floor(value))
}

/**
 * The minimums that protect a removal.
 *
 * Composition is computed with `lp-math`, which is double precision — and that
 * is sound HERE, unlike for a mint, for two reasons. These values are BOUNDS
 * rather than transfer amounts: nothing is sized from them, the pool pays what
 * it pays, and the transaction only reverts if it pays less. And the float error
 * (about 1e-12 relative) is eight orders of magnitude below the smallest
 * tolerance this module accepts, so it cannot move the floor a user set. The
 * liquidity being burnt, which IS an exact quantity, never goes through a float
 * (`liquidityForPercent`).
 */
export function decreaseMinAmounts(opts: {
  liquidityToRemove: bigint
  sqrtPriceX96: bigint
  currentTick: number
  tickLower: number
  tickUpper: number
  slippageBps: number
}): { amount0Min: bigint; amount1Min: bigint } {
  const raw = rawAmountsForLiquidity({
    liquidity: opts.liquidityToRemove,
    sqrtPriceX96: opts.sqrtPriceX96,
    currentTick: opts.currentTick,
    tickLower: opts.tickLower,
    tickUpper: opts.tickUpper,
  })
  return {
    amount0Min: applySlippageFloor(
      floorToBigInt(raw.amount0),
      opts.slippageBps,
    ),
    amount1Min: applySlippageFloor(
      floorToBigInt(raw.amount1),
      opts.slippageBps,
    ),
  }
}

/** Unix seconds the manager should stop accepting this transaction at. */
export function writeDeadline(
  nowMs: number,
  windowSeconds = LP_DEADLINE_SECONDS,
): bigint {
  return BigInt(Math.floor(nowMs / 1000) + windowSeconds)
}

/** A refusal in the shape the pane renders. Nothing was sent. */
export function lpWriteFailure(
  action: LpWriteAction,
  market: string,
  tokenId: string,
  error: string,
): LpWriteResult {
  return { success: false, action, market, tokenId, txHash: null, error }
}

// ── The signing path ───────────────────────────────────────────────────

export type LpWriteRequest = {
  chain: EvmChainConfig
  action: LpWriteAction
  /** Position manager, as the caller read it off a position row. UNTRUSTED. */
  manager: unknown
  tokenId: unknown
  /** Wallet slot address. The signing key must derive to exactly this. */
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
  rpcUrl: string
  slippageBps?: unknown
  /** Whole percentage of the position's liquidity to remove (`lp-decrease`). */
  liquidityPct?: unknown
  /** Human decimal amounts to add (`lp-increase`), per pool-ordered token. */
  amount0Desired?: unknown
  amount1Desired?: unknown
}

/**
 * Run one liquidity write end to end, and report what happened.
 *
 * Errors are data all the way through, exactly like the swap path: a refusal, a
 * revert and a dead RPC are all results a pane can render, and none of them is a
 * throw the caller has to catch to keep a workspace alive.
 */
export async function executeLpWrite(
  request: LpWriteRequest,
): Promise<LpWriteResult> {
  const { chain, action } = request
  const tokenIdLabel =
    typeof request.tokenId === 'string'
      ? request.tokenId
      : String(request.tokenId ?? '')
  const fail = (error: string) =>
    lpWriteFailure(action, chain.market, tokenIdLabel, error)

  if (!isLpWriteAction(action)) return fail(`Unsupported action: ${action}`)

  const manager = resolveLpManager(chain.market, request.manager)
  if (!manager) {
    return fail(
      `Unknown position manager ${String(request.manager)} on ${chain.displayName}. Refusing to sign.`,
    )
  }
  const tokenId = parseTokenId(request.tokenId)
  if (tokenId === null) return fail(`Invalid position id: ${tokenIdLabel}`)
  if (!isEvmAddress(request.walletAddress)) {
    return fail('Wallet address is not an EVM address')
  }
  const slippageBps = normalizeSlippageBps(request.slippageBps)
  if (slippageBps === null) {
    return fail(
      `Slippage tolerance must be between 0 and ${LP_MAX_SLIPPAGE_BPS} bps`,
    )
  }

  let pct = 0
  if (action === 'lp-decrease') {
    const raw = request.liquidityPct
    if (
      typeof raw !== 'number' ||
      !Number.isInteger(raw) ||
      raw < 1 ||
      raw > 100
    ) {
      return fail('Removal percentage must be a whole number from 1 to 100')
    }
    pct = raw
  }
  if (action === 'lp-increase') {
    const zero0 = !isPositiveAmount(request.amount0Desired)
    const zero1 = !isPositiveAmount(request.amount1Desired)
    if (zero0 && zero1) return fail('Nothing to add: both amounts are zero')
  }

  const owner = request.walletAddress as `0x${string}`

  try {
    const { createPublicClient, createWalletClient, encodeFunctionData, http } =
      await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const viemChain = await getViemChain(chain.market)
    const transport = http(request.rpcUrl)
    const publicClient = createPublicClient({ chain: viemChain, transport })

    // ── Ownership, the pinned factory, and the position itself ──
    const [ownerResult, factoryResult, positionResult] =
      await publicClient.multicall({
        contracts: [
          {
            address: manager.manager,
            abi: NFPM_WRITE_ABI,
            functionName: 'ownerOf' as const,
            args: [tokenId] as const,
          },
          {
            address: manager.manager,
            abi: NFPM_WRITE_ABI,
            functionName: 'factory' as const,
          },
          {
            address: manager.manager,
            abi: NFPM_WRITE_ABI,
            functionName: 'positions' as const,
            args: [tokenId] as const,
          },
        ],
        allowFailure: true,
      })

    if (ownerResult.status !== 'success') {
      return fail(
        `Position #${tokenIdLabel} could not be read on ${chain.displayName}`,
      )
    }
    if (String(ownerResult.result).toLowerCase() !== owner.toLowerCase()) {
      return fail(
        `Position #${tokenIdLabel} is not held by this wallet. Refusing to sign.`,
      )
    }
    if (
      factoryResult.status !== 'success' ||
      String(factoryResult.result).toLowerCase() !==
        manager.factory.toLowerCase()
    ) {
      return fail(
        'Pinned factory does not match the position manager. Refusing to sign.',
      )
    }
    if (positionResult.status !== 'success') {
      return fail(`Position #${tokenIdLabel} state could not be read`)
    }
    const position = positionResult.result as readonly [
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
    const token0 = position[2] as `0x${string}`
    const token1 = position[3] as `0x${string}`
    const fee = Number(position[4])
    const tickLower = Number(position[5])
    const tickUpper = Number(position[6])
    const liquidity = position[7]

    // The slice to burn is decided from chain state, so it is decided here:
    // a position that has already been emptied is a refusal, and refusing it
    // before the key means an empty position never reaches the vault at all.
    const liquidityToRemove =
      action === 'lp-decrease' ? liquidityForPercent(liquidity, pct) : null
    if (action === 'lp-decrease' && (liquidityToRemove ?? 0n) <= 0n) {
      return fail(`Position #${tokenIdLabel} has no liquidity to remove`)
    }

    // ── The key, and only now ──
    const privateKey = await request.getPrivateKey()
    if (!privateKey) return fail('Wallet private key not found')
    const account = privateKeyToAccount(
      (privateKey.startsWith('0x')
        ? privateKey
        : `0x${privateKey}`) as `0x${string}`,
    )
    if (account.address.toLowerCase() !== owner.toLowerCase()) {
      return fail('Private key does not match wallet')
    }
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport,
    })
    const deadline = writeDeadline(Date.now())

    if (action === 'lp-collect') {
      const hash = await walletClient.writeContract({
        address: manager.manager,
        abi: NFPM_WRITE_ABI,
        functionName: 'collect',
        args: [
          {
            tokenId,
            // The signer, always. A recipient is never taken from the caller:
            // the whole point of this pane is claiming YOUR fees.
            recipient: account.address,
            amount0Max: MAX_UINT128,
            amount1Max: MAX_UINT128,
          },
        ],
      })
      return receiptResult(
        publicClient,
        action,
        chain.market,
        tokenIdLabel,
        hash,
      )
    }

    if (action === 'lp-decrease' && liquidityToRemove !== null) {
      // Minimums need the pool's live price, so the pool is resolved through
      // the same factory the read path uses and its `slot0` is read with the
      // variant this manager's pools actually deploy.
      const poolAddress = await publicClient.readContract({
        address: manager.factory,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [token0, token1, fee],
      })
      if (!isEvmAddress(poolAddress) || /^0x0{40}$/.test(poolAddress)) {
        return fail('Pool for this position could not be resolved')
      }
      const slot0 = await publicClient.readContract({
        address: poolAddress,
        abi:
          manager.slot0 === 'pancake-v3'
            ? PANCAKE_SLOT0_ABI
            : UNISWAP_SLOT0_ABI,
        functionName: 'slot0',
      })
      const [sqrtPriceX96, currentTick] = slot0 as readonly [
        bigint,
        number,
        ...Array<unknown>,
      ]
      const { amount0Min, amount1Min } = decreaseMinAmounts({
        liquidityToRemove,
        sqrtPriceX96,
        currentTick: Number(currentTick),
        tickLower,
        tickUpper,
        slippageBps,
      })

      // One transaction: burn the liquidity, then sweep everything the position
      // owes — the burnt amounts AND the fees they earned. Sent as a multicall
      // because a bare decrease transfers nothing.
      const calls = [
        encodeFunctionData({
          abi: NFPM_WRITE_ABI,
          functionName: 'decreaseLiquidity',
          args: [
            {
              tokenId,
              liquidity: liquidityToRemove,
              amount0Min,
              amount1Min,
              deadline,
            },
          ],
        }),
        encodeFunctionData({
          abi: NFPM_WRITE_ABI,
          functionName: 'collect',
          args: [
            {
              tokenId,
              recipient: account.address,
              amount0Max: MAX_UINT128,
              amount1Max: MAX_UINT128,
            },
          ],
        }),
      ]
      const hash = await walletClient.writeContract({
        address: manager.manager,
        abi: NFPM_WRITE_ABI,
        functionName: 'multicall',
        args: [calls],
      })
      return receiptResult(
        publicClient,
        action,
        chain.market,
        tokenIdLabel,
        hash,
      )
    }

    // ── lp-increase ──
    // Decimals come off the chain rather than from the caller: a wrong scale is
    // a wrong approval and a wrong deposit, and the pane's copy of them came
    // from a read that could be minutes old or, for a hostile caller, invented.
    const decimalsResults = await publicClient.multicall({
      contracts: [
        {
          address: token0,
          abi: ERC20_DECIMALS_ABI,
          functionName: 'decimals' as const,
        },
        {
          address: token1,
          abi: ERC20_DECIMALS_ABI,
          functionName: 'decimals' as const,
        },
      ],
      allowFailure: true,
    })
    if (
      decimalsResults[0].status !== 'success' ||
      decimalsResults[1].status !== 'success'
    ) {
      return fail('Token decimals could not be read. Refusing to sign.')
    }
    const decimals0 = Number(decimalsResults[0].result)
    const decimals1 = Number(decimalsResults[1].result)

    const amount0Desired = isPositiveAmount(request.amount0Desired)
      ? scaleAmount(String(request.amount0Desired), decimals0)
      : 0n
    const amount1Desired = isPositiveAmount(request.amount1Desired)
      ? scaleAmount(String(request.amount1Desired), decimals1)
      : 0n
    if (amount0Desired <= 0n && amount1Desired <= 0n) {
      return fail('Nothing to add: both amounts round to zero')
    }

    // Approvals, the swap path's idiom: check the allowance first, approve
    // exactly the amount being deposited, and never name a spender other than
    // the pinned manager.
    const approvals: Array<string> = []
    for (const [token, amount] of [
      [token0, amount0Desired],
      [token1, amount1Desired],
    ] as const) {
      if (amount <= 0n) continue
      const allowance = await publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, manager.manager],
      })
      if (allowance >= amount) continue
      const approveHash = await walletClient.writeContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [manager.manager, amount],
      })
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
      })
      approvals.push(approveHash)
      if (approveReceipt.status !== 'success') {
        return {
          ...fail(`Token approval failed (tx ${approveHash})`),
          approvals,
        }
      }
    }

    const hash = await walletClient.writeContract({
      address: manager.manager,
      abi: NFPM_WRITE_ABI,
      functionName: 'increaseLiquidity',
      args: [
        {
          tokenId,
          amount0Desired,
          amount1Desired,
          // Exact integer haircut on amounts the user typed, so the confirm
          // card can state the floor rather than describe it.
          amount0Min: applySlippageFloor(amount0Desired, slippageBps),
          amount1Min: applySlippageFloor(amount1Desired, slippageBps),
          deadline,
        },
      ],
    })
    const result = await receiptResult(
      publicClient,
      action,
      chain.market,
      tokenIdLabel,
      hash,
    )
    return approvals.length > 0 ? { ...result, approvals } : result
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

/** A decimal amount string that is worth sending. */
function isPositiveAmount(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (typeof value !== 'string' || value.trim() === '') return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

/**
 * Wait for the receipt and report it.
 *
 * A revert keeps its hash: the pane links straight to the explorer, which is
 * the only place the reason lives. "Failed" with nothing to click is what makes
 * a user retry a transaction that will fail the same way.
 */
async function receiptResult(
  publicClient: {
    waitForTransactionReceipt: (args: {
      hash: `0x${string}`
    }) => Promise<{ status: string }>
  },
  action: LpWriteAction,
  market: string,
  tokenId: string,
  hash: `0x${string}`,
): Promise<LpWriteResult> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') {
    return {
      success: false,
      action,
      market,
      tokenId,
      txHash: hash,
      error: `${ACTION_LABELS[action]} reverted on-chain (tx ${hash})`,
    }
  }
  return { success: true, action, market, tokenId, txHash: hash }
}

const ACTION_LABELS: Record<LpWriteAction, string> = {
  'lp-collect': 'Collect',
  'lp-decrease': 'Remove liquidity',
  'lp-increase': 'Add liquidity',
}
