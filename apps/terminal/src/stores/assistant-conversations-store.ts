// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Assistant conversations, on this device only ─────────────────────
//
// Chat history never leaves the machine it was typed on. It used to ride
// the App Server under one fixed key, which meant one thread for the
// whole terminal AND a copy of every question the user ever asked
// sitting in a database. Both are gone: threads are many, and they live
// in localStorage next to the indicator scripts.
//
// Two storage tiers, for the same reason the indicator workbench has
// two. The index is small and read on every boot; the messages are not,
// and a thread from March must never be able to keep today's list from
// loading. So the index carries titles and timestamps, and each thread's
// messages sit under their own key, read the moment that thread is
// opened and not before.

import { create } from 'zustand'

import type { UIMessage } from 'ai'

const INDEX_KEY = 'pairlens:assistant.conversations'
const THREAD_PREFIX = 'pairlens:assistant.thread.'

/** Older threads fall off the end. Fifty is months of real use. */
export const MAX_CONVERSATIONS = 50

/**
 * Per-thread character budget. A run that reads twenty candles tables
 * serializes to a surprising amount of JSON, and one runaway thread must
 * not be able to eat the whole origin's quota. Oldest turns are dropped
 * first; the newest survives whatever it weighs.
 */
export const MAX_THREAD_CHARS = 600_000

/** What the list shows. Deliberately free of message content. */
export type AssistantConversationMeta = {
  id: string
  /** Null until the first message names it. The UI shows a placeholder. */
  title: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

type PersistedIndex = {
  version: 1
  activeId: string | null
  items: Array<AssistantConversationMeta>
}

function generateId(): string {
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function threadKey(id: string): string {
  return `${THREAD_PREFIX}${id}`
}

// ── Reading ──────────────────────────────────────────────────────────

function isMeta(value: unknown): value is AssistantConversationMeta {
  if (!value || typeof value !== 'object') return false
  const meta = value as Partial<AssistantConversationMeta>
  return (
    typeof meta.id === 'string' &&
    (meta.title === null || typeof meta.title === 'string') &&
    typeof meta.createdAt === 'number' &&
    typeof meta.updatedAt === 'number'
  )
}

function readIndex(): PersistedIndex {
  const empty: PersistedIndex = { version: 1, activeId: null, items: [] }
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return empty
    const parsed = JSON.parse(raw) as Partial<PersistedIndex>
    if (!Array.isArray(parsed.items)) return empty
    const items = parsed.items.filter(isMeta).map((meta) => ({
      ...meta,
      messageCount:
        typeof meta.messageCount === 'number' ? meta.messageCount : 0,
    }))
    return {
      version: 1,
      activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null,
      items: sortByRecency(items),
    }
  } catch {
    // A corrupted index costs the list, never the boot.
    return empty
  }
}

function readThread(id: string): Array<UIMessage> {
  try {
    const raw = localStorage.getItem(threadKey(id))
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Anything without parts cannot be replayed into the chat, and one bad
    // row must not cost the rest of the thread.
    return parsed.filter(
      (message): message is UIMessage =>
        Boolean(message) &&
        typeof message === 'object' &&
        Array.isArray((message as UIMessage).parts),
    )
  } catch {
    return []
  }
}

function sortByRecency(
  items: Array<AssistantConversationMeta>,
): Array<AssistantConversationMeta> {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt)
}

// ── Writing ──────────────────────────────────────────────────────────

function writeIndex(index: PersistedIndex): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index))
  } catch {
    // Quota, private mode, a locked-down profile: the session still works,
    // it just will not be there next time.
  }
}

function dropThread(id: string): void {
  try {
    localStorage.removeItem(threadKey(id))
  } catch {
    // Nothing to do; the index no longer points at it either way.
  }
}

/**
 * Weight of one message as stored. Cheap and approximate on purpose: it
 * is a budget, not an invoice, and JSON.stringify per message per write
 * is the kind of thing that shows up in a profile.
 */
function messageChars(message: UIMessage): number {
  try {
    return JSON.stringify(message).length
  } catch {
    return 0
  }
}

/**
 * Trim a thread to the character budget, dropping the OLDEST turns. The
 * newest message always survives, whatever it weighs: a single enormous
 * answer is still the one the user is looking at.
 */
export function trimThread(messages: Array<UIMessage>): Array<UIMessage> {
  if (messages.length <= 1) return messages
  const weights = messages.map(messageChars)
  let total = weights.reduce((sum, weight) => sum + weight, 0)
  let start = 0
  while (start < messages.length - 1 && total > MAX_THREAD_CHARS) {
    total -= weights[start]
    start += 1
  }
  return start === 0 ? messages : messages.slice(start)
}

/**
 * Write a thread, shedding the least recently used OTHER thread and
 * retrying when the origin is out of room. Returns the ids that were
 * evicted so the caller can drop them from the index it is about to
 * persist: storage IO stays out of the store updaters, which have to be
 * pure.
 */
function writeThread(id: string, messages: Array<UIMessage>): Array<string> {
  const payload = JSON.stringify(trimThread(messages))
  const evicted: Array<string> = []
  // One write plus two evictions is the whole budget. A profile that
  // cannot hold one trimmed thread will not be talked into it by more.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      localStorage.setItem(threadKey(id), payload)
      return evicted
    } catch {
      const victim = oldestStoredThread(id, evicted)
      if (!victim) return evicted
      dropThread(victim)
      evicted.push(victim)
    }
  }
  return evicted
}

/** The least recently updated thread that is not `protectedId`. */
function oldestStoredThread(
  protectedId: string,
  alreadyEvicted: Array<string>,
): string | null {
  const { conversations } = useAssistantConversationsStore.getState()
  for (let i = conversations.length - 1; i >= 0; i -= 1) {
    const { id } = conversations[i]
    if (id === protectedId || alreadyEvicted.includes(id)) continue
    return id
  }
  return null
}

function withoutKey(
  threads: Record<string, Array<UIMessage>>,
  id: string,
): Record<string, Array<UIMessage>> {
  if (!(id in threads)) return threads
  const next = { ...threads }
  delete next[id]
  return next
}

// ── Titles ───────────────────────────────────────────────────────────

/** Longest a title may be. Beyond this the sidebar truncates anyway. */
export const MAX_TITLE_CHARS = 60

/**
 * A title from the message itself: first line, collapsed whitespace, cut
 * on a word boundary. Used the instant a conversation gets its first
 * message so the list never shows a nameless row, and used again as the
 * fallback when the model cannot be reached to write a better one.
 */
export function titleFromText(text: string): string | null {
  const firstLine = text.trim().split('\n')[0] ?? ''
  const collapsed = firstLine.replace(/\s+/g, ' ').trim()
  if (!collapsed) return null
  if (collapsed.length <= MAX_TITLE_CHARS) return collapsed
  const cut = collapsed.slice(0, MAX_TITLE_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${lastSpace > 24 ? cut.slice(0, lastSpace) : cut}…`
}

/** Trim a model-written title down to what the list can hold. */
export function normalizeTitle(raw: string): string | null {
  const cleaned = raw
    .replace(/\s+/g, ' ')
    // Models like to wrap a title in quotes or end it with a full stop.
    .replace(/^["'“”‘’]+|["'“”‘’.]+$/g, '')
    .trim()
  return cleaned ? titleFromText(cleaned) : null
}

// ── Store ────────────────────────────────────────────────────────────

type AssistantConversationsStore = {
  /** Newest first. Empty until `load()`. */
  conversations: Array<AssistantConversationMeta>
  /** The thread the chat is showing. Null before the first `load()`. */
  activeId: string | null
  /** Messages of every thread opened this session, keyed by id. */
  threads: Record<string, Array<UIMessage>>
  loaded: boolean

  /** Read the index and open the last active thread. Idempotent. */
  load: () => void
  /** Start an empty conversation and make it active. Returns its id. */
  create: () => string
  /** Open an existing conversation, reading its messages if needed. */
  select: (id: string) => void
  /** Delete one conversation. Falls through to the next most recent. */
  remove: (id: string) => void
  /** Name a conversation. Null clears it back to the placeholder. */
  rename: (id: string, title: string | null) => void
  /** Persist a thread's messages and refresh its index entry. */
  setMessages: (id: string, messages: Array<UIMessage>) => void
  /** Messages of a conversation, reading through to storage on a miss. */
  messagesOf: (id: string) => Array<UIMessage>
}

export const useAssistantConversationsStore =
  create<AssistantConversationsStore>((set, get) => ({
    conversations: [],
    activeId: null,
    threads: {},
    loaded: false,

    load: () => {
      if (get().loaded) return
      const index = readIndex()
      // An index whose active row was trimmed away points at nothing; fall
      // through to the most recent rather than opening a blank thread the
      // user cannot find in the list.
      const active =
        index.items.find((meta) => meta.id === index.activeId)?.id ??
        index.items[0]?.id ??
        null
      set({
        conversations: index.items,
        activeId: active,
        threads: active ? { [active]: readThread(active) } : {},
        loaded: true,
      })
    },

    create: () => {
      // Ahead of every existing row, so a new conversation sits at the top
      // of the list even when the one before it was written this same
      // millisecond.
      const now = nextStamp(get().conversations)
      const meta: AssistantConversationMeta = {
        id: generateId(),
        title: null,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      }
      const state = get()
      // An untouched empty conversation is not worth keeping: New pressed
      // twice should leave one empty thread, not two.
      const stale = state.conversations.filter(
        (row) => row.messageCount === 0 && row.id === state.activeId,
      )
      for (const row of stale) dropThread(row.id)
      const kept = state.conversations.filter(
        (row) => !stale.some((dead) => dead.id === row.id),
      )
      const items = capConversations([meta, ...kept])
      persist(items, meta.id)
      const threads = { ...state.threads, [meta.id]: [] as Array<UIMessage> }
      for (const row of stale) delete threads[row.id]
      set({ conversations: items, activeId: meta.id, threads, loaded: true })
      return meta.id
    },

    select: (id) => {
      const state = get()
      if (id === state.activeId) return
      if (!state.conversations.some((meta) => meta.id === id)) return
      persist(state.conversations, id)
      set({
        activeId: id,
        threads:
          id in state.threads
            ? state.threads
            : { ...state.threads, [id]: readThread(id) },
      })
    },

    remove: (id) => {
      const state = get()
      dropThread(id)
      const items = state.conversations.filter((meta) => meta.id !== id)
      const activeId =
        state.activeId === id ? (items[0]?.id ?? null) : state.activeId
      const threads = withoutKey(state.threads, id)
      if (activeId && !(activeId in threads)) {
        threads[activeId] = readThread(activeId)
      }
      persist(items, activeId)
      set({ conversations: items, activeId, threads })
    },

    rename: (id, title) => {
      const state = get()
      if (!state.conversations.some((meta) => meta.id === id)) return
      const items = state.conversations.map((meta) =>
        meta.id === id ? { ...meta, title } : meta,
      )
      persist(items, state.activeId)
      set({ conversations: items })
    },

    setMessages: (id, messages) => {
      const state = get()
      const existing = state.conversations.find((meta) => meta.id === id)
      if (!existing) return
      const evicted = writeThread(id, messages)
      // `updatedAt` only moves when the thread actually grew. Rewriting the
      // same array on a reload must not reorder the list.
      const grew = messages.length !== existing.messageCount
      const items = sortByRecency(
        state.conversations
          .filter((meta) => !evicted.includes(meta.id))
          .map((meta) =>
            meta.id === id
              ? {
                  ...meta,
                  messageCount: messages.length,
                  updatedAt: grew
                    ? nextStamp(state.conversations)
                    : meta.updatedAt,
                }
              : meta,
          ),
      )
      persist(items, state.activeId)
      let threads = { ...state.threads, [id]: messages }
      for (const dead of evicted) threads = withoutKey(threads, dead)
      set({ conversations: items, threads })
    },

    messagesOf: (id) => {
      const cached = get().threads[id]
      if (cached) return cached
      const messages = readThread(id)
      set((state) => ({ threads: { ...state.threads, [id]: messages } }))
      return messages
    },
  }))

/**
 * A stamp that is strictly newer than every row. Two messages inside the
 * same millisecond are ordinary during a fast exchange, and a plain
 * `Date.now()` there leaves the list in whatever order it already had:
 * the thread the user is typing in would not come to the top.
 */
function nextStamp(items: Array<AssistantConversationMeta>): number {
  const newest = items.reduce((max, meta) => Math.max(max, meta.updatedAt), 0)
  return Math.max(Date.now(), newest + 1)
}

/** Enforce the count cap, dropping the oldest and their stored threads. */
function capConversations(
  items: Array<AssistantConversationMeta>,
): Array<AssistantConversationMeta> {
  const sorted = sortByRecency(items)
  if (sorted.length <= MAX_CONVERSATIONS) return sorted
  for (const meta of sorted.slice(MAX_CONVERSATIONS)) dropThread(meta.id)
  return sorted.slice(0, MAX_CONVERSATIONS)
}

function persist(
  items: Array<AssistantConversationMeta>,
  activeId: string | null,
): void {
  writeIndex({ version: 1, activeId, items })
}

/**
 * The active conversation, creating one when the store is empty. The chat
 * needs an id to key itself on from its very first render, and a terminal
 * that has never been asked anything has no rows yet.
 */
export function ensureActiveConversation(): string {
  const store = useAssistantConversationsStore.getState()
  store.load()
  const { activeId } = useAssistantConversationsStore.getState()
  return activeId ?? useAssistantConversationsStore.getState().create()
}
