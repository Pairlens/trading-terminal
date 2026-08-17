// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Hand-built Orca and Raydium instructions, and the addresses they need.
 *
 * No Anchor client, no protocol SDK: the same decision `lp-layouts` documents
 * for reading. An Anchor instruction is an 8-byte discriminator, the Borsh
 * encoding of its arguments, and an ORDERED list of accounts, so building one
 * is byte concatenation. What it costs is that the ordering is transcribed, and
 * a transcription error here does not throw — it hands the program a different
 * account in a slot it will happily use.
 *
 * So two things guard it. The discriminators are asserted against
 * `sha256("global:<method>")` in the tests rather than trusted as magic
 * numbers. And the account orders came from the programs' own published IDLs
 * (pinned under `__tests__/fixtures/`), cross-checked against the account
 * counts of real mainnet transactions: Orca `collect_fees_v2` is 13 accounts,
 * `decrease_liquidity_v2` and `increase_liquidity_v2` are 15, Raydium's
 * decrease is 16 and its increase is 15.
 *
 * ONE TRAP WORTH NAMING. Both programs have instructions called
 * `decrease_liquidity_v2` and `increase_liquidity_v2`, so the Anchor
 * discriminators are IDENTICAL across them while the account lists are not.
 * Nothing dispatches on the discriminator here; everything dispatches on the
 * program id.
 *
 * Everything in this file is pure. It touches no key, no RPC and no clock.
 */
import {
  ORCA_TICKS_PER_ARRAY,
  ORCA_WHIRLPOOL_PROGRAM_ID,
  POSITION_PDA_SEED,
  RAYDIUM_CLMM_PROGRAM_ID,
  RAYDIUM_TICKS_PER_ARRAY,
  TICK_ARRAY_PDA_SEED,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  i32ToBigEndianBytes,
  i32ToLittleEndianBytes,
  tickArrayStartIndex,
} from './lp-layouts'
import type { SolanaLpProtocol } from './lp-layouts'

/** SPL Associated Token Account program. Derives a wallet's canonical account. */
export const ASSOCIATED_TOKEN_PROGRAM_ID =
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'

/** Both v2 instruction families take a memo program slot; both ignore it. */
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'

export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'

/**
 * Anchor discriminators: the first eight bytes of `sha256("global:<method>")`.
 *
 * Pinned rather than hashed at runtime so the bytes are reviewable, and
 * asserted against a real sha256 in `__tests__/lp-instructions.test.ts` so they
 * cannot drift from the method names beside them.
 */
export const DISCRIMINATORS = {
  /** `collect_fees_v2` (Orca). */
  collectFeesV2: Uint8Array.from([207, 117, 95, 191, 229, 180, 226, 15]),
  /** `decrease_liquidity_v2`. Same bytes on both programs. */
  decreaseLiquidityV2: Uint8Array.from([58, 127, 188, 62, 79, 82, 196, 96]),
  /** `increase_liquidity_v2`. Same bytes on both programs. */
  increaseLiquidityV2: Uint8Array.from([133, 29, 89, 223, 69, 238, 176, 10]),
  /** `update_fees_and_rewards` (Orca), permissionless. */
  updateFeesAndRewards: Uint8Array.from([154, 230, 250, 13, 236, 209, 75, 223]),
} as const

/** An account slot in an instruction, before it is turned into a web3 meta. */
export type AccountMeta = {
  pubkey: string
  isSigner: boolean
  isWritable: boolean
}

/** A built instruction, in the shape the writer converts to web3 objects. */
export type BuiltInstruction = {
  programId: string
  keys: Array<AccountMeta>
  data: Uint8Array
}

const ro = (pubkey: string): AccountMeta => ({
  pubkey,
  isSigner: false,
  isWritable: false,
})
const mut = (pubkey: string): AccountMeta => ({
  pubkey,
  isSigner: false,
  isWritable: true,
})
const signer = (pubkey: string): AccountMeta => ({
  pubkey,
  isSigner: true,
  isWritable: false,
})

// ── Argument encoding ───────────────────────────────────────────────────────

export function encodeU64LE(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 64n) {
    throw new Error(`u64 out of range: ${value}`)
  }
  const out = new Uint8Array(8)
  let rest = value
  for (let i = 0; i < 8; i++) {
    out[i] = Number(rest & 0xffn)
    rest >>= 8n
  }
  return out
}

export function encodeU128LE(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 128n) {
    throw new Error(`u128 out of range: ${value}`)
  }
  const out = new Uint8Array(16)
  let rest = value
  for (let i = 0; i < 16; i++) {
    out[i] = Number(rest & 0xffn)
    rest >>= 8n
  }
  return out
}

export function concatBytes(...parts: Array<Uint8Array>): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/**
 * A Borsh `Option::None`, one zero byte.
 *
 * Both Orca v2 instructions end with `Option<RemainingAccountsInfo>`, which
 * exists for Token-2022 transfer hooks and supplemental tick arrays. Passing
 * `None` is what every ordinary position needs, and it is also the only value
 * that is safe to send blind: a `Some` describes trailing accounts this module
 * does not append, and the program would read the wrong ones.
 */
export const OPTION_NONE = Uint8Array.from([0])

// ── Address derivation ──────────────────────────────────────────────────────
//
// These take a `derive` callback rather than importing `@solana/web3.js`, which
// keeps the module pure and, more usefully, keeps the whole ~200 KB of web3 out
// of any bundle that only reads positions.

/** `findProgramAddressSync`, injected. Returns a base58 address. */
export type DeriveAddress = (
  seeds: Array<Uint8Array>,
  programId: string,
) => string

/** Raw 32 bytes of a base58 address, injected for the same reason. */
export type DecodeAddress = (address: string) => Uint8Array

export function positionPda(
  derive: DeriveAddress,
  decode: DecodeAddress,
  protocol: SolanaLpProtocol,
  positionMint: string,
): string {
  return derive(
    [new TextEncoder().encode(POSITION_PDA_SEED), decode(positionMint)],
    protocol === 'orca-whirlpool'
      ? ORCA_WHIRLPOOL_PROGRAM_ID
      : RAYDIUM_CLMM_PROGRAM_ID,
  )
}

/**
 * Raydium's `protocol_position`: the aggregate of every position on one band.
 *
 * Seeded with the SAME `"position"` string as a personal position but with the
 * pool and the two tick bounds instead of a mint — and the bounds are
 * LITTLE-endian here, where the tick-array seed below uses big-endian. Same
 * program, same field type, opposite byte order, and both orders derive a valid
 * address, so the wrong one yields an account that does not exist rather than an
 * error. Pinned to a real mainnet protocol position in the tests.
 */
export function raydiumProtocolPositionPda(
  derive: DeriveAddress,
  decode: DecodeAddress,
  opts: { pool: string; tickLower: number; tickUpper: number },
): string {
  return derive(
    [
      new TextEncoder().encode(POSITION_PDA_SEED),
      decode(opts.pool),
      i32ToLittleEndianBytes(opts.tickLower),
      i32ToLittleEndianBytes(opts.tickUpper),
    ],
    RAYDIUM_CLMM_PROGRAM_ID,
  )
}

export function tickArrayPda(
  derive: DeriveAddress,
  decode: DecodeAddress,
  opts: {
    protocol: SolanaLpProtocol
    pool: string
    tick: number
    tickSpacing: number
  },
): string {
  const perArray =
    opts.protocol === 'orca-whirlpool'
      ? ORCA_TICKS_PER_ARRAY
      : RAYDIUM_TICKS_PER_ARRAY
  const start = tickArrayStartIndex(opts.tick, opts.tickSpacing, perArray)
  const startSeed =
    opts.protocol === 'orca-whirlpool'
      ? new TextEncoder().encode(String(start))
      : i32ToBigEndianBytes(start)
  return derive(
    [
      new TextEncoder().encode(TICK_ARRAY_PDA_SEED),
      decode(opts.pool),
      startSeed,
    ],
    opts.protocol === 'orca-whirlpool'
      ? ORCA_WHIRLPOOL_PROGRAM_ID
      : RAYDIUM_CLMM_PROGRAM_ID,
  )
}

/**
 * A wallet's associated token account for a mint.
 *
 * The token program is part of the SEED, so the same wallet and mint derive to
 * different addresses under SPL Token and Token-2022. Passing the wrong one
 * produces a real, empty account rather than an error.
 */
export function associatedTokenAddress(
  derive: DeriveAddress,
  decode: DecodeAddress,
  opts: { owner: string; mint: string; tokenProgram: string },
): string {
  return derive(
    [decode(opts.owner), decode(opts.tokenProgram), decode(opts.mint)],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
}

/**
 * `CreateIdempotent` on the ATA program: make the account if it is missing.
 *
 * Idempotent rather than `Create` because a payout account that already exists
 * is the normal case, and the plain variant fails the whole transaction when it
 * does. Costs the payer rent only when it actually creates something.
 */
export function createAssociatedTokenAccountIdempotent(opts: {
  payer: string
  associatedAccount: string
  owner: string
  mint: string
  tokenProgram: string
}): BuiltInstruction {
  return {
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: opts.payer, isSigner: true, isWritable: true },
      mut(opts.associatedAccount),
      ro(opts.owner),
      ro(opts.mint),
      ro(SYSTEM_PROGRAM_ID),
      ro(opts.tokenProgram),
    ],
    // Instruction 1 of the ATA program. Instruction 0 is the non-idempotent
    // `Create`, which is one byte away and fails on an existing account.
    data: Uint8Array.from([1]),
  }
}

// ── Orca Whirlpools ─────────────────────────────────────────────────────────

/** Accounts every Orca write shares, resolved from chain state by the writer. */
export type OrcaWriteAccounts = {
  whirlpool: string
  position: string
  positionTokenAccount: string
  positionAuthority: string
  tokenMintA: string
  tokenMintB: string
  tokenOwnerAccountA: string
  tokenOwnerAccountB: string
  tokenVaultA: string
  tokenVaultB: string
  tokenProgramA: string
  tokenProgramB: string
}

/**
 * `collect_fees_v2`: pay out everything the position has settled.
 *
 * Note the A/B interleaving in slots 6..9 (`owner_a, vault_a, owner_b, vault_b`)
 * which is NOT the order the liquidity instructions use, and note that the
 * whirlpool is read-only here: collecting moves no liquidity.
 *
 * Collect pays `feeOwed`, and `feeOwed` is only refreshed when the position is
 * touched, so the writer prepends `update_fees_and_rewards` to sweep everything
 * the replay in `lp-fees` reports rather than the stale settled figure.
 */
export function orcaCollectFeesV2(
  accounts: OrcaWriteAccounts,
): BuiltInstruction {
  return {
    programId: ORCA_WHIRLPOOL_PROGRAM_ID,
    keys: [
      ro(accounts.whirlpool),
      signer(accounts.positionAuthority),
      mut(accounts.position),
      ro(accounts.positionTokenAccount),
      ro(accounts.tokenMintA),
      ro(accounts.tokenMintB),
      mut(accounts.tokenOwnerAccountA),
      mut(accounts.tokenVaultA),
      mut(accounts.tokenOwnerAccountB),
      mut(accounts.tokenVaultB),
      ro(accounts.tokenProgramA),
      ro(accounts.tokenProgramB),
      ro(MEMO_PROGRAM_ID),
    ],
    data: concatBytes(DISCRIMINATORS.collectFeesV2, OPTION_NONE),
  }
}

/** `update_fees_and_rewards`: settle accrued fees into the position. No signer. */
export function orcaUpdateFeesAndRewards(opts: {
  whirlpool: string
  position: string
  tickArrayLower: string
  tickArrayUpper: string
}): BuiltInstruction {
  return {
    programId: ORCA_WHIRLPOOL_PROGRAM_ID,
    keys: [
      mut(opts.whirlpool),
      mut(opts.position),
      ro(opts.tickArrayLower),
      ro(opts.tickArrayUpper),
    ],
    data: DISCRIMINATORS.updateFeesAndRewards,
  }
}

/**
 * `decrease_liquidity_v2` / `increase_liquidity_v2`, which share a context.
 *
 * The two differ only in the discriminator and in what the two u64 arguments
 * MEAN: minimums to receive on a decrease, maximums to spend on an increase.
 * That is why they are one builder with an explicit `kind` — writing them
 * separately invites the two argument slots drifting apart.
 */
export function orcaModifyLiquidityV2(opts: {
  kind: 'decrease' | 'increase'
  accounts: OrcaWriteAccounts
  tickArrayLower: string
  tickArrayUpper: string
  liquidityAmount: bigint
  /** Minimum out on a decrease, maximum in on an increase. */
  thresholdA: bigint
  thresholdB: bigint
}): BuiltInstruction {
  const a = opts.accounts
  return {
    programId: ORCA_WHIRLPOOL_PROGRAM_ID,
    keys: [
      mut(a.whirlpool),
      ro(a.tokenProgramA),
      ro(a.tokenProgramB),
      ro(MEMO_PROGRAM_ID),
      signer(a.positionAuthority),
      mut(a.position),
      ro(a.positionTokenAccount),
      ro(a.tokenMintA),
      ro(a.tokenMintB),
      mut(a.tokenOwnerAccountA),
      mut(a.tokenOwnerAccountB),
      mut(a.tokenVaultA),
      mut(a.tokenVaultB),
      mut(opts.tickArrayLower),
      mut(opts.tickArrayUpper),
    ],
    data: concatBytes(
      opts.kind === 'decrease'
        ? DISCRIMINATORS.decreaseLiquidityV2
        : DISCRIMINATORS.increaseLiquidityV2,
      encodeU128LE(opts.liquidityAmount),
      encodeU64LE(opts.thresholdA),
      encodeU64LE(opts.thresholdB),
      OPTION_NONE,
    ),
  }
}

// ── Raydium CLMM ────────────────────────────────────────────────────────────

export type RaydiumWriteAccounts = {
  nftOwner: string
  nftAccount: string
  personalPosition: string
  protocolPosition: string
  poolState: string
  tokenVault0: string
  tokenVault1: string
  tickArrayLower: string
  tickArrayUpper: string
  tokenAccount0: string
  tokenAccount1: string
  vault0Mint: string
  vault1Mint: string
}

/**
 * `decrease_liquidity_v2`.
 *
 * Raydium ships no collect instruction. Fees are settled and paid by a decrease,
 * so claiming without burning anything is this same call with `liquidity = 0`
 * and both minimums at zero, which is exactly what `lp-collect` sends.
 *
 * Both token programs are passed unconditionally: the program picks whichever
 * matches each vault's mint, so a pool with one Token-2022 leg needs no
 * different call.
 */
export function raydiumDecreaseLiquidityV2(opts: {
  accounts: RaydiumWriteAccounts
  liquidity: bigint
  amount0Min: bigint
  amount1Min: bigint
}): BuiltInstruction {
  const a = opts.accounts
  return {
    programId: RAYDIUM_CLMM_PROGRAM_ID,
    keys: [
      signer(a.nftOwner),
      ro(a.nftAccount),
      mut(a.personalPosition),
      mut(a.poolState),
      ro(a.protocolPosition),
      mut(a.tokenVault0),
      mut(a.tokenVault1),
      mut(a.tickArrayLower),
      mut(a.tickArrayUpper),
      mut(a.tokenAccount0),
      mut(a.tokenAccount1),
      ro(TOKEN_PROGRAM_ID),
      ro(TOKEN_2022_PROGRAM_ID),
      ro(MEMO_PROGRAM_ID),
      ro(a.vault0Mint),
      ro(a.vault1Mint),
    ],
    data: concatBytes(
      DISCRIMINATORS.decreaseLiquidityV2,
      encodeU128LE(opts.liquidity),
      encodeU64LE(opts.amount0Min),
      encodeU64LE(opts.amount1Min),
    ),
  }
}

/**
 * `increase_liquidity_v2`.
 *
 * A DIFFERENT account order from decrease, not a reordering of the same list:
 * decrease is `personal, pool, protocol` and increase is `pool, protocol,
 * personal`, and increase carries no memo program. Copying one into the other
 * produces a transaction the program accepts far enough to fail confusingly.
 */
export function raydiumIncreaseLiquidityV2(opts: {
  accounts: RaydiumWriteAccounts
  liquidity: bigint
  amount0Max: bigint
  amount1Max: bigint
}): BuiltInstruction {
  const a = opts.accounts
  return {
    programId: RAYDIUM_CLMM_PROGRAM_ID,
    keys: [
      signer(a.nftOwner),
      ro(a.nftAccount),
      mut(a.poolState),
      ro(a.protocolPosition),
      mut(a.personalPosition),
      mut(a.tickArrayLower),
      mut(a.tickArrayUpper),
      mut(a.tokenAccount0),
      mut(a.tokenAccount1),
      mut(a.tokenVault0),
      mut(a.tokenVault1),
      ro(TOKEN_PROGRAM_ID),
      ro(TOKEN_2022_PROGRAM_ID),
      ro(a.vault0Mint),
      ro(a.vault1Mint),
    ],
    data: concatBytes(
      DISCRIMINATORS.increaseLiquidityV2,
      encodeU128LE(opts.liquidity),
      encodeU64LE(opts.amount0Max),
      encodeU64LE(opts.amount1Max),
      // `base_flag: Option<bool>` — None means "both amounts are maximums",
      // which is the only interpretation that matches what the confirm card
      // states. `Some` asks the program to size one leg from the other.
      OPTION_NONE,
    ),
  }
}
