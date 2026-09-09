// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import { clearTokenDirectory } from '@pairlens/market-engine/token-directory'
import bs58 from 'bs58'
import {
  executeSwap,
  getQuote,
  prioritizationFeeFor,
  validateQuote,
  validateSwapExecution,
} from '../swap-executor'
import { clearTokenCache } from '../token-registry'
import type { JupiterQuote } from '../types'

const SOL_MINT = 'So11111111111111111111111111111111111111112'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

type Captured = { url: string; body: unknown }

/** Route fetches by URL substring → response JSON (and optional status). */
function stubFetchRoutes(
  routes: Array<{ match: string; json: unknown; status?: number }>,
): {
  calls: Array<Captured>
} {
  const calls: Array<Captured> = []
  globalThis.fetch = mock(async (url: unknown, init?: RequestInit) => {
    const u = String(url)
    let body: unknown = null
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    calls.push({ url: u, body })
    const route = routes.find((r) => u.includes(r.match))
    if (!route) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(route.json), {
      status: route.status ?? 200,
    })
  }) as unknown as typeof fetch
  return { calls }
}

const realFetch = globalThis.fetch
beforeEach(() => {
  clearTokenCache()
  clearTokenDirectory()
})
afterEach(() => {
  globalThis.fetch = realFetch
})

const TOKEN_ROUTES = [
  {
    match: 'tokens/v2/search?query=SOL',
    json: [{ id: SOL_MINT, symbol: 'SOL', name: 'Solana', decimals: 9 }],
  },
  {
    match: 'tokens/v2/search?query=USDC',
    json: [{ id: USDC_MINT, symbol: 'USDC', name: 'USD Coin', decimals: 6 }],
  },
]

const QUOTE_JSON = {
  inputMint: SOL_MINT,
  outputMint: USDC_MINT,
  inAmount: '1000000000',
  outAmount: '66815000',
  otherAmountThreshold: '66481000',
  swapMode: 'ExactIn',
  slippageBps: 50,
  priceImpactPct: '0.01',
  routePlan: [],
}

describe('getQuote — Jupiter Swap API v1 (lite-api host)', () => {
  it('requests the current lite-api quote endpoint (v6 host is dead)', async () => {
    const { calls } = stubFetchRoutes([
      ...TOKEN_ROUTES,
      { match: 'swap/v1/quote', json: QUOTE_JSON },
    ])

    const quote = await getQuote('SOL-USDC', 'sell', '1000000000', 50)
    expect(quote?.outAmount).toBe('66815000')

    const quoteCall = calls.find((c) => c.url.includes('/quote?'))
    expect(quoteCall).toBeDefined()
    const url = new URL(quoteCall!.url)
    expect(url.origin + url.pathname).toBe(
      'https://lite-api.jup.ag/swap/v1/quote',
    )
    // Sell: base (SOL) is the input, quote (USDC) the output
    expect(url.searchParams.get('inputMint')).toBe(SOL_MINT)
    expect(url.searchParams.get('outputMint')).toBe(USDC_MINT)
    expect(url.searchParams.get('slippageBps')).toBe('50')
  })

  it('swaps input/output mints for buys', async () => {
    const { calls } = stubFetchRoutes([
      ...TOKEN_ROUTES,
      {
        match: 'swap/v1/quote',
        json: {
          ...QUOTE_JSON,
          inputMint: USDC_MINT,
          outputMint: SOL_MINT,
          inAmount: '100000000',
        },
      },
    ])

    const quote = await getQuote('SOL-USDC', 'buy', '100000000', 50)
    expect(quote).not.toBeNull()

    const url = new URL(calls.find((c) => c.url.includes('/quote?'))!.url)
    expect(url.searchParams.get('inputMint')).toBe(USDC_MINT)
    expect(url.searchParams.get('outputMint')).toBe(SOL_MINT)
  })

  it('returns null when the pair cannot be resolved', async () => {
    stubFetchRoutes([]) // token search 404s
    const quote = await getQuote('NOPE-USDC', 'buy', '1', 50)
    expect(quote).toBeNull()
  })

  it('rejects a quote whose mints do not match the request (fail closed)', async () => {
    stubFetchRoutes([
      ...TOKEN_ROUTES,
      {
        match: 'swap/v1/quote',
        // API swaps in a different output mint than requested
        json: { ...QUOTE_JSON, outputMint: SOL_MINT },
      },
    ])
    const quote = await getQuote('SOL-USDC', 'sell', '1000000000', 50)
    expect(quote).toBeNull()
  })

  it('rejects a quote whose inAmount was tampered with', async () => {
    stubFetchRoutes([
      ...TOKEN_ROUTES,
      {
        match: 'swap/v1/quote',
        json: { ...QUOTE_JSON, inAmount: '5000000000' },
      },
    ])
    const quote = await getQuote('SOL-USDC', 'sell', '1000000000', 50)
    expect(quote).toBeNull()
  })
})

describe('validateQuote — anchors the quote to the user request', () => {
  const expected = {
    inputMint: SOL_MINT,
    outputMint: USDC_MINT,
    amount: '1000000000',
    slippageBps: 50,
  }
  const quote = QUOTE_JSON as JupiterQuote

  it('accepts a coherent quote', () => {
    expect(validateQuote(quote, expected)).toBeNull()
  })

  it('rejects mint, amount, mode, and slippage mismatches', () => {
    expect(
      validateQuote({ ...quote, inputMint: USDC_MINT }, expected),
    ).toContain('inputMint')
    expect(validateQuote({ ...quote, inAmount: '1' }, expected)).toContain(
      'inAmount',
    )
    expect(
      validateQuote({ ...quote, swapMode: 'ExactOut' }, expected),
    ).toContain('swapMode')
    expect(validateQuote({ ...quote, slippageBps: 5000 }, expected)).toContain(
      'slippageBps',
    )
  })

  it('rejects a min-out threshold below the slippage floor', () => {
    // 50 bps slippage but a threshold 10% below outAmount
    expect(
      validateQuote({ ...quote, otherAmountThreshold: '60000000' }, expected),
    ).toContain('slippage floor')
  })

  it('rejects malformed amounts instead of throwing', () => {
    expect(
      validateQuote({ ...quote, outAmount: 'garbage' }, expected),
    ).toContain('malformed')
  })
})

describe('executeSwap — refuses to sign foreign transactions', () => {
  function buildUnsignedBase64(payer: Keypair): string {
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: payer.publicKey.toBase58(),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1_000,
        }),
      ],
    }).compileToV0Message()
    return Buffer.from(new VersionedTransaction(message).serialize()).toString(
      'base64',
    )
  }

  it('rejects a transaction whose fee payer is not the wallet', async () => {
    const wallet = Keypair.generate()
    const attacker = Keypair.generate()
    stubFetchRoutes([
      {
        match: 'swap/v1/swap',
        json: { swapTransaction: buildUnsignedBase64(attacker) },
      },
    ])
    const getPrivateKey = mock(async () => null)

    const res = await executeSwap(
      QUOTE_JSON as JupiterQuote,
      wallet.publicKey.toBase58(),
      getPrivateKey,
      'http://localhost:0',
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain('fee payer')
    expect(getPrivateKey).not.toHaveBeenCalled()
  })

  it('rejects an unparseable transaction payload', async () => {
    const wallet = Keypair.generate()
    stubFetchRoutes([
      {
        match: 'swap/v1/swap',
        json: { swapTransaction: 'bm90LWEtdHJhbnNhY3Rpb24=' },
      },
    ])
    const res = await executeSwap(
      QUOTE_JSON as JupiterQuote,
      wallet.publicKey.toBase58(),
      async () => null,
      'http://localhost:0',
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain('unparseable')
  })

  it('rejects a response with no transaction at all', async () => {
    stubFetchRoutes([{ match: 'swap/v1/swap', json: {} }])
    const res = await executeSwap(
      QUOTE_JSON as JupiterQuote,
      Keypair.generate().publicKey.toBase58(),
      async () => null,
      'http://localhost:0',
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain('no transaction')
  })

  it('proceeds to key retrieval once the transaction passes the checks', async () => {
    const wallet = Keypair.generate()
    stubFetchRoutes([
      {
        match: 'swap/v1/swap',
        json: { swapTransaction: buildUnsignedBase64(wallet) },
      },
    ])
    const getPrivateKey = mock(async () => null)

    const res = await executeSwap(
      QUOTE_JSON as JupiterQuote,
      wallet.publicKey.toBase58(),
      getPrivateKey,
      'http://localhost:0',
    )
    // Key mock returns null, so execution stops right after validation —
    // reaching this error proves the fee-payer check passed.
    expect(res).toEqual({
      success: false,
      error: 'Wallet private key not found',
    })
    expect(getPrivateKey).toHaveBeenCalledTimes(1)
  })
})

describe('swap execution options', () => {
  it('defaults to the venue estimate on the public lane', () => {
    expect(prioritizationFeeFor(undefined)).toBe('auto')
    expect(prioritizationFeeFor({ mev: 'off' })).toBe('auto')
  })

  it('maps a priority level to the capped Jupiter shape', () => {
    expect(
      prioritizationFeeFor({
        priorityLevel: 'high',
        maxPriorityFeeLamports: 2_000_000,
      }),
    ).toEqual({
      priorityLevelWithMaxLamports: {
        priorityLevel: 'high',
        maxLamports: 2_000_000,
        global: false,
      },
    })
  })

  it('a private lane pays a tip and never a priority fee', () => {
    expect(
      prioritizationFeeFor({
        mev: 'reduced',
        tipLamports: 1_000_000,
        priorityLevel: 'veryHigh',
      }),
    ).toEqual({ jitoTipLamports: 1_000_000 })
  })

  it('refuses a private lane without a tip and a negative fee cap', () => {
    expect(validateSwapExecution({ mev: 'secure' })).toContain('tip')
    expect(validateSwapExecution({ mev: 'secure', tipLamports: 0 })).toContain(
      'tip',
    )
    expect(validateSwapExecution({ maxPriorityFeeLamports: -1 })).toContain(
      'cap',
    )
    expect(validateSwapExecution({ mev: 'off' })).toBeNull()
    expect(
      validateSwapExecution({ mev: 'reduced', tipLamports: 500_000 }),
    ).toBeNull()
  })
})

describe('executeSwap — lanes', () => {
  function buildUnsignedBase64(payer: Keypair): string {
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: payer.publicKey.toBase58(),
      instructions: [
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: Keypair.generate().publicKey,
          lamports: 1_000,
        }),
      ],
    }).compileToV0Message()
    return Buffer.from(new VersionedTransaction(message).serialize()).toString(
      'base64',
    )
  }

  it('builds the swap with the tip and refuses to fall back on the secure lane', async () => {
    const wallet = Keypair.generate()
    const { calls } = stubFetchRoutes([
      {
        match: 'swap/v1/swap',
        json: { swapTransaction: buildUnsignedBase64(wallet) },
      },
      {
        match: 'block-engine.jito.wtf',
        json: { jsonrpc: '2.0', id: 1, error: { message: 'no leader' } },
        status: 400,
      },
    ])
    const res = await executeSwap(
      QUOTE_JSON as JupiterQuote,
      wallet.publicKey.toBase58(),
      async () => bs58.encode(wallet.secretKey),
      'http://localhost:0',
      { mev: 'secure', tipLamports: 1_000_000 },
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain('Private lane')
    expect(res.error).toContain('no leader')

    const build = calls.find((c) => c.url.includes('swap/v1/swap'))
    expect(build?.body).toMatchObject({
      prioritizationFeeLamports: { jitoTipLamports: 1_000_000 },
    })
    const jito = calls.find((c) => c.url.includes('block-engine.jito.wtf'))
    expect(jito?.url).toContain('bundleOnly=true')
    expect(jito?.body).toMatchObject({
      method: 'sendTransaction',
      params: [expect.any(String), { encoding: 'base64' }],
    })
    // Nothing reached the public RPC: the only calls are the build and Jito.
    expect(
      calls.filter((c) => c.url.startsWith('http://localhost:0')),
    ).toHaveLength(0)
  })

  it('refuses a tipped lane before any request when the tip is missing', async () => {
    const wallet = Keypair.generate()
    const { calls } = stubFetchRoutes([])
    const res = await executeSwap(
      QUOTE_JSON as JupiterQuote,
      wallet.publicKey.toBase58(),
      async () => null,
      'http://localhost:0',
      { mev: 'reduced' },
    )
    expect(res.success).toBe(false)
    expect(res.error).toContain('tip')
    expect(calls).toHaveLength(0)
  })

  it('sends the priority level shape on the public lane', async () => {
    const wallet = Keypair.generate()
    const { calls } = stubFetchRoutes([
      {
        match: 'swap/v1/swap',
        json: { swapTransaction: buildUnsignedBase64(wallet) },
      },
    ])
    await executeSwap(
      QUOTE_JSON as JupiterQuote,
      wallet.publicKey.toBase58(),
      async () => null,
      'http://localhost:0',
      { priorityLevel: 'veryHigh', maxPriorityFeeLamports: 10_000_000 },
    )
    const build = calls.find((c) => c.url.includes('swap/v1/swap'))
    expect(build?.body).toMatchObject({
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          priorityLevel: 'veryHigh',
          maxLamports: 10_000_000,
        },
      },
    })
  })
})
