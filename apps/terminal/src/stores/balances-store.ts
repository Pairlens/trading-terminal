// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Global in-memory store for account balances from the exchange.
 * Module-scoped — survives component unmount/remount (navigation).
 *
 * Keyed by `credentialId:currency` so multiple credentials for the same
 * exchange can coexist without overwriting each other.
 */

export type BalanceRecord = {
  currency: string
  available: string
  frozen: string
  total: string
  market: string
  credentialId: string
  updatedAt: number
}

type Listener = () => void

const balancesMap = new Map<string, BalanceRecord>()
let snapshot: Array<BalanceRecord> = []
let credentialSnapshots = new Map<string, Array<BalanceRecord>>()
const listeners = new Set<Listener>()

function rebuildSnapshot(): void {
  snapshot = Array.from(balancesMap.values())
    .filter((b) => Number(b.total) > 0)
    .sort((a, b) => Number(b.total) - Number(a.total))

  const byCredential = new Map<string, Array<BalanceRecord>>()
  for (const b of snapshot) {
    let arr = byCredential.get(b.credentialId)
    if (!arr) {
      arr = []
      byCredential.set(b.credentialId, arr)
    }
    arr.push(b)
  }
  credentialSnapshots = byCredential

  for (const l of listeners) l()
}

/**
 * Composite key for balances that one account holds on more than one venue.
 *
 * Two cases need it, for the same reason. One EVM wallet trades on every EVM
 * chain, and the same currency symbol on two chains is two distinct balances.
 * And one exchange API key can now serve two venues: a futures connector that
 * declares `credentialAlias` is provisioned from the SPOT credential, and a
 * futures USDT margin balance is not the spot USDT balance — recorded under
 * the bare credential id they would overwrite each other, and whichever
 * arrived last would be what the ticket displayed.
 */
export function venueBalanceCredentialKey(
  accountId: string,
  market: string,
): string {
  return `${accountId}@${market}`
}

/** The wallet-shaped spelling of the same key. */
export function dexBalanceCredentialKey(
  walletId: string,
  market: string,
): string {
  return venueBalanceCredentialKey(walletId, market)
}

export function upsertBalance(record: BalanceRecord): void {
  balancesMap.set(`${record.credentialId}:${record.currency}`, record)
  rebuildSnapshot()
}

export function clearBalances(): void {
  balancesMap.clear()
  snapshot = []
  credentialSnapshots = new Map()
  for (const l of listeners) l()
}

/** Drop one namespace exactly: this credential on this venue, nothing else. */
export function clearBalancesForScope(scope: string): void {
  for (const [key, record] of balancesMap) {
    if (record.credentialId === scope) balancesMap.delete(key)
  }
  rebuildSnapshot()
}

/**
 * Drop everything an account holds, across every venue it reaches.
 *
 * The `id@venue` namespaces are matched by prefix rather than tracked by the
 * caller. A removed credential's aliased scopes cannot be recomputed from the
 * credential (it is already gone from the store by the time teardown runs),
 * and a caller-held list of them is state that can be one entry behind.
 */
export function clearBalancesForCredential(credentialId: string): void {
  const prefix = `${credentialId}@`
  for (const [key, record] of balancesMap) {
    if (
      record.credentialId === credentialId ||
      record.credentialId.startsWith(prefix)
    ) {
      balancesMap.delete(key)
    }
  }
  rebuildSnapshot()
}

export function getBalances(): Array<BalanceRecord> {
  return snapshot
}

export function getBalancesForCredential(
  credentialId: string,
): Array<BalanceRecord> {
  return credentialSnapshots.get(credentialId) ?? []
}

export function subscribeBalances(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
