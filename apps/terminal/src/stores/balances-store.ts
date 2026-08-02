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
 * Composite credential key for DEX wallet balances. One wallet trades on
 * many chains (a single EVM key serves Ethereum, Base, Arbitrum, …), and
 * the same currency symbol on two chains is two distinct balances — so DEX
 * records are namespaced per (wallet, market).
 */
export function dexBalanceCredentialKey(
  walletId: string,
  market: string,
): string {
  return `${walletId}@${market}`
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

export function clearBalancesForCredential(credentialId: string): void {
  for (const [key, record] of balancesMap) {
    if (record.credentialId === credentialId) {
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
