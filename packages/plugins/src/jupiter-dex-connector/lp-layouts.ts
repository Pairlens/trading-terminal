// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fixed-offset decoders for the four Solana accounts an LP position is made of.
 *
 * Solana publishes account state as opaque bytes. Anchor programs prefix them
 * with an 8-byte discriminator and then lay the struct out in declaration
 * order, little-endian, with NO padding between fields — so a position is
 * readable with slice arithmetic and nothing else. That is the whole reason
 * this file exists instead of a dependency: the Orca and Raydium SDKs each pull
 * in an Anchor client, a BN implementation and a wallet adapter to read four
 * numbers off four accounts, and every byte of that ships to a browser.
 *
 * The offsets below are TRANSCRIBED, which makes them the risky part. A wrong
 * one does not throw: it reads a neighbouring field and prints a plausible
 * number, so a range lands around the wrong price and a liquidity figure is off
 * by a factor nobody can spot. Hence the fixtures in `__tests__/fixtures` —
 * real mainnet accounts, captured base64 — and a test per layout that asserts
 * decoded values against what the pools actually held. Re-capture them if a
 * program ever changes its struct; do not "fix" an offset by eye.
 *
 * Two more things the layouts settle, both verified against those fixtures:
 *
 *   - Both protocols derive the position account as
 *     `PDA(["position", positionMint], programId)`. Same seeds, different
 *     program. That is what makes enumeration cheap: the wallet's NFTs are one
 *     `getTokenAccountsByOwner`, and every candidate position address is
 *     computed locally rather than scanned for.
 *   - Both store their pool price as a Q64.64 square root, where Uniswap v3
 *     uses Q96. `sqrtPriceX64ToX96` is an exact left shift, so the v3 math in
 *     `evm-dex-connector/lp-math.ts` is reused verbatim instead of re-derived
 *     against a second fixed-point convention.
 */

/** Orca Whirlpools program. Owns both the pools and the position accounts. */
export const ORCA_WHIRLPOOL_PROGRAM_ID =
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'

/** Raydium concentrated liquidity (CLMM) program. */
export const RAYDIUM_CLMM_PROGRAM_ID =
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'

/** Seed both programs use for the position PDA, before the mint. */
export const POSITION_PDA_SEED = 'position'

/** Exact account sizes, used to tell one decoded account from another. */
export const ORCA_POSITION_SIZE = 216
export const ORCA_WHIRLPOOL_SIZE = 653
export const RAYDIUM_POSITION_SIZE = 281
export const RAYDIUM_POOL_SIZE = 1544

/** SPL Token and Token-2022. Orca mints new position NFTs under the latter. */
export const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
export const TOKEN_2022_PROGRAM_ID =
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

/** Which protocol a decoded position came from. */
export type SolanaLpProtocol = 'orca-whirlpool' | 'raydium-clmm'

/** Display names, as the pane prints them next to the chain. */
export const PROTOCOL_LABEL: Record<SolanaLpProtocol, string> = {
  'orca-whirlpool': 'Orca Whirlpool',
  'raydium-clmm': 'Raydium CLMM',
}

export const PROTOCOL_PROGRAM: Record<SolanaLpProtocol, string> = {
  'orca-whirlpool': ORCA_WHIRLPOOL_PROGRAM_ID,
  'raydium-clmm': RAYDIUM_CLMM_PROGRAM_ID,
}

// ── Primitive readers ───────────────────────────────────────────────────────
// Little-endian, unsigned unless named otherwise. `bigint` for anything wider
// than 32 bits: a u128 liquidity is routinely above 2^53 and reading it as a
// double loses the low digits silently.

export function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8)
}

export function readI32LE(data: Uint8Array, offset: number): number {
  const unsigned =
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
    0
  // `>> 0` would already sign-extend, but the intent is worth stating: tick
  // indices are negative for every pool whose price is below 1.0.
  return unsigned | 0
}

export function readU32LE(data: Uint8Array, offset: number): number {
  return (
    (data[offset] |
      (data[offset + 1] << 8) |
      (data[offset + 2] << 16) |
      (data[offset + 3] << 24)) >>>
    0
  )
}

function readUnsignedLE(
  data: Uint8Array,
  offset: number,
  bytes: number,
): bigint {
  let value = 0n
  for (let i = bytes - 1; i >= 0; i--) {
    value = (value << 8n) | BigInt(data[offset + i])
  }
  return value
}

export function readU64LE(data: Uint8Array, offset: number): bigint {
  return readUnsignedLE(data, offset, 8)
}

export function readU128LE(data: Uint8Array, offset: number): bigint {
  return readUnsignedLE(data, offset, 16)
}

/** A 32-byte pubkey slice, still raw. Base58 encoding is the caller's job. */
export function readPubkeyBytes(data: Uint8Array, offset: number): Uint8Array {
  return data.subarray(offset, offset + 32)
}

/**
 * Q64.64 → Q64.96, exactly.
 *
 * Both Solana CLMMs express `sqrtPrice` with 64 fractional bits and Uniswap v3
 * with 96, so the conversion is a shift by 32 with no rounding at all. Doing it
 * here rather than forking the math is what keeps one tested implementation of
 * "liquidity to token amounts" in the repo.
 */
export function sqrtPriceX64ToX96(sqrtPriceX64: bigint): bigint {
  return sqrtPriceX64 << 32n
}

// ── Orca Whirlpools ─────────────────────────────────────────────────────────

/** `Position` (216 bytes). Reward slots at 144.. are not read. */
export type OrcaPositionAccount = {
  protocol: 'orca-whirlpool'
  /** Pool this position belongs to, raw pubkey bytes. */
  pool: Uint8Array
  positionMint: Uint8Array
  liquidity: bigint
  tickLower: number
  tickUpper: number
  /** Fees credited at the position's last touch. NOT a live claimable figure. */
  feeOwedA: bigint
  feeOwedB: bigint
}

export function decodeOrcaPosition(data: Uint8Array): OrcaPositionAccount {
  if (data.length !== ORCA_POSITION_SIZE) {
    throw new Error(
      `orca position: expected ${ORCA_POSITION_SIZE} bytes, got ${data.length}`,
    )
  }
  return {
    protocol: 'orca-whirlpool',
    pool: readPubkeyBytes(data, 8),
    positionMint: readPubkeyBytes(data, 40),
    liquidity: readU128LE(data, 72),
    tickLower: readI32LE(data, 88),
    tickUpper: readI32LE(data, 92),
    // 96..112 and 120..136 are the fee-growth checkpoints; only the owed
    // amounts are printable without replaying the pool's fee growth.
    feeOwedA: readU64LE(data, 112),
    feeOwedB: readU64LE(data, 136),
  }
}

/** `Whirlpool` (653 bytes). Reward slots at 269.. are not read. */
export type OrcaWhirlpoolAccount = {
  tickSpacing: number
  /** Hundredths of a basis point, the same unit Uniswap v3 stores. */
  feeRate: number
  sqrtPriceX64: bigint
  tickCurrent: number
  mintA: Uint8Array
  mintB: Uint8Array
}

export function decodeOrcaWhirlpool(data: Uint8Array): OrcaWhirlpoolAccount {
  if (data.length !== ORCA_WHIRLPOOL_SIZE) {
    throw new Error(
      `orca whirlpool: expected ${ORCA_WHIRLPOOL_SIZE} bytes, got ${data.length}`,
    )
  }
  return {
    tickSpacing: readU16LE(data, 41),
    feeRate: readU16LE(data, 45),
    sqrtPriceX64: readU128LE(data, 65),
    tickCurrent: readI32LE(data, 81),
    mintA: readPubkeyBytes(data, 101),
    mintB: readPubkeyBytes(data, 181),
  }
}

// ── Raydium CLMM ────────────────────────────────────────────────────────────

/** `PersonalPositionState` (281 bytes). Reward slots at 145.. are not read. */
export type RaydiumPositionAccount = {
  protocol: 'raydium-clmm'
  nftMint: Uint8Array
  pool: Uint8Array
  tickLower: number
  tickUpper: number
  liquidity: bigint
  /** Fees credited at the position's last touch, same caveat as Orca's. */
  tokenFeesOwed0: bigint
  tokenFeesOwed1: bigint
}

export function decodeRaydiumPosition(
  data: Uint8Array,
): RaydiumPositionAccount {
  if (data.length !== RAYDIUM_POSITION_SIZE) {
    throw new Error(
      `raydium position: expected ${RAYDIUM_POSITION_SIZE} bytes, got ${data.length}`,
    )
  }
  return {
    protocol: 'raydium-clmm',
    // 8 is the PDA bump; the mint starts one byte later.
    nftMint: readPubkeyBytes(data, 9),
    pool: readPubkeyBytes(data, 41),
    tickLower: readI32LE(data, 73),
    tickUpper: readI32LE(data, 77),
    liquidity: readU128LE(data, 81),
    tokenFeesOwed0: readU64LE(data, 129),
    tokenFeesOwed1: readU64LE(data, 137),
  }
}

/**
 * `PoolState` (1544 bytes).
 *
 * Unlike a Whirlpool this one carries both mints' decimals, which is worth
 * noting but not worth relying on: the decoder still reports them and the
 * client prefers the mint accounts, so one pool with a stale copy cannot
 * misprice a position.
 */
export type RaydiumPoolAccount = {
  /** The config account holding this pool's fee rate. */
  ammConfig: Uint8Array
  mint0: Uint8Array
  mint1: Uint8Array
  decimals0: number
  decimals1: number
  tickSpacing: number
  sqrtPriceX64: bigint
  tickCurrent: number
}

export function decodeRaydiumPool(data: Uint8Array): RaydiumPoolAccount {
  if (data.length !== RAYDIUM_POOL_SIZE) {
    throw new Error(
      `raydium pool: expected ${RAYDIUM_POOL_SIZE} bytes, got ${data.length}`,
    )
  }
  return {
    ammConfig: readPubkeyBytes(data, 9),
    mint0: readPubkeyBytes(data, 73),
    mint1: readPubkeyBytes(data, 105),
    decimals0: data[233],
    decimals1: data[234],
    tickSpacing: readU16LE(data, 235),
    sqrtPriceX64: readU128LE(data, 253),
    tickCurrent: readI32LE(data, 269),
  }
}

/**
 * `AmmConfig`, read for one field.
 *
 * Raydium keeps the fee rate on a shared config account rather than on the
 * pool, so a fee tier costs one extra batched read. `tradeFeeRate` is in
 * millionths, identical to the unit Uniswap v3 packs into its `uint24 fee`, so
 * it drops straight into the wire shape's `fee`.
 */
export function decodeRaydiumAmmConfigFee(data: Uint8Array): number {
  if (data.length < 51) {
    throw new Error(`raydium amm config: too short (${data.length} bytes)`)
  }
  return readU32LE(data, 47)
}
