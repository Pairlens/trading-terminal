// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import { deleteCredential, getCredential, saveCredential } from '@/lib/keychain'

export type ExchangeCredential = {
  id: string
  market: string
  label: string
  mode: 'paper' | 'live'
  apiKey: string
  apiSecret: string
  passphrase?: string
  createdAt: number
  /** Timestamp of last use (credentials provisioned to a connector plugin). Used for inactivity expiry warnings. */
  lastActivityAt?: number
}

export type InactivityExpiryPolicy = {
  /** Days of inactivity before the exchange expires API keys. */
  days: number
  /** Warning shown when creating/viewing wallets for this exchange. */
  warning: string
}

/** Static credential schema registry — per-market field requirements. */
export const CREDENTIAL_SCHEMAS: Record<
  string,
  {
    label: string
    /**
     * What kind of venue this credential belongs to. Drives which Accounts
     * section it appears under. Defaults to 'exchange' (crypto CEX).
     */
    kind?: 'exchange' | 'broker'
    fields: Array<{ key: string; label: string; required: boolean }>
    modes: Array<'paper' | 'live'>
    /** If set, the exchange expires API keys after N days of inactivity. */
    inactivityExpiry?: InactivityExpiryPolicy
  }
> = {
  okx: {
    label: 'OKX',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
      { key: 'passphrase', label: 'Passphrase', required: true },
    ],
    modes: ['paper', 'live'],
    inactivityExpiry: {
      days: 14,
      warning:
        'API keys with trade or withdraw permissions will expire after 14 days of inactivity.',
    },
  },
  binance: {
    label: 'Binance',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['paper', 'live'],
  },
  bybit: {
    label: 'ByBit',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['paper', 'live'],
  },
  bitvavo: {
    label: 'Bitvavo',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['live'],
  },
  mexc: {
    label: 'MEXC',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['live'],
  },
  kucoin: {
    label: 'KuCoin',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
      { key: 'passphrase', label: 'Passphrase', required: true },
    ],
    modes: ['paper', 'live'],
  },
  gate: {
    label: 'Gate.io',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['paper', 'live'],
  },
  bitget: {
    label: 'Bitget',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
      { key: 'passphrase', label: 'Passphrase', required: true },
    ],
    modes: ['paper', 'live'],
  },
  coinbase: {
    label: 'Coinbase',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret (PEM)', required: true },
    ],
    modes: ['paper', 'live'],
  },
  kraken: {
    label: 'Kraken',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['live'],
  },
  htx: {
    label: 'HTX',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['live'],
  },
  cryptocom: {
    label: 'Crypto.com',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['paper', 'live'],
  },
  bitfinex: {
    label: 'Bitfinex',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['live'],
  },
  upbit: {
    label: 'Upbit',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
    ],
    modes: ['live'],
  },
  alpaca: {
    label: 'Alpaca',
    kind: 'broker',
    fields: [
      { key: 'apiKey', label: 'API Key ID', required: true },
      { key: 'apiSecret', label: 'Secret Key', required: true },
    ],
    modes: ['paper', 'live'],
  },
}

/** True when a market's credentials belong to a stock broker. */
export function isBrokerMarket(market: string): boolean {
  return CREDENTIAL_SCHEMAS[market]?.kind === 'broker'
}

const CREDENTIALS_INDEX_KEY = 'pairlens:credentials-index'

const MS_PER_DAY = 86_400_000

/** Returns the inactivity expiry status for a credential, or null if no policy applies. */
export function getExpiryStatus(cred: ExchangeCredential): {
  policy: InactivityExpiryPolicy
  lastActive: number
  daysInactive: number
  expired: boolean
  /** True when >= 75% of the inactivity window has elapsed. */
  warning: boolean
} | null {
  const schema = CREDENTIAL_SCHEMAS[cred.market]
  if (!schema?.inactivityExpiry) return null
  const policy = schema.inactivityExpiry
  const lastActive = cred.lastActivityAt ?? cred.createdAt
  const daysInactive = Math.floor((Date.now() - lastActive) / MS_PER_DAY)
  return {
    policy,
    lastActive,
    daysInactive,
    expired: daysInactive >= policy.days,
    warning: daysInactive >= Math.floor(policy.days * 0.75),
  }
}

type CredentialsState = {
  credentials: Array<ExchangeCredential>
  loaded: boolean
  load: () => Promise<void>
  addCredential: (
    cred: Omit<ExchangeCredential, 'id' | 'createdAt'>,
  ) => Promise<void>
  removeCredential: (id: string) => Promise<void>
  getCredentialForMarket: (market: string) => ExchangeCredential | undefined
  /** Update lastActivityAt for a credential (call when credentials are handed to a connector plugin). */
  touchCredential: (id: string) => Promise<void>
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const useCredentialsStore = create<CredentialsState>((set, get) => ({
  credentials: [],
  loaded: false,

  load: async () => {
    if (get().loaded) return
    try {
      const indexRaw = await getCredential(CREDENTIALS_INDEX_KEY)
      if (!indexRaw) {
        set({ loaded: true })
        return
      }
      const ids = JSON.parse(indexRaw) as Array<string>
      const loaded: Array<ExchangeCredential> = []
      for (const id of ids) {
        const raw = await getCredential(`cred:${id}`)
        if (raw) {
          try {
            loaded.push(JSON.parse(raw) as ExchangeCredential)
          } catch {
            // Corrupted entry — skip
          }
        }
      }
      set({ credentials: loaded, loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  addCredential: async (cred) => {
    const id = generateId()
    const entry: ExchangeCredential = {
      ...cred,
      id,
      createdAt: Date.now(),
    }
    const next = [...get().credentials, entry]
    set({ credentials: next })
    await saveCredential(`cred:${id}`, JSON.stringify(entry))
    await saveCredential(
      CREDENTIALS_INDEX_KEY,
      JSON.stringify(next.map((c) => c.id)),
    )
  },

  removeCredential: async (id) => {
    const next = get().credentials.filter((c) => c.id !== id)
    set({ credentials: next })
    await deleteCredential(`cred:${id}`)
    await saveCredential(
      CREDENTIALS_INDEX_KEY,
      JSON.stringify(next.map((c) => c.id)),
    )
  },

  getCredentialForMarket: (market) => {
    return get().credentials.find((c) => c.market === market)
  },

  touchCredential: async (id) => {
    const now = Date.now()
    const next = get().credentials.map((c) =>
      c.id === id ? { ...c, lastActivityAt: now } : c,
    )
    set({ credentials: next })
    const updated = next.find((c) => c.id === id)
    if (updated) {
      await saveCredential(`cred:${id}`, JSON.stringify(updated))
    }
  },
}))
