// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { restFetch as fetch } from '@pairlens/market-engine/http'
import { resolvePairMints } from './token-registry'
import type { JupiterQuote } from './types'

// Jupiter Swap API v1 (free "lite" tier — no API key required). The legacy
// quote-api.jup.ag/v6 host was decommissioned; the request/response contract
// is unchanged. https://dev.jup.ag/docs/swap-api
const JUPITER_API = 'https://lite-api.jup.ag/swap/v1'

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
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    // Get serialized transaction from Jupiter
    const swapRes = await fetch(`${JUPITER_API}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: walletAddress,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 'auto',
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
    const { tx } = await signBase64Transaction(swapTransaction, privateKey)

    // Submit
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    })

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
