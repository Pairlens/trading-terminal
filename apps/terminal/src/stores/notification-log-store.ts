// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type { NotificationLogEntry } from '@/lib/notifications/notification-runtime'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

// ── Storage ──────────────────────────────────────────────────────────

const LOG_KEY = 'pairlens:notification-log'

/** Newest-first cap — the log is a debugging/audit aid, not an archive. */
const MAX_ENTRIES = 200

function loadLog(): Array<NotificationLogEntry> {
  try {
    const raw = localStorage.getItem(LOG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Array<NotificationLogEntry>
    }
  } catch {
    // Ignore corrupted data
  }
  return []
}

function saveLog(entries: Array<NotificationLogEntry>) {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries))
    emitWrite('notification-log', entries)
  } catch {
    // Ignore quota errors — don't emit write if persist failed
  }
}

// ── Store ────────────────────────────────────────────────────────────
// The leader window appends (it's the only one evaluating rules); every
// window reads. Entries survive reloads so users can see why an alert
// fired — or that a channel delivery failed — after the fact.

type NotificationLogStore = {
  entries: Array<NotificationLogEntry>
  loaded: boolean

  load: () => void
  append: (entry: NotificationLogEntry) => void
  clear: () => void
}

export const useNotificationLogStore = create<NotificationLogStore>(
  (set, get) => ({
    entries: [],
    loaded: false,

    load() {
      if (get().loaded) return
      set({ entries: loadLog(), loaded: true })
    },

    append(entry: NotificationLogEntry) {
      const next = [entry, ...get().entries].slice(0, MAX_ENTRIES)
      set({ entries: next })
      saveLog(next)
    },

    clear() {
      set({ entries: [] })
      saveLog([])
    },
  }),
)

// Cross-window hydration: the leader window evaluates and appends; sibling
// windows mirror its log.
onHydrate((key, value) => {
  if (key !== 'notification-log' || !Array.isArray(value)) return
  useNotificationLogStore.setState({
    entries: value as Array<NotificationLogEntry>,
  })
})
