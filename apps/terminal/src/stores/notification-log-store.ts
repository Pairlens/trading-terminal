// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { create } from 'zustand'

import type { NotificationLogEntry } from '@/lib/notifications/notification-runtime'
import { emitWrite, onHydrate } from '@/lib/sync/sync-channel'

// ── Storage ──────────────────────────────────────────────────────────

const LOG_KEY = 'pairlens:notification-log'

/**
 * When the user last looked at the log.
 *
 * Window-local and deliberately NOT synced: "seen" is a fact about this
 * screen, not about the account. A second window mirroring the leader's log
 * has its own bell, and marking one read from the other would hide the badge
 * on a monitor nobody is sitting at.
 */
const SEEN_KEY = 'pairlens:notification-log-seen'

function loadSeenAt(): number {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed = raw ? Number(raw) : 0
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

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
  /** Timestamp of the newest entry the user has actually looked at. */
  seenAt: number

  load: () => void
  append: (entry: NotificationLogEntry) => void
  clear: () => void
  markSeen: () => void
}

export const useNotificationLogStore = create<NotificationLogStore>(
  (set, get) => ({
    entries: [],
    loaded: false,
    seenAt: 0,

    load() {
      if (get().loaded) return
      set({ entries: loadLog(), seenAt: loadSeenAt(), loaded: true })
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

    /**
     * Stamp the newest entry as seen, not `Date.now()` — a firing that lands
     * in the same millisecond the panel opens would otherwise be marked read
     * before it was ever painted.
     */
    markSeen() {
      const newest = get().entries[0]?.timestamp ?? 0
      if (newest <= get().seenAt) return
      set({ seenAt: newest })
      try {
        localStorage.setItem(SEEN_KEY, String(newest))
      } catch {
        // Quota or unavailable storage — the badge degrades to in-memory.
      }
    },
  }),
)

/** How many entries arrived since the user last looked. */
export function selectUnreadCount(state: NotificationLogStore): number {
  return state.entries.filter((entry) => entry.timestamp > state.seenAt).length
}

// Cross-window hydration: the leader window evaluates and appends; sibling
// windows mirror its log.
onHydrate((key, value) => {
  if (key !== 'notification-log' || !Array.isArray(value)) return
  useNotificationLogStore.setState({
    entries: value as Array<NotificationLogEntry>,
  })
})
