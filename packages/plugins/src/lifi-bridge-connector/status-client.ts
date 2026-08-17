// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `GET /v1/status?txHash=`, parsed into the three states a transfer can be in.
 *
 * The one judgement call in here is what an unindexed transfer means. LI.FI
 * answers 404 for a hash it has never seen, and a send is routinely unknown to
 * the status endpoint for a block or two after it lands on the source chain.
 * Reading that as failure would report a live transfer as dead, which is the
 * single worst thing this pane could say, so an unindexed hash stays PENDING
 * and carries `found: false` for a surface that wants to say "not picked up
 * yet".
 *
 * The mapping is otherwise narrow on purpose: only DONE is confirmed, only
 * FAILED and INVALID are failed, and everything else (PENDING, NOT_FOUND, an
 * unknown string a later API version invents) is pending. A status this
 * connector does not recognise must not resolve a transfer.
 */
import { LIFI_PROVIDER, lifiFetch } from './rate-limiter'
import { toHumanAmount } from './quote-client'
import type {
  BridgeStatusUpdate,
  BridgeTransferStatus,
} from '@pairlens/shared/instrument-types'

/** The subset of a LI.FI status response this connector reads. */
export type LifiStatusRaw = {
  status?: unknown
  substatus?: unknown
  substatusMessage?: unknown
  lifiExplorerLink?: unknown
  sending?: { txHash?: unknown }
  receiving?: {
    txHash?: unknown
    amount?: unknown
    token?: { decimals?: unknown }
  }
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** LI.FI's status vocabulary, narrowed to what a transfer row can act on. */
export function mapLifiStatus(status: string | null): BridgeTransferStatus {
  switch (status) {
    case 'DONE':
      return 'confirmed'
    case 'FAILED':
    case 'INVALID':
      return 'failed'
    default:
      return 'pending'
  }
}

/**
 * Parse a status body. Pure: `found` is a parameter because the 404 that means
 * "not indexed yet" carries no body to read it from.
 */
export function parseLifiStatus(
  raw: unknown,
  found = true,
): BridgeStatusUpdate {
  if (typeof raw !== 'object' || raw === null) {
    return {
      status: 'pending',
      substatus: null,
      substatusMessage: null,
      sourceTxHash: null,
      destinationTxHash: null,
      amountOut: null,
      explorerUrl: null,
      found,
    }
  }
  const body = raw as LifiStatusRaw
  const receivingAmount = str(body.receiving?.amount)
  const decimals =
    typeof body.receiving?.token?.decimals === 'number'
      ? body.receiving.token.decimals
      : null

  return {
    status: mapLifiStatus(str(body.status)),
    substatus: str(body.substatus),
    substatusMessage: str(body.substatusMessage),
    sourceTxHash: str(body.sending?.txHash),
    destinationTxHash: str(body.receiving?.txHash),
    amountOut:
      receivingAmount !== null && decimals !== null
        ? toHumanAmount(receivingAmount, decimals)
        : null,
    explorerUrl: str(body.lifiExplorerLink),
    found,
  }
}

/** Poll one transfer. Throws only on a failure worth retrying (throttle, 5xx). */
export async function fetchBridgeStatus(
  txHash: string,
): Promise<BridgeStatusUpdate> {
  const res = await lifiFetch(`/status?txHash=${encodeURIComponent(txHash)}`)
  if (res.status === 404) {
    return parseLifiStatus(null, false)
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `${LIFI_PROVIDER} status failed (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`,
    )
  }
  return parseLifiStatus(await res.json())
}
