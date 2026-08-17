// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The refusal ladder, and the one property that matters most about it: the
 * private key is never fetched until every check has passed.
 *
 * `getPrivateKey` is a counting mock in every test here, and each refusal
 * asserts the count is still zero. That is the invariant a reviewer actually
 * cares about — a wallet whose vault is never opened for a request that was
 * going to be refused anyway — and it is the one that quietly breaks when
 * somebody moves a check below the key fetch to reuse a variable.
 *
 * The chain is a fake `Connection` (everything else in `@solana/web3.js` stays
 * real), fed the REAL mainnet fixture bytes for the position and pool. Nothing
 * here reaches the network, and the transaction the writer assembles is
 * captured on its way into `simulateTransaction`.
 */
import * as web3 from '@solana/web3.js'
import { Keypair, PublicKey } from '@solana/web3.js'
import bs58 from 'bs58'
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'

import {
  applySlippageFloor,
  executeSolanaLpWrite,
  isLpWriteAction,
  isSolanaAddress,
  liquidityForAmounts,
  liquidityForPercent,
  normalizeSlippageBps,
  resolveSolanaLpProgram,
  scaleToRaw,
  simulationRefusal,
} from '../lp-writer'
import {
  ORCA_WHIRLPOOL_PROGRAM_ID,
  RAYDIUM_CLMM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '../lp-layouts'
import {
  ORCA_FEE_REPLAY_FIXTURE,
  RAYDIUM_FEE_REPLAY_FIXTURE,
  fixtureBytes,
} from './fixtures/solana-lp-accounts'

const POSITION_MINT = '9Wrid2qSgMASyBYyiQCBFKDs9paNpb2te9PrcjVDbjwz'
const POSITION_ADDRESS = 'EgbNG2x3Lu377grW5pLd9856xJZxsRC9yD9hmJwUoPv'
const POOL = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE'
const WSOL = 'So11111111111111111111111111111111111111112'
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const ATA_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
const RPC = 'https://rpc.invalid/never-called'

// ── Test account builders ───────────────────────────────────────────────────

/** SPL token account: mint at 0, owner at 32, amount u64 at 64. */
function tokenAccountBytes(opts: {
  mint: string
  owner: string
  amount: bigint
}): Uint8Array {
  const data = new Uint8Array(165)
  data.set(new PublicKey(opts.mint).toBytes(), 0)
  data.set(new PublicKey(opts.owner).toBytes(), 32)
  let rest = opts.amount
  for (let i = 0; i < 8; i++) {
    data[64 + i] = Number(rest & 0xffn)
    rest >>= 8n
  }
  data[108] = 1
  return data
}

/** SPL mint account: `decimals` is a u8 at 44. */
function mintBytes(decimals: number): Uint8Array {
  const data = new Uint8Array(82)
  data[44] = decimals
  data[45] = 1
  return data
}

function ata(owner: string, mint: string, tokenProgram: string): string {
  return PublicKey.findProgramAddressSync(
    [
      new PublicKey(owner).toBytes(),
      new PublicKey(tokenProgram).toBytes(),
      new PublicKey(mint).toBytes(),
    ].map((bytes) => Buffer.from(bytes)),
    new PublicKey(ATA_PROGRAM),
  )[0].toBase58()
}

type StubAccount = { data: Uint8Array; owner: string }

type Chain = {
  accounts: Record<string, StubAccount | null>
  simulateErr?: unknown
  simulateLogs?: Array<string>
  confirmErr?: unknown
}

let rpcCalls: Array<string> = []
let chainState: Chain = { accounts: {} }
let sentTransaction: web3.VersionedTransaction | null = null
let simulatedTransaction: web3.VersionedTransaction | null = null

/**
 * A fake `Connection` carrying only the five methods the writer uses.
 *
 * Preferred over stubbing `fetch`: web3.js does not route through
 * `globalThis.fetch`, and this way the transaction the writer builds is
 * inspectable rather than a base64 blob on a wire.
 */
class FakeConnection {
  constructor(
    readonly rpcEndpoint: string,
    readonly commitment?: unknown,
  ) {}

  async getMultipleAccountsInfo(
    keys: Array<web3.PublicKey>,
  ): Promise<Array<unknown>> {
    rpcCalls.push('getMultipleAccounts')
    return keys.map((key) => {
      const account = chainState.accounts[key.toBase58()]
      if (!account) return null
      return {
        data: Buffer.from(account.data),
        owner: new PublicKey(account.owner),
        executable: false,
        lamports: 1_000_000,
        rentEpoch: 0,
      }
    })
  }

  async getLatestBlockhash(): Promise<unknown> {
    rpcCalls.push('getLatestBlockhash')
    return {
      blockhash: '11111111111111111111111111111112',
      lastValidBlockHeight: 100,
    }
  }

  async simulateTransaction(
    transaction: web3.VersionedTransaction,
  ): Promise<unknown> {
    rpcCalls.push('simulateTransaction')
    simulatedTransaction = transaction
    return {
      context: { slot: 1 },
      value: {
        err: chainState.simulateErr ?? null,
        logs: chainState.simulateLogs ?? ['Program log: ok'],
        accounts: null,
        unitsConsumed: 1_000,
      },
    }
  }

  async sendRawTransaction(raw: Uint8Array): Promise<string> {
    rpcCalls.push('sendTransaction')
    sentTransaction = web3.VersionedTransaction.deserialize(raw)
    return SIGNATURE
  }

  async confirmTransaction(): Promise<unknown> {
    rpcCalls.push('confirmTransaction')
    return {
      context: { slot: 1 },
      value: { err: chainState.confirmErr ?? null },
    }
  }
}

const SIGNATURE = '5'.repeat(87)

// Only `Connection` is replaced; Keypair, PublicKey, TransactionMessage and
// VersionedTransaction stay real, so the transaction under test is a real one.
mock.module('@solana/web3.js', () => ({ ...web3, Connection: FakeConnection }))

function stubChain(chain: Chain): void {
  rpcCalls = []
  sentTransaction = null
  simulatedTransaction = null
  chainState = chain
}

/** A wallet that really does hold the fixture position, as far as the stub knows. */
function healthyChain(wallet: string, overrides: Partial<Chain> = {}): Chain {
  const positionAta = ata(wallet, POSITION_MINT, TOKEN_2022_PROGRAM_ID)
  return {
    accounts: {
      [POSITION_ADDRESS]: {
        data: fixtureBytes(ORCA_FEE_REPLAY_FIXTURE.position),
        owner: ORCA_WHIRLPOOL_PROGRAM_ID,
      },
      [POOL]: {
        data: fixtureBytes(ORCA_FEE_REPLAY_FIXTURE.pool),
        owner: ORCA_WHIRLPOOL_PROGRAM_ID,
      },
      // Orca mints position NFTs under Token-2022.
      [POSITION_MINT]: { data: mintBytes(0), owner: TOKEN_2022_PROGRAM_ID },
      [positionAta]: {
        data: tokenAccountBytes({
          mint: POSITION_MINT,
          owner: wallet,
          amount: 1n,
        }),
        owner: TOKEN_2022_PROGRAM_ID,
      },
      [WSOL]: { data: mintBytes(9), owner: TOKEN_PROGRAM_ID },
      [USDC]: { data: mintBytes(6), owner: TOKEN_PROGRAM_ID },
    },
    ...overrides,
  }
}

let keypair: Keypair
let wallet: string
let keyCalls: number
let getPrivateKey: () => Promise<string | null>

beforeEach(() => {
  keypair = Keypair.generate()
  wallet = keypair.publicKey.toBase58()
  keyCalls = 0
  getPrivateKey = async () => {
    keyCalls++
    return bs58.encode(keypair.secretKey)
  }
})
afterEach(() => {
  chainState = { accounts: {} }
})

function request(overrides: Record<string, unknown> = {}) {
  return {
    action: 'lp-collect' as const,
    manager: ORCA_WHIRLPOOL_PROGRAM_ID,
    tokenId: POSITION_MINT,
    walletAddress: wallet,
    getPrivateKey,
    rpcUrl: RPC,
    ...overrides,
  }
}

// ── Pure helpers ────────────────────────────────────────────────────────────

describe('pure validation', () => {
  test('the action set is closed', () => {
    expect(isLpWriteAction('lp-collect')).toBe(true)
    expect(isLpWriteAction('lp-decrease')).toBe(true)
    expect(isLpWriteAction('lp-increase')).toBe(true)
    expect(isLpWriteAction('lp-positions')).toBe(false)
    expect(isLpWriteAction('place')).toBe(false)
    expect(isLpWriteAction(undefined)).toBe(false)
  })

  test('only the two pinned programs resolve', () => {
    expect(resolveSolanaLpProgram(ORCA_WHIRLPOOL_PROGRAM_ID)).toBe(
      'orca-whirlpool',
    )
    expect(resolveSolanaLpProgram(RAYDIUM_CLMM_PROGRAM_ID)).toBe('raydium-clmm')
    // A real, live Solana program that is NOT a CLMM. Never a fallback.
    expect(resolveSolanaLpProgram(TOKEN_PROGRAM_ID)).toBeNull()
    expect(resolveSolanaLpProgram('')).toBeNull()
    expect(resolveSolanaLpProgram(null)).toBeNull()
  })

  test('addresses are checked, not assumed', () => {
    expect(isSolanaAddress(POSITION_MINT)).toBe(true)
    expect(isSolanaAddress('0xabc')).toBe(false)
    // Base58 excludes 0, O, I and l.
    expect(isSolanaAddress('0'.repeat(44))).toBe(false)
    expect(isSolanaAddress('short')).toBe(false)
  })

  test('a percentage burns an exact slice, and 100% leaves no dust', () => {
    expect(liquidityForPercent(1_000n, 25)).toBe(250n)
    expect(liquidityForPercent(999n, 100)).toBe(999n)
    expect(liquidityForPercent(1_000n, 0)).toBeNull()
    expect(liquidityForPercent(1_000n, 101)).toBeNull()
    expect(liquidityForPercent(1_000n, 33.5)).toBeNull()
    expect(liquidityForPercent(0n, 50)).toBeNull()
  })

  test('slippage is capped, and the cap is a refusal not a clamp', () => {
    expect(normalizeSlippageBps(undefined)).toBe(50)
    expect(normalizeSlippageBps(0)).toBe(0)
    expect(normalizeSlippageBps(2_500)).toBe(2_500)
    expect(normalizeSlippageBps(2_501)).toBeNull()
    expect(normalizeSlippageBps(-1)).toBeNull()
    expect(normalizeSlippageBps('50')).toBeNull()
    expect(normalizeSlippageBps(Number.NaN)).toBeNull()
  })

  test('a floor rounds down', () => {
    expect(applySlippageFloor(10_000n, 50)).toBe(9_950n)
    expect(applySlippageFloor(1n, 50)).toBe(0n)
    expect(applySlippageFloor(0n, 50)).toBe(0n)
  })

  test('decimal amounts scale without floating point', () => {
    expect(scaleToRaw('1.5', 9)).toBe(1_500_000_000n)
    expect(scaleToRaw('0.000000001', 9)).toBe(1n)
    // Truncates past the mint's precision rather than rounding up.
    expect(scaleToRaw('1.0000000004', 9)).toBe(1_000_000_000n)
    expect(scaleToRaw('12', 6)).toBe(12_000_000n)
    expect(scaleToRaw('0', 6)).toBe(0n)
    expect(scaleToRaw('', 6)).toBe(0n)
  })

  test('liquidity from amounts takes the binding leg in range', () => {
    const inRange = {
      sqrtPriceX96: BigInt(Math.floor(1 * 2 ** 96)),
      currentTick: 0,
      tickLower: -1000,
      tickUpper: 1000,
    }
    // A tiny token1 amount binds even when token0 is generous.
    const bound = liquidityForAmounts({
      ...inRange,
      amount0: 10n ** 12n,
      amount1: 1_000n,
    })
    const generous = liquidityForAmounts({
      ...inRange,
      amount0: 10n ** 12n,
      amount1: 10n ** 12n,
    })
    expect(bound).toBeLessThan(generous)
    expect(bound).toBeGreaterThan(0n)
  })

  test('below the range only token0 counts, above only token1', () => {
    const band = { tickLower: 1000, tickUpper: 2000, sqrtPriceX96: 0n }
    // Price below the band: token1 alone buys nothing.
    expect(
      liquidityForAmounts({
        ...band,
        currentTick: 0,
        amount0: 0n,
        amount1: 10n ** 12n,
      }),
    ).toBe(0n)
    expect(
      liquidityForAmounts({
        ...band,
        currentTick: 0,
        amount0: 10n ** 12n,
        amount1: 0n,
      }),
    ).toBeGreaterThan(0n)
    // Price above the band: the other way round.
    expect(
      liquidityForAmounts({
        ...band,
        currentTick: 5000,
        amount0: 10n ** 12n,
        amount1: 0n,
      }),
    ).toBe(0n)
    expect(
      liquidityForAmounts({
        ...band,
        currentTick: 5000,
        amount0: 0n,
        amount1: 10n ** 12n,
      }),
    ).toBeGreaterThan(0n)
  })

  test('an inverted band is refused rather than producing a negative', () => {
    expect(
      liquidityForAmounts({
        amount0: 10n ** 12n,
        amount1: 10n ** 12n,
        sqrtPriceX96: BigInt(Math.floor(2 ** 96)),
        currentTick: 0,
        tickLower: 100,
        tickUpper: 100,
      }),
    ).toBe(0n)
  })

  test('a simulation refusal carries the program log', () => {
    const message = simulationRefusal([
      'Program log: Instruction: DecreaseLiquidityV2',
      'Program log: AnchorError caused by account: tick_array_lower',
      'Program failed to complete',
    ])
    expect(message).toContain('tick_array_lower')
    expect(message).toContain('nothing was sent')
    expect(simulationRefusal(null)).toContain('nothing was sent')
  })
})

// ── Refusals: none of these may touch the key ───────────────────────────────

describe('refusals happen before the key is fetched', () => {
  test('an unknown program is refused without any chain read', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ manager: TOKEN_PROGRAM_ID }),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('Unknown position program')
    expect(keyCalls).toBe(0)
    expect(rpcCalls).toEqual([])
  })

  test('a non-base58 position mint is refused', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ tokenId: '0xdeadbeef' }),
    )
    expect(result.error).toContain('Invalid position mint')
    expect(keyCalls).toBe(0)
    expect(rpcCalls).toEqual([])
  })

  test('an EVM wallet address is refused', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ walletAddress: '0x' + 'a'.repeat(40) }),
    )
    expect(result.error).toContain('not a Solana address')
    expect(keyCalls).toBe(0)
  })

  test('slippage above the cap is refused', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ action: 'lp-decrease', liquidityPct: 50, slippageBps: 9_000 }),
    )
    expect(result.error).toContain('2500 bps')
    expect(keyCalls).toBe(0)
    expect(rpcCalls).toEqual([])
  })

  test('a fractional removal percentage is refused', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ action: 'lp-decrease', liquidityPct: 12.5 }),
    )
    expect(result.error).toContain('whole number from 1 to 100')
    expect(keyCalls).toBe(0)
  })

  test('an increase with nothing to add is refused', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({
        action: 'lp-increase',
        amount0Desired: '0',
        amount1Desired: '',
      }),
    )
    expect(result.error).toContain('Nothing to add')
    expect(keyCalls).toBe(0)
  })

  test('a position that does not exist is refused', async () => {
    const chain = healthyChain(wallet)
    chain.accounts[POSITION_ADDRESS] = null
    stubChain(chain)
    const result = await executeSolanaLpWrite(request())
    expect(result.error).toContain('No Orca position exists')
    expect(keyCalls).toBe(0)
  })

  test('an NFT the wallet does not hold is refused', async () => {
    // No associated token account at all: the position belongs to somebody else.
    const chain = healthyChain(wallet)
    for (const key of Object.keys(chain.accounts)) {
      if (
        key !== POSITION_ADDRESS &&
        key !== POOL &&
        key !== POSITION_MINT &&
        key !== WSOL &&
        key !== USDC
      ) {
        chain.accounts[key] = null
      }
    }
    stubChain(chain)
    const result = await executeSolanaLpWrite(request())
    expect(result.error).toContain('not in this wallet')
    expect(keyCalls).toBe(0)
  })

  test('an NFT held under the WRONG token program is refused', async () => {
    // The mint says classic SPL Token, so the classic ATA is what gets checked;
    // the Token-2022 account the wallet actually has is not consulted, and the
    // request is refused rather than signed against a mismatched program.
    const chain = healthyChain(wallet)
    chain.accounts[POSITION_MINT] = {
      data: mintBytes(0),
      owner: TOKEN_PROGRAM_ID,
    }
    stubChain(chain)
    const result = await executeSolanaLpWrite(request())
    expect(result.success).toBe(false)
    expect(result.error).toContain('not in this wallet')
    expect(keyCalls).toBe(0)
  })

  test('an NFT balance that is not exactly one is refused', async () => {
    const chain = healthyChain(wallet)
    const key = ata(wallet, POSITION_MINT, TOKEN_2022_PROGRAM_ID)
    chain.accounts[key] = {
      data: tokenAccountBytes({
        mint: POSITION_MINT,
        owner: wallet,
        amount: 0n,
      }),
      owner: TOKEN_2022_PROGRAM_ID,
    }
    stubChain(chain)
    const result = await executeSolanaLpWrite(request())
    expect(result.error).toContain('not held by this wallet')
    expect(keyCalls).toBe(0)
  })

  test('a token account owned by somebody else is refused', async () => {
    const chain = healthyChain(wallet)
    const key = ata(wallet, POSITION_MINT, TOKEN_2022_PROGRAM_ID)
    chain.accounts[key] = {
      data: tokenAccountBytes({
        mint: POSITION_MINT,
        owner: Keypair.generate().publicKey.toBase58(),
        amount: 1n,
      }),
      owner: TOKEN_2022_PROGRAM_ID,
    }
    stubChain(chain)
    const result = await executeSolanaLpWrite(request())
    expect(result.error).toContain('not owned by this wallet')
    expect(keyCalls).toBe(0)
  })

  test('a token account holding a different mint is refused', async () => {
    const chain = healthyChain(wallet)
    const key = ata(wallet, POSITION_MINT, TOKEN_2022_PROGRAM_ID)
    chain.accounts[key] = {
      data: tokenAccountBytes({ mint: USDC, owner: wallet, amount: 1n }),
      owner: TOKEN_2022_PROGRAM_ID,
    }
    stubChain(chain)
    const result = await executeSolanaLpWrite(request())
    expect(result.error).toContain('different mint')
    expect(keyCalls).toBe(0)
  })

  test('unreadable pool token mints are refused', async () => {
    const chain = healthyChain(wallet)
    chain.accounts[USDC] = null
    stubChain(chain)
    const result = await executeSolanaLpWrite(request())
    expect(result.error).toContain('mints could not be read')
    expect(keyCalls).toBe(0)
  })
})

// ── After the chain reads ───────────────────────────────────────────────────

describe('the key, and what happens after it', () => {
  test('a key that derives to a different wallet is refused', async () => {
    stubChain(healthyChain(wallet))
    const stranger = Keypair.generate()
    let calls = 0
    const result = await executeSolanaLpWrite(
      request({
        getPrivateKey: async () => {
          calls++
          return bs58.encode(stranger.secretKey)
        },
      }),
    )
    expect(result.error).toBe('Private key does not match wallet')
    // The key WAS fetched here — this check can only happen after it.
    expect(calls).toBe(1)
    expect(rpcCalls).not.toContain('sendTransaction')
  })

  test('a missing key is reported, and nothing is sent', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ getPrivateKey: async () => null }),
    )
    expect(result.error).toBe('Wallet private key not found')
    expect(rpcCalls).not.toContain('sendTransaction')
  })

  test('a failing simulation is a refusal that reports the program log', async () => {
    stubChain(
      healthyChain(wallet, {
        simulateErr: { InstructionError: [1, { Custom: 6016 }] },
        simulateLogs: [
          'Program log: Instruction: CollectFeesV2',
          'Program log: AnchorError caused by account: position_token_account',
          'Program failed to complete',
        ],
      }),
    )
    const result = await executeSolanaLpWrite(request())
    expect(result.success).toBe(false)
    expect(result.error).toContain('position_token_account')
    expect(result.txHash).toBeNull()
    // The whole point: simulation ran, and the transaction did NOT go out.
    expect(rpcCalls).toContain('simulateTransaction')
    expect(rpcCalls).not.toContain('sendTransaction')
  })

  test('simulation is mandatory and precedes the send', async () => {
    stubChain(healthyChain(wallet))
    await executeSolanaLpWrite(request())
    const simulateAt = rpcCalls.indexOf('simulateTransaction')
    const sendAt = rpcCalls.indexOf('sendTransaction')
    expect(simulateAt).toBeGreaterThanOrEqual(0)
    expect(sendAt).toBeGreaterThan(simulateAt)
  })

  test('a position with no liquidity cannot be decreased', async () => {
    stubChain(healthyChain(wallet))
    // The fixture position holds liquidity, so zero it out.
    const chain = healthyChain(wallet)
    const emptied = new Uint8Array(
      fixtureBytes(ORCA_FEE_REPLAY_FIXTURE.position),
    )
    emptied.fill(0, 72, 88)
    chain.accounts[POSITION_ADDRESS] = {
      data: emptied,
      owner: ORCA_WHIRLPOOL_PROGRAM_ID,
    }
    stubChain(chain)
    const result = await executeSolanaLpWrite(
      request({ action: 'lp-decrease', liquidityPct: 100 }),
    )
    expect(result.error).toContain('no liquidity to remove')
    expect(keyCalls).toBe(0)
  })

  test('a result always names the action and the position', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ manager: TOKEN_PROGRAM_ID }),
    )
    expect(result.action).toBe('lp-collect')
    expect(result.market).toBe('jupiter')
    expect(result.tokenId).toBe(POSITION_MINT)
  })
})

// ── What actually gets assembled ────────────────────────────────────────────

/** The instruction sequence of the transaction the writer built, by program. */
function assembled(): Array<{ programId: string; disc: string; keys: number }> {
  const message = web3.TransactionMessage.decompile(
    simulatedTransaction!.message,
  )
  return message.instructions.map((instruction) => ({
    programId: instruction.programId.toBase58(),
    disc: [...new Uint8Array(instruction.data).subarray(0, 8)].join(','),
    keys: instruction.keys.length,
  }))
}

const DISC = {
  collect: '207,117,95,191,229,180,226,15',
  decrease: '58,127,188,62,79,82,196,96',
  increase: '133,29,89,223,69,238,176,10',
  update: '154,230,250,13,236,209,75,223',
}

describe('the transaction the writer assembles', () => {
  test('an Orca collect settles the fees before claiming them', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(request())
    expect(result.success).toBe(true)
    expect(result.txHash).toBe(SIGNATURE)

    const instructions = assembled()
    // Two idempotent payout-account creations, then settle, then collect. The
    // order is the point: collect pays `feeOwed`, which is stale until the
    // update runs, so a collect on its own would leave most of the fees behind.
    expect(instructions.map((i) => i.programId)).toEqual([
      ATA_PROGRAM,
      ATA_PROGRAM,
      ORCA_WHIRLPOOL_PROGRAM_ID,
      ORCA_WHIRLPOOL_PROGRAM_ID,
    ])
    expect(instructions[2].disc).toBe(DISC.update)
    expect(instructions[2].keys).toBe(4)
    expect(instructions[3].disc).toBe(DISC.collect)
    expect(instructions[3].keys).toBe(13)
  })

  test('an Orca decrease burns and then sweeps, atomically', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({ action: 'lp-decrease', liquidityPct: 25 }),
    )
    expect(result.success).toBe(true)
    const instructions = assembled()
    expect(instructions[2].disc).toBe(DISC.decrease)
    expect(instructions[2].keys).toBe(15)
    // A bare decrease transfers nothing extra, so the collect is what pays out.
    expect(instructions[3].disc).toBe(DISC.collect)
    expect(instructions).toHaveLength(4)
  })

  test('an Orca increase is one instruction and no collect', async () => {
    stubChain(healthyChain(wallet))
    const result = await executeSolanaLpWrite(
      request({
        action: 'lp-increase',
        amount0Desired: '0.5',
        amount1Desired: '40',
      }),
    )
    expect(result.success).toBe(true)
    const instructions = assembled()
    expect(instructions).toHaveLength(3)
    expect(instructions[2].disc).toBe(DISC.increase)
    expect(instructions[2].keys).toBe(15)
  })

  test('the fee payer is the wallet, and the transaction is signed', async () => {
    stubChain(healthyChain(wallet))
    await executeSolanaLpWrite(request())
    expect(sentTransaction).not.toBeNull()
    expect(sentTransaction!.message.staticAccountKeys[0].toBase58()).toBe(
      wallet,
    )
    // A non-zero first signature: the writer signed rather than sending a shell.
    expect(sentTransaction!.signatures[0].some((byte) => byte !== 0)).toBe(true)
  })

  test('the removal minimums are a floor below the position value', async () => {
    stubChain(healthyChain(wallet))
    await executeSolanaLpWrite(
      request({ action: 'lp-decrease', liquidityPct: 100, slippageBps: 50 }),
    )
    const message = web3.TransactionMessage.decompile(
      simulatedTransaction!.message,
    )
    const decrease = message.instructions[2]
    const data = new Uint8Array(decrease.data)
    const readU64 = (offset: number) => {
      let value = 0n
      for (let i = offset + 7; i >= offset; i--)
        value = (value << 8n) | BigInt(data[i])
      return value
    }
    // liquidity at 8..24, then the two minimums.
    let liquidity = 0n
    for (let i = 23; i >= 8; i--)
      liquidity = (liquidity << 8n) | BigInt(data[i])
    // 100% of the fixture position's liquidity, exactly.
    expect(liquidity).toBe(61_028_272_428_078n)
    // Both legs are non-zero (the fixture band straddles the price) and neither
    // floor is zero, which would be no protection at all.
    expect(readU64(24)).toBeGreaterThan(0n)
    expect(readU64(32)).toBeGreaterThan(0n)
  })
})

describe('Raydium writes', () => {
  const RAY_MINT = 'GVweUCKW5R9xtpgfVUGcehZ7V1ymnKBpnMmUdtAmvoFx'
  const RAY_POSITION = '61w9LnqxwJeakEnviTFb3nr4Gjd6Y3SM17h7w6w8ta1R'
  const RAY_POOL = '3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv'

  function raydiumChain(owner: string): Chain {
    const positionAta = ata(owner, RAY_MINT, TOKEN_2022_PROGRAM_ID)
    return {
      accounts: {
        [RAY_POSITION]: {
          data: fixtureBytes(RAYDIUM_FEE_REPLAY_FIXTURE.position),
          owner: RAYDIUM_CLMM_PROGRAM_ID,
        },
        [RAY_POOL]: {
          data: fixtureBytes(RAYDIUM_FEE_REPLAY_FIXTURE.pool),
          owner: RAYDIUM_CLMM_PROGRAM_ID,
        },
        [RAY_MINT]: { data: mintBytes(0), owner: TOKEN_2022_PROGRAM_ID },
        [positionAta]: {
          data: tokenAccountBytes({
            mint: RAY_MINT,
            owner,
            amount: 1n,
          }),
          owner: TOKEN_2022_PROGRAM_ID,
        },
        [WSOL]: { data: mintBytes(9), owner: TOKEN_PROGRAM_ID },
        [USDC]: { data: mintBytes(6), owner: TOKEN_PROGRAM_ID },
      },
    }
  }

  function raydiumRequest(overrides: Record<string, unknown> = {}) {
    return {
      action: 'lp-collect' as const,
      manager: RAYDIUM_CLMM_PROGRAM_ID,
      tokenId: RAY_MINT,
      walletAddress: wallet,
      getPrivateKey,
      rpcUrl: RPC,
      ...overrides,
    }
  }

  test('a collect is a decrease that burns nothing', async () => {
    stubChain(raydiumChain(wallet))
    const result = await executeSolanaLpWrite(raydiumRequest())
    expect(result.success).toBe(true)
    const instructions = assembled()
    expect(instructions).toHaveLength(3)
    expect(instructions[2].programId).toBe(RAYDIUM_CLMM_PROGRAM_ID)
    expect(instructions[2].disc).toBe(DISC.decrease)
    expect(instructions[2].keys).toBe(16)
    // Raydium has no collect instruction, so liquidity and both minimums are
    // zero: settle and pay the fees, burn nothing.
    const message = web3.TransactionMessage.decompile(
      simulatedTransaction!.message,
    )
    const data = new Uint8Array(message.instructions[2].data)
    expect([...data.subarray(8, 40)]).toEqual(new Array(32).fill(0))
  })

  test('a decrease burns the requested slice', async () => {
    stubChain(raydiumChain(wallet))
    const result = await executeSolanaLpWrite(
      raydiumRequest({ action: 'lp-decrease', liquidityPct: 50 }),
    )
    expect(result.success).toBe(true)
    const message = web3.TransactionMessage.decompile(
      simulatedTransaction!.message,
    )
    const data = new Uint8Array(message.instructions[2].data)
    let liquidity = 0n
    for (let i = 23; i >= 8; i--)
      liquidity = (liquidity << 8n) | BigInt(data[i])
    expect(liquidity).toBe(20_904_343_930_541n / 2n)
  })

  test('an increase uses the 15-account context, not the 16-account one', async () => {
    stubChain(raydiumChain(wallet))
    const result = await executeSolanaLpWrite(
      raydiumRequest({
        action: 'lp-increase',
        amount0Desired: '0.1',
        amount1Desired: '7',
      }),
    )
    expect(result.success).toBe(true)
    const instructions = assembled()
    expect(instructions[2].disc).toBe(DISC.increase)
    expect(instructions[2].keys).toBe(15)
  })

  test('an Orca program id cannot be used to sign a Raydium position', async () => {
    // The position PDA is derived under the NAMED program, so naming the wrong
    // one looks for an account that is not there.
    stubChain(raydiumChain(wallet))
    const result = await executeSolanaLpWrite(
      raydiumRequest({ manager: ORCA_WHIRLPOOL_PROGRAM_ID }),
    )
    expect(result.success).toBe(false)
    expect(result.error).toContain('No Orca position exists')
    expect(keyCalls).toBe(0)
  })
})
