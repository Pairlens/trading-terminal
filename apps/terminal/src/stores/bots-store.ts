// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Bot definitions — the configured deployments of strategy scripts to markets.
 *
 * This store holds intent, not runtime state: whether the user wants a bot on,
 * not whether it is currently running. Live status lives in `bot-runs-store`,
 * which is deliberately separate so a status tick from the runtime never
 * rewrites (and re-syncs) the definition list.
 *
 * Loaded in every window so the editor works anywhere, but only the leader
 * window's runtime acts on it — see `lib/bots/bot-runtime.ts`.
 */
import { create } from 'zustand'

import type {
  BotDefinition,
  BotGuardConfig,
  BotMode,
  BotSizing,
} from '@pairlens/bot-engine/types'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

const STORAGE_KEY = 'pairlens:bots'
const SYNC_KEY = 'bots'

export type { BotDefinition, BotGuardConfig, BotMode, BotSizing }

/** A new bot is paper, unarmed, and unguarded until the user says otherwise. */
export const DEFAULT_SIZING: BotSizing = { kind: 'percent-equity', value: 0.1 }

/**
 * Guards ship empty. Inventing limits on the user's behalf would be worse
 * than none: they'd read as "protected" without the user having chosen any of
 * the numbers. The create flow prompts for them instead.
 */
export const DEFAULT_GUARDS: BotGuardConfig = {}

function loadFromStorage(): Array<BotDefinition> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(rearmOnLoad)
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

/**
 * A live bot never resumes by itself across an app restart.
 *
 * Coming back to a terminal that quietly started routing real orders while you
 * were reading the release notes is the kind of surprise this feature cannot
 * afford. Paper bots resume freely — nothing is at stake.
 */
function rearmOnLoad(bot: BotDefinition): BotDefinition {
  if (bot.mode !== 'live' || !bot.enabled) return bot
  return { ...bot, enabled: false, needsRearm: true }
}

function saveToStorage(bots: Array<BotDefinition>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bots))
  } catch {
    // Ignore quota errors
  }
  emitWrite(SYNC_KEY, bots)
}

type BotsStore = {
  bots: Array<BotDefinition>
  loaded: boolean
  load: () => void
  createBot: (input: {
    name: string
    scriptId: string
    market: string
    pair: string
    timeframe: string
    params?: Record<string, unknown>
    sizing?: BotSizing
    guards?: BotGuardConfig
  }) => string
  updateBot: (
    id: string,
    patch: Partial<Omit<BotDefinition, 'id' | 'createdAt'>>,
  ) => void
  deleteBot: (id: string) => void
  duplicateBot: (id: string, name: string) => string | null
  /** Turn a bot on or off. Live bots clear `needsRearm` when turned on. */
  setEnabled: (id: string, enabled: boolean) => void
  /** Panic button: disarm everything at once. */
  stopAll: () => void
}

export const useBotsStore = create<BotsStore>((set, get) => ({
  bots: [],
  loaded: false,

  load() {
    if (get().loaded) return
    set({ bots: loadFromStorage(), loaded: true })
  },

  createBot(input) {
    const id = crypto.randomUUID()
    const now = Date.now()
    const bot: BotDefinition = {
      id,
      name: input.name,
      scriptId: input.scriptId,
      params: input.params ?? {},
      market: input.market,
      pair: input.pair.toUpperCase(),
      timeframe: input.timeframe,
      mode: 'paper',
      sizing: input.sizing ?? DEFAULT_SIZING,
      guards: input.guards ?? DEFAULT_GUARDS,
      enabled: false,
      createdAt: now,
      updatedAt: now,
    }
    const next = [bot, ...get().bots]
    set({ bots: next })
    saveToStorage(next)
    return id
  },

  updateBot(id, patch) {
    const next = get().bots.map((bot) =>
      bot.id === id ? { ...bot, ...patch, updatedAt: Date.now() } : bot,
    )
    set({ bots: next })
    saveToStorage(next)
  },

  deleteBot(id) {
    const next = get().bots.filter((bot) => bot.id !== id)
    set({ bots: next })
    saveToStorage(next)
  },

  duplicateBot(id, name) {
    const source = get().bots.find((bot) => bot.id === id)
    if (!source) return null
    const newId = crypto.randomUUID()
    const now = Date.now()
    // A copy is always off and always paper, whatever the original was doing.
    const copy: BotDefinition = {
      ...source,
      id: newId,
      name,
      mode: 'paper',
      enabled: false,
      needsRearm: undefined,
      createdAt: now,
      updatedAt: now,
    }
    const next = [copy, ...get().bots]
    set({ bots: next })
    saveToStorage(next)
    return newId
  },

  setEnabled(id, enabled) {
    const next = get().bots.map((bot) =>
      bot.id === id
        ? {
            ...bot,
            enabled,
            needsRearm: enabled ? undefined : bot.needsRearm,
            updatedAt: Date.now(),
          }
        : bot,
    )
    set({ bots: next })
    saveToStorage(next)
  },

  stopAll() {
    const next = get().bots.map((bot) =>
      bot.enabled ? { ...bot, enabled: false, updatedAt: Date.now() } : bot,
    )
    set({ bots: next })
    saveToStorage(next)
  },
}))

// Cross-window / cloud-merge hydration: in-memory only, so the writer's own
// persist isn't echoed back as a second write.
onHydrate((key, value) => {
  if (key === SYNC_KEY && Array.isArray(value)) {
    useBotsStore.setState({
      bots: (value as Array<BotDefinition>).map(rearmOnLoad),
      loaded: true,
    })
  }
})
