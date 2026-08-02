// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type { WalletChain } from '@pairlens/market-engine/adapter'
import { deleteCredential, getCredential, saveCredential } from '@/lib/keychain'

export type CryptoWallet = {
  id: string
  chain: WalletChain
  address: string
  label: string
  createdAt: number
  lastActivityAt?: number
}

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
        label: 'Private Key (base58)',
        type: 'secret',
        required: true,
      },
    ],
  },
  ethereum: {
    label: 'Ethereum / EVM',
    fields: [
      {
        key: 'privateKey',
        label: 'Private Key (hex)',
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
        label: 'Private Key (WIF)',
        type: 'secret',
        required: true,
      },
    ],
  },
}

const WALLETS_INDEX_KEY = 'pairlens:wallets-index'

type WalletsState = {
  wallets: Array<CryptoWallet>
  loaded: boolean
  load: () => Promise<void>
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

export const useWalletsStore = create<WalletsState>((set, get) => ({
  wallets: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const indexRaw = await getCredential(WALLETS_INDEX_KEY)
      if (!indexRaw) {
        set({ loaded: true })
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
      set({ wallets: loaded, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  addWallet: async (wallet, privateKey) => {
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
