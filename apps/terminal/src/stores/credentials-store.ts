// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import { deleteCredential, getCredential, saveCredential } from '@/lib/keychain'
import { isVaultSealed } from '@/lib/security/vault/vault-errors'
import { assertCanAddCredential } from '@/lib/security/vault/vault-policy'

export type ExchangeCredential = {
  id: string
  market: string
  label: string
  mode: 'paper' | 'live'
  apiKey: string
  apiSecret: string
  passphrase?: string
  /**
   * Account's home regional entity, for venues whose API keys bind to one
   * (OKX: 'global' | 'eea' | 'us'). Empty/absent = route by the country
   * setting. See the `entity` selector on the venue's credential schema.
   */
  entity?: string
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
    /**
     * Account-entity selector, for venues whose API keys exist on exactly one
     * regional entity (the one the account was registered with). Rendered as
     * a select in the connect wizard; the choice lands on
     * `ExchangeCredential.entity` and overrides country-based routing for
     * every credentialed call. Without it, a key registered on another entity
     * fails with the venue's misleading "key doesn't exist" error.
     */
    entity?: {
      label: string
      help: string
      options: Array<{ value: string; label: string }>
    }
  }
> = {
  okx: {
    label: 'OKX',
    fields: [
      { key: 'apiKey', label: 'API Key', required: true },
      { key: 'apiSecret', label: 'API Secret', required: true },
      { key: 'passphrase', label: 'Passphrase', required: true },
    ],
    entity: {
      label: 'OKX account entity',
      help: 'OKX API keys only work on the regional entity where the account was created. Pick the one this account belongs to — if unsure, leave Auto and switch when you see "API key doesn\'t exist" (50119).',
      options: [
        { value: '', label: 'Auto (match my region)' },
        { value: 'global', label: 'OKX Global (okx.com)' },
        { value: 'eea', label: 'OKX EEA (eea.okx.com)' },
        { value: 'us', label: 'OKX US (us.okx.com)' },
      ],
    },
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
    // Paper rides AddOrder's `validate: true` dry run (no Kraken sandbox
    // exists) — orders are checked against the real account and never reach
    // the matching engine.
    modes: ['paper', 'live'],
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
  // Kalshi is an exchange, not a broker, so it takes the default 'exchange'
  // copy. The PEM rides in `apiSecret` — the same slot Coinbase's does, which
  // is what lets the wizard describe it without a new field type. Paper signs
  // against the venue's own demo endpoint set, not a simulation.
  kalshi: {
    label: 'Kalshi',
    fields: [
      { key: 'apiKey', label: 'API Key ID', required: true },
      { key: 'apiSecret', label: 'RSA Private Key (PEM)', required: true },
    ],
    modes: ['paper', 'live'],
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

/** Keychain slot listing every stored credential id. */
export const CREDENTIALS_INDEX_KEY = 'pairlens:credentials-index'

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

/**
 * Why this is not a boolean.
 *
 * The old `loaded` flag latched true on any outcome, including the catch — so
 * a locked credential vault presented as "you have no accounts". Downstream
 * that means the Accounts page shows its first-run hero, live bots decide they
 * have no credential, and the user re-enters API keys on top of a vault they
 * cannot open. `sealed` has to be its own state, everywhere it is read.
 */
export type CredentialsStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'sealed'
  | 'error'

type CredentialsState = {
  credentials: Array<ExchangeCredential>
  /**
   * "The load finished" — true for `sealed` and `error` too, so the UI paints
   * its answer instead of spinning forever. Never read this to mean "there is
   * nothing stored"; read `status` for that.
   */
  loaded: boolean
  status: CredentialsStatus
  /** Convenience mirror of `status === 'sealed'` for render paths. */
  sealed: boolean
  load: () => Promise<void>
  /** Force a re-read — the vault-unlock subscription calls this. */
  reload: () => Promise<void>
  addCredential: (
    cred: Omit<ExchangeCredential, 'id' | 'createdAt'>,
  ) => Promise<void>
  removeCredential: (id: string) => Promise<void>
  /**
   * Rename a credential in place. Same record, same keychain slot, same vault
   * envelope — only the user-facing label moves. Rejects (does not swallow)
   * when the store cannot be written, so the caller can say so.
   */
  renameCredential: (id: string, label: string) => Promise<void>
  /**
   * Change which regional entity a credential's account belongs to (venues
   * with an `entity` selector on their schema). Same persist-before-publish
   * contract as `renameCredential` — and the connector re-provisions off the
   * new value, so the next order routes to the new entity without a reload.
   */
  updateCredentialEntity: (id: string, entity: string) => Promise<void>
  getCredentialForMarket: (market: string) => ExchangeCredential | undefined
  /** Update lastActivityAt for a credential (call when credentials are handed to a connector plugin). */
  touchCredential: (id: string) => Promise<void>
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10)
}

async function readAll(
  set: (partial: Partial<CredentialsState>) => void,
): Promise<void> {
  set({ status: 'loading' })
  try {
    const indexRaw = await getCredential(CREDENTIALS_INDEX_KEY)
    if (!indexRaw) {
      set({ credentials: [], loaded: true, status: 'ready', sealed: false })
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
    set({ credentials: loaded, loaded: true, status: 'ready', sealed: false })
  } catch (err) {
    // The one branch that must never collapse into "ready with nothing".
    if (isVaultSealed(err)) {
      set({ credentials: [], loaded: true, status: 'sealed', sealed: true })
      return
    }
    set({ credentials: [], loaded: true, status: 'error', sealed: false })
  }
}

/**
 * The read in flight, so concurrent callers await the same one.
 *
 * `load()` resolving means "the credentials are in memory" — the bot runtime
 * arms live bots off exactly that promise. Short-circuiting on
 * `status === 'loading'` would resolve immediately while the keychain read was
 * still going, and every armed live bot would be disabled for having no
 * credential. Whoever asks second waits for the same answer as the first.
 */
let inFlight: Promise<void> | null = null

function startRead(set: (partial: Partial<CredentialsState>) => void) {
  const read = readAll(set).finally(() => {
    if (inFlight === read) inFlight = null
  })
  inFlight = read
  return read
}

export const useCredentialsStore = create<CredentialsState>((set, get) => ({
  credentials: [],
  loaded: false,
  status: 'idle',
  sealed: false,

  load: async () => {
    // A sealed or errored store retries; only a settled read short-circuits.
    if (get().status === 'ready') return
    await (inFlight ?? startRead(set))
  },

  reload: async () => {
    // Always a fresh read — an unlock has to see past whatever a sealed read
    // in flight is about to conclude.
    await startRead(set)
  },

  addCredential: async (cred) => {
    // Enforced here rather than at the call site so every future writer —
    // copilot, onboarding, a workspace template — is gated by construction.
    await assertCanAddCredential()
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

  /**
   * Writes BEFORE it publishes, which is the opposite order to
   * `touchCredential` below and deliberately so. A lost activity timestamp is
   * invisible; a rename that repaints the list with the new name and then
   * fails to reach the keychain is a lie the user goes on to trust — and on a
   * sealed vault `saveCredential` throws exactly that way. Persisting first
   * means the in-memory list and the disk never disagree, and the caller gets
   * the rejection to show.
   *
   * The index is not rewritten: it holds ids, and the id does not change.
   */
  renameCredential: async (id, label) => {
    const trimmed = label.trim()
    if (!trimmed) return
    const current = get().credentials.find((c) => c.id === id)
    if (!current || current.label === trimmed) return

    await saveCredential(
      `cred:${id}`,
      JSON.stringify({ ...current, label: trimmed }),
    )

    // Re-read rather than reusing the array captured above: the await is a
    // window in which a load or a remove could have replaced the list.
    set({
      credentials: get().credentials.map((c) =>
        c.id === id ? { ...c, label: trimmed } : c,
      ),
    })
  },

  // Persists before it publishes, for the reason spelled out on
  // `renameCredential`: a routing change the UI shows but the keychain never
  // took would send the next order to the entity the user just moved away from.
  updateCredentialEntity: async (id, entity) => {
    const current = get().credentials.find((c) => c.id === id)
    if (!current) return
    // Normalize: 'auto' is stored as an absent field, not an empty string, so
    // a credential saved before this option existed and one explicitly set
    // back to auto are the same record.
    const next = entity || undefined
    if ((current.entity || undefined) === next) return

    const { entity: _dropped, ...rest } = current
    const updated = next ? { ...rest, entity: next } : rest
    await saveCredential(`cred:${id}`, JSON.stringify(updated))

    set({
      credentials: get().credentials.map((c) => (c.id === id ? updated : c)),
    })
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
