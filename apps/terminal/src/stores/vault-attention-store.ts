// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

/**
 * Live bots that stopped because the credential vault is sealed.
 *
 * This store exists because the alternative is the worst outcome the whole
 * feature can produce: a user reboots their laptop, the vault comes back
 * sealed, and their armed bots quietly do nothing. The runtime parks those
 * bots rather than disabling them, and this is what makes the parking visible
 * — an in-app banner, plus one OS notification from the leader window.
 *
 * Paper bots are unaffected and the copy says so, because "your bots are
 * paused" is alarming enough that the qualifier matters.
 */
export type ParkedBot = { id: string; label: string }

type VaultAttentionStore = {
  parked: Array<ParkedBot>
  /** The user closed the banner. Re-arms whenever a NEW bot parks. */
  dismissed: boolean
  /** True while at least one live bot is waiting and the banner is showing. */
  report: (bot: ParkedBot) => void
  clear: (botId: string) => void
  clearAll: () => void
  dismiss: () => void
}

export const useVaultAttentionStore = create<VaultAttentionStore>((set) => ({
  parked: [],
  dismissed: false,

  report: (bot) =>
    set((s) => {
      if (s.parked.some((p) => p.id === bot.id)) return s
      // A newly parked bot un-dismisses: the user dismissed a smaller problem.
      return { parked: [...s.parked, bot], dismissed: false }
    }),

  clear: (botId) =>
    set((s) =>
      s.parked.some((p) => p.id === botId)
        ? { parked: s.parked.filter((p) => p.id !== botId) }
        : s,
    ),

  clearAll: () =>
    set((s) => (s.parked.length > 0 ? { parked: [], dismissed: false } : s)),

  dismiss: () => set({ dismissed: true }),
}))
