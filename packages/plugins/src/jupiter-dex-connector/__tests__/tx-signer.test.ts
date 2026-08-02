// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'
import {
  Keypair,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { signBase64Transaction } from '../tx-signer'

/**
 * Build an unsigned v0 transaction the way Jupiter's APIs return them
 * (base64-serialized, signature slots zeroed). The blockhash only needs to
 * be 32 bytes for signing — no network involved.
 */
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

describe('signBase64Transaction — cryptographic verification', () => {
  it('produces an ed25519 signature that verifies against the message', async () => {
    const payer = Keypair.generate()
    const unsigned = buildUnsignedBase64(payer)

    const { tx } = await signBase64Transaction(
      unsigned,
      bs58.encode(payer.secretKey),
    )

    const signature = tx.signatures[0]
    expect(signature.some((b) => b !== 0)).toBe(true)
    expect(
      nacl.sign.detached.verify(
        tx.message.serialize(),
        signature,
        payer.publicKey.toBytes(),
      ),
    ).toBe(true)
  })

  it('round-trips through base64 with the signature intact', async () => {
    const payer = Keypair.generate()
    const unsigned = buildUnsignedBase64(payer)

    const { tx, signedBase64 } = await signBase64Transaction(
      unsigned,
      bs58.encode(payer.secretKey),
    )

    const reparsed = VersionedTransaction.deserialize(
      Buffer.from(signedBase64, 'base64'),
    )
    expect(Buffer.from(reparsed.signatures[0])).toEqual(
      Buffer.from(tx.signatures[0]),
    )
    expect(
      nacl.sign.detached.verify(
        reparsed.message.serialize(),
        reparsed.signatures[0],
        payer.publicKey.toBytes(),
      ),
    ).toBe(true)
  })

  it('a wrong key cannot produce a signature for the payer slot', async () => {
    const payer = Keypair.generate()
    const intruder = Keypair.generate()
    const unsigned = buildUnsignedBase64(payer)

    // Signing with a key that is not a required signer must throw
    await expect(
      signBase64Transaction(unsigned, bs58.encode(intruder.secretKey)),
    ).rejects.toThrow()
  })
})
