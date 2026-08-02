// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Testnet verification of the DEX connectors' wallet machinery — OPT-IN,
 * network-bound. Skipped unless `PAIRLENS_LIVE_TESTNET=1`. Run with:
 *
 *   bun run test:dex:testnet
 *
 * Scope (and honest limits): Jupiter, KyberSwap, and GeckoTerminal have no
 * testnet deployments, so the aggregator round-trips themselves can only run
 * on mainnet. What testnets CAN prove — against real nodes, with zero real
 * funds at risk — is the entire wallet-side layer those round-trips depend
 * on:
 *
 *  - Solana devnet: our base64-transaction signing path produces signatures
 *    a REAL validator accepts (`simulateTransaction` with `sigVerify: true`
 *    runs server-side signature verification without needing a funded
 *    account), plus the SPL balance machinery against the devnet RPC.
 *  - Ethereum Sepolia: the viem client stack — Multicall3 balance scans,
 *    ERC-20 reads with our ABI — against a real chain.
 *  - Funded end-to-end paths (real send + confirm, ERC-20 approve) run when
 *    `PAIRLENS_TESTNET_SOLANA_KEY` (base58, devnet SOL) /
 *    `PAIRLENS_TESTNET_EVM_KEY` (hex, Sepolia ETH) are provided; without
 *    keys an ephemeral devnet airdrop is attempted and the check reports
 *    itself skipped if the faucet is dry.
 *
 * NOTE: `bun test` runs with NODE_ENV=test and therefore does NOT auto-load
 * `.env.local` — export the two keys in your shell (or pass them inline)
 * before `bun run test:dex:testnet`. Verified funded on Sepolia 2026-07-24:
 * self-transfer + USDC approve mined (nonce 2, allowance readback exact).
 */

import { describe, expect, it } from 'bun:test'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js'
import bs58 from 'bs58'

import { signBase64Transaction } from '../../jupiter-dex-connector/tx-signer'
import { fetchBalances as fetchSolanaBalances } from '../../jupiter-dex-connector/balance-client'
import { fetchBalances as fetchEvmBalances } from '../../evm-dex-connector/balance-client'
import { ERC20_ABI } from '../../evm-dex-connector/swap-executor'
import { getViemChain } from '../../evm-dex-connector/chains'
import type { EvmChainConfig } from '../../evm-dex-connector/chains'

const LIVE = process.env['PAIRLENS_LIVE_TESTNET'] === '1'

const DEVNET_RPC = 'https://api.devnet.solana.com'
const SEPOLIA_RPC = 'https://ethereum-sepolia-rpc.publicnode.com'

/** Sepolia stand-in chain config — same shape the EVM connector runs on. */
const SEPOLIA_CHAIN: EvmChainConfig = {
  market: 'sepolia',
  displayName: 'Sepolia',
  abbr: 'SEP',
  chainId: 11155111,
  kyberSlug: '', // no aggregator on testnets
  geckoNetwork: '', // no DEX data on testnets
  iconUrl: '',
  rpcUrl: SEPOLIA_RPC,
  nativeSymbol: 'ETH',
  // Canonical Sepolia WETH (Uniswap deployment)
  wrappedNativeAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  // Circle's official Sepolia USDC
  quote: {
    symbol: 'USDC',
    address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
    decimals: 6,
  },
}

/** Build the unsigned base64 v0 transaction shape the Jupiter APIs return. */
function buildUnsignedTransfer(
  payer: Keypair,
  recentBlockhash: string,
  lamports: number,
): string {
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: payer.publicKey,
        lamports,
      }),
    ],
  }).compileToV0Message()
  return Buffer.from(new VersionedTransaction(message).serialize()).toString(
    'base64',
  )
}

describe.skipIf(!LIVE)('testnet machinery verification', () => {
  // ── Solana devnet ───────────────────────────────────────────────────
  describe('Solana devnet', () => {
    it('devnet accepts our signatures (simulateTransaction sigVerify)', async () => {
      const conn = new Connection(DEVNET_RPC, 'confirmed')
      const payer = Keypair.generate()
      const { blockhash } = await conn.getLatestBlockhash()

      const unsigned = buildUnsignedTransfer(payer, blockhash, 1_000)
      const { tx } = await signBase64Transaction(
        unsigned,
        bs58.encode(payer.secretKey),
      )

      // sigVerify: true makes the validator verify the ed25519 signature
      // server-side BEFORE execution. A bad signature simulates to
      // err "SignatureFailure"; ours must get PAST that to the execution
      // stage, where the unfunded fee payer yields "AccountNotFound" —
      // proof a real validator accepted the signature.
      const sim = await conn.simulateTransaction(tx, { sigVerify: true })
      expect(JSON.stringify(sim.value.err)).not.toContain('SignatureFailure')

      // Negative control: corrupt one signature byte → the validator must
      // now fail it at signature verification.
      tx.signatures[0][0] ^= 0xff
      const bad = await conn.simulateTransaction(tx, { sigVerify: true })
      expect(JSON.stringify(bad.value.err)).toContain('SignatureFailure')
    }, 30_000)

    it('SPL balance machinery runs against the devnet RPC', async () => {
      const address = Keypair.generate().publicKey.toBase58()
      const balances = await fetchSolanaBalances(address, DEVNET_RPC)
      // Fresh account: native SOL entry present at zero, no token accounts
      expect(balances.length).toBeGreaterThanOrEqual(1)
      expect(balances[0].currency).toBe('SOL')
      expect(Number(balances[0].total)).toBe(0)
    }, 30_000)

    it('funded send + confirm end-to-end (key or faucet)', async () => {
      const conn = new Connection(DEVNET_RPC, 'confirmed')

      // Prefer an operator-provided funded key; fall back to the faucet
      const envKey = process.env['PAIRLENS_TESTNET_SOLANA_KEY']
      let payer: Keypair
      if (envKey) {
        payer = Keypair.fromSecretKey(bs58.decode(envKey))
      } else {
        payer = Keypair.generate()
        try {
          const sig = await conn.requestAirdrop(
            payer.publicKey,
            LAMPORTS_PER_SOL / 2,
          )
          const bh = await conn.getLatestBlockhash()
          await conn.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
        } catch {
          console.warn(
            '  ⚠ devnet faucet unavailable and no PAIRLENS_TESTNET_SOLANA_KEY — funded e2e skipped',
          )
          return
        }
      }

      const balance = await conn.getBalance(payer.publicKey)
      if (balance < 10_000) {
        console.warn('  ⚠ devnet key has no SOL — funded e2e skipped')
        return
      }

      // The exact sequence executeSwap performs after the Jupiter API:
      // sign → sendRawTransaction → confirmTransaction
      const { blockhash, lastValidBlockHeight } =
        await conn.getLatestBlockhash()
      const unsigned = buildUnsignedTransfer(payer, blockhash, 1_000)
      const { tx } = await signBase64Transaction(
        unsigned,
        bs58.encode(payer.secretKey),
      )
      const signature = await conn.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      })
      const confirmation = await conn.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      )
      expect(confirmation.value.err).toBeNull()
    }, 90_000)
  })

  // ── Ethereum Sepolia ────────────────────────────────────────────────
  describe('Ethereum Sepolia', () => {
    it('balance machinery (Multicall3 + ERC-20 ABI) runs against Sepolia', async () => {
      const { privateKeyToAccount } = await import('viem/accounts')
      const probe = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      ).address

      const balances = await fetchEvmBalances(SEPOLIA_CHAIN, probe, SEPOLIA_RPC)
      // Native entry always first; the quote token (USDC) is always
      // scanned even at zero balance
      expect(balances.length).toBeGreaterThanOrEqual(2)
      expect(balances[0].currency).toBe('ETH')
      expect(balances.some((b) => b.currency === 'USDC')).toBe(true)
      for (const b of balances) {
        expect(Number.isFinite(Number(b.total))).toBe(true)
      }
    }, 30_000)

    it('ERC-20 allowance read (the approve-gate check) against Sepolia USDC', async () => {
      const { createPublicClient, http } = await import('viem')
      const client = createPublicClient({
        chain: await getViemChain('sepolia'),
        transport: http(SEPOLIA_RPC),
      })
      const allowance = await client.readContract({
        address: SEPOLIA_CHAIN.quote.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [
          '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        ],
      })
      expect(allowance).toBe(0n)
    }, 30_000)

    it('funded self-transfer + ERC-20 approve end-to-end (key required)', async () => {
      const envKey = process.env['PAIRLENS_TESTNET_EVM_KEY']
      if (!envKey) {
        console.warn(
          '  ⚠ no PAIRLENS_TESTNET_EVM_KEY (Sepolia ETH) — funded e2e skipped',
        )
        return
      }

      const { createPublicClient, createWalletClient, http } =
        await import('viem')
      const { privateKeyToAccount } = await import('viem/accounts')
      const account = privateKeyToAccount(
        (envKey.startsWith('0x') ? envKey : `0x${envKey}`) as `0x${string}`,
      )
      const chain = await getViemChain('sepolia')
      const transport = http(SEPOLIA_RPC)
      const publicClient = createPublicClient({ chain, transport })
      const walletClient = createWalletClient({ account, chain, transport })

      // The exact sequence executeSwap performs: sendTransaction → receipt
      const hash = await walletClient.sendTransaction({
        to: account.address,
        value: 0n,
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      expect(receipt.status).toBe('success')

      // The exact approve gate the swap/limit-order paths perform
      const approveHash = await walletClient.writeContract({
        address: SEPOLIA_CHAIN.quote.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: ['0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 1n],
      })
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveHash,
      })
      expect(approveReceipt.status).toBe('success')

      const allowance = await publicClient.readContract({
        address: SEPOLIA_CHAIN.quote.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account.address, '0x70997970C51812dc3A010C7d01b50e0d17dc79C8'],
      })
      expect(allowance).toBe(1n)
    }, 120_000)
  })
})
