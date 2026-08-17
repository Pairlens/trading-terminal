// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Fixed-offset decoders for the Solana accounts an LP position is made of.
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
 *
 * FEE GROWTH IS Q64.64 ON BOTH, and that is the one convention this file does
 * NOT share with Uniswap, which carries the same quantity at Q128.128. The
 * scale is pinned by a test that replays the Orca fixture and matches, to the
 * bit, what the program itself computes: at X128 the same position reports its
 * settled figure and nothing more, which looks like a working number.
 */

/** Orca Whirlpools program. Owns both the pools and the position accounts. */
export const ORCA_WHIRLPOOL_PROGRAM_ID =
  'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc'

/** Raydium concentrated liquidity (CLMM) program. */
export const RAYDIUM_CLMM_PROGRAM_ID =
  'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK'

/** Seed both programs use for the position PDA, before the mint. */
export const POSITION_PDA_SEED = 'position'

/** Seed both programs use for a tick array, before the pool and start index. */
export const TICK_ARRAY_PDA_SEED = 'tick_array'

/** Exact account sizes, used to tell one decoded account from another. */
export const ORCA_POSITION_SIZE = 216
export const ORCA_WHIRLPOOL_SIZE = 653
export const ORCA_TICK_ARRAY_SIZE = 9988
export const RAYDIUM_POSITION_SIZE = 281
export const RAYDIUM_POOL_SIZE = 1544
export const RAYDIUM_TICK_ARRAY_SIZE = 10240

/** Ticks per array. The number the start-index grid is built on. */
export const ORCA_TICKS_PER_ARRAY = 88
export const RAYDIUM_TICKS_PER_ARRAY = 60

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
  /**
   * Fee growth inside the band the last time the position was touched, Q64.64.
   *
   * The other half of the live figure: everything the pool has earned inside
   * this band SINCE this checkpoint is claimable and is not in `feeOwed`. See
   * `lp-fees.ts`.
   */
  feeGrowthCheckpointA: bigint
  feeGrowthCheckpointB: bigint
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
    feeGrowthCheckpointA: readU128LE(data, 96),
    feeOwedA: readU64LE(data, 112),
    feeGrowthCheckpointB: readU128LE(data, 120),
    feeOwedB: readU64LE(data, 136),
  }
}

/**
 * `Whirlpool` (653 bytes). Reward slots at 269.. are not read.
 *
 * The two fee-growth globals sit between a mint and the vault that follows it
 * (`tokenVaultA` 133..165, `feeGrowthGlobalA` 165..181, `tokenMintB` 181..),
 * which is why the already-pinned mint offsets are what makes 165 and 245
 * trustworthy: the struct closes on 653 only if every field between them is
 * exactly where this says it is.
 */
export type OrcaWhirlpoolAccount = {
  tickSpacing: number
  /** Hundredths of a basis point, the same unit Uniswap v3 stores. */
  feeRate: number
  sqrtPriceX64: bigint
  tickCurrent: number
  mintA: Uint8Array
  mintB: Uint8Array
  /** Where the pool holds each token. Write paths name them as accounts. */
  vaultA: Uint8Array
  vaultB: Uint8Array
  /** Fees per unit of liquidity the pool has ever earned, Q64.64. */
  feeGrowthGlobalA: bigint
  feeGrowthGlobalB: bigint
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
    vaultA: readPubkeyBytes(data, 133),
    feeGrowthGlobalA: readU128LE(data, 165),
    mintB: readPubkeyBytes(data, 181),
    vaultB: readPubkeyBytes(data, 213),
    feeGrowthGlobalB: readU128LE(data, 245),
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
  /**
   * Fee growth inside the band at that touch, Q64.64.
   *
   * Raydium names these `fee_growth_inside_N_last_x64`. Note the X64: Uniswap
   * v3 carries the same quantity at X128, and reading this one as X128 divides
   * the accrued fees by 2^64 and reports approximately zero.
   */
  feeGrowthInside0Last: bigint
  feeGrowthInside1Last: bigint
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
    feeGrowthInside0Last: readU128LE(data, 97),
    feeGrowthInside1Last: readU128LE(data, 113),
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
  /** Where the pool holds each token. Write paths name them as accounts. */
  vault0: Uint8Array
  vault1: Uint8Array
  decimals0: number
  decimals1: number
  tickSpacing: number
  sqrtPriceX64: bigint
  tickCurrent: number
  /** Fees per unit of liquidity the pool has ever earned, Q64.64. */
  feeGrowthGlobal0: bigint
  feeGrowthGlobal1: bigint
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
    vault0: readPubkeyBytes(data, 137),
    vault1: readPubkeyBytes(data, 169),
    decimals0: data[233],
    decimals1: data[234],
    tickSpacing: readU16LE(data, 235),
    sqrtPriceX64: readU128LE(data, 253),
    tickCurrent: readI32LE(data, 269),
    // 273..277 is two u16 of padding the program still calls `padding3` and
    // `padding4`; older deployments used them for the observation index.
    feeGrowthGlobal0: readU128LE(data, 277),
    feeGrowthGlobal1: readU128LE(data, 293),
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

// ── Tick arrays ─────────────────────────────────────────────────────────────
//
// A CLMM does not store "fees earned by this position" anywhere. It stores one
// running total per pool and, on every initialized tick, the share of that
// total accumulated on the FAR side of it. Fee growth inside a band is the
// global minus the two outsides, which is why claiming a position's real fees
// means reading two more accounts — and why they are batched onto the walk in
// `lp-client` rather than fetched per position.
//
// Ticks live in fixed-size arrays on a grid: 88 ticks per array for Orca, 60
// for Raydium, each covering `ticksPerArray * tickSpacing` of tick space. The
// grid start is a FLOOR division, so a band below price 1.0 (every SOL/USDC
// position) lands on a negative start index and truncation toward zero would
// derive the neighbouring array's address and read the wrong ticks.

/** The tick array a tick belongs to, on either protocol's grid. */
export function tickArrayStartIndex(
  tick: number,
  tickSpacing: number,
  ticksPerArray: number,
): number {
  const span = tickSpacing * ticksPerArray
  if (!(span > 0)) return 0
  return Math.floor(tick / span) * span
}

/** One boundary tick, reduced to the two numbers a fee replay needs. */
export type TickFeeGrowth = {
  /** False when the tick holds no liquidity, which makes its outsides meaningless. */
  initialized: boolean
  feeGrowthOutside0: bigint
  feeGrowthOutside1: bigint
}

/**
 * Orca ships TWO tick-array layouts at the SAME PDA, and the difference is not
 * visible from the address or from anything the position knows.
 *
 * `TickArray` is the original: 9988 bytes, `startTickIndex` i32 at 8, 88 × a
 * 113-byte `Tick`, whirlpool at 9956. `DynamicTickArray` is the newer one and
 * is variable length, because an uninitialized tick costs one byte instead of
 * 113: `startTickIndex` i32 at 8, whirlpool at 12, a `tick_bitmap` u128 at 44,
 * then 88 Borsh enum slots from 60 — one tag byte each, followed by 112 bytes
 * of body only when the tag is 1. Its size is therefore always `148 + 112n`.
 *
 * Both are live on mainnet today, on the same pools. Reading a dynamic array at
 * the fixed offsets does not throw: it lands mid-struct and returns a fee
 * growth that is some other tick's, so the decision is made on the ACCOUNT
 * DISCRIMINATOR and an unrecognised one is a refusal.
 */
export const ORCA_TICK_STRIDE = 113
export const ORCA_DYNAMIC_TICK_BODY = 112

/** Anchor account discriminators, the first 8 bytes of each account. */
export const ORCA_TICK_ARRAY_DISCRIMINATOR = Uint8Array.from([
  69, 97, 189, 190, 110, 7, 66, 187,
])
export const ORCA_DYNAMIC_TICK_ARRAY_DISCRIMINATOR = Uint8Array.from([
  17, 216, 246, 142, 225, 199, 218, 56,
])

function hasDiscriminator(data: Uint8Array, want: Uint8Array): boolean {
  if (data.length < 8) return false
  for (let i = 0; i < 8; i++) if (data[i] !== want[i]) return false
  return true
}

/** Which of the two layouts an Orca tick-array account is, or null. */
export function orcaTickArrayKind(
  data: Uint8Array,
): 'fixed' | 'dynamic' | null {
  if (hasDiscriminator(data, ORCA_TICK_ARRAY_DISCRIMINATOR)) return 'fixed'
  if (hasDiscriminator(data, ORCA_DYNAMIC_TICK_ARRAY_DISCRIMINATOR)) {
    return 'dynamic'
  }
  return null
}

/** Start tick index. Offset 8 on both layouts, which is the only field shared. */
export function decodeOrcaTickArrayStart(data: Uint8Array): number | null {
  return orcaTickArrayKind(data) === null ? null : readI32LE(data, 8)
}

export function decodeOrcaTick(
  data: Uint8Array,
  tick: number,
  tickSpacing: number,
): TickFeeGrowth | null {
  const kind = orcaTickArrayKind(data)
  if (kind === null) return null
  const index = tickIndexIn(
    tick,
    readI32LE(data, 8),
    tickSpacing,
    ORCA_TICKS_PER_ARRAY,
  )
  if (index === null) return null

  if (kind === 'fixed') {
    if (data.length !== ORCA_TICK_ARRAY_SIZE) return null
    const offset = 12 + index * ORCA_TICK_STRIDE
    return {
      initialized: data[offset] === 1,
      feeGrowthOutside0: readU128LE(data, offset + 33),
      feeGrowthOutside1: readU128LE(data, offset + 49),
    }
  }

  // Variable stride, so the slot has to be walked to. Every tag before the one
  // being read is either 0 (one byte) or 1 (one byte plus a body); anything
  // else means the account is not what its discriminator claims.
  let offset = 60
  for (let i = 0; i < index; i++) {
    if (offset >= data.length) return null
    const tag = data[offset]
    if (tag === 0) offset += 1
    else if (tag === 1) offset += 1 + ORCA_DYNAMIC_TICK_BODY
    else return null
  }
  if (offset >= data.length) return null
  const tag = data[offset]
  if (tag === 0) {
    return { initialized: false, feeGrowthOutside0: 0n, feeGrowthOutside1: 0n }
  }
  if (tag !== 1) return null
  if (offset + 1 + ORCA_DYNAMIC_TICK_BODY > data.length) return null
  const body = offset + 1
  return {
    initialized: true,
    // No `initialized` flag in the body: the tag IS the flag. Fields are
    // liquidityNet, liquidityGross, then the two fee growths.
    feeGrowthOutside0: readU128LE(data, body + 32),
    feeGrowthOutside1: readU128LE(data, body + 48),
  }
}

/**
 * Raydium `TickArrayState` (10240 bytes): pool at 8, `startTickIndex` i32 at
 * 40, 60 × `TickState` from 44. A `TickState` is 168 bytes and opens with its
 * own tick index, which is what makes a wrong offset here loud rather than
 * silent: the decoded `tick` field has to equal the tick being asked for.
 *
 * Raydium ships no `initialized` flag. The program's own `is_initialized` is
 * `liquidity_gross != 0`, so that is the test used here.
 */
export const RAYDIUM_TICK_STRIDE = 168

export function decodeRaydiumTickArrayStart(data: Uint8Array): number {
  if (data.length !== RAYDIUM_TICK_ARRAY_SIZE) {
    throw new Error(
      `raydium tick array: expected ${RAYDIUM_TICK_ARRAY_SIZE} bytes, got ${data.length}`,
    )
  }
  return readI32LE(data, 40)
}

export function decodeRaydiumTick(
  data: Uint8Array,
  tick: number,
  tickSpacing: number,
): TickFeeGrowth | null {
  if (data.length !== RAYDIUM_TICK_ARRAY_SIZE) return null
  const start = readI32LE(data, 40)
  const index = tickIndexIn(tick, start, tickSpacing, RAYDIUM_TICKS_PER_ARRAY)
  if (index === null) return null
  const offset = 44 + index * RAYDIUM_TICK_STRIDE
  // The slot's own tick index. A mismatch means the array or the offset is
  // wrong, and a fee number derived from the wrong slot is worse than none.
  if (readI32LE(data, offset) !== tick) return null
  return {
    initialized: readU128LE(data, offset + 20) > 0n,
    feeGrowthOutside0: readU128LE(data, offset + 36),
    feeGrowthOutside1: readU128LE(data, offset + 52),
  }
}

/**
 * A signed 32-bit tick index as four BIG-endian bytes.
 *
 * Raydium seeds its tick-array PDA with this, which is the one place on either
 * protocol where a number is not little-endian. Orca seeds with the DECIMAL
 * STRING of the same index instead. Both are verified against live accounts by
 * `__tests__/lp-fees.test.ts`; neither is guessable from the other.
 */
export function i32ToBigEndianBytes(value: number): Uint8Array {
  const out = new Uint8Array(4)
  const unsigned = value >>> 0
  out[0] = (unsigned >>> 24) & 0xff
  out[1] = (unsigned >>> 16) & 0xff
  out[2] = (unsigned >>> 8) & 0xff
  out[3] = unsigned & 0xff
  return out
}

/**
 * The same index LITTLE-endian, which Raydium also needs, for a different PDA.
 *
 * Raydium seeds its TICK ARRAY with the big-endian form above and its PROTOCOL
 * POSITION with this one. Two endiannesses, same program, same field type, and
 * both derive a real address either way — so the wrong one produces an account
 * that simply does not exist, which is how this was caught: the derived
 * protocol position was absent from chain while the transaction history showed
 * a live one. Both forms are pinned to real mainnet addresses in the tests.
 */
export function i32ToLittleEndianBytes(value: number): Uint8Array {
  const out = new Uint8Array(4)
  const unsigned = value >>> 0
  out[0] = unsigned & 0xff
  out[1] = (unsigned >>> 8) & 0xff
  out[2] = (unsigned >>> 16) & 0xff
  out[3] = (unsigned >>> 24) & 0xff
  return out
}

/** Slot a tick occupies in the array starting at `start`, or null if outside. */
function tickIndexIn(
  tick: number,
  start: number,
  tickSpacing: number,
  ticksPerArray: number,
): number | null {
  if (!(tickSpacing > 0)) return null
  const offset = tick - start
  if (offset < 0 || offset % tickSpacing !== 0) return null
  const index = offset / tickSpacing
  return index < ticksPerArray ? index : null
}
