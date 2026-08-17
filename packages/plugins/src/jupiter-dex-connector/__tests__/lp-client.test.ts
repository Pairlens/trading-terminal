// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The parsing half of the Solana position reader.
 *
 * The RPC walk is six batched calls with no branching worth simulating; what
 * DOES branch is pulled out and tested here — which account a PDA is allowed to
 * decode as, what counts as a live position, what counts as this pool, and the
 * arithmetic every printed field comes out of.
 *
 * The numeric expectations are computed from the same frozen mainnet bytes the
 * layout test decodes, so a change in the CLMM math shows up as a failing
 * amount rather than as a pane that quietly reprices somebody's position.
 */
import { describe, expect, test } from 'bun:test'
import bs58 from 'bs58'
import { PublicKey } from '@solana/web3.js'

import {
  buildSolanaPositionEntry,
  decodePoolAccount,
  decodePositionAccount,
  isListableSolanaPosition,
  isSolanaLpAddress,
  matchesSolanaPair,
} from '../lp-client'
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  POSITION_PDA_SEED,
  RAYDIUM_CLMM_PROGRAM_ID,
} from '../lp-layouts'
import {
  ORCA_POSITION_FIXTURE,
  ORCA_POSITION_MINT,
  ORCA_WHIRLPOOL_FIXTURE,
  RAYDIUM_POOL_FIXTURE,
  RAYDIUM_POSITION_FIXTURE,
  RAYDIUM_POSITION_MINT,
  USDC_MINT,
  WSOL_MINT,
  fixtureBytes,
} from './fixtures/solana-lp-accounts'
import type { RawSolanaLpPosition, SolanaPoolState } from '../lp-client'

const WSOL = { address: WSOL_MINT, symbol: 'SOL', decimals: 9 }
const USDC = { address: USDC_MINT, symbol: 'USDC', decimals: 6 }

const orcaRaw = decodePositionAccount({
  positionMint: ORCA_POSITION_MINT,
  positionAddress: ORCA_POSITION_FIXTURE.address,
  ownerProgram: ORCA_POSITION_FIXTURE.ownerProgram,
  data: fixtureBytes(ORCA_POSITION_FIXTURE),
})!

const orcaPool = decodePoolAccount(fixtureBytes(ORCA_WHIRLPOOL_FIXTURE))!

describe('position PDA derivation', () => {
  // Both programs use the same seeds, which is what makes enumeration a local
  // computation instead of a program-account scan. If either ever changes,
  // every position silently disappears — so it is asserted against the real
  // pair of (mint, account) captured from mainnet.
  test('Orca: PDA(["position", mint]) is the account the fixture came from', () => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(POSITION_PDA_SEED),
        new PublicKey(ORCA_POSITION_MINT).toBuffer(),
      ],
      new PublicKey(ORCA_WHIRLPOOL_PROGRAM_ID),
    )
    expect(pda.toBase58()).toBe(ORCA_POSITION_FIXTURE.address)
  })

  test('Raydium: same seeds, its own program', () => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from(POSITION_PDA_SEED),
        new PublicKey(RAYDIUM_POSITION_MINT).toBuffer(),
      ],
      new PublicKey(RAYDIUM_CLMM_PROGRAM_ID),
    )
    expect(pda.toBase58()).toBe(RAYDIUM_POSITION_FIXTURE.address)
  })
})

describe('decodePositionAccount', () => {
  test('reads an Orca position into the protocol-agnostic shape', () => {
    expect(orcaRaw.protocol).toBe('orca-whirlpool')
    expect(orcaRaw.pool).toBe(ORCA_WHIRLPOOL_FIXTURE.address)
    expect(orcaRaw.liquidity).toBe(61_028_272_428_078n)
    expect(orcaRaw.feesOwed0).toBe(13_576_608n)
  })

  test('reads a Raydium position into the same shape', () => {
    const raw = decodePositionAccount({
      positionMint: RAYDIUM_POSITION_MINT,
      positionAddress: RAYDIUM_POSITION_FIXTURE.address,
      ownerProgram: RAYDIUM_POSITION_FIXTURE.ownerProgram,
      data: fixtureBytes(RAYDIUM_POSITION_FIXTURE),
    })
    expect(raw?.protocol).toBe('raydium-clmm')
    expect(raw?.pool).toBe(RAYDIUM_POOL_FIXTURE.address)
    expect(raw?.tickLower).toBe(-25_890)
  })

  test('refuses bytes owned by a program it does not know', () => {
    // A PDA is only an address. Decoding by SIZE alone would read a stranger's
    // account as a position, and the row would look entirely plausible.
    expect(
      decodePositionAccount({
        positionMint: ORCA_POSITION_MINT,
        positionAddress: ORCA_POSITION_FIXTURE.address,
        ownerProgram: '11111111111111111111111111111111',
        data: fixtureBytes(ORCA_POSITION_FIXTURE),
      }),
    ).toBeNull()
  })

  test('refuses an Orca-sized account owned by Raydium and vice versa', () => {
    expect(
      decodePositionAccount({
        positionMint: ORCA_POSITION_MINT,
        positionAddress: ORCA_POSITION_FIXTURE.address,
        ownerProgram: RAYDIUM_CLMM_PROGRAM_ID,
        data: fixtureBytes(ORCA_POSITION_FIXTURE),
      }),
    ).toBeNull()
  })
})

describe('decodePoolAccount', () => {
  test('Orca carries its own fee rate', () => {
    expect(orcaPool.ammConfig).toBeNull()
    expect(orcaPool.state.fee).toBe(400)
    expect(orcaPool.state.mint0).toBe(WSOL_MINT)
    expect(orcaPool.state.mint1).toBe(USDC_MINT)
  })

  test('Raydium defers its fee rate to a config account', () => {
    const decoded = decodePoolAccount(fixtureBytes(RAYDIUM_POOL_FIXTURE))
    expect(decoded?.state.fee).toBeNull()
    expect(decoded?.ammConfig).toBe(
      '3h2e43PunVA5K34vwKCLHWhZF4aZpyaC9RmxvshGAQpL',
    )
  })

  test('returns null for an account that is neither', () => {
    expect(decodePoolAccount(new Uint8Array(400))).toBeNull()
  })
})

describe('isListableSolanaPosition', () => {
  const spent = { liquidity: 0n, feesOwed0: 0n, feesOwed1: 0n }

  test('a live range is listable', () => {
    expect(isListableSolanaPosition(orcaRaw)).toBe(true)
  })

  test('a closed position with nothing owed is a receipt, not a row', () => {
    expect(isListableSolanaPosition(spent)).toBe(false)
  })

  test('a closed position with fees still owed keeps its row', () => {
    expect(isListableSolanaPosition({ ...spent, feesOwed1: 1n })).toBe(true)
  })
})

describe('matchesSolanaPair', () => {
  test('null when no pair was asked about', () => {
    expect(matchesSolanaPair([WSOL_MINT, USDC_MINT], null)).toBeNull()
  })

  test('true only when both legs are the pool s own mints', () => {
    expect(
      matchesSolanaPair([WSOL_MINT, USDC_MINT], [WSOL_MINT, USDC_MINT]),
    ).toBe(true)
    expect(
      matchesSolanaPair(
        [WSOL_MINT, 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'],
        [WSOL_MINT, USDC_MINT],
      ),
    ).toBe(false)
  })

  test('matches on mints, so a same-ticker impostor is not this pool', () => {
    // Every Solana ticker is squatted. Symbol matching is how a fake-USDC pool
    // gets presented as the canonical one.
    const fakeUsdc = '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E'
    expect(
      matchesSolanaPair([WSOL_MINT, fakeUsdc], [WSOL_MINT, USDC_MINT]),
    ).toBe(false)
  })
})

describe('isSolanaLpAddress', () => {
  test('accepts a base58 pubkey and refuses everything else', () => {
    expect(isSolanaLpAddress(WSOL_MINT)).toBe(true)
    // An EVM address reaching the Solana connector is the bug this catches:
    // the two wallet families do not share an address space.
    expect(
      isSolanaLpAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    ).toBe(false)
    expect(isSolanaLpAddress('')).toBe(false)
    expect(isSolanaLpAddress(null)).toBe(false)
  })
})

describe('buildSolanaPositionEntry', () => {
  const entry = buildSolanaPositionEntry({
    raw: orcaRaw,
    pool: orcaPool.state,
    token0: WSOL,
    token1: USDC,
    pairMints: [WSOL_MINT, USDC_MINT],
  })

  test('identifies the position by program and NFT mint', () => {
    expect(entry.market).toBe('jupiter')
    expect(entry.managerAddress).toBe(ORCA_WHIRLPOOL_PROGRAM_ID)
    expect(entry.tokenId).toBe(ORCA_POSITION_MINT)
    expect(entry.dexName).toBe('Orca Whirlpool')
    expect(entry.poolAddress).toBe(ORCA_WHIRLPOOL_FIXTURE.address)
  })

  test('prices the range against the pool, in USDC per SOL', () => {
    expect(entry.inRange).toBe(true)
    expect(entry.priceLower).toBeCloseTo(75.511, 2)
    expect(entry.priceUpper).toBeCloseTo(76.24, 2)
    expect(entry.priceCurrent).toBeCloseTo(75.838, 2)
  })

  test('splits the liquidity into the amounts a burn would return', () => {
    // Computed from the fixture's own sqrtPrice and bounds. Both legs are held
    // because the pool is trading inside the band.
    expect(entry.amount0).toBeCloseTo(585.194, 2)
    expect(entry.amount1).toBeCloseTo(36_188.97, 1)
  })

  test('reports fees as settled at the last touch, and says so', () => {
    expect(entry.fees0).toBeCloseTo(0.013576608, 9)
    expect(entry.fees1).toBeCloseTo(0.030139, 6)
    // The label is the point: the EVM side simulates a live collect, this side
    // reports the floor the program has already booked.
    expect(entry.feesAsOf).toBe('last-touch')
  })

  test('carries the fee tier in the same unit the panes already read', () => {
    expect(entry.fee).toBe(400)
    expect(entry.feeTier).toBeCloseTo(0.0004, 6)
  })

  test('an unread pool nulls every derived field instead of zeroing it', () => {
    const unread = buildSolanaPositionEntry({
      raw: orcaRaw,
      pool: null,
      token0: WSOL,
      token1: USDC,
      pairMints: [WSOL_MINT, USDC_MINT],
    })
    expect(unread.inRange).toBeNull()
    expect(unread.amount0).toBeNull()
    expect(unread.amount1).toBeNull()
    expect(unread.currentTick).toBeNull()
    expect(unread.sqrtPriceX96).toBeNull()
    // Undeterminable, not "not this pool": the pane shows an unfiltered list.
    expect(unread.matchesPair).toBeNull()
    // Fees come off the position account, so they survive an unread pool.
    expect(unread.fees0).toBeCloseTo(0.013576608, 9)
  })

  test('a Raydium position with no fee config still lists, without a tier', () => {
    const raw: RawSolanaLpPosition = {
      ...orcaRaw,
      protocol: 'raydium-clmm',
    }
    const pool: SolanaPoolState = { ...orcaPool.state, fee: null }
    const entry2 = buildSolanaPositionEntry({
      raw,
      pool,
      token0: WSOL,
      token1: USDC,
      pairMints: null,
    })
    expect(entry2.managerAddress).toBe(RAYDIUM_CLMM_PROGRAM_ID)
    expect(entry2.dexName).toBe('Raydium CLMM')
    expect(entry2.feeTier).toBeNull()
    expect(entry2.amount0).toBeCloseTo(585.194, 2)
  })

  test('the pool address it reports is the one the position points at', () => {
    expect(bs58.decode(entry.poolAddress!).length).toBe(32)
  })
})
