// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolvePairMints } from './token-registry'
import type { JupiterQuote } from './types'
import type { SwapExecution } from '@pairlens/market-engine/types'

// Jupiter Swap API v1 (free "lite" tier — no API key required). The legacy
// quote-api.jup.ag/v6 host was decommissioned; the request/response contract
// is unchanged. https://dev.jup.ag/docs/swap-api
const JUPITER_API = 'https://lite-api.jup.ag/swap/v1'

/**
 * Jito's block engine, the private lane. `sendTransaction` here takes one
 * signed transaction and lands it as a single-transaction bundle; by default
 * it ALSO forwards over the ordinary route, and `bundleOnly=true` switches
 * that off. The tip that pays for the bundle is already inside the
 * transaction: Jupiter appends the transfer when the swap is built with
 * `jitoTipLamports`, so nothing is added locally and the fee-payer check
 * below still covers exactly what gets signed.
 *
 * The endpoint reflects the request origin in its CORS headers, so the web
 * terminal reaches it without a proxy. On desktop it is in the CSP baseline
 * and the Tauri HTTP scope beside the Solana RPC hosts.
 */
const JITO_BLOCK_ENGINE =
  'https://mainnet.block-engine.jito.wtf/api/v1/transactions'

/** Jupiter refuses a priority fee above this when it estimates one itself. */
const AUTO_PRIORITY_CAP_LAMPORTS = 5_000_000

/**
 * The `prioritizationFeeLamports` field of a `/swap` request for the given
 * execution options. Jupiter takes a priority fee OR a Jito tip, never both,
 * so the MEV lane decides which one is sent: a private lane pays its tip,
 * the public lane pays the validator's priority market.
 */
export function prioritizationFeeFor(
  options: SwapExecution | undefined,
): unknown {
  const mev = options?.mev ?? 'off'
  if (mev !== 'off') {
    return { jitoTipLamports: Math.round(options?.tipLamports ?? 0) }
  }
  if (options?.priorityLevel) {
    return {
      priorityLevelWithMaxLamports: {
        priorityLevel: options.priorityLevel,
        maxLamports: Math.round(
          options.maxPriorityFeeLamports ?? AUTO_PRIORITY_CAP_LAMPORTS,
        ),
        global: false,
      },
    }
  }
  return 'auto'
}

/**
 * Refuses execution options that cannot produce a sane transaction, before
 * a key is touched. A tipped lane with no tip would build a bundle nobody
 * includes; a negative or non-finite number would reach the builder as NaN.
 */
export function validateSwapExecution(
  options: SwapExecution | undefined,
): string | null {
  if (!options) return null
  const mev = options.mev ?? 'off'
  if (mev !== 'off') {
    const tip = options.tipLamports
    if (typeof tip !== 'number' || !Number.isFinite(tip) || tip <= 0) {
      return 'MEV protection needs a validator tip above zero'
    }
  }
  const cap = options.maxPriorityFeeLamports
  if (cap != null && (!Number.isFinite(cap) || cap < 0)) {
    return 'Priority fee cap must be a non-negative number'
  }
  return null
}

/**
 * Send a signed transaction through the Jito block engine. Returns the
 * signature the engine acknowledged, or throws with the engine's own message
 * so the caller can decide whether the public lane is an acceptable fallback.
 */
async function sendViaJito(
  signedBase64: string,
  bundleOnly: boolean,
): Promise<string> {
  const url = bundleOnly
    ? `${JITO_BLOCK_ENGINE}?bundleOnly=true`
    : JITO_BLOCK_ENGINE
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [signedBase64, { encoding: 'base64' }],
    }),
  })
  const body = (await res.json().catch(() => null)) as {
    result?: unknown
    error?: { message?: unknown }
  } | null
  if (!res.ok || !body || typeof body.result !== 'string') {
    const message =
      body && body.error && typeof body.error.message === 'string'
        ? body.error.message
        : `Jito block engine answered ${res.status}`
    throw new Error(message)
  }
  return body.result
}

/**
 * Fail-closed check that a quote returned by the (untrusted) Jupiter API is
 * for exactly the swap the user requested: same mints, same input amount,
 * same mode/slippage, and a min-out threshold coherent with that slippage.
 * Returns a description of the first mismatch, or null when coherent.
 */
export function validateQuote(
  quote: JupiterQuote,
  expected: {
    inputMint: string
    outputMint: string
    amount: string
    slippageBps: number
  },
): string | null {
  if (quote.inputMint !== expected.inputMint) {
    return `inputMint ${quote.inputMint} != requested ${expected.inputMint}`
  }
  if (quote.outputMint !== expected.outputMint) {
    return `outputMint ${quote.outputMint} != requested ${expected.outputMint}`
  }
  if (quote.inAmount !== expected.amount) {
    return `inAmount ${quote.inAmount} != requested ${expected.amount}`
  }
  if (quote.swapMode !== 'ExactIn') {
    return `swapMode ${quote.swapMode} != ExactIn`
  }
  if (quote.slippageBps != null && quote.slippageBps !== expected.slippageBps) {
    return `slippageBps ${quote.slippageBps} != requested ${expected.slippageBps}`
  }
  try {
    const outAmount = BigInt(quote.outAmount)
    const minOut = BigInt(quote.otherAmountThreshold)
    if (outAmount <= 0n) return 'outAmount is not positive'
    if (expected.slippageBps < 9_990) {
      // Min-out floor = outAmount * (1 - slippage), minus a 10 bps epsilon
      // for rounding differences in Jupiter's own floor computation.
      const floor =
        (outAmount * BigInt(10_000 - expected.slippageBps - 10)) / 10_000n
      if (minOut < floor) {
        return 'otherAmountThreshold is below the slippage floor'
      }
    }
  } catch {
    return 'quote contains malformed amounts'
  }
  return null
}

/**
 * Get a swap quote from the Jupiter Swap API. The response is validated
 * against the request (fail closed) before it is returned, so a quote
 * obtained here is safe to hand to executeSwap.
 */
export async function getQuote(
  pair: string,
  side: 'buy' | 'sell',
  amount: string,
  slippageBps: number,
): Promise<JupiterQuote | null> {
  const mints = await resolvePairMints(pair)
  if (!mints) return null

  // For buy: swap quote → base (output is base token)
  // For sell: swap base → quote (output is quote token)
  const inputMint = side === 'buy' ? mints.outputMint : mints.inputMint
  const outputMint = side === 'buy' ? mints.inputMint : mints.outputMint

  try {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: String(slippageBps),
      swapMode: 'ExactIn',
    })

    const res = await fetch(`${JUPITER_API}/quote?${params}`)
    if (!res.ok) return null
    const quote = (await res.json()) as JupiterQuote
    const mismatch = validateQuote(quote, {
      inputMint,
      outputMint,
      amount,
      slippageBps,
    })
    if (mismatch) {
      console.warn(`[jupiter-dex] rejected quote: ${mismatch}`)
      return null
    }
    return quote
  } catch {
    return null
  }
}

/**
 * Execute a swap via the Jupiter Swap API. `quote` must be the object
 * returned by getQuote — it has already been anchored to the user's
 * request there (mints, amount, slippage).
 * Dynamically imports @solana/web3.js for signing (code-split).
 */
export async function executeSwap(
  quote: JupiterQuote,
  walletAddress: string,
  getPrivateKey: () => Promise<string | null>,
  rpcUrl: string,
  options?: SwapExecution,
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const invalid = validateSwapExecution(options)
    if (invalid) return { success: false, error: invalid }
    const mev = options?.mev ?? 'off'

    // Get serialized transaction from Jupiter
    const swapRes = await fetch(`${JUPITER_API}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: walletAddress,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: prioritizationFeeFor(options),
      }),
    })

    if (!swapRes.ok) {
      const err = await swapRes.text()
      return { success: false, error: `Jupiter swap API error: ${err}` }
    }

    const { swapTransaction } = (await swapRes.json()) as {
      swapTransaction?: string
    }
    if (typeof swapTransaction !== 'string' || !swapTransaction) {
      return {
        success: false,
        error: 'Jupiter swap API returned no transaction',
      }
    }

    // Dynamic import — Solana libs only loaded on first swap
    const { Connection, VersionedTransaction } = await import('@solana/web3.js')

    // ── Local sanity checks on the returned transaction ──────────────
    // The transaction bytes are untrusted. Without a full instruction
    // decoder we cannot prove the transaction performs only the quoted
    // swap — that residual trust stays with the Jupiter Swap API (a
    // compromised API could still return a transaction that spends other
    // assets the wallet's signature authorizes). What we DO assert
    // locally: the payload parses as a Solana transaction and its fee
    // payer — the first required signer, i.e. the account our signature
    // is for — is the provisioned wallet, so the API cannot get us to
    // co-sign a transaction built around a different signer set.
    let unsigned
    try {
      unsigned = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64'),
      )
    } catch {
      return {
        success: false,
        error: 'Refusing to sign: Jupiter returned an unparseable transaction',
      }
    }
    const feePayer = unsigned.message.staticAccountKeys[0]
    if (!feePayer || feePayer.toBase58() !== walletAddress) {
      return {
        success: false,
        error:
          'Refusing to sign: the Jupiter transaction fee payer does not match the wallet',
      }
    }

    // Sign with wallet private key
    const privateKey = await getPrivateKey()
    if (!privateKey) {
      return { success: false, error: 'Wallet private key not found' }
    }

    const connection = new Connection(rpcUrl, 'confirmed')

    const { signBase64Transaction } = await import('./tx-signer')
    const { tx, signedBase64 } = await signBase64Transaction(
      swapTransaction,
      privateKey,
    )

    // Submit. The public lane is the RPC the wallet was provisioned with.
    // `reduced` tries the block engine and falls back to the public lane if
    // the engine refuses, because the trader chose speed with protection as a
    // bonus; `secure` never falls back, because the trader chose never to be
    // seen, and a swap that lands in the open would betray that choice.
    let signature: string
    if (mev === 'off') {
      signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      })
    } else if (mev === 'reduced') {
      try {
        signature = await sendViaJito(signedBase64, false)
      } catch (jitoErr) {
        console.warn(
          `[jupiter-dex] Jito refused the swap, sending on the public lane: ${
            jitoErr instanceof Error ? jitoErr.message : String(jitoErr)
          }`,
        )
        signature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        })
      }
    } else {
      try {
        signature = await sendViaJito(signedBase64, true)
      } catch (jitoErr) {
        return {
          success: false,
          error: `Private lane refused the swap, nothing was sent: ${
            jitoErr instanceof Error ? jitoErr.message : String(jitoErr)
          }`,
        }
      }
    }

    // Confirm
    const latestBlock = await connection.getLatestBlockhash()
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlock.blockhash,
        lastValidBlockHeight: latestBlock.lastValidBlockHeight,
      },
      'confirmed',
    )

    return { success: true, orderId: signature }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Swap failed',
    }
  }
}
