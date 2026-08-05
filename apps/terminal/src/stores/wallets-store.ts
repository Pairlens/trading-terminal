// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type { WalletChain } from '@pairlens/market-engine/adapter'
import { deleteCredential, getCredential, saveCredential } from '@/lib/keychain'
import i18n from '@/lib/i18n'
import { isVaultSealed } from '@/lib/security/vault/vault-errors'
import { assertCanAddCredential } from '@/lib/security/vault/vault-policy'

export type CryptoWallet = {
  id: string
  chain: WalletChain
  address: string
  label: string
  createdAt: number
  lastActivityAt?: number
}

/**
 * The chains you can add a wallet for, and what each one asks you to paste.
 *
 * Every translated label is a getter, not a value. This is a module-level
 * const read by four components, so a plain `i18n.t(...)` would resolve once
 * at import — with whatever language was active then — and go stale the
 * moment someone switches language in Settings. A getter re-resolves on each
 * read, which costs a catalog lookup in a form nobody renders in a loop.
 *
 * Chain names themselves (Solana, Bitcoin) are proper nouns and stay put;
 * "Ethereum / EVM" is translated because the "/ EVM" half is a description.
 */
export const WALLET_SCHEMAS: Record<
  WalletChain,
  {
    label: string
    fields: Array<{
      key: string
      label: string
      type: 'text' | 'secret'
      required: boolean
    }>
  }
> = {
  solana: {
    label: 'Solana',
    fields: [
      {
        key: 'privateKey',
        get label() {
          return i18n.t(
            'accounts.walletChains.solana.fields.privateKey.label',
            {
              defaultValue: 'Private Key (base58)',
            },
          )
        },
        type: 'secret',
        required: true,
      },
    ],
  },
  ethereum: {
    get label() {
      return i18n.t('accounts.walletChains.ethereum.label', {
        defaultValue: 'Ethereum / EVM',
      })
    },
    fields: [
      {
        key: 'privateKey',
        get label() {
          return i18n.t(
            'accounts.walletChains.ethereum.fields.privateKey.label',
            { defaultValue: 'Private Key (hex)' },
          )
        },
        type: 'secret',
        required: true,
      },
    ],
  },
  bitcoin: {
    label: 'Bitcoin',
    fields: [
      {
        key: 'privateKey',
        get label() {
          return i18n.t(
            'accounts.walletChains.bitcoin.fields.privateKey.label',
            { defaultValue: 'Private Key (WIF)' },
          )
        },
        type: 'secret',
        required: true,
      },
    ],
  },
}

/** Keychain slot listing every stored wallet id. */
export const WALLETS_INDEX_KEY = 'pairlens:wallets-index'

/** Same three-way distinction as the credentials store — see the note there. */
export type WalletsStatus = 'idle' | 'loading' | 'ready' | 'sealed' | 'error'

type WalletsState = {
  wallets: Array<CryptoWallet>
  /** Settled, not "empty". Read `status` to tell those apart. */
  loaded: boolean
  status: WalletsStatus
  sealed: boolean
  load: () => Promise<void>
  reload: () => Promise<void>
  addWallet: (
    wallet: Omit<CryptoWallet, 'id' | 'createdAt'>,
    privateKey: string,
  ) => Promise<void>
  removeWallet: (id: string) => Promise<void>
  getWalletsForChain: (chain: WalletChain) => Array<CryptoWallet>
  getPrivateKey: (id: string) => Promise<string | null>
  touchWallet: (id: string) => Promise<void>
}

function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Derive a Solana public address from a base58-encoded private key.
 * Dynamically imports @solana/web3.js to avoid bundling it in the main chunk.
 */
export async function deriveSolanaAddress(
  privateKeyBase58: string,
): Promise<string> {
  const { Keypair } = await import('@solana/web3.js')
  const bs58 = await import('bs58')
  const keypair = Keypair.fromSecretKey(bs58.default.decode(privateKeyBase58))
  return keypair.publicKey.toBase58()
}

/**
 * Derive an EVM address from a hex private key (with or without 0x prefix).
 * One key serves every EVM chain (Ethereum, Base, Arbitrum, BSC, Polygon, …).
 * Dynamically imports viem to keep it out of the main chunk.
 */
export async function deriveEvmAddress(privateKeyHex: string): Promise<string> {
  const { privateKeyToAccount } = await import('viem/accounts')
  const normalized = (
    privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`
  ) as `0x${string}`
  return privateKeyToAccount(normalized).address
}

async function readAll(
  set: (partial: Partial<WalletsState>) => void,
): Promise<void> {
  set({ status: 'loading' })
  try {
    const indexRaw = await getCredential(WALLETS_INDEX_KEY)
    if (!indexRaw) {
      set({ wallets: [], loaded: true, status: 'ready', sealed: false })
      return
    }
    const ids = JSON.parse(indexRaw) as Array<string>
    const loaded: Array<CryptoWallet> = []
    for (const id of ids) {
      const raw = await getCredential(`wallet:${id}`)
      if (raw) {
        try {
          loaded.push(JSON.parse(raw) as CryptoWallet)
        } catch {
          // Corrupted entry — skip
        }
      }
    }
    set({ wallets: loaded, loaded: true, status: 'ready', sealed: false })
  } catch (err) {
    if (isVaultSealed(err)) {
      set({ wallets: [], loaded: true, status: 'sealed', sealed: true })
      return
    }
    set({ wallets: [], loaded: true, status: 'error', sealed: false })
  }
}

/**
 * The read in flight, so concurrent callers await the same one — resolving
 * `load()` while the keychain read is still going would tell every caller the
 * wallets are in memory when they are not. Same contract as
 * credentials-store.ts; see the note there.
 */
let inFlight: Promise<void> | null = null

function startRead(set: (partial: Partial<WalletsState>) => void) {
  const read = readAll(set).finally(() => {
    if (inFlight === read) inFlight = null
  })
  inFlight = read
  return read
}

export const useWalletsStore = create<WalletsState>((set, get) => ({
  wallets: [],
  loaded: false,
  status: 'idle',
  sealed: false,

  load: async () => {
    if (get().status === 'ready') return
    await (inFlight ?? startRead(set))
  },

  reload: async () => {
    await startRead(set)
  },

  addWallet: async (wallet, privateKey) => {
    await assertCanAddCredential()
    const id = generateId()
    const entry: CryptoWallet = {
      ...wallet,
      id,
      createdAt: Date.now(),
    }
    const next = [...get().wallets, entry]
    set({ wallets: next })
    // Store wallet metadata (no secrets)
    await saveCredential(`wallet:${id}`, JSON.stringify(entry))
    // Store private key separately
    await saveCredential(`wallet:${id}:secret`, privateKey)
    await saveCredential(
      WALLETS_INDEX_KEY,
      JSON.stringify(next.map((w) => w.id)),
    )
  },

  removeWallet: async (id) => {
    const next = get().wallets.filter((w) => w.id !== id)
    set({ wallets: next })
    await deleteCredential(`wallet:${id}`)
    await deleteCredential(`wallet:${id}:secret`)
    await saveCredential(
      WALLETS_INDEX_KEY,
      JSON.stringify(next.map((w) => w.id)),
    )
  },

  getWalletsForChain: (chain) => {
    return get().wallets.filter((w) => w.chain === chain)
  },

  getPrivateKey: async (id) => {
    return getCredential(`wallet:${id}:secret`)
  },

  touchWallet: async (id) => {
    const now = Date.now()
    const next = get().wallets.map((w) =>
      w.id === id ? { ...w, lastActivityAt: now } : w,
    )
    set({ wallets: next })
    const updated = next.find((w) => w.id === id)
    if (updated) {
      await saveCredential(`wallet:${id}`, JSON.stringify(updated))
    }
  },
}))
