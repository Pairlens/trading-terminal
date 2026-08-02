// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { VersionedTransaction } from '@solana/web3.js'

/**
 * Deserialize a base64-encoded Solana transaction (the shape every Jupiter
 * API returns), sign it with the wallet's base58 private key, and return
 * both the signed transaction and its base64 serialization.
 *
 * This is the single signing path for swaps (Swap API) and resting limit
 * orders (Trigger API) — and the unit the offline/testnet signing tests
 * verify cryptographically.
 */
export async function signBase64Transaction(
  base64Tx: string,
  privateKeyBase58: string,
): Promise<{ tx: VersionedTransaction; signedBase64: string }> {
  const { VersionedTransaction: VTx, Keypair } = await import('@solana/web3.js')
  const bs58 = await import('bs58')

  const tx = VTx.deserialize(Buffer.from(base64Tx, 'base64'))
  const keypair = Keypair.fromSecretKey(bs58.default.decode(privateKeyBase58))
  tx.sign([keypair])

  return {
    tx,
    signedBase64: Buffer.from(tx.serialize()).toString('base64'),
  }
}
