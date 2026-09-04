// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── One Chat per conversation ────────────────────────────────────────
//
// `useChat({ id })` rebuilds its Chat whenever the id moves. Switching
// History used to stop the outgoing run first so that rebuild would not
// orphan a stream. The cost was that a click on another row aborted the
// answer, which minimizing the dock does not.
//
// This map keeps each thread's Chat alive. The hook is handed the
// instance (`useChat({ chat })`), so a switch only changes which Chat
// is on screen. The previous one keeps streaming, and coming back is
// the same as un-minimizing.

import { deriveRunStatus } from './run-status'
import type { AssistantRunStatus } from './run-status'
import type { UIMessage } from 'ai'

export type ChatSession = {
  id: string
  status: string
  messages: ReadonlyArray<unknown>
  stop: () => unknown
  sendMessage: (message: { text: string }) => unknown
  '~registerMessagesCallback': (onChange: () => void) => () => void
  '~registerStatusCallback': (onChange: () => void) => () => void
}

export type AssistantChatSessionsOptions<T extends ChatSession> = {
  create: (id: string) => T
  persist: (id: string, messages: T['messages']) => void
  debounceMs?: number
  /** Fired when a run reaches ready/error from a non-idle status. */
  onReady?: (id: string, chat: T) => void
}

const DEFAULT_DEBOUNCE_MS = 700

const IDLE: AssistantRunStatus = { phase: 'idle', toolName: null }

export class AssistantChatSessions<T extends ChatSession> {
  private readonly chats = new Map<string, T>()
  private readonly unsubs = new Map<string, () => void>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly lastStatus = new Map<string, string>()
  private readonly orbKey = new Map<string, string>()
  private revision = 0
  private readonly listeners = new Set<() => void>()

  constructor(private readonly options: AssistantChatSessionsOptions<T>) {}

  get(id: string): T {
    const existing = this.chats.get(id)
    if (existing) return existing
    const chat = this.options.create(id)
    this.chats.set(id, chat)
    this.lastStatus.set(id, chat.status)
    this.unsubs.set(id, this.watch(id, chat))
    return chat
  }

  /**
   * Drop Chats whose threads no longer exist. Stops a run that was still
   * in flight: deleting the conversation is the one way to abort it.
   * An empty live set is ignored so a first-load blank index cannot
   * wipe sessions the host has not published yet.
   */
  prune(liveIds: Iterable<string>): void {
    const live = new Set(liveIds)
    if (live.size === 0) return
    for (const [id, chat] of this.chats) {
      if (live.has(id)) continue
      this.drop(id, chat)
    }
  }

  dispose(): void {
    for (const [id, chat] of [...this.chats]) {
      this.drop(id, chat)
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): number => this.revision

  busiestStatus(): AssistantRunStatus {
    for (const chat of this.chats.values()) {
      const status = deriveRunStatus(
        chat.messages as Array<UIMessage>,
        chat.status,
      )
      if (status.phase !== 'idle') return status
    }
    return IDLE
  }

  private watch(id: string, chat: T): () => void {
    const onChange = () => {
      this.schedule(id, chat)
      this.considerOrb(id, chat)
      const prev = this.lastStatus.get(id)
      this.lastStatus.set(id, chat.status)
      if (
        prev &&
        prev !== 'ready' &&
        prev !== 'error' &&
        (chat.status === 'ready' || chat.status === 'error')
      ) {
        this.options.onReady?.(id, chat)
      }
    }
    const unsubM = chat['~registerMessagesCallback'](onChange)
    const unsubS = chat['~registerStatusCallback'](onChange)
    return () => {
      unsubM()
      unsubS()
    }
  }

  private considerOrb(id: string, chat: T): void {
    const status = deriveRunStatus(
      chat.messages as Array<UIMessage>,
      chat.status,
    )
    const key = `${status.phase}:${status.toolName ?? ''}`
    if (this.orbKey.get(id) === key) return
    this.orbKey.set(id, key)
    this.bump()
  }

  private schedule(id: string, chat: T): void {
    if (chat.messages.length === 0) return
    if (chat.status === 'ready' || chat.status === 'error') {
      this.flush(id, chat)
      return
    }
    const wait = this.options.debounceMs ?? DEFAULT_DEBOUNCE_MS
    if (wait <= 0) {
      this.persistNow(id, chat)
      return
    }
    if (this.timers.has(id)) return
    const timer = setTimeout(() => {
      this.timers.delete(id)
      this.persistNow(id, chat)
    }, wait)
    this.timers.set(id, timer)
  }

  private flush(id: string, chat: T): void {
    const timer = this.timers.get(id)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(id)
    }
    this.persistNow(id, chat)
  }

  private persistNow(id: string, chat: T): void {
    if (chat.messages.length === 0) return
    this.options.persist(id, chat.messages)
  }

  private drop(id: string, chat: T): void {
    this.flush(id, chat)
    this.unsubs.get(id)?.()
    this.unsubs.delete(id)
    this.lastStatus.delete(id)
    this.orbKey.delete(id)
    void chat.stop()
    this.chats.delete(id)
  }

  private bump(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
