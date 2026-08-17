// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The checks that stand between a LI.FI Solana transaction and a signature.
 *
 * The EVM validator can pin a contract address and be done. This one cannot, so
 * every guarantee it offers comes from running the transaction first and
 * reading what it did to the wallet. That makes the delta rules the load-bearing
 * part of the whole Solana path, and this file is where they are held down:
 * every case here is a way a transfer takes more than the user agreed to.
 *
 * The ordering assertions matter as much as the outcomes. A refusal that fires
 * AFTER the private key was fetched is a refusal that already handed a
 * compromised response the thing it wanted, so the tests count when
 * `getPrivateKey` was called, not just whether the transfer was refused.
 */
import { describe, expect, it } from 'bun:test'
import {
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

import {
  LAMPORT_HEADROOM,
  SYSTEM_PROGRAM_ID,
  WRAPPED_SOL_MINT,
  checkSimulatedDeltas,
  decodeTokenAccount,
  runSolanaBridgeTransfer,
  simulationFailureMessage,
  validateSolanaTransactionShape,
} from '../solana-executor'
import type {
  RpcAccountInfo,
  SolanaRpcFacade,
  TokenAccountView,
  WalletStateSnapshot,
} from '../solana-executor'
import type { LifiRoute } from '../quote-client'

const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const MEMO_PROGRAM = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'

function hexOf(base58: string): string {
  let out = ''
  for (const byte of new PublicKey(base58).toBytes()) {
    out += byte.toString(16).padStart(2, '0')
  }
  return out
}

const USDC_HEX = hexOf(USDC_MINT)
const WSOL_HEX = hexOf(WRAPPED_SOL_MINT)

// ── pure: the token-account decoder ──────────────────────────────────

/** Build the 165 bytes both token programs agree on. */
function tokenAccountBytes(opts: {
  mint: string
  owner: string
  amount: bigint
  delegate?: string
  closeAuthority?: string
}): Uint8Array {
  const data = new Uint8Array(165)
  data.set(new PublicKey(opts.mint).toBytes(), 0)
  data.set(new PublicKey(opts.owner).toBytes(), 32)
  const view = new DataView(data.buffer)
  view.setBigUint64(64, opts.amount, true)
  if (opts.delegate) {
    view.setUint32(72, 1, true)
    data.set(new PublicKey(opts.delegate).toBytes(), 76)
  }
  if (opts.closeAuthority) {
    view.setUint32(129, 1, true)
    data.set(new PublicKey(opts.closeAuthority).toBytes(), 133)
  }
  return data
}

describe('decodeTokenAccount', () => {
  const owner = Keypair.generate().publicKey.toBase58()

  it('reads mint, owner and amount off the fixed offsets', () => {
    const view = decodeTokenAccount(
      tokenAccountBytes({ mint: USDC_MINT, owner, amount: 1_234_567n }),
    )
    expect(view?.mintHex).toBe(USDC_HEX)
    expect(view?.ownerHex).toBe(hexOf(owner))
    expect(view?.amount).toBe(1_234_567n)
    expect(view?.delegateHex).toBeNull()
    expect(view?.closeAuthorityHex).toBeNull()
  })

  it('reads the optional delegate and close authority when set', () => {
    const delegate = Keypair.generate().publicKey.toBase58()
    const view = decodeTokenAccount(
      tokenAccountBytes({
        mint: USDC_MINT,
        owner,
        amount: 1n,
        delegate,
        closeAuthority: delegate,
      }),
    )
    expect(view?.delegateHex).toBe(hexOf(delegate))
    expect(view?.closeAuthorityHex).toBe(hexOf(delegate))
  })

  it('refuses anything too short to be a token account', () => {
    expect(decodeTokenAccount(new Uint8Array(164))).toBeNull()
    expect(decodeTokenAccount(new Uint8Array(0))).toBeNull()
    expect(decodeTokenAccount(null)).toBeNull()
  })
})

// ── pure: the transaction shape ──────────────────────────────────────

describe('validateSolanaTransactionShape', () => {
  const wallet = Keypair.generate().publicKey.toBase58()
  const other = Keypair.generate().publicKey.toBase58()

  function shape(signers: Array<{ address: string | null; signed: boolean }>) {
    return {
      shape: {
        numRequiredSignatures: signers.length,
        feePayer: wallet,
        signers,
      },
      walletAddress: wallet,
    }
  }

  it('accepts a single-signature transaction the wallet pays for', () => {
    expect(
      validateSolanaTransactionShape(
        shape([{ address: wallet, signed: false }]),
      ).ok,
    ).toBe(true)
  })

  it('accepts a co-signer who has ALREADY signed these bytes', () => {
    // Mayan prices most Solana legs and returns a two-signer transaction with
    // its own half filled in. Refusing that outright would have cut Solana
    // support down to whichever tools happen to need one signature.
    expect(
      validateSolanaTransactionShape(
        shape([
          { address: wallet, signed: false },
          { address: other, signed: true },
        ]),
      ).ok,
    ).toBe(true)
  })

  it('refuses a co-signer who has NOT signed yet', () => {
    // The transaction is unfinished, and the other party is still free to
    // change what our signature ends up authorizing.
    const result = validateSolanaTransactionShape(
      shape([
        { address: wallet, signed: false },
        { address: other, signed: false },
      ]),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('half-built')
  })

  it('refuses a transaction already signed in your name', () => {
    const result = validateSolanaTransactionShape(
      shape([{ address: wallet, signed: true }]),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('already signed in your name')
  })

  it('refuses a transaction that wants your signature twice', () => {
    const result = validateSolanaTransactionShape(
      shape([
        { address: wallet, signed: false },
        { address: wallet, signed: true },
      ]),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('twice over')
  })

  it('refuses a transaction somebody else pays for', () => {
    const result = validateSolanaTransactionShape({
      shape: {
        numRequiredSignatures: 1,
        feePayer: other,
        signers: [{ address: other, signed: false }],
      },
      walletAddress: wallet,
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('not your wallet')
  })

  it('refuses a signature list that disagrees with the header', () => {
    const result = validateSolanaTransactionShape({
      shape: {
        numRequiredSignatures: 2,
        feePayer: wallet,
        signers: [{ address: wallet, signed: false }],
      },
      walletAddress: wallet,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a transaction with no fee payer at all', () => {
    const result = validateSolanaTransactionShape({
      shape: { numRequiredSignatures: 1, feePayer: null, signers: [] },
      walletAddress: wallet,
    })
    expect(result.ok).toBe(false)
  })
})

// ── pure: the balance deltas ─────────────────────────────────────────

const WALLET_HEX = hexOf(Keypair.generate().publicKey.toBase58())

function token(over: Partial<TokenAccountView> = {}): TokenAccountView {
  return {
    mintHex: USDC_HEX,
    ownerHex: WALLET_HEX,
    amount: 1_000_000_000n,
    delegateHex: null,
    closeAuthorityHex: null,
    ...over,
  }
}

function snapshot(
  lamports: bigint,
  tokens: Record<string, TokenAccountView> = {},
): WalletStateSnapshot {
  return {
    lamports,
    nativeProgram: SYSTEM_PROGRAM_ID,
    tokens: new Map(Object.entries(tokens)),
  }
}

function deltas(over: Partial<Parameters<typeof checkSimulatedDeltas>[0]>) {
  return checkSimulatedDeltas({
    pre: snapshot(1_000_000_000n),
    post: snapshot(1_000_000_000n),
    walletOwnerHex: WALLET_HEX,
    isNativeSend: true,
    fromAmountRaw: 100_000_000n,
    sourceMintHex: null,
    wrappedSolMintHex: WSOL_HEX,
    systemProgramId: SYSTEM_PROGRAM_ID,
    ...over,
  })
}

describe('checkSimulatedDeltas — native sends', () => {
  it('accepts a send that costs the amount plus a plausible fee', () => {
    const result = deltas({
      pre: snapshot(1_000_000_000n),
      post: snapshot(1_000_000_000n - 100_000_000n - 2_500_000n),
    })
    expect(result.ok).toBe(true)
  })

  it('counts wrapped SOL with native SOL, so an unwrap is not a deposit', () => {
    // The measured Mayan route closes the wallet's wrapped-SOL account while it
    // spends, so raw lamports RISE. Reading lamports alone would call a 0.1 SOL
    // send a 1124 SOL deposit and wave it through.
    const result = deltas({
      pre: snapshot(1_000_000_000n, {
        wsol: token({ mintHex: WSOL_HEX, amount: 500_000_000n }),
      }),
      // wSOL account closed, its balance folded into lamports, minus the send.
      post: snapshot(1_000_000_000n + 500_000_000n - 100_000_000n - 2_000_000n),
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a send that takes more than the amount plus headroom', () => {
    const result = deltas({
      pre: snapshot(10_000_000_000n),
      post: snapshot(10_000_000_000n - 100_000_000n - LAMPORT_HEADROOM - 1n),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('Nothing was sent')
  })

  it('refuses a native send that also spends one of your tokens', () => {
    const result = deltas({
      pre: snapshot(1_000_000_000n, { usdc: token({ amount: 500n }) }),
      post: snapshot(1_000_000_000n - 100_000_000n, {
        usdc: token({ amount: 400n }),
      }),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('not for')
  })

  it('accepts a transfer that leaves you with more than you started with', () => {
    // A refund or a rent reclaim is not a drain, and refusing it would be a
    // rule about arithmetic rather than about the user's money.
    expect(deltas({ post: snapshot(2_000_000_000n) }).ok).toBe(true)
  })
})

describe('checkSimulatedDeltas — SPL sends', () => {
  function splDeltas(
    over: Partial<Parameters<typeof checkSimulatedDeltas>[0]>,
  ) {
    return deltas({
      isNativeSend: false,
      sourceMintHex: USDC_HEX,
      fromAmountRaw: 10_000_000n,
      ...over,
    })
  }

  it('accepts a source balance that fell by exactly the quoted amount', () => {
    const result = splDeltas({
      pre: snapshot(1_000_000_000n, { ata: token({ amount: 100_000_000n }) }),
      post: snapshot(1_000_000_000n - 2_100_000n, {
        ata: token({ amount: 90_000_000n }),
      }),
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a source balance that fell by more than the quote', () => {
    const result = splDeltas({
      pre: snapshot(1_000_000_000n, { ata: token({ amount: 100_000_000n }) }),
      post: snapshot(1_000_000_000n, { ata: token({ amount: 89_999_999n }) }),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('10000001 units')
  })

  it('refuses a source balance that fell by LESS than the quote', () => {
    // Exactly, not at most: a token send that moves less than quoted is a
    // transfer the bridge will not honour on the far side.
    const result = splDeltas({
      pre: snapshot(1_000_000_000n, { ata: token({ amount: 100_000_000n }) }),
      post: snapshot(1_000_000_000n, { ata: token({ amount: 95_000_000n }) }),
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a token send that quietly spends your SOL as well', () => {
    const result = splDeltas({
      pre: snapshot(1_000_000_000n, { ata: token({ amount: 100_000_000n }) }),
      post: snapshot(1_000_000_000n - LAMPORT_HEADROOM - 1n, {
        ata: token({ amount: 90_000_000n }),
      }),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('in fees')
  })

  it('refuses a token send that drains a different mint too', () => {
    const result = splDeltas({
      pre: snapshot(1_000_000_000n, {
        ata: token({ amount: 100_000_000n }),
        wsol: token({ mintHex: WSOL_HEX, amount: 5n }),
      }),
      post: snapshot(1_000_000_000n, {
        ata: token({ amount: 90_000_000n }),
        wsol: token({ mintHex: WSOL_HEX, amount: 4n }),
      }),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('not for')
  })
})

describe('checkSimulatedDeltas — custody', () => {
  const stranger = hexOf(Keypair.generate().publicKey.toBase58())

  it('refuses a token account that changed owner', () => {
    const result = deltas({
      pre: snapshot(1n, { ata: token() }),
      post: snapshot(1n, { ata: token({ ownerHex: stranger }) }),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('another owner')
  })

  it('refuses a delegate the account did not have before', () => {
    // The Solana shape of an unlimited ERC-20 approval: a standing claim that
    // outlives the transfer.
    const result = deltas({
      pre: snapshot(1n, { ata: token() }),
      post: snapshot(1n, { ata: token({ delegateHex: stranger }) }),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('spending delegate')
  })

  it('refuses a close authority the account did not have before', () => {
    const result = deltas({
      pre: snapshot(1n, { ata: token() }),
      post: snapshot(1n, { ata: token({ closeAuthorityHex: stranger }) }),
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('close authority')
  })

  it('leaves a delegate you already had alone', () => {
    const result = deltas({
      pre: snapshot(1n, { ata: token({ delegateHex: stranger }) }),
      post: snapshot(1n, { ata: token({ delegateHex: stranger }) }),
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a wallet account reassigned to another program', () => {
    const result = deltas({
      post: { ...snapshot(1_000_000_000n), nativeProgram: TOKEN_PROGRAM },
    })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('another program')
  })
})

describe('simulationFailureMessage', () => {
  it('carries the log tail so the pane can say why', () => {
    const message = simulationFailureMessage({ InstructionError: [2, 'X'] }, [
      'Program A invoke [1]',
      'Program A failed: custom program error: 0x1771',
    ])
    expect(message).toContain('custom program error')
    expect(message).toContain('Nothing was sent')
  })
})

// ── the whole path, against a faked RPC ──────────────────────────────

type FakeState = {
  calls: Array<string>
  keyFetchedAt: number | null
  lookupResolves: boolean
  simulateErr: unknown
  preAccounts: Map<string, RpcAccountInfo>
  postAccounts: Map<string, RpcAccountInfo>
}

function fakeRpc(state: FakeState): SolanaRpcFacade {
  return {
    async getAddressLookupTable(key) {
      state.calls.push('getAddressLookupTable')
      return state.lookupResolves
        ? { value: { key, state: {} } as never }
        : { value: null }
    },
    async getMultipleAccountsInfo(keys) {
      state.calls.push('getMultipleAccountsInfo')
      return keys.map((k) => state.preAccounts.get(k.toBase58()) ?? null)
    },
    async simulateTransaction(_tx, config) {
      state.calls.push('simulateTransaction')
      if (state.simulateErr) {
        return {
          value: {
            err: state.simulateErr,
            logs: ['Program X invoke [1]', 'Program X failed: insufficient'],
          },
        }
      }
      return {
        value: {
          err: null,
          logs: [],
          accounts: config.accounts.addresses.map((address) => {
            const post = state.postAccounts.get(address)
            if (!post) return null
            return {
              lamports: post.lamports,
              owner: post.owner.toBase58(),
              data: [Buffer.from(post.data).toString('base64'), 'base64'],
            }
          }),
        },
      }
    },
    async sendRawTransaction() {
      state.calls.push('sendRawTransaction')
      return 'signature-base58'
    },
    async getLatestBlockhash() {
      return { blockhash: SYSTEM_PROGRAM_ID, lastValidBlockHeight: 1 }
    },
    async confirmTransaction() {
      return { value: { err: null } }
    },
  }
}

function account(opts: {
  lamports: number
  owner: string
  data?: Uint8Array
}): RpcAccountInfo {
  return {
    lamports: opts.lamports,
    data: opts.data ?? new Uint8Array(0),
    owner: { toBase58: () => opts.owner },
  }
}

/** A v0 transaction with the accounts and signer set the case needs. */
function buildTx(opts: {
  payer: PublicKey
  writable?: Array<PublicKey>
  extraSigner?: PublicKey
}): VersionedTransaction {
  const keys = [
    ...(opts.writable ?? []).map((pubkey) => ({
      pubkey,
      isSigner: false,
      isWritable: true,
    })),
    ...(opts.extraSigner
      ? [{ pubkey: opts.extraSigner, isSigner: true, isWritable: false }]
      : []),
  ]
  const message = new TransactionMessage({
    payerKey: opts.payer,
    recentBlockhash: SYSTEM_PROGRAM_ID,
    instructions: [
      new TransactionInstruction({
        keys,
        programId: new PublicKey(MEMO_PROGRAM),
        data: Buffer.from('bridge'),
      }),
    ],
  }).compileToV0Message()
  return new VersionedTransaction(message)
}

function route(
  tx: VersionedTransaction,
  over: Partial<LifiRoute> = {},
): LifiRoute {
  return {
    quote: {
      fromMarket: 'jupiter',
      toMarket: 'base',
      symbol: 'SOL',
      toSymbol: 'USDC',
      amount: 0.1,
      amountOut: 7.4,
      amountOutMin: 7.3,
      feeUsd: 0.2,
      feeIncluded: true,
      gasUsd: null,
      etaSeconds: 20,
      tool: 'relaydepository',
      provider: 'LI.FI',
      quotedAt: 1_700_000_000_000,
    },
    tx: {
      kind: 'svm',
      serializedTransaction: Buffer.from(tx.serialize()).toString('base64'),
    },
    approvalAddress: null,
    fromToken: {
      address: '11111111111111111111111111111111',
      symbol: 'SOL',
      decimals: 9,
      native: true,
    },
    fromAmountRaw: 100_000_000n,
    ...over,
  }
}

function harness(over: Partial<FakeState> = {}) {
  const wallet = Keypair.generate()
  const address = wallet.publicKey.toBase58()
  const state: FakeState = {
    calls: [],
    keyFetchedAt: null,
    lookupResolves: true,
    simulateErr: null,
    preAccounts: new Map([
      [address, account({ lamports: 1_000_000_000, owner: SYSTEM_PROGRAM_ID })],
    ]),
    postAccounts: new Map([
      [
        address,
        account({
          lamports: 1_000_000_000 - 102_000_000,
          owner: SYSTEM_PROGRAM_ID,
        }),
      ],
    ]),
    ...over,
  }
  const getPrivateKey = async () => {
    state.keyFetchedAt = state.calls.length
    return bs58.encode(wallet.secretKey)
  }
  return { wallet, address, state, getPrivateKey }
}

describe('runSolanaBridgeTransfer', () => {
  it('signs and sends a transfer whose dry run adds up', async () => {
    const h = harness()
    const result = await runSolanaBridgeTransfer({
      route: route(buildTx({ payer: h.wallet.publicKey })),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(true)
    expect(result.sourceTxHash).toBe('signature-base58')
    expect(h.state.calls).toContain('simulateTransaction')
    expect(h.state.calls).toContain('sendRawTransaction')
  })

  it('fetches the key only after the dry run has passed', async () => {
    // The ordering IS the guarantee. A refusal that fires after the key was
    // fetched has already handed a compromised response the thing it wanted.
    const h = harness()
    await runSolanaBridgeTransfer({
      route: route(buildTx({ payer: h.wallet.publicKey })),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    const simulateIndex = h.state.calls.indexOf('simulateTransaction')
    expect(simulateIndex).toBeGreaterThanOrEqual(0)
    expect(h.state.keyFetchedAt).toBeGreaterThan(simulateIndex)
  })

  it('refuses a foreign fee payer without touching the network', async () => {
    const h = harness()
    const stranger = Keypair.generate()
    const result = await runSolanaBridgeTransfer({
      route: route(buildTx({ payer: stranger.publicKey })),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not your wallet')
    expect(h.state.calls).toEqual([])
    expect(h.state.keyFetchedAt).toBeNull()
  })

  it('refuses a co-signer who has not signed the transaction yet', async () => {
    const h = harness()
    const result = await runSolanaBridgeTransfer({
      route: route(
        buildTx({
          payer: h.wallet.publicKey,
          extraSigner: Keypair.generate().publicKey,
        }),
      ),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('half-built')
    expect(h.state.calls).toEqual([])
    expect(h.state.keyFetchedAt).toBeNull()
  })

  it('signs alongside a co-signer who already committed', async () => {
    // Exactly the Mayan shape: two required signers, theirs already filled in.
    const h = harness()
    const cosigner = Keypair.generate()
    const tx = buildTx({
      payer: h.wallet.publicKey,
      extraSigner: cosigner.publicKey,
    })
    tx.sign([cosigner])
    const result = await runSolanaBridgeTransfer({
      route: route(tx),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(true)
    expect(h.state.calls).toContain('sendRawTransaction')
  })

  it('refuses when the dry run fails, and says what the chain said', async () => {
    const h = harness({ simulateErr: { InstructionError: [1, 'Custom'] } })
    const result = await runSolanaBridgeTransfer({
      route: route(buildTx({ payer: h.wallet.publicKey })),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('failed a dry run')
    expect(result.error).toContain('insufficient')
    expect(h.state.calls).not.toContain('sendRawTransaction')
    expect(h.state.keyFetchedAt).toBeNull()
  })

  it('refuses when the dry run says the wallet loses too much', async () => {
    const h = harness()
    h.state.postAccounts.set(
      h.address,
      account({ lamports: 1, owner: SYSTEM_PROGRAM_ID }),
    )
    const result = await runSolanaBridgeTransfer({
      route: route(buildTx({ payer: h.wallet.publicKey })),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('lamports for a 100000000 transfer')
    expect(h.state.calls).not.toContain('sendRawTransaction')
    expect(h.state.keyFetchedAt).toBeNull()
  })

  it('refuses one of your token accounts under an unpinned token program', async () => {
    const h = harness()
    const ata = Keypair.generate().publicKey
    h.state.preAccounts.set(
      ata.toBase58(),
      account({
        lamports: 2_039_280,
        owner: MEMO_PROGRAM,
        data: tokenAccountBytes({
          mint: USDC_MINT,
          owner: h.address,
          amount: 5n,
        }),
      }),
    )
    const result = await runSolanaBridgeTransfer({
      route: route(buildTx({ payer: h.wallet.publicKey, writable: [ata] })),
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('unrecognised token program')
    expect(h.state.calls).not.toContain('simulateTransaction')
    expect(h.state.keyFetchedAt).toBeNull()
  })

  it('refuses a private key that derives to a different account', async () => {
    const h = harness()
    const stranger = Keypair.generate()
    const result = await runSolanaBridgeTransfer({
      route: route(buildTx({ payer: h.wallet.publicKey })),
      walletAddress: h.address,
      getPrivateKey: async () => bs58.encode(stranger.secretKey),
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('does not match wallet')
    expect(h.state.calls).not.toContain('sendRawTransaction')
  })

  it('refuses an EVM route handed to the Solana executor', async () => {
    const h = harness()
    const evmRoute = route(buildTx({ payer: h.wallet.publicKey }), {
      tx: { kind: 'evm', to: '0x1', data: '0x2', value: null, chainId: 1 },
    })
    const result = await runSolanaBridgeTransfer({
      route: evmRoute,
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('not a Solana transfer')
  })

  it('refuses an unparseable transaction', async () => {
    const h = harness()
    const bad = route(buildTx({ payer: h.wallet.publicKey }), {
      tx: { kind: 'svm', serializedTransaction: 'AAAA' },
    })
    const result = await runSolanaBridgeTransfer({
      route: bad,
      walletAddress: h.address,
      getPrivateKey: h.getPrivateKey,
      rpcUrl: 'http://fake',
      rpc: fakeRpc(h.state),
    })
    expect(result.success).toBe(false)
    expect(result.error).toContain('unparseable')
    expect(h.state.keyFetchedAt).toBeNull()
  })
})
