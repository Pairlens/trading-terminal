// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The three signed transactions a Solana concentrated-liquidity position
 * accepts: claim the fees, burn part of the range, add to it.
 *
 * The write half of `lp-client`, split for the reason the EVM connector splits
 * its own: that module is structurally read-only and has to stay that way,
 * because it runs on every LP pane with the vault still sealed. Everything that
 * can reach a key lives here.
 *
 * WHAT IS CHECKED BEFORE ANYTHING IS SIGNED, in order, all fail closed:
 *
 *   1. The action is one of the three. Nothing else reaches this module.
 *   2. `manager` is one of the two PINNED program ids. The caller supplies it —
 *      a pane read it off a position row — and on Solana it decides which
 *      program will be handed a signature, so an unknown one is refused rather
 *      than treated as a new venue.
 *   3. The position mint and the wallet address are real base58 pubkeys, and
 *      the tolerance is inside the cap.
 *   4. The position account exists AT THE PDA DERIVED UNDER THE NAMED PROGRAM
 *      and decodes as that program's layout. A caller cannot point this at an
 *      arbitrary address: the address is derived here, from the mint.
 *   5. OWNERSHIP IS PROVEN FROM CHAIN STATE. The wallet's associated token
 *      account for the position mint, under the token program the MINT ITSELF
 *      declares, must exist and hold exactly one unit. That single read is both
 *      the ownership proof and the thing that decides which token program goes
 *      into the instruction, so the two can never disagree.
 *   6. Amounts and floors are computed from the pool and position as read in
 *      this call, never from anything the caller sent.
 *   7. Only then is the private key fetched, and the keypair it derives must
 *      equal the wallet slot's address.
 *   8. The assembled transaction is SIMULATED. A simulation that fails is a
 *      refusal that reports the program's own log tail, and nothing is sent.
 *
 * WHY COLLECT IS TWO INSTRUCTIONS ON ORCA. `collect_fees_v2` pays out
 * `feeOwed`, and `feeOwed` is a receipt from the position's last touch, not a
 * balance — the same gap `lp-fees` exists to close on the read side. Collecting
 * without settling first would pay the stale figure and silently leave the rest
 * (on the module's own fixture, 1.1 SOL of 1.11) in the pool. So a collect is
 * `update_fees_and_rewards` and then `collect_fees_v2`, atomically.
 *
 * WHY RAYDIUM'S COLLECT IS A DECREASE. Raydium ships no collect instruction at
 * all. `decrease_liquidity_v2` settles fees and pays them out along with
 * whatever it burns, so claiming without burning is that same call with
 * `liquidity = 0` and both minimums at zero.
 *
 * MINIMUMS come from state read in THIS call. They are the only protection a
 * burn has against the pool moving between signing and inclusion, and a floor
 * computed by a pane from a position read a minute old is a floor around a
 * price that no longer exists.
 */
import {
  rawAmountsForLiquidity,
  sqrtRatioAtTick,
} from '../evm-dex-connector/lp-math'
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  decodeOrcaPosition,
  decodeOrcaWhirlpool,
  decodeRaydiumPool,
  decodeRaydiumPosition,
  sqrtPriceX64ToX96,
} from './lp-layouts'
import {
  associatedTokenAddress,
  createAssociatedTokenAccountIdempotent,
  orcaCollectFeesV2,
  orcaModifyLiquidityV2,
  orcaUpdateFeesAndRewards,
  positionPda,
  raydiumDecreaseLiquidityV2,
  raydiumIncreaseLiquidityV2,
  raydiumProtocolPositionPda,
  tickArrayPda,
} from './lp-instructions'
import type {
  BuiltInstruction,
  DecodeAddress,
  DeriveAddress,
} from './lp-instructions'
import type { SolanaLpProtocol } from './lp-layouts'
import type {
  LpWriteAction,
  LpWriteResult,
} from '@pairlens/shared/instrument-types'

/** Tolerance on a removal when the caller names none. */
export const LP_DEFAULT_SLIPPAGE_BPS = 50

/** Ceiling on the tolerance. Above this a minimum stops being a protection. */
export const LP_MAX_SLIPPAGE_BPS = 2_500

/** Base58, and the length a 32-byte pubkey encodes into. */
const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

/** The two programs this module will sign for. A miss is a refusal. */
export const SOLANA_LP_PROGRAMS: Record<string, SolanaLpProtocol> = {
  [ORCA_WHIRLPOOL_PROGRAM_ID]: 'orca-whirlpool',
  [RAYDIUM_CLMM_PROGRAM_ID]: 'raydium-clmm',
}

// ── Pure validation and math ────────────────────────────────────────────────
// Reimplemented rather than imported from the EVM writer: the shapes differ
// (a pubkey is not a `uint256` token id) and the two modules are owned by
// different chains. Everything below is deterministic and tested.

/** True for the three actions this module implements. */
export function isLpWriteAction(action: unknown): action is LpWriteAction {
  return (
    action === 'lp-collect' ||
    action === 'lp-decrease' ||
    action === 'lp-increase'
  )
}

/**
 * The protocol a caller-supplied manager names, or null.
 *
 * Null is a refusal and never a default. On Solana the "manager" IS the program
 * that will execute against a signature, so falling back to either of them
 * would sign an Orca instruction layout against whatever program the caller
 * actually named.
 */
export function resolveSolanaLpProgram(
  manager: unknown,
): SolanaLpProtocol | null {
  if (typeof manager !== 'string') return null
  return SOLANA_LP_PROGRAMS[manager] ?? null
}

/** A syntactically valid Solana address. */
export function isSolanaAddress(value: unknown): value is string {
  return typeof value === 'string' && BASE58_RE.test(value)
}

/**
 * The slice of liquidity a percentage removes, exactly.
 *
 * Integer math on the `u128` the position stores, so 100% burns to zero with no
 * dust and no rounding above what it holds. Null for anything that is not a
 * whole percentage in 1..100: clamping would burn a different amount than the
 * one confirmed on screen.
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
 * Down is the only safe direction for a floor: rounding up sets a minimum the
 * pool cannot meet and reverts a transaction the user already paid for.
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
 * The liquidity a pair of raw token amounts buys at the current price.
 *
 * The inverse of `rawAmountsForLiquidity`, and the reason an increase needs it:
 * both programs take a LIQUIDITY figure plus per-token maximums, not the
 * amounts themselves. Inside the band the binding leg is whichever produces
 * less, because a position must be funded in the pool's ratio and the surplus
 * of the other token simply is not deposited.
 *
 * Double precision, which is sound because nothing is sized exactly from it:
 * the result is bounded above by the maximums, which ARE exact and come
 * straight from what the user typed.
 */
export function liquidityForAmounts(opts: {
  amount0: bigint
  amount1: bigint
  sqrtPriceX96: bigint
  currentTick: number
  tickLower: number
  tickUpper: number
}): bigint {
  const sqrtLower = sqrtRatioAtTick(opts.tickLower)
  const sqrtUpper = sqrtRatioAtTick(opts.tickUpper)
  if (!(sqrtUpper > sqrtLower)) return 0n
  const amount0 = Number(opts.amount0)
  const amount1 = Number(opts.amount1)

  if (opts.currentTick < opts.tickLower) {
    // Entirely token0: the band sits above the price.
    return floorToBigInt(
      (amount0 * (sqrtLower * sqrtUpper)) / (sqrtUpper - sqrtLower),
    )
  }
  if (opts.currentTick >= opts.tickUpper) {
    return floorToBigInt(amount1 / (sqrtUpper - sqrtLower))
  }

  const sqrtPrice = Math.min(
    sqrtUpper,
    Math.max(sqrtLower, Number(opts.sqrtPriceX96) / 2 ** 96),
  )
  const from0 =
    sqrtUpper > sqrtPrice
      ? (amount0 * (sqrtPrice * sqrtUpper)) / (sqrtUpper - sqrtPrice)
      : Number.POSITIVE_INFINITY
  const from1 =
    sqrtPrice > sqrtLower
      ? amount1 / (sqrtPrice - sqrtLower)
      : Number.POSITIVE_INFINITY
  const liquidity = Math.min(from0, from1)
  return Number.isFinite(liquidity) ? floorToBigInt(liquidity) : 0n
}

/** The minimums that protect a removal, from freshly read pool state. */
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

/** A refusal in the shape the pane renders. Nothing was sent. */
export function lpWriteFailure(
  action: LpWriteAction,
  tokenId: string,
  error: string,
): LpWriteResult {
  return {
    success: false,
    action,
    market: 'jupiter',
    tokenId,
    txHash: null,
    error,
  }
}

/** A decimal amount string worth sending. */
export function isPositiveAmount(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0
  if (typeof value !== 'string' || value.trim() === '') return false
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

/** A human decimal amount as raw integer units, floored. */
export function scaleToRaw(value: unknown, decimals: number): bigint {
  if (!isPositiveAmount(value)) return 0n
  const text = String(value).trim()
  const [whole, fraction = ''] = text.split('.')
  const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals)
  try {
    return (
      BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0')
    )
  } catch {
    return 0n
  }
}

/**
 * The tail of a program's own logs, for a refusal message.
 *
 * A simulation failure without the log is "transaction simulation failed",
 * which tells a user nothing and makes them retry the identical transaction.
 * The last few lines carry the program's actual complaint.
 */
export function simulationRefusal(logs: ReadonlyArray<string> | null): string {
  const tail = (logs ?? [])
    .filter((line) => /Error|error|failed|Panicked|insufficient/.test(line))
    .slice(-3)
  const detail =
    tail.length > 0 ? tail.join(' | ') : (logs ?? []).slice(-3).join(' | ')
  return detail
    ? `Simulation failed, nothing was sent: ${detail}`
    : 'Simulation failed, nothing was sent'
}

// ── The signing path ────────────────────────────────────────────────────────

export type SolanaLpWriteRequest = {
  action: LpWriteAction
  /** Program id, as the caller read it off a position row. UNTRUSTED. */
  manager: unknown
  /** Position NFT mint. UNTRUSTED; the position address is derived from it. */
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
 * failed simulation and a dead RPC are all results a pane can render, and none
 * of them is a throw the caller has to catch to keep a workspace alive. A
 * failure AFTER the send keeps the signature, because that is the only place a
 * user can find out what actually happened.
 */
export async function executeSolanaLpWrite(
  request: SolanaLpWriteRequest,
): Promise<LpWriteResult> {
  const { action } = request
  const tokenIdLabel =
    typeof request.tokenId === 'string' ? request.tokenId : ''
  const fail = (error: string) => lpWriteFailure(action, tokenIdLabel, error)

  // ── 1..3: everything decidable without the chain ──
  if (!isLpWriteAction(action)) return fail(`Unsupported action: ${action}`)

  const protocol = resolveSolanaLpProgram(request.manager)
  if (!protocol) {
    return fail(
      `Unknown position program ${String(request.manager)} on Solana. Refusing to sign.`,
    )
  }
  if (!isSolanaAddress(request.tokenId)) {
    return fail(`Invalid position mint: ${String(request.tokenId)}`)
  }
  if (!isSolanaAddress(request.walletAddress)) {
    return fail('Wallet address is not a Solana address')
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
  if (
    action === 'lp-increase' &&
    !isPositiveAmount(request.amount0Desired) &&
    !isPositiveAmount(request.amount1Desired)
  ) {
    return fail('Nothing to add: both amounts are zero')
  }

  const positionMint = request.tokenId
  const wallet = request.walletAddress

  try {
    const {
      Connection,
      Keypair,
      PublicKey,
      TransactionInstruction,
      TransactionMessage,
      VersionedTransaction,
    } = await import('@solana/web3.js')
    const bs58 = (await import('bs58')).default

    const derive: DeriveAddress = (seeds, programId) =>
      PublicKey.findProgramAddressSync(
        seeds.map((seed) => Buffer.from(seed)),
        new PublicKey(programId),
      )[0].toBase58()
    const decode: DecodeAddress = (address) => new PublicKey(address).toBytes()

    const connection = new Connection(request.rpcUrl, 'confirmed')

    // ── 4: the position, at the PDA derived under the NAMED program ──
    const positionAddress = positionPda(derive, decode, protocol, positionMint)
    const [positionInfo] = await connection.getMultipleAccountsInfo([
      new PublicKey(positionAddress),
    ])
    if (!positionInfo) {
      return fail(
        `No ${protocol === 'orca-whirlpool' ? 'Orca' : 'Raydium'} position exists for mint ${positionMint}`,
      )
    }
    if (positionInfo.owner.toBase58() !== String(request.manager)) {
      // The address is a PDA of the named program, so this should be
      // impossible; refusing anyway is what keeps it impossible.
      return fail('Position account is not owned by the named program')
    }

    const positionData = new Uint8Array(positionInfo.data)
    let poolAddress: string
    let tickLower: number
    let tickUpper: number
    let positionLiquidity: bigint
    try {
      if (protocol === 'orca-whirlpool') {
        const decoded = decodeOrcaPosition(positionData)
        poolAddress = bs58.encode(decoded.pool)
        tickLower = decoded.tickLower
        tickUpper = decoded.tickUpper
        positionLiquidity = decoded.liquidity
      } else {
        const decoded = decodeRaydiumPosition(positionData)
        poolAddress = bs58.encode(decoded.pool)
        tickLower = decoded.tickLower
        tickUpper = decoded.tickUpper
        positionLiquidity = decoded.liquidity
      }
    } catch (error) {
      return fail(
        `Position account did not decode: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    // ── The pool, and the position mint (whose owner names the token program) ──
    const [poolInfo, mintInfo] = await connection.getMultipleAccountsInfo([
      new PublicKey(poolAddress),
      new PublicKey(positionMint),
    ])
    if (!poolInfo) return fail('Pool for this position could not be read')
    if (!mintInfo) return fail('Position mint could not be read')

    const positionTokenProgram = mintInfo.owner.toBase58()
    if (
      positionTokenProgram !== TOKEN_PROGRAM_ID &&
      positionTokenProgram !== TOKEN_2022_PROGRAM_ID
    ) {
      return fail('Position mint is not held by a known token program')
    }

    const poolData = new Uint8Array(poolInfo.data)
    let pool: {
      sqrtPriceX96: bigint
      tick: number
      tickSpacing: number
      mint0: string
      mint1: string
      vault0: string
      vault1: string
      decimals0: number | null
      decimals1: number | null
    }
    try {
      if (protocol === 'orca-whirlpool') {
        const decoded = decodeOrcaWhirlpool(poolData)
        pool = {
          sqrtPriceX96: sqrtPriceX64ToX96(decoded.sqrtPriceX64),
          tick: decoded.tickCurrent,
          tickSpacing: decoded.tickSpacing,
          mint0: bs58.encode(decoded.mintA),
          mint1: bs58.encode(decoded.mintB),
          vault0: bs58.encode(decoded.vaultA),
          vault1: bs58.encode(decoded.vaultB),
          decimals0: null,
          decimals1: null,
        }
      } else {
        const decoded = decodeRaydiumPool(poolData)
        pool = {
          sqrtPriceX96: sqrtPriceX64ToX96(decoded.sqrtPriceX64),
          tick: decoded.tickCurrent,
          tickSpacing: decoded.tickSpacing,
          mint0: bs58.encode(decoded.mint0),
          mint1: bs58.encode(decoded.mint1),
          vault0: bs58.encode(decoded.vault0),
          vault1: bs58.encode(decoded.vault1),
          decimals0: decoded.decimals0,
          decimals1: decoded.decimals1,
        }
      }
    } catch (error) {
      return fail(
        `Pool account did not decode: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    // ── 5: ownership, proven from the chain ──
    // The position NFT must sit in THIS wallet's associated token account, under
    // the token program the mint itself declares. That one read is both the
    // ownership proof and the source of the token-program account the
    // instruction needs, so the two cannot disagree.
    const positionTokenAccount = associatedTokenAddress(derive, decode, {
      owner: wallet,
      mint: positionMint,
      tokenProgram: positionTokenProgram,
    })

    const [positionTaInfo, mint0Info, mint1Info] =
      await connection.getMultipleAccountsInfo([
        new PublicKey(positionTokenAccount),
        new PublicKey(pool.mint0),
        new PublicKey(pool.mint1),
      ])

    if (!positionTaInfo) {
      return fail('The position NFT is not in this wallet. Refusing to sign.')
    }
    if (positionTaInfo.owner.toBase58() !== positionTokenProgram) {
      return fail('Position token account is under the wrong token program')
    }
    // SPL token account layout: mint at 0, owner at 32, amount u64 at 64.
    const taData = new Uint8Array(positionTaInfo.data)
    if (taData.length < 72) return fail('Position token account is malformed')
    if (bs58.encode(taData.subarray(0, 32)) !== positionMint) {
      return fail('Position token account holds a different mint')
    }
    if (bs58.encode(taData.subarray(32, 64)) !== wallet) {
      return fail('Position token account is not owned by this wallet')
    }
    let amount = 0n
    for (let i = 71; i >= 64; i--) amount = (amount << 8n) | BigInt(taData[i])
    if (amount !== 1n) {
      return fail(
        'The position NFT is not held by this wallet. Refusing to sign.',
      )
    }

    if (!mint0Info || !mint1Info) {
      return fail('Pool token mints could not be read. Refusing to sign.')
    }
    const tokenProgram0 = mint0Info.owner.toBase58()
    const tokenProgram1 = mint1Info.owner.toBase58()
    for (const program of [tokenProgram0, tokenProgram1]) {
      if (program !== TOKEN_PROGRAM_ID && program !== TOKEN_2022_PROGRAM_ID) {
        return fail('A pool token mint is not held by a known token program')
      }
    }
    // Mint account layout: `decimals` is a u8 at offset 44 on both programs.
    const decimals0 = pool.decimals0 ?? new Uint8Array(mint0Info.data)[44]
    const decimals1 = pool.decimals1 ?? new Uint8Array(mint1Info.data)[44]

    const ownerAccount0 = associatedTokenAddress(derive, decode, {
      owner: wallet,
      mint: pool.mint0,
      tokenProgram: tokenProgram0,
    })
    const ownerAccount1 = associatedTokenAddress(derive, decode, {
      owner: wallet,
      mint: pool.mint1,
      tokenProgram: tokenProgram1,
    })

    // ── 6: sizes, from the state read above ──
    let liquidityAmount = 0n
    let threshold0 = 0n
    let threshold1 = 0n

    if (action === 'lp-decrease') {
      const toRemove = liquidityForPercent(positionLiquidity, pct)
      if (!toRemove || toRemove <= 0n) {
        return fail('This position has no liquidity to remove')
      }
      liquidityAmount = toRemove
      const mins = decreaseMinAmounts({
        liquidityToRemove: toRemove,
        sqrtPriceX96: pool.sqrtPriceX96,
        currentTick: pool.tick,
        tickLower,
        tickUpper,
        slippageBps,
      })
      threshold0 = mins.amount0Min
      threshold1 = mins.amount1Min
    }

    if (action === 'lp-increase') {
      const desired0 = scaleToRaw(request.amount0Desired, decimals0)
      const desired1 = scaleToRaw(request.amount1Desired, decimals1)
      if (desired0 <= 0n && desired1 <= 0n) {
        return fail('Nothing to add: both amounts round to zero')
      }
      // Size the liquidity from the amounts REDUCED by the tolerance, then cap
      // the maximums at exactly what the user typed. The headroom absorbs a
      // block or two of price drift; the cap is what the confirm card states,
      // so the transaction can never spend more than was agreed to.
      liquidityAmount = liquidityForAmounts({
        amount0: applySlippageFloor(desired0, slippageBps),
        amount1: applySlippageFloor(desired1, slippageBps),
        sqrtPriceX96: pool.sqrtPriceX96,
        currentTick: pool.tick,
        tickLower,
        tickUpper,
      })
      if (liquidityAmount <= 0n) {
        return fail('These amounts are too small to add liquidity to this band')
      }
      threshold0 = desired0
      threshold1 = desired1
    }

    // ── 7: the key, and only now ──
    const privateKey = await request.getPrivateKey()
    if (!privateKey) return fail('Wallet private key not found')
    let keypair: ReturnType<typeof Keypair.fromSecretKey>
    try {
      keypair = Keypair.fromSecretKey(bs58.decode(privateKey))
    } catch {
      return fail('Wallet private key could not be read')
    }
    if (keypair.publicKey.toBase58() !== wallet) {
      return fail('Private key does not match wallet')
    }

    // ── The instructions ──
    const tickArrayLower = tickArrayPda(derive, decode, {
      protocol,
      pool: poolAddress,
      tick: tickLower,
      tickSpacing: pool.tickSpacing,
    })
    const tickArrayUpper = tickArrayPda(derive, decode, {
      protocol,
      pool: poolAddress,
      tick: tickUpper,
      tickSpacing: pool.tickSpacing,
    })

    const built: Array<BuiltInstruction> = []
    // Payout accounts are created idempotently: a wallet that has never held
    // one of the pool's tokens has no account for it, and every one of these
    // instructions pays out.
    for (const [account, mint, program] of [
      [ownerAccount0, pool.mint0, tokenProgram0],
      [ownerAccount1, pool.mint1, tokenProgram1],
    ] as const) {
      built.push(
        createAssociatedTokenAccountIdempotent({
          payer: wallet,
          associatedAccount: account,
          owner: wallet,
          mint,
          tokenProgram: program,
        }),
      )
    }

    if (protocol === 'orca-whirlpool') {
      const accounts = {
        whirlpool: poolAddress,
        position: positionAddress,
        positionTokenAccount,
        positionAuthority: wallet,
        tokenMintA: pool.mint0,
        tokenMintB: pool.mint1,
        tokenOwnerAccountA: ownerAccount0,
        tokenOwnerAccountB: ownerAccount1,
        tokenVaultA: pool.vault0,
        tokenVaultB: pool.vault1,
        tokenProgramA: tokenProgram0,
        tokenProgramB: tokenProgram1,
      }
      if (action === 'lp-collect') {
        // Settle first: `collect_fees_v2` pays `feeOwed`, which is stale until
        // something touches the position.
        built.push(
          orcaUpdateFeesAndRewards({
            whirlpool: poolAddress,
            position: positionAddress,
            tickArrayLower,
            tickArrayUpper,
          }),
          orcaCollectFeesV2(accounts),
        )
      } else {
        built.push(
          orcaModifyLiquidityV2({
            kind: action === 'lp-decrease' ? 'decrease' : 'increase',
            accounts,
            tickArrayLower,
            tickArrayUpper,
            liquidityAmount,
            thresholdA: threshold0,
            thresholdB: threshold1,
          }),
        )
        if (action === 'lp-decrease') {
          // A bare decrease moves the burnt amounts into `feeOwed` alongside
          // the fees and transfers nothing extra, so the collect is what
          // actually pays them out. Same reasoning as the EVM multicall.
          built.push(orcaCollectFeesV2(accounts))
        }
      }
    } else {
      const accounts = {
        nftOwner: wallet,
        nftAccount: positionTokenAccount,
        personalPosition: positionAddress,
        protocolPosition: raydiumProtocolPositionPda(derive, decode, {
          pool: poolAddress,
          tickLower,
          tickUpper,
        }),
        poolState: poolAddress,
        tokenVault0: pool.vault0,
        tokenVault1: pool.vault1,
        tickArrayLower,
        tickArrayUpper,
        tokenAccount0: ownerAccount0,
        tokenAccount1: ownerAccount1,
        vault0Mint: pool.mint0,
        vault1Mint: pool.mint1,
      }
      if (action === 'lp-increase') {
        built.push(
          raydiumIncreaseLiquidityV2({
            accounts,
            liquidity: liquidityAmount,
            amount0Max: threshold0,
            amount1Max: threshold1,
          }),
        )
      } else {
        // `lp-collect` is this same call with nothing burnt.
        built.push(
          raydiumDecreaseLiquidityV2({
            accounts,
            liquidity: action === 'lp-collect' ? 0n : liquidityAmount,
            amount0Min: action === 'lp-collect' ? 0n : threshold0,
            amount1Min: action === 'lp-collect' ? 0n : threshold1,
          }),
        )
      }
    }

    const instructions = built.map(
      (instruction) =>
        new TransactionInstruction({
          programId: new PublicKey(instruction.programId),
          keys: instruction.keys.map((key) => ({
            pubkey: new PublicKey(key.pubkey),
            isSigner: key.isSigner,
            isWritable: key.isWritable,
          })),
          data: Buffer.from(instruction.data),
        }),
    )

    const latest = await connection.getLatestBlockhash()
    const message = new TransactionMessage({
      payerKey: keypair.publicKey,
      recentBlockhash: latest.blockhash,
      instructions,
    }).compileToV0Message()
    const transaction = new VersionedTransaction(message)

    // ── 8: simulate, and refuse on anything but success ──
    // Mandatory. These instructions are assembled from transcribed account
    // orders, and the program is the only thing that can confirm they are
    // right. A simulation failure costs nothing; the transaction it would have
    // become costs a fee and a confusing explorer page.
    const simulation = await connection.simulateTransaction(transaction, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    })
    if (simulation.value.err) {
      return fail(simulationRefusal(simulation.value.logs))
    }

    transaction.sign([keypair])
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false, maxRetries: 3 },
    )

    // Past this point the transaction is on the network, so every exit keeps
    // the signature: it is the only way a user can find out what happened.
    try {
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latest.blockhash,
          lastValidBlockHeight: latest.lastValidBlockHeight,
        },
        'confirmed',
      )
      if (confirmation.value.err) {
        return {
          success: false,
          action,
          market: 'jupiter',
          tokenId: tokenIdLabel,
          txHash: signature,
          error: `${ACTION_LABELS[action]} failed on-chain (${signature})`,
        }
      }
    } catch (error) {
      return {
        success: false,
        action,
        market: 'jupiter',
        tokenId: tokenIdLabel,
        txHash: signature,
        error: `Sent, but confirmation did not complete: ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }

    return {
      success: true,
      action,
      market: 'jupiter',
      tokenId: tokenIdLabel,
      txHash: signature,
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
}

const ACTION_LABELS: Record<LpWriteAction, string> = {
  'lp-collect': 'Collect',
  'lp-decrease': 'Remove liquidity',
  'lp-increase': 'Add liquidity',
}
