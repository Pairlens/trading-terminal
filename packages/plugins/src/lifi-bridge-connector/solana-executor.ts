// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Signing a bridge transfer that leaves Solana, fail-closed at every step.
 *
 * The EVM path proves a transfer is safe by pinning WHO it talks to: the target
 * and the allowance spender must both be the LiFiDiamond, and `value` must be
 * exactly the amount. That works because an EVM transaction has one call, one
 * value and one recipient to check.
 *
 * A Solana transaction has none of that shape. It arrives as an opaque blob of
 * instructions across programs that change per bridge tool, so a program-id
 * allowlist would either be permanently out of date or so wide it proved
 * nothing. So this path proves the transfer safe by what it DOES instead of by
 * whom it calls, and it does that by running the transaction before signing it:
 *
 *   1. The transaction deserializes, and its fee payer is the wallet slot's own
 *      address. The fee payer is the account our signature authorizes.
 *   2. The wallet is the ONLY party still to commit: its own signature slot is
 *      empty and every other required signer has already signed these exact
 *      bytes. Mayan, which prices most Solana legs, returns a two-signer
 *      transaction with its own half already filled in, so "exactly one
 *      signature" would refuse most real routes; "nobody else is still free to
 *      change this" is the guarantee that was actually wanted.
 *   3. Every writable account the transaction touches is read from chain first.
 *      One that holds the wallet's pubkey in a token account's owner slot but
 *      lives under a token program this connector does not pin is a refusal, not
 *      something to skip: an account we cannot decode is an account we cannot
 *      prove was left alone.
 *   4. The transaction is SIMULATED against the live cluster, and the simulation
 *      is mandatory. A failing simulation is a refusal that carries the log tail
 *      so the pane can say why.
 *   5. The simulated post-state is compared with the pre-state, and the wallet
 *      must come out having spent exactly what it agreed to: for an SPL send,
 *      the source mint falls by exactly `fromAmountRaw`; for a native send, SOL
 *      plus wrapped SOL together fall by no more than the amount plus a bounded
 *      fee headroom. No other asset of the wallet's may fall at all, no token
 *      account may change owner, and none may come out with a delegate or a
 *      close authority it did not have — the Solana shape of the standing claim
 *      an unlimited ERC-20 approval would leave behind.
 *   6. Only then is the private key fetched, and the pubkey derived from it must
 *      equal the slot address before it signs anything.
 *
 * Wrapped SOL is counted with native SOL on a native send for a reason found by
 * running real routes: Mayan's Solana leg closes the wallet's wrapped-SOL
 * account, so the wallet's raw lamports go UP while it is spending. Checking
 * lamports alone would have called that a deposit.
 *
 * What is NOT proven: simulation runs against the bank as it is now, and a
 * transaction that lands in a different state can behave differently. The bound
 * is on the transfer's own accounts, not on the whole cluster.
 */
import { isNativeToken } from './quote-client'
import type { LifiRoute } from './quote-client'
import type { BridgeExecutionResult } from '@pairlens/shared/instrument-types'
import type {
  AddressLookupTableAccount,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js'

/**
 * Token programs whose account layout this connector decodes. A wallet-owned
 * token account under anything else is a refusal: the first 165 bytes of SPL
 * Token and Token-2022 accounts agree, and nothing else is guaranteed to.
 */
export const PINNED_TOKEN_PROGRAMS: ReadonlyArray<string> = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
]

/** The program a plain wallet account belongs to. */
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111'

/** Native SOL wrapped as an SPL token. Counted with SOL on a native send. */
export const WRAPPED_SOL_MINT = 'So11111111111111111111111111111111111111112'

/**
 * How many lamports a transfer may consume beyond the amount being sent.
 *
 * A real send spends a base fee, a priority bid and sometimes rent for an
 * associated token account it has to create (about 0.00204 SOL each). Measured
 * routes came in between 0.0021 and 0.0025 SOL. 0.05 leaves room for a busy
 * block and several rent-exempt creations while still being a hard ceiling:
 * whatever the transaction turns out to do, it cannot take more than this out
 * of the wallet on top of the quoted amount.
 */
export const LAMPORT_HEADROOM = 50_000_000n

/**
 * How many of the wallet's own accounts a transfer may touch.
 *
 * A bridge send reaches one or two. A transaction rewriting thirty of them is
 * not a bridge send, and refusing beats simulating a sweep and hoping the delta
 * rules catch every leg of it.
 */
export const MAX_WATCHED_ACCOUNTS = 32

/** Minimum length of an SPL token account. The prefix both programs share. */
export const SPL_TOKEN_ACCOUNT_MIN_LEN = 165

function hex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0')
  return out
}

/** The fields of an SPL token account this connector reasons about. */
export type TokenAccountView = {
  mintHex: string
  ownerHex: string
  amount: bigint
  delegateHex: string | null
  closeAuthorityHex: string | null
}

/**
 * Decode the shared prefix of an SPL Token / Token-2022 account.
 *
 * Fixed offsets, hand-rolled, for the reason the Solana LP layouts are: pulling
 * in an SPL SDK to read four fields costs a megabyte and a dependency that can
 * change its mind about the layout. Offsets: mint 0, owner 32, amount 64,
 * delegate option 72 with the pubkey at 76, close-authority option 129 with the
 * pubkey at 133.
 */
export function decodeTokenAccount(
  data: Uint8Array | null | undefined,
): TokenAccountView | null {
  if (!data || data.length < SPL_TOKEN_ACCOUNT_MIN_LEN) return null
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const delegateOption = view.getUint32(72, true)
  const closeAuthorityOption = view.getUint32(129, true)
  return {
    mintHex: hex(data.subarray(0, 32)),
    ownerHex: hex(data.subarray(32, 64)),
    amount: view.getBigUint64(64, true),
    delegateHex: delegateOption === 1 ? hex(data.subarray(76, 108)) : null,
    closeAuthorityHex:
      closeAuthorityOption === 1 ? hex(data.subarray(133, 165)) : null,
  }
}

/** Everything about the wallet that a transfer is allowed to change. */
export type WalletStateSnapshot = {
  /** The wallet's own system account. */
  lamports: bigint
  /** Program owning that account. Null when the account does not exist. */
  nativeProgram: string | null
  /** Wallet-owned token accounts, keyed by their base58 address. */
  tokens: Map<string, TokenAccountView>
}

export type DeltaCheck = { ok: true } | { ok: false; error: string }

function sumMint(snapshot: WalletStateSnapshot, mintHex: string): bigint {
  let total = 0n
  for (const token of snapshot.tokens.values()) {
    if (token.mintHex === mintHex) total += token.amount
  }
  return total
}

function mintsIn(...snapshots: Array<WalletStateSnapshot>): Set<string> {
  const mints = new Set<string>()
  for (const snapshot of snapshots) {
    for (const token of snapshot.tokens.values()) mints.add(token.mintHex)
  }
  return mints
}

/**
 * Does the simulated outcome match what the user agreed to?
 *
 * Pure over two snapshots, and the piece worth testing hardest: every rule in
 * here is one whose failure costs money rather than a rerender.
 */
export function checkSimulatedDeltas(input: {
  pre: WalletStateSnapshot
  post: WalletStateSnapshot
  walletOwnerHex: string
  isNativeSend: boolean
  /** Raw source-token units the user agreed to send. */
  fromAmountRaw: bigint
  /** Mint being sent, hex. Null on a native send. */
  sourceMintHex: string | null
  wrappedSolMintHex: string
  systemProgramId: string
  lamportHeadroom?: bigint
}): DeltaCheck {
  const {
    pre,
    post,
    walletOwnerHex,
    isNativeSend,
    fromAmountRaw,
    sourceMintHex,
    wrappedSolMintHex,
    systemProgramId,
    lamportHeadroom = LAMPORT_HEADROOM,
  } = input

  // Custody first: an account that changed hands, or picked up somebody else's
  // standing claim, is a loss even when the balance still looks right.
  for (const [address, after] of post.tokens) {
    const before = pre.tokens.get(address)
    if (after.ownerHex !== walletOwnerHex) {
      return {
        ok: false,
        error: `The route would move your token account ${address} to another owner. Nothing was sent.`,
      }
    }
    if (
      after.delegateHex !== null &&
      after.delegateHex !== before?.delegateHex
    ) {
      return {
        ok: false,
        error: `The route would grant a spending delegate over your token account ${address}. Nothing was sent.`,
      }
    }
    if (
      after.closeAuthorityHex !== null &&
      after.closeAuthorityHex !== before?.closeAuthorityHex
    ) {
      return {
        ok: false,
        error: `The route would grant a close authority over your token account ${address}. Nothing was sent.`,
      }
    }
  }
  if (post.nativeProgram !== null && post.nativeProgram !== systemProgramId) {
    return {
      ok: false,
      error:
        'The route would reassign your wallet account to another program. Nothing was sent.',
    }
  }

  // Per-mint: only the asset being sent may fall, and on an SPL send it must
  // fall by exactly the quoted amount rather than merely "not too much".
  for (const mint of mintsIn(pre, post)) {
    const spent = sumMint(pre, mint) - sumMint(post, mint)
    const isSourceMint = !isNativeSend && mint === sourceMintHex
    const countedWithNative = isNativeSend && mint === wrappedSolMintHex
    if (isSourceMint) {
      if (spent !== fromAmountRaw) {
        return {
          ok: false,
          error: `The route would move ${spent} units of the asset for a ${fromAmountRaw} transfer. Nothing was sent.`,
        }
      }
      continue
    }
    if (countedWithNative) continue
    if (spent > 0n) {
      return {
        ok: false,
        error:
          'The route would spend an asset this transfer is not for. Nothing was sent.',
      }
    }
  }

  if (isNativeSend) {
    // SOL and wrapped SOL as one balance: a route that unwraps to fund the send
    // makes raw lamports rise while the wallet is spending.
    const combinedPre = pre.lamports + sumMint(pre, wrappedSolMintHex)
    const combinedPost = post.lamports + sumMint(post, wrappedSolMintHex)
    const spent = combinedPre - combinedPost
    if (spent > fromAmountRaw + lamportHeadroom) {
      return {
        ok: false,
        error: `The route would take ${spent} lamports for a ${fromAmountRaw} transfer. Nothing was sent.`,
      }
    }
    return { ok: true }
  }

  const lamportsSpent = pre.lamports - post.lamports
  if (lamportsSpent > lamportHeadroom) {
    return {
      ok: false,
      error: `The route would take ${lamportsSpent} lamports in fees for a token transfer. Nothing was sent.`,
    }
  }
  return { ok: true }
}

export type SolanaTxShape = {
  numRequiredSignatures: number
  /** Fee payer, base58. The account our signature is for. */
  feePayer: string | null
  /** Required signers in order, and whether each already carries a signature. */
  signers: Array<{ address: string | null; signed: boolean }>
}

/**
 * Everything decidable about the transaction without a network: who pays, and
 * who else has to sign.
 *
 * The rule is NOT "exactly one signature". Real routes need more than one, and
 * refusing them outright would have cut Solana support down to the tools that
 * happen not to: Mayan, which prices most Solana legs, hands back a transaction
 * with two required signers where the second is an account of its own.
 *
 * The rule that matters is that WE are the only party still to commit. The
 * wallet must be the fee payer, its own signature slot must be empty (a slot
 * already filled in our name means somebody signed as us), and every other
 * required signer must ALREADY carry a signature over these exact bytes. A
 * co-signer who has signed is a co-signer who is committed to this transaction
 * and cannot swap it afterwards; a co-signer who has not is the case worth
 * refusing, because the transaction is not finished and we would be signing a
 * blank half of it.
 */
export function validateSolanaTransactionShape(input: {
  shape: SolanaTxShape
  walletAddress: string
}): DeltaCheck {
  const { shape, walletAddress } = input
  if (shape.feePayer === null) {
    return {
      ok: false,
      error:
        'The route returned a transaction with no fee payer. Refusing to sign.',
    }
  }
  if (shape.feePayer !== walletAddress) {
    return {
      ok: false,
      error: `The route's transaction is paid for by ${shape.feePayer}, not your wallet. Refusing to sign.`,
    }
  }
  if (shape.signers.length !== shape.numRequiredSignatures) {
    return {
      ok: false,
      error:
        'The route returned a transaction whose signature list does not match its header. Refusing to sign.',
    }
  }
  if (shape.signers[0]?.signed) {
    return {
      ok: false,
      error:
        'The route returned a transaction already signed in your name. Refusing to sign.',
    }
  }
  for (let i = 1; i < shape.signers.length; i += 1) {
    const signer = shape.signers[i]
    if (signer.address === walletAddress) {
      return {
        ok: false,
        error: 'The route wants your signature twice over. Refusing to sign.',
      }
    }
    if (!signer.signed) {
      return {
        ok: false,
        error: `The route's transaction still needs a signature from ${signer.address ?? 'an unknown account'}. Refusing to sign a half-built transaction.`,
      }
    }
  }
  return { ok: true }
}

/** The last few simulation log lines, which is where the reason usually is. */
export function simulationFailureMessage(
  err: unknown,
  logs: Array<string> | null | undefined,
): string {
  const tail = (logs ?? []).slice(-3).join(' | ')
  const reason = typeof err === 'string' ? err : JSON.stringify(err)
  return `The transfer failed a dry run on Solana (${reason})${tail ? `: ${tail}` : ''}. Nothing was sent.`
}

/** An account as the RPC reports it. Structural, so a fake is a plain object. */
export type RpcAccountInfo = {
  lamports: number
  data: Uint8Array
  owner: { toBase58: () => string }
}

/** The simulated account state, in either encoding web3.js may hand back. */
export type RpcSimulatedAccount = {
  lamports: number
  owner: unknown
  data: Array<string> | Uint8Array
} | null

/**
 * The six RPC calls this path makes, named as an interface.
 *
 * A seam rather than a `Connection` because the interesting failures here are
 * RPC answers: a lookup table that will not resolve, a simulation that reverts,
 * a post-state whose balances do not add up. Those are the cases worth a test,
 * and none of them is reachable by pointing at a real node and hoping.
 */
export type SolanaRpcFacade = {
  getAddressLookupTable: (
    key: PublicKey,
  ) => Promise<{ value: AddressLookupTableAccount | null }>
  getMultipleAccountsInfo: (
    keys: Array<PublicKey>,
  ) => Promise<Array<RpcAccountInfo | null>>
  simulateTransaction: (
    tx: VersionedTransaction,
    config: {
      sigVerify: boolean
      replaceRecentBlockhash: boolean
      commitment: 'confirmed'
      accounts: { encoding: 'base64'; addresses: Array<string> }
    },
  ) => Promise<{
    value: {
      err: unknown
      logs?: Array<string> | null
      accounts?: Array<RpcSimulatedAccount> | null
    }
  }>
  sendRawTransaction: (
    raw: Uint8Array,
    opts: { skipPreflight: boolean; maxRetries: number },
  ) => Promise<string>
  getLatestBlockhash: () => Promise<{
    blockhash: string
    lastValidBlockHeight: number
  }>
  confirmTransaction: (
    strategy: {
      signature: string
      blockhash: string
      lastValidBlockHeight: number
    },
    commitment: 'confirmed',
  ) => Promise<{ value: { err: unknown } }>
}

export type ExecuteSolanaBridgeOptions = {
  route: LifiRoute
  walletAddress: string
  getPrivateKey: () => Promise<string | null>
  rpcUrl: string
}

/**
 * Dry-run, then sign, send and confirm.
 *
 * Builds the RPC facade from a real connection and hands off to
 * `runSolanaBridgeTransfer`, which holds every rule.
 */
export async function executeSolanaBridgeTransfer(
  opts: ExecuteSolanaBridgeOptions,
): Promise<BridgeExecutionResult> {
  try {
    // Dynamic import: web3.js is only pulled in on the first Solana transfer.
    const { Connection } = await import('@solana/web3.js')
    const connection = new Connection(opts.rpcUrl, 'confirmed')
    return await runSolanaBridgeTransfer({
      ...opts,
      rpc: {
        getAddressLookupTable: (key) => connection.getAddressLookupTable(key),
        getMultipleAccountsInfo: (keys) =>
          connection.getMultipleAccountsInfo(keys),
        simulateTransaction: (tx, config) =>
          connection.simulateTransaction(tx, config),
        sendRawTransaction: (raw, o) => connection.sendRawTransaction(raw, o),
        getLatestBlockhash: () => connection.getLatestBlockhash(),
        confirmTransaction: (strategy, commitment) =>
          connection.confirmTransaction(strategy, commitment),
      },
    })
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Bridge transfer failed',
    }
  }
}

/**
 * Every rule between a quoted Solana route and a signature.
 *
 * Returns rather than throws, like every other `trading:*` path: the capability
 * is `sideEffect: true`, so the plugin manager never retries it elsewhere, and a
 * thrown error would lose the distinction between "nothing was sent" and "sent,
 * and then something went wrong".
 */
export async function runSolanaBridgeTransfer(
  opts: ExecuteSolanaBridgeOptions & { rpc: SolanaRpcFacade },
): Promise<BridgeExecutionResult> {
  const { route, walletAddress, getPrivateKey, rpc } = opts
  if (route.tx.kind !== 'svm') {
    return {
      success: false,
      error: 'This route is not a Solana transfer. Refusing to sign.',
    }
  }

  try {
    const { PublicKey, VersionedTransaction } = await import('@solana/web3.js')

    let tx
    try {
      tx = VersionedTransaction.deserialize(
        Buffer.from(route.tx.serializedTransaction, 'base64'),
      )
    } catch {
      return {
        success: false,
        error:
          'The route returned an unparseable Solana transaction. Refusing to sign.',
      }
    }

    const feePayerKey = tx.message.staticAccountKeys[0] ?? null
    const shapeCheck = validateSolanaTransactionShape({
      shape: {
        numRequiredSignatures: tx.message.header.numRequiredSignatures,
        feePayer: feePayerKey ? feePayerKey.toBase58() : null,
        signers: tx.signatures.map((signature, index) => ({
          address: tx.message.staticAccountKeys[index]?.toBase58() ?? null,
          // An all-zero slot is web3.js's placeholder for "not signed yet".
          signed: !signature.every((byte) => byte === 0),
        })),
      },
      walletAddress,
    })
    if (!shapeCheck.ok) return { success: false, error: shapeCheck.error }

    // Resolve every account the transaction can write to, address tables
    // included. An unresolvable table is a refusal: an account list we cannot
    // enumerate is a transaction we cannot bound.
    const lookupAccounts = []
    for (const lookup of tx.message.addressTableLookups) {
      const table = await rpc.getAddressLookupTable(lookup.accountKey)
      if (!table.value) {
        return {
          success: false,
          error: `The route uses an address table (${lookup.accountKey.toBase58()}) this node cannot read. Refusing to sign.`,
        }
      }
      lookupAccounts.push(table.value)
    }
    const keys = tx.message.getAccountKeys({
      addressLookupTableAccounts: lookupAccounts,
    })
    const writable: Array<string> = []
    for (let i = 0; i < keys.length; i += 1) {
      if (!tx.message.isAccountWritable(i)) continue
      const key = keys.get(i)
      if (key) writable.push(key.toBase58())
    }
    const writableUnique = [...new Set(writable)]

    // Pre-state, from chain, before anything is signed.
    const walletKey = new PublicKey(walletAddress)
    const walletOwnerHex = hex(walletKey.toBytes())
    const preInfos = []
    for (let i = 0; i < writableUnique.length; i += 100) {
      const chunk = writableUnique.slice(i, i + 100)
      preInfos.push(
        ...(await rpc.getMultipleAccountsInfo(
          chunk.map((a) => new PublicKey(a)),
        )),
      )
    }

    const pre: WalletStateSnapshot = {
      lamports: 0n,
      nativeProgram: null,
      tokens: new Map(),
    }
    const watched: Array<string> = []
    for (let i = 0; i < writableUnique.length; i += 1) {
      const address = writableUnique[i]
      const info = preInfos[i]
      if (address === walletAddress) {
        pre.lamports = BigInt(info?.lamports ?? 0)
        pre.nativeProgram = info ? info.owner.toBase58() : null
        watched.push(address)
        continue
      }
      if (!info) continue
      const decoded = decodeTokenAccount(info.data)
      if (!decoded || decoded.ownerHex !== walletOwnerHex) continue
      const program = info.owner.toBase58()
      if (!PINNED_TOKEN_PROGRAMS.includes(program)) {
        // Claims to be ours, lives under a program whose layout we do not pin.
        // We cannot prove what happens to it, so we do not sign.
        return {
          success: false,
          error: `The route touches your account ${address} under an unrecognised token program (${program}). Refusing to sign.`,
        }
      }
      pre.tokens.set(address, decoded)
      watched.push(address)
    }
    if (watched.length > MAX_WATCHED_ACCOUNTS) {
      return {
        success: false,
        error: `The route writes to ${watched.length} of your accounts. Refusing to sign a transfer that broad.`,
      }
    }

    // Mandatory dry run. `sigVerify: false` is what makes it possible before the
    // key exists; `replaceRecentBlockhash: true` keeps a quote that took a
    // moment to confirm from failing on an expired blockhash during the check.
    const sim = await rpc.simulateTransaction(tx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: 'confirmed',
      accounts: { encoding: 'base64', addresses: watched },
    })
    if (sim.value.err) {
      return {
        success: false,
        error: simulationFailureMessage(sim.value.err, sim.value.logs),
      }
    }

    const post: WalletStateSnapshot = {
      lamports: 0n,
      nativeProgram: null,
      tokens: new Map(),
    }
    const simulated = sim.value.accounts ?? []
    if (simulated.length !== watched.length) {
      return {
        success: false,
        error:
          'The dry run did not report your accounts back. Refusing to sign.',
      }
    }
    for (let i = 0; i < watched.length; i += 1) {
      const address = watched[i]
      const account = simulated[i]
      if (address === walletAddress) {
        // A null account here means the simulation closed it, which is a zero
        // balance rather than a missing reading.
        post.lamports = BigInt(account?.lamports ?? 0)
        post.nativeProgram = account ? String(account.owner) : null
        continue
      }
      if (!account) continue
      const raw = Array.isArray(account.data)
        ? Buffer.from(account.data[0], 'base64')
        : account.data
      const decoded = decodeTokenAccount(raw)
      if (decoded) post.tokens.set(address, decoded)
    }

    const isNativeSend = isNativeToken(route.fromToken)
    const deltas = checkSimulatedDeltas({
      pre,
      post,
      walletOwnerHex,
      isNativeSend,
      fromAmountRaw: route.fromAmountRaw,
      sourceMintHex: isNativeSend
        ? null
        : hex(new PublicKey(route.fromToken.address).toBytes()),
      wrappedSolMintHex: hex(new PublicKey(WRAPPED_SOL_MINT).toBytes()),
      systemProgramId: SYSTEM_PROGRAM_ID,
    })
    if (!deltas.ok) return { success: false, error: deltas.error }

    // Every refusal above ran without the key. Only now does it exist.
    const privateKey = await getPrivateKey()
    if (!privateKey) {
      return { success: false, error: 'Wallet private key not found' }
    }

    const { Keypair } = await import('@solana/web3.js')
    const bs58 = await import('bs58')
    let derived: string
    try {
      derived = Keypair.fromSecretKey(
        bs58.default.decode(privateKey),
      ).publicKey.toBase58()
    } catch {
      return { success: false, error: 'Wallet private key is unreadable' }
    }
    if (derived !== walletAddress) {
      return { success: false, error: 'Private key does not match wallet' }
    }

    const { signBase64Transaction } =
      await import('../jupiter-dex-connector/tx-signer')
    const signed = await signBase64Transaction(
      route.tx.serializedTransaction,
      privateKey,
    )

    const signature = await rpc.sendRawTransaction(signed.tx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    })
    const latest = await rpc.getLatestBlockhash()
    const confirmation = await rpc.confirmTransaction(
      {
        signature,
        blockhash: latest.blockhash,
        lastValidBlockHeight: latest.lastValidBlockHeight,
      },
      'confirmed',
    )
    if (confirmation.value.err) {
      // The signature is kept: the transaction exists on chain and the user has
      // to be able to look it up, whatever it did.
      return {
        success: false,
        error: `The transfer failed on Solana (tx ${signature})`,
      }
    }

    return { success: true, sourceTxHash: signature, quote: route.quote }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Bridge transfer failed',
    }
  }
}
