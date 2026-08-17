// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Signing a bridge transfer, fail-closed at every step.
 *
 * A bridge send is the most expensive transaction a user makes in this app: the
 * calldata is opaque, the funds leave the chain they can be recovered on, and
 * the party that produced the transaction is an HTTP API. So the discipline is
 * the swap executor's, restated for a send that crosses chains:
 *
 *   1. The route is RE-QUOTED here, at signing time, with the wallet slot's own
 *      address. Calldata never travels through the UI, so there is no window in
 *      which a confirmed transfer and the bytes being signed can differ.
 *   2. The re-quote is checked against the floor the user accepted. A route that
 *      re-priced below it is refused rather than signed at the worse rate.
 *   3. The transaction target must be a known LI.FI contract, and so must the
 *      address an ERC-20 allowance is granted to.
 *   4. `value` is the field a malicious response would drain a wallet with, so
 *      it is checked rather than trusted: exactly the sent amount for a native
 *      transfer, exactly zero for an ERC-20 one.
 *   5. The account derived from the private key must be the slot's address.
 *
 * What is NOT verifiable here is the recipient encoded inside the calldata:
 * decoding a diamond's cross-chain payload needs an ABI this connector does not
 * carry. What it can do, and does in `parseLifiQuote`, is refuse a route whose
 * STATED sender or recipient is anyone but the wallet. The residual trust is in
 * the pinned LI.FI contract, not in an arbitrary response.
 */
import { ERC20_ABI } from '../evm-dex-connector/swap-executor'
import { getViemChain } from '../evm-dex-connector/chains'
import { isNativeToken } from './quote-client'
import type { EvmChainConfig } from '../evm-dex-connector/chains'
import type { LifiRoute, LifiTransaction } from './quote-client'
import type { BridgeExecutionResult } from '@pairlens/shared/instrument-types'

/**
 * Contracts a bridge transaction may target, and that an ERC-20 allowance may
 * name. The LiFiDiamond is deployed at the same address on every EVM chain LI.FI
 * supports (https://docs.li.fi/smart-contracts/deployments); every quote this
 * connector has seen, native and ERC-20, across five chains, routes through it.
 *
 * Extend this list only after verifying a new deployment against LI.FI's
 * published addresses. A route naming anything else is refused: an unknown
 * spender with an unbounded-looking approval is exactly the shape of the attack
 * this list exists to stop. Entries must be lowercase.
 */
export const LIFI_ALLOWED_CONTRACTS: ReadonlySet<string> = new Set([
  '0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae', // LiFiDiamond (all chains)
])

export function isAllowedLifiContract(address: unknown): boolean {
  return (
    typeof address === 'string' &&
    LIFI_ALLOWED_CONTRACTS.has(address.toLowerCase())
  )
}

/**
 * `value` as the API states it: hex (`0x0`, `0x16345785d8a0000`) or decimal.
 * Null when it is neither, which is a refusal rather than a zero.
 */
export function parseTxValue(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') return 0n
  try {
    if (/^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value)
    if (/^\d+$/.test(value)) return BigInt(value)
  } catch {
    return null
  }
  return null
}

export type TxValidationInput = {
  tx: LifiTransaction
  /** The spender an allowance would name. Null is a refusal on a token send. */
  approvalAddress: string | null
  expectedChainId: number
  /** Raw source-token units the user is sending. */
  fromAmountRaw: bigint
  /** True when the asset is the chain's native coin. */
  isNativeSend: boolean
}

export type TxValidation =
  | { ok: true; to: `0x${string}`; data: `0x${string}`; value: bigint }
  | { ok: false; error: string }

/**
 * Everything that can be decided about a transaction without a network: the
 * target, the calldata's shape, the chain and the native value.
 *
 * Pure, and tested as such. The rules it encodes are the ones whose failure
 * costs money rather than a rerender.
 */
export function validateBridgeTransaction(
  input: TxValidationInput,
): TxValidation {
  const { tx, approvalAddress, expectedChainId, fromAmountRaw, isNativeSend } =
    input

  // A Solana transaction has no `to`, no `value` and no chain id, so none of
  // the rules below would fire on one. Refusing here rather than reading three
  // absent fields as three passing checks is what keeps the two families from
  // ever validating each other's work.
  if (tx.kind !== 'evm') {
    return {
      ok: false,
      error:
        'Route returned a non-EVM transaction for an EVM chain. Refusing to sign.',
    }
  }
  if (!isAllowedLifiContract(tx.to)) {
    return {
      ok: false,
      error: `Route targets an unrecognised contract (${tx.to}). Refusing to sign.`,
    }
  }
  if (!isNativeSend && !isAllowedLifiContract(approvalAddress)) {
    return {
      ok: false,
      error: `Route asks to approve an unrecognised spender (${approvalAddress}). Refusing to sign.`,
    }
  }
  if (!/^0x[0-9a-fA-F]+$/.test(tx.data) || tx.data.length < 10) {
    return {
      ok: false,
      error: 'Route returned malformed calldata. Refusing to sign.',
    }
  }
  if (tx.chainId !== null && tx.chainId !== expectedChainId) {
    return {
      ok: false,
      error: `Route is built for chain ${tx.chainId}, not ${expectedChainId}. Refusing to sign.`,
    }
  }

  const value = parseTxValue(tx.value)
  if (value === null) {
    return {
      ok: false,
      error: `Route states an unreadable value (${tx.value}). Refusing to sign.`,
    }
  }
  // A native transfer sends exactly what was quoted: LI.FI's own fee is taken
  // OUT of that amount (every fee cost comes back flagged `included`), never
  // added on top. An ERC-20 transfer is pulled through the allowance, so any
  // native value at all is a surprise and is refused rather than reasoned about.
  if (isNativeSend && value !== fromAmountRaw) {
    return {
      ok: false,
      error: `Route would send ${value} native units for a ${fromAmountRaw} transfer. Refusing to sign.`,
    }
  }
  if (!isNativeSend && value !== 0n) {
    return {
      ok: false,
      error: `Route would send ${value} native units alongside a token transfer. Refusing to sign.`,
    }
  }

  return {
    ok: true,
    to: tx.to as `0x${string}`,
    data: tx.data as `0x${string}`,
    value,
  }
}

/**
 * Is the re-quoted floor still what the user agreed to?
 *
 * Bridges re-price between the quote a user reads and the confirm they press,
 * and a small drift is normal. `maxSlippageBps` is how much of it the confirm
 * carries; below that the transfer is refused and the pane requotes, because a
 * confirm is consent to a stated outcome, not a blank cheque.
 */
export function acceptableRequote(opts: {
  accepted: number
  requoted: number | null
  maxSlippageBps: number
}): { ok: true } | { ok: false; error: string } {
  const { accepted, requoted, maxSlippageBps } = opts
  if (!(accepted > 0)) return { ok: true }
  if (requoted === null) {
    return {
      ok: false,
      error: 'The bridge no longer states a guaranteed amount for this route.',
    }
  }
  const floor = accepted * (1 - maxSlippageBps / 10_000)
  if (requoted < floor) {
    return {
      ok: false,
      error: `The route re-priced below what you confirmed (${requoted} against ${accepted}). Nothing was sent.`,
    }
  }
  return { ok: true }
}

export type ExecuteBridgeOptions = {
  chain: EvmChainConfig
  route: LifiRoute
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
  rpcUrl: string
}

/**
 * Approve if needed, send, wait for the source-chain receipt.
 *
 * Returning rather than throwing, like every other `trading:*` path: the
 * capability is declared `sideEffect: true`, so the plugin manager never retries
 * it against another plugin, and a thrown error would lose the distinction
 * between "nothing was sent" and "sent, and then something went wrong".
 */
export async function executeBridgeTransfer(
  opts: ExecuteBridgeOptions,
): Promise<BridgeExecutionResult> {
  const { chain, route, walletAddress, getPrivateKey, rpcUrl } = opts
  try {
    const isNativeSend = isNativeToken(route.fromToken)

    const validation = validateBridgeTransaction({
      tx: route.tx,
      approvalAddress: route.approvalAddress,
      expectedChainId: chain.chainId,
      fromAmountRaw: route.fromAmountRaw,
      isNativeSend,
    })
    if (!validation.ok) return { success: false, error: validation.error }

    const privateKey = await getPrivateKey()
    if (!privateKey) {
      return { success: false, error: 'Wallet private key not found' }
    }

    // Dynamic imports: viem is only pulled in on the first transfer.
    const { createPublicClient, createWalletClient, http } =
      await import('viem')
    const { privateKeyToAccount } = await import('viem/accounts')
    const viemChain = await getViemChain(chain.market)

    const account = privateKeyToAccount(
      (privateKey.startsWith('0x')
        ? privateKey
        : `0x${privateKey}`) as `0x${string}`,
    )
    if (account.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return { success: false, error: 'Private key does not match wallet' }
    }

    const transport = http(rpcUrl)
    const publicClient = createPublicClient({ chain: viemChain, transport })
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport,
    })

    if (!isNativeSend) {
      const tokenAddress = route.fromToken.address as `0x${string}`
      // Non-null past `validateBridgeTransaction`, which refuses a token send
      // whose spender is not a pinned contract. Re-stated rather than asserted
      // so the guarantee survives someone reordering the two.
      if (!route.approvalAddress) {
        return { success: false, error: 'Route names no allowance spender' }
      }
      const spender = route.approvalAddress as `0x${string}`
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, spender],
      })
      if (allowance < route.fromAmountRaw) {
        // Exactly the amount being sent. An unlimited approval would outlive
        // the transfer, and a bridge contract holding one is a standing claim
        // on the wallet.
        const approveHash = await walletClient.writeContract({
          address: tokenAddress,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [spender, route.fromAmountRaw],
        })
        const approveReceipt = await publicClient.waitForTransactionReceipt({
          hash: approveHash,
        })
        if (approveReceipt.status !== 'success') {
          return { success: false, error: 'Token approval failed' }
        }
      }
    }

    const hash = await walletClient.sendTransaction({
      to: validation.to,
      data: validation.data,
      value: validation.value,
    })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      return {
        success: false,
        error: `Bridge transaction reverted on ${chain.displayName} (tx ${hash})`,
      }
    }

    return { success: true, sourceTxHash: hash, quote: route.quote }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Bridge transfer failed',
    }
  }
}
