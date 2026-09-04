// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Switching History used to abort the run: the chat was one Chat keyed
 * on the visible thread, and the switch effect called stop() before
 * swapping the id. These pin a map that keeps each thread's Chat alive
 * so a click on another row is the same as minimizing.
 */
import { describe, expect, test } from 'bun:test'

import { AssistantChatSessions } from '../chat-sessions'
import type { ChatSession } from '../chat-sessions'

type Fake = ChatSession & {
  stopped: boolean
  setStatus: (status: string) => void
  pushMessage: () => void
}

const fake = (id: string, messages: Array<unknown> = [{}]): Fake => {
  let status = 'ready'
  const messageCbs = new Set<() => void>()
  const statusCbs = new Set<() => void>()
  const chat: Fake = {
    id,
    messages,
    get status() {
      return status
    },
    stopped: false,
    stop() {
      this.stopped = true
    },
    sendMessage() {},
    setStatus(next) {
      status = next
      for (const cb of statusCbs) cb()
    },
    pushMessage() {
      for (const cb of messageCbs) cb()
    },
    '~registerMessagesCallback'(onChange) {
      messageCbs.add(onChange)
      return () => {
        messageCbs.delete(onChange)
      }
    },
    '~registerStatusCallback'(onChange) {
      statusCbs.add(onChange)
      return () => {
        statusCbs.delete(onChange)
      }
    },
  }
  return chat
}

describe('AssistantChatSessions', () => {
  test('get returns the same Chat for a thread after another is opened', () => {
    const created: Array<string> = []
    const sessions = new AssistantChatSessions({
      create: (id) => {
        created.push(id)
        return fake(id)
      },
      persist: () => {},
    })
    const a = sessions.get('a')
    const b = sessions.get('b')
    expect(b).not.toBe(a)
    expect(sessions.get('a')).toBe(a)
    expect(created).toEqual(['a', 'b'])
  })

  test('prune stops and drops threads that were deleted, and leaves the rest', () => {
    const sessions = new AssistantChatSessions({
      create: (id) => fake(id),
      persist: () => {},
    })
    const a = sessions.get('a')
    const gone = sessions.get('gone')
    sessions.prune(['a'])
    expect(gone.stopped).toBe(true)
    expect(a.stopped).toBe(false)
    expect(sessions.get('a')).toBe(a)
    expect(sessions.get('gone')).not.toBe(gone)
  })

  test('a streaming thread is persisted even when it is not the one on screen', () => {
    const writes: Array<{ id: string; n: number }> = []
    const sessions = new AssistantChatSessions({
      create: (id) => fake(id, [{ n: 1 }]),
      persist: (id, messages) => {
        writes.push({ id, n: messages.length })
      },
      debounceMs: 0,
    })
    const a = sessions.get('a')
    sessions.get('b')
    a.setStatus('streaming')
    a.pushMessage()
    expect(writes.some((w) => w.id === 'a')).toBe(true)
  })

  test('dispose stops every live Chat', () => {
    const sessions = new AssistantChatSessions({
      create: (id) => fake(id),
      persist: () => {},
    })
    const a = sessions.get('a')
    const b = sessions.get('b')
    sessions.dispose()
    expect(a.stopped).toBe(true)
    expect(b.stopped).toBe(true)
  })
})
