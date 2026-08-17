// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Golden vectors for the hand-built instructions.
 *
 * Two kinds of assertion, and the distinction matters. The DISCRIMINATORS are
 * checked against a real sha256 of the method name, so a pinned constant cannot
 * drift from the instruction it claims to be. The ADDRESSES are checked against
 * accounts that exist on mainnet today — position PDAs, tick arrays, a protocol
 * position and an associated token account all read off live transactions — so a
 * seed order or an endianness is verified against the chain rather than against
 * a second copy of the same assumption.
 *
 * The account ORDERS below were taken from each program's published IDL and then
 * confirmed against the account lists of real mainnet transactions: Orca
 * `collect_fees_v2` (13) and `update_fees_and_rewards` (4), Raydium
 * `increase_liquidity_v2` (15).
 */
import { createHash } from 'node:crypto'
import { PublicKey } from '@solana/web3.js'
import { describe, expect, test } from 'bun:test'

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  DISCRIMINATORS,
  MEMO_PROGRAM_ID,
  OPTION_NONE,
  associatedTokenAddress,
  createAssociatedTokenAccountIdempotent,
  encodeU128LE,
  encodeU64LE,
  orcaCollectFeesV2,
  orcaModifyLiquidityV2,
  orcaUpdateFeesAndRewards,
  positionPda,
  raydiumDecreaseLiquidityV2,
  raydiumIncreaseLiquidityV2,
  raydiumProtocolPositionPda,
  tickArrayPda,
} from '../lp-instructions'
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '../lp-layouts'
import type { DecodeAddress, DeriveAddress } from '../lp-instructions'

const derive: DeriveAddress = (seeds, programId) =>
  PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    new PublicKey(programId),
  )[0].toBase58()
const decode: DecodeAddress = (address) => new PublicKey(address).toBytes()

const WSOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

describe('discriminators are the real Anchor hashes', () => {
  const cases: Array<[keyof typeof DISCRIMINATORS, string]> = [
    ['collectFeesV2', 'collect_fees_v2'],
    ['decreaseLiquidityV2', 'decrease_liquidity_v2'],
    ['increaseLiquidityV2', 'increase_liquidity_v2'],
    ['updateFeesAndRewards', 'update_fees_and_rewards'],
  ]

  for (const [key, method] of cases) {
    test(`${key} === sha256("global:${method}")[0..8]`, () => {
      const expected = createHash('sha256')
        .update(`global:${method}`)
        .digest()
        .subarray(0, 8)
      expect([...DISCRIMINATORS[key]]).toEqual([...expected])
    })
  }

  test('the two programs collide on the liquidity discriminators', () => {
    // Same method names, so the same hash. Nothing may dispatch on these bytes:
    // the account lists behind them are completely different.
    expect(DISCRIMINATORS.decreaseLiquidityV2).not.toEqual(
      DISCRIMINATORS.increaseLiquidityV2,
    )
    const orca = orcaModifyLiquidityV2({
      kind: 'decrease',
      accounts: ORCA_ACCOUNTS,
      tickArrayLower: 'A'.repeat(32),
      tickArrayUpper: 'B'.repeat(32),
      liquidityAmount: 1n,
      thresholdA: 0n,
      thresholdB: 0n,
    })
    const raydium = raydiumDecreaseLiquidityV2({
      accounts: RAYDIUM_ACCOUNTS,
      liquidity: 1n,
      amount0Min: 0n,
      amount1Min: 0n,
    })
    expect([...orca.data.subarray(0, 8)]).toEqual([
      ...raydium.data.subarray(0, 8),
    ])
    expect(orca.programId).not.toBe(raydium.programId)
  })
})

describe('argument encoding', () => {
  test('u64 little-endian', () => {
    expect([...encodeU64LE(0n)]).toEqual([0, 0, 0, 0, 0, 0, 0, 0])
    expect([...encodeU64LE(1n)]).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
    expect([...encodeU64LE(258n)]).toEqual([2, 1, 0, 0, 0, 0, 0, 0])
    expect([...encodeU64LE((1n << 64n) - 1n)]).toEqual([
      255, 255, 255, 255, 255, 255, 255, 255,
    ])
  })

  test('u128 little-endian', () => {
    expect(encodeU128LE(0n).length).toBe(16)
    expect([...encodeU128LE(1n)].slice(0, 3)).toEqual([1, 0, 0])
    // 88,544,094 raw lamports, the amount0Max of a real mainnet increase.
    expect([...encodeU64LE(88_544_094n)]).toEqual([94, 19, 71, 5, 0, 0, 0, 0])
  })

  test('out-of-range values throw rather than silently truncating', () => {
    expect(() => encodeU64LE(1n << 64n)).toThrow()
    expect(() => encodeU64LE(-1n)).toThrow()
    expect(() => encodeU128LE(1n << 128n)).toThrow()
  })

  test('a Borsh None is one zero byte', () => {
    expect([...OPTION_NONE]).toEqual([0])
  })
})

describe('address derivation, against live mainnet accounts', () => {
  test('Orca position PDA', () => {
    // The position account this repo's fee fixture was captured from.
    expect(
      positionPda(
        derive,
        decode,
        'orca-whirlpool',
        '9Wrid2qSgMASyBYyiQCBFKDs9paNpb2te9PrcjVDbjwz',
      ),
    ).toBe('EgbNG2x3Lu377grW5pLd9856xJZxsRC9yD9hmJwUoPv')
  })

  test('Raydium position PDA: same seeds, different program', () => {
    expect(
      positionPda(
        derive,
        decode,
        'raydium-clmm',
        'GVweUCKW5R9xtpgfVUGcehZ7V1ymnKBpnMmUdtAmvoFx',
      ),
    ).toBe('61w9LnqxwJeakEnviTFb3nr4Gjd6Y3SM17h7w6w8ta1R')
  })

  test('Orca tick array: seeded with the decimal STRING of the start index', () => {
    expect(
      tickArrayPda(derive, decode, {
        protocol: 'orca-whirlpool',
        pool: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
        tick: -25836,
        tickSpacing: 4,
      }),
    ).toBe('ChxrcGgr1UNLhgE6bge26EQRwDzbv9Q6co5ea12no6JP')
  })

  test('Raydium tick arrays: seeded with BIG-endian bytes', () => {
    // Both addresses appear as tick_array_lower / tick_array_upper in a real
    // Raydium increase_liquidity_v2 on this pool.
    const args = {
      protocol: 'raydium-clmm' as const,
      pool: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
      tickSpacing: 1,
    }
    expect(tickArrayPda(derive, decode, { ...args, tick: -25890 })).toBe(
      'EpZdFLNpsAqfa9ZXmjbMpbsdTjcdwGvK7iJxbwAExTMH',
    )
    expect(tickArrayPda(derive, decode, { ...args, tick: -25729 })).toBe(
      '12EagwvkiBz5wiRaPZg2rViGSuZF344ff4FiTAfE79z2',
    )
  })

  test('Raydium protocol position: seeded with LITTLE-endian bytes', () => {
    // The opposite byte order from the tick array above, in the same program.
    // This address is the `protocol_position` of a real mainnet increase; the
    // big-endian derivation produces an account that does not exist.
    expect(
      raydiumProtocolPositionPda(derive, decode, {
        pool: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
        tickLower: -25890,
        tickUpper: -25729,
      }),
    ).toBe('J1fHMWLTDfNSYfwpH9gBc9DESHqfWhSRu4dL1tQaVJ7W')
  })

  test('associated token address, and the token program is part of the seed', () => {
    // A live USDC account of a large mainnet wallet.
    expect(
      associatedTokenAddress(derive, decode, {
        owner: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        mint: USDC,
        tokenProgram: TOKEN_PROGRAM_ID,
      }),
    ).toBe('FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B')

    // Same owner, same mint, Token-2022: a DIFFERENT address, which is why the
    // program has to come from the mint rather than be assumed.
    expect(
      associatedTokenAddress(derive, decode, {
        owner: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        mint: USDC,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      }),
    ).not.toBe('FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B')
  })

  test('the position NFT of a real Orca position is at its canonical ATA', () => {
    // The ownership proof in `lp-writer` requires exactly this, so it is worth
    // pinning: `position_token_account` in a real mainnet collect_fees_v2 is the
    // holder's Token-2022 associated account for the position mint.
    expect(
      associatedTokenAddress(derive, decode, {
        owner: '7k5WLRVYcMCg6LFXLrhFs8656HWyQkfi9UjmDbnniQdh',
        mint: '5DM3KSAsJQi63gP7Y2cS1zMKCjmp4F7NhMUrvPQNcyEd',
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      }),
    ).toBe('AqvvDAmBEvAXTb3g3dk1fhALmyhkPKRoNhrZaFroXLtL')
  })
})

// Placeholder account sets. Distinct strings so an ordering mistake shows up as
// the wrong NAME rather than as a repeated address.
const ORCA_ACCOUNTS = {
  whirlpool: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
  position: 'EgbNG2x3Lu377grW5pLd9856xJZxsRC9yD9hmJwUoPv',
  positionTokenAccount: 'AqvvDAmBEvAXTb3g3dk1fhALmyhkPKRoNhrZaFroXLtL',
  positionAuthority: '7k5WLRVYcMCg6LFXLrhFs8656HWyQkfi9UjmDbnniQdh',
  tokenMintA: WSOL,
  tokenMintB: USDC,
  tokenOwnerAccountA: 'Bjntg6QkpWPavnXTjATEyrbxMdQcekfJ2HYfgA7TSVPT',
  tokenOwnerAccountB: '3Q9hX22gfaprVmWBBgj7qmdTX1Zdm6ZDoW9bfvbaJrF3',
  tokenVaultA: 'EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9',
  tokenVaultB: '2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP',
  tokenProgramA: TOKEN_PROGRAM_ID,
  tokenProgramB: TOKEN_PROGRAM_ID,
}

const RAYDIUM_ACCOUNTS = {
  nftOwner: '6n556toWjo4XWocYf3DaR9LpWoHikfd4VTt4zeypNqkN',
  nftAccount: '59L9iCB7aXTqHZCRkuCusjdZgsRHs6yD4jKCi7EekxD',
  personalPosition: '61w9LnqxwJeakEnviTFb3nr4Gjd6Y3SM17h7w6w8ta1R',
  protocolPosition: 'J1fHMWLTDfNSYfwpH9gBc9DESHqfWhSRu4dL1tQaVJ7W',
  poolState: '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv',
  tokenVault0: '4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A',
  tokenVault1: '5it83u57VRrVgc51oNV19TTmAJuffPx5GtGwQr7gQNUo',
  tickArrayLower: 'EpZdFLNpsAqfa9ZXmjbMpbsdTjcdwGvK7iJxbwAExTMH',
  tickArrayUpper: '12EagwvkiBz5wiRaPZg2rViGSuZF344ff4FiTAfE79z2',
  tokenAccount0: '6QfnBE2gK45ZHqjjU8Gn5u2KufUPyXX1YFRS3epM3cyP',
  tokenAccount1: 'FDSRT6Rz1BjhBqNQtKsTvXH4cycFWMunE8vzfm6mPHA2',
  vault0Mint: WSOL,
  vault1Mint: USDC,
}

describe('Orca instruction shapes', () => {
  test('collect_fees_v2: 13 accounts, A/B interleaved, one None byte', () => {
    const ix = orcaCollectFeesV2(ORCA_ACCOUNTS)
    expect(ix.programId).toBe(ORCA_WHIRLPOOL_PROGRAM_ID)
    expect(ix.keys.map((k) => k.pubkey)).toEqual([
      ORCA_ACCOUNTS.whirlpool,
      ORCA_ACCOUNTS.positionAuthority,
      ORCA_ACCOUNTS.position,
      ORCA_ACCOUNTS.positionTokenAccount,
      ORCA_ACCOUNTS.tokenMintA,
      ORCA_ACCOUNTS.tokenMintB,
      ORCA_ACCOUNTS.tokenOwnerAccountA,
      ORCA_ACCOUNTS.tokenVaultA,
      ORCA_ACCOUNTS.tokenOwnerAccountB,
      ORCA_ACCOUNTS.tokenVaultB,
      TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      MEMO_PROGRAM_ID,
    ])
    // Exactly one signer, and it is the position authority.
    expect(ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey)).toEqual([
      ORCA_ACCOUNTS.positionAuthority,
    ])
    // The four payout/vault slots plus the position are writable, nothing else.
    expect(ix.keys.filter((k) => k.isWritable).map((k) => k.pubkey)).toEqual([
      ORCA_ACCOUNTS.position,
      ORCA_ACCOUNTS.tokenOwnerAccountA,
      ORCA_ACCOUNTS.tokenVaultA,
      ORCA_ACCOUNTS.tokenOwnerAccountB,
      ORCA_ACCOUNTS.tokenVaultB,
    ])
    // Data length 9 matches the real mainnet transaction exactly.
    expect(ix.data.length).toBe(9)
    expect([...ix.data]).toEqual([...DISCRIMINATORS.collectFeesV2, 0])
  })

  test('update_fees_and_rewards: 4 accounts, no signer, no args', () => {
    const ix = orcaUpdateFeesAndRewards({
      whirlpool: ORCA_ACCOUNTS.whirlpool,
      position: ORCA_ACCOUNTS.position,
      tickArrayLower: 'ChxrcGgr1UNLhgE6bge26EQRwDzbv9Q6co5ea12no6JP',
      tickArrayUpper: '2s4eJvC4t2oscWNFDw4sZShL3SfB3Zifmr6R8Qayp7mU',
    })
    expect(ix.keys.map((k) => k.pubkey)).toEqual([
      ORCA_ACCOUNTS.whirlpool,
      ORCA_ACCOUNTS.position,
      'ChxrcGgr1UNLhgE6bge26EQRwDzbv9Q6co5ea12no6JP',
      '2s4eJvC4t2oscWNFDw4sZShL3SfB3Zifmr6R8Qayp7mU',
    ])
    expect(ix.keys.some((k) => k.isSigner)).toBe(false)
    expect(ix.data.length).toBe(8)
  })

  test('modify_liquidity_v2: 15 accounts, both programs before the authority', () => {
    const ix = orcaModifyLiquidityV2({
      kind: 'decrease',
      accounts: ORCA_ACCOUNTS,
      tickArrayLower: 'ChxrcGgr1UNLhgE6bge26EQRwDzbv9Q6co5ea12no6JP',
      tickArrayUpper: '2s4eJvC4t2oscWNFDw4sZShL3SfB3Zifmr6R8Qayp7mU',
      liquidityAmount: 61_028_272_428_078n,
      thresholdA: 1_000n,
      thresholdB: 2_000n,
    })
    expect(ix.keys.length).toBe(15)
    expect(ix.keys.map((k) => k.pubkey)).toEqual([
      ORCA_ACCOUNTS.whirlpool,
      TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      MEMO_PROGRAM_ID,
      ORCA_ACCOUNTS.positionAuthority,
      ORCA_ACCOUNTS.position,
      ORCA_ACCOUNTS.positionTokenAccount,
      ORCA_ACCOUNTS.tokenMintA,
      ORCA_ACCOUNTS.tokenMintB,
      // Owner accounts BEFORE vaults here, unlike collect_fees_v2's
      // owner/vault/owner/vault interleaving.
      ORCA_ACCOUNTS.tokenOwnerAccountA,
      ORCA_ACCOUNTS.tokenOwnerAccountB,
      ORCA_ACCOUNTS.tokenVaultA,
      ORCA_ACCOUNTS.tokenVaultB,
      'ChxrcGgr1UNLhgE6bge26EQRwDzbv9Q6co5ea12no6JP',
      '2s4eJvC4t2oscWNFDw4sZShL3SfB3Zifmr6R8Qayp7mU',
    ])
    // 8 + 16 + 8 + 8 + 1, matching the 41-byte real transactions.
    expect(ix.data.length).toBe(41)
    expect([...ix.data.subarray(0, 8)]).toEqual([
      ...DISCRIMINATORS.decreaseLiquidityV2,
    ])
    expect([...ix.data.subarray(8, 24)]).toEqual([
      ...encodeU128LE(61_028_272_428_078n),
    ])
    expect([...ix.data.subarray(24, 32)]).toEqual([...encodeU64LE(1_000n)])
    expect([...ix.data.subarray(32, 40)]).toEqual([...encodeU64LE(2_000n)])
    expect(ix.data[40]).toBe(0)
  })

  test('increase differs from decrease only in the discriminator', () => {
    const shared = {
      accounts: ORCA_ACCOUNTS,
      tickArrayLower: 'ChxrcGgr1UNLhgE6bge26EQRwDzbv9Q6co5ea12no6JP',
      tickArrayUpper: '2s4eJvC4t2oscWNFDw4sZShL3SfB3Zifmr6R8Qayp7mU',
      liquidityAmount: 5n,
      thresholdA: 7n,
      thresholdB: 9n,
    }
    const dec = orcaModifyLiquidityV2({ ...shared, kind: 'decrease' })
    const inc = orcaModifyLiquidityV2({ ...shared, kind: 'increase' })
    expect(inc.keys).toEqual(dec.keys)
    expect([...inc.data.subarray(8)]).toEqual([...dec.data.subarray(8)])
    expect([...inc.data.subarray(0, 8)]).toEqual([
      ...DISCRIMINATORS.increaseLiquidityV2,
    ])
  })
})

describe('Raydium instruction shapes', () => {
  test('increase_liquidity_v2 matches a real mainnet transaction', () => {
    const ix = raydiumIncreaseLiquidityV2({
      accounts: RAYDIUM_ACCOUNTS,
      liquidity: 4_596_556_794n,
      amount0Max: 88_544_094n,
      amount1Max: 4_036_790n,
    })
    expect(ix.programId).toBe(RAYDIUM_CLMM_PROGRAM_ID)
    // Account for account, the order of tx 2vtXLWQHLXqQQGHVuVJDLstZY3fVVFNhoLkX…
    expect(ix.keys.map((k) => k.pubkey)).toEqual([
      RAYDIUM_ACCOUNTS.nftOwner,
      RAYDIUM_ACCOUNTS.nftAccount,
      RAYDIUM_ACCOUNTS.poolState,
      RAYDIUM_ACCOUNTS.protocolPosition,
      RAYDIUM_ACCOUNTS.personalPosition,
      RAYDIUM_ACCOUNTS.tickArrayLower,
      RAYDIUM_ACCOUNTS.tickArrayUpper,
      RAYDIUM_ACCOUNTS.tokenAccount0,
      RAYDIUM_ACCOUNTS.tokenAccount1,
      RAYDIUM_ACCOUNTS.tokenVault0,
      RAYDIUM_ACCOUNTS.tokenVault1,
      TOKEN_PROGRAM_ID,
      TOKEN_2022_PROGRAM_ID,
      RAYDIUM_ACCOUNTS.vault0Mint,
      RAYDIUM_ACCOUNTS.vault1Mint,
    ])
    expect(ix.keys.length).toBe(15)
    // 8 + 16 + 8 + 8 + 1 = 41. The real transaction carried one extra trailing
    // byte its client appended; Anchor ignores trailing bytes, and this encoding
    // is exactly what the IDL declares.
    expect(ix.data.length).toBe(41)
    expect([...ix.data.subarray(8, 24)]).toEqual([
      ...encodeU128LE(4_596_556_794n),
    ])
    expect([...ix.data.subarray(24, 32)]).toEqual([94, 19, 71, 5, 0, 0, 0, 0])
    expect([...ix.data.subarray(32, 40)]).toEqual([182, 152, 61, 0, 0, 0, 0, 0])
    expect(ix.data[40]).toBe(0)
  })

  test('decrease_liquidity_v2: 16 accounts, a DIFFERENT order, no base flag', () => {
    const ix = raydiumDecreaseLiquidityV2({
      accounts: RAYDIUM_ACCOUNTS,
      liquidity: 100n,
      amount0Min: 3n,
      amount1Min: 4n,
    })
    expect(ix.keys.map((k) => k.pubkey)).toEqual([
      RAYDIUM_ACCOUNTS.nftOwner,
      RAYDIUM_ACCOUNTS.nftAccount,
      // personal, pool, protocol — the reverse-ish of increase's
      // pool, protocol, personal.
      RAYDIUM_ACCOUNTS.personalPosition,
      RAYDIUM_ACCOUNTS.poolState,
      RAYDIUM_ACCOUNTS.protocolPosition,
      RAYDIUM_ACCOUNTS.tokenVault0,
      RAYDIUM_ACCOUNTS.tokenVault1,
      RAYDIUM_ACCOUNTS.tickArrayLower,
      RAYDIUM_ACCOUNTS.tickArrayUpper,
      RAYDIUM_ACCOUNTS.tokenAccount0,
      RAYDIUM_ACCOUNTS.tokenAccount1,
      TOKEN_PROGRAM_ID,
      TOKEN_2022_PROGRAM_ID,
      MEMO_PROGRAM_ID,
      RAYDIUM_ACCOUNTS.vault0Mint,
      RAYDIUM_ACCOUNTS.vault1Mint,
    ])
    expect(ix.keys.length).toBe(16)
    // No trailing Option: 8 + 16 + 8 + 8.
    expect(ix.data.length).toBe(40)
  })

  test('a Raydium collect is a decrease that burns nothing', () => {
    const ix = raydiumDecreaseLiquidityV2({
      accounts: RAYDIUM_ACCOUNTS,
      liquidity: 0n,
      amount0Min: 0n,
      amount1Min: 0n,
    })
    expect([...ix.data.subarray(8, 40)]).toEqual(new Array(32).fill(0))
  })

  test('increase and decrease do not share an account order', () => {
    const inc = raydiumIncreaseLiquidityV2({
      accounts: RAYDIUM_ACCOUNTS,
      liquidity: 1n,
      amount0Max: 1n,
      amount1Max: 1n,
    })
    const dec = raydiumDecreaseLiquidityV2({
      accounts: RAYDIUM_ACCOUNTS,
      liquidity: 1n,
      amount0Min: 1n,
      amount1Min: 1n,
    })
    expect(inc.keys.map((k) => k.pubkey)).not.toEqual(
      dec.keys.map((k) => k.pubkey),
    )
  })
})

describe('idempotent associated-token creation', () => {
  test('instruction 1, not 0', () => {
    const ix = createAssociatedTokenAccountIdempotent({
      payer: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      associatedAccount: 'FGETo8T8wMcN2wCjav8VK6eh3dLk63evNDPxzLSJra8B',
      owner: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      mint: USDC,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    expect(ix.programId).toBe(ASSOCIATED_TOKEN_PROGRAM_ID)
    // 0 is the non-idempotent Create, which fails on an existing account and
    // would take the whole transaction with it.
    expect([...ix.data]).toEqual([1])
    expect(ix.keys.length).toBe(6)
    expect(ix.keys[0].isSigner).toBe(true)
    expect(ix.keys[0].isWritable).toBe(true)
    expect(ix.keys[1].isWritable).toBe(true)
  })
})
