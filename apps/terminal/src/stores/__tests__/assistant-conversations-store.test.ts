// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, it } from 'bun:test'

import {
  MAX_CONVERSATIONS,
  ensureActiveConversation,
  normalizeTitle,
  titleFromText,
  trimThread,
  useAssistantConversationsStore,
} from '../assistant-conversations-store'

import type { UIMessage } from 'ai'

// A localStorage of our own only when the process has none. Other suites in
// this app install one first, so the setup below never assumes it owns the
// object: it clears through whatever is there and patches `setItem` in place
// for the one test that needs a full disk.
const backing = new Map<string, string>()
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => {
      backing.set(k, String(v))
    },
    removeItem: (k: string) => {
      backing.delete(k)
    },
    clear: () => backing.clear(),
    key: (i: number) => [...backing.keys()][i] ?? null,
    get length() {
      return backing.size
    },
  } as Storage
}

/**
 * Run `body` against a storage that refuses any write once the total goes
 * past `limitBytes`, then put the real `setItem` back.
 */
function withStorageLimit(limitBytes: number, body: () => void): void {
  const original = localStorage.setItem.bind(localStorage)
  localStorage.setItem = (key: string, value: string) => {
    let used = 0
    for (let i = 0; i < localStorage.length; i += 1) {
      const other = localStorage.key(i)
      if (!other || other === key) continue
      used += other.length + (localStorage.getItem(other)?.length ?? 0)
    }
    if (used + key.length + value.length > limitBytes) {
      throw new Error('QuotaExceededError')
    }
    original(key, value)
  }
  try {
    body()
  } finally {
    localStorage.setItem = original
  }
}

const store = () => useAssistantConversationsStore.getState()

const message = (text: string): UIMessage =>
  ({
    id: `m-${text}`,
    role: 'user',
    parts: [{ type: 'text', text }],
  }) as UIMessage

beforeEach(() => {
  localStorage.clear()
  useAssistantConversationsStore.setState({
    conversations: [],
    activeId: null,
    threads: {},
    loaded: false,
  })
})

describe('lifecycle', () => {
  it('creates the first conversation on demand and reopens it on reload', () => {
    const id = ensureActiveConversation()
    store().setMessages(id, [message('hello')])

    // A fresh boot against the same storage.
    useAssistantConversationsStore.setState({
      conversations: [],
      activeId: null,
      threads: {},
      loaded: false,
    })
    store().load()

    expect(store().activeId).toBe(id)
    expect(store().messagesOf(id)).toHaveLength(1)
  })

  it('keeps full message parts, not just text', () => {
    const id = ensureActiveConversation()
    const withTool = {
      id: 'm1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'done' },
        {
          type: 'tool-get_candles',
          state: 'output-available',
          output: { n: 1 },
        },
      ],
    } as unknown as UIMessage
    store().setMessages(id, [withTool])

    useAssistantConversationsStore.setState({ threads: {} })
    expect(store().messagesOf(id)[0].parts).toHaveLength(2)
  })

  it('replaces an untouched empty conversation instead of stacking them', () => {
    ensureActiveConversation()
    store().create()
    store().create()
    expect(store().conversations).toHaveLength(1)
  })

  it('keeps a conversation that has messages when a new one starts', () => {
    const first = ensureActiveConversation()
    store().setMessages(first, [message('keep me')])
    const second = store().create()

    expect(store().conversations.map((c) => c.id)).toEqual([second, first])
    expect(store().activeId).toBe(second)
  })

  it('falls through to the next thread when the active one is deleted', () => {
    const first = ensureActiveConversation()
    store().setMessages(first, [message('one')])
    const second = store().create()
    store().setMessages(second, [message('two')])

    store().remove(second)

    expect(store().activeId).toBe(first)
    expect(store().messagesOf(first)).toHaveLength(1)
    expect(localStorage.getItem(`pairlens:assistant.thread.${second}`)).toBe(
      null,
    )
  })

  it('goes back to nothing active when the last thread is deleted', () => {
    const only = ensureActiveConversation()
    store().remove(only)
    expect(store().activeId).toBe(null)
    expect(store().conversations).toEqual([])

    // What the chat does next: no thread means a fresh one, not a blank
    // column. Deleting the only conversation is how you start over.
    const replacement = ensureActiveConversation()
    expect(replacement).not.toBe(only)
    expect(store().activeId).toBe(replacement)
    expect(store().messagesOf(replacement)).toEqual([])
  })
})

describe('ordering and caps', () => {
  it('orders by last activity, newest first', () => {
    const a = ensureActiveConversation()
    store().setMessages(a, [message('a')])
    const b = store().create()
    store().setMessages(b, [message('b')])

    expect(store().conversations[0].id).toBe(b)
    store().setMessages(a, [message('a'), message('a2')])
    expect(store().conversations[0].id).toBe(a)
  })

  it('does not reorder when a thread is rewritten unchanged', () => {
    const a = ensureActiveConversation()
    store().setMessages(a, [message('a')])
    const b = store().create()
    store().setMessages(b, [message('b')])

    const before = store().conversations.map((c) => c.id)
    store().setMessages(a, [message('a')])
    expect(store().conversations.map((c) => c.id)).toEqual(before)
  })

  it('drops the oldest past the conversation cap', () => {
    let oldest = ''
    for (let i = 0; i <= MAX_CONVERSATIONS; i += 1) {
      const id = i === 0 ? ensureActiveConversation() : store().create()
      if (i === 0) oldest = id
      store().setMessages(id, [message(`m${i}`)])
    }
    expect(store().conversations).toHaveLength(MAX_CONVERSATIONS)
    expect(store().conversations.some((c) => c.id === oldest)).toBe(false)
    expect(localStorage.getItem(`pairlens:assistant.thread.${oldest}`)).toBe(
      null,
    )
  })

  it('trims the oldest turns past the character budget but keeps the last', () => {
    const big = (n: number) =>
      ({
        id: `big-${n}`,
        role: 'user',
        parts: [{ type: 'text', text: 'x'.repeat(400_000) }],
      }) as UIMessage
    const trimmed = trimThread([big(1), big(2), big(3)])
    expect(trimmed).toHaveLength(1)
    expect(trimmed[0].id).toBe('big-3')
  })

  it('sheds an older thread rather than losing the one being written', () => {
    const old = ensureActiveConversation()
    store().setMessages(old, [message('old')])
    const current = store().create()
    store().setMessages(current, [message('seed')])

    // Only room for roughly one thread from here on.
    withStorageLimit(2_600, () => {
      store().setMessages(current, [message('x'.repeat(1_200))])
    })

    expect(store().messagesOf(current)[0].parts).toHaveLength(1)
    expect(store().conversations.some((c) => c.id === old)).toBe(false)
  })
})

describe('titles', () => {
  it('takes the first line and cuts on a word boundary', () => {
    expect(titleFromText('  Analyze BTC \n and then ETH ')).toBe('Analyze BTC')
    expect(titleFromText('   ')).toBe(null)
    const long = titleFromText('word '.repeat(40))
    expect(long).not.toBe(null)
    expect(long!.length).toBeLessThanOrEqual(61)
  })

  it('strips the quotes and trailing stops a model likes to add', () => {
    expect(normalizeTitle('"BTC breakout watch."')).toBe('BTC breakout watch')
    expect(normalizeTitle('   ')).toBe(null)
  })

  it('renames only the conversation asked for', () => {
    const a = ensureActiveConversation()
    store().setMessages(a, [message('a')])
    const b = store().create()
    store().rename(a, 'First thread')
    expect(store().conversations.find((c) => c.id === a)?.title).toBe(
      'First thread',
    )
    expect(store().conversations.find((c) => c.id === b)?.title).toBe(null)
  })
})
