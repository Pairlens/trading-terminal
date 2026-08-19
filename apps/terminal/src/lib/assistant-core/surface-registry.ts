// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Assistant Surface Registry ───────────────────────────────────────
//
// The spine of the unified assistant. Mounted surfaces publish what
// they can see and what they can do; the assistant reads the union at
// the moment it needs it. Nothing is pushed, nothing is cached across
// turns, so the tool set always describes the screen as it stands.
//
// Mirrors the DynamicPaneRegistry / WorkflowStepRegistry pattern:
// a version counter, a listener set, and useSyncExternalStore on top.

import { createContext, useContext, useSyncExternalStore } from 'react'

import { DEFAULT_SURFACE_PRIORITY } from './types'
import type {
  AssistantAction,
  AssistantSuggestion,
  AssistantSurfaceContext,
  AssistantSurfaceFocus,
  AssistantSurfaceRegistration,
} from './types'

/** A surface's context, tagged with the surface that produced it. */
export type RankedSurfaceContext = AssistantSurfaceContext & {
  surfaceId: string
  priority: number
}

export class AssistantSurfaceRegistry {
  private surfaces = new Map<string, AssistantSurfaceRegistration>()
  /** Registration order, so ties break towards the most recent mount. */
  private order: Array<string> = []
  private version = 0
  private listeners = new Set<() => void>()

  // ── Registration ──────────────────────────────────────────────────

  register(registration: AssistantSurfaceRegistration): () => void {
    const { id } = registration
    if (this.surfaces.has(id)) {
      this.order = this.order.filter((entry) => entry !== id)
    }
    this.surfaces.set(id, registration)
    this.order.push(id)
    this.bump()

    return () => {
      // Only withdraw our own registration — a remount under the same
      // id may already have replaced it.
      if (this.surfaces.get(id) !== registration) return
      this.surfaces.delete(id)
      this.order = this.order.filter((entry) => entry !== id)
      this.bump()
    }
  }

  // ── Queries ───────────────────────────────────────────────────────

  /**
   * Surfaces ranked highest-priority first, most-recently-mounted
   * first within a priority. Every read path orders through this, so
   * "the surface the user is looking at" means one thing everywhere.
   */
  private ranked(): Array<{
    registration: AssistantSurfaceRegistration
    priority: number
  }> {
    const entries: Array<{
      registration: AssistantSurfaceRegistration
      priority: number
      index: number
    }> = []

    this.order.forEach((id, index) => {
      const registration = this.surfaces.get(id)
      if (!registration) return
      // Every other read guards its callback, and this one has to as
      // well: ranking is on the path of all three, so a surface that
      // throws while ranking itself would take the orb down with it.
      let priority = DEFAULT_SURFACE_PRIORITY
      try {
        priority = registration.getPriority?.() ?? DEFAULT_SURFACE_PRIORITY
      } catch (error) {
        console.warn(`[assistant] surface '${id}' failed to rank itself`, error)
      }
      entries.push({ registration, priority, index })
    })

    return entries
      .sort((a, b) => b.priority - a.priority || b.index - a.index)
      .map(({ registration, priority }) => ({ registration, priority }))
  }

  /** Every mounted surface's context, best first. */
  getContexts(): Array<RankedSurfaceContext> {
    const out: Array<RankedSurfaceContext> = []
    for (const { registration, priority } of this.ranked()) {
      let context: AssistantSurfaceContext | null = null
      try {
        context = registration.getContext?.() ?? null
      } catch (error) {
        console.warn(
          `[assistant] surface '${registration.id}' failed to describe itself`,
          error,
        )
      }
      if (context)
        out.push({ ...context, surfaceId: registration.id, priority })
    }
    return out
  }

  /**
   * The action set the model sees. On a name collision the
   * higher-priority surface wins, so "add_indicator" always means the
   * chart the user is working in.
   */
  getActions(): Array<AssistantAction> {
    const claimed = new Map<string, AssistantAction>()
    for (const { registration } of this.ranked()) {
      let actions: Array<AssistantAction> = []
      try {
        actions = registration.getActions?.() ?? []
      } catch (error) {
        console.warn(
          `[assistant] surface '${registration.id}' failed to publish actions`,
          error,
        )
      }
      for (const action of actions) {
        if (!claimed.has(action.name)) claimed.set(action.name, action)
      }
    }
    return [...claimed.values()]
  }

  /**
   * Resolve one action by name, using the same ranking `getActions`
   * does. An approval card runs the action long after the model asked
   * for it, so it has to re-resolve rather than hold a stale closure.
   */
  getAction(name: string): AssistantAction | null {
    for (const { registration } of this.ranked()) {
      let actions: Array<AssistantAction> = []
      try {
        actions = registration.getActions?.() ?? []
      } catch {
        continue
      }
      const match = actions.find((action) => action.name === name)
      if (match) return match
    }
    return null
  }

  /**
   * What "this pair" means right now: the leading surface that claims an
   * instrument.
   *
   * The market tools default their arguments to this, so the ranking is
   * doing real work — on a prediction board the desk sits above the
   * address, and the desk names the leg with a book rather than the
   * event, which has none. A focus naming neither venue nor pair is
   * skipped rather than returned, so a half-built surface cannot blank
   * out the address underneath it.
   */
  getFocus(): AssistantSurfaceFocus | null {
    for (const { registration } of this.ranked()) {
      try {
        const focus = registration.getFocus?.()
        if (focus && (focus.market || focus.pair)) return focus
      } catch (error) {
        console.warn(
          `[assistant] surface '${registration.id}' failed to name its instrument`,
          error,
        )
      }
    }
    return null
  }

  /** The orb's idle prompt: the leading surface that offers one. */
  getSuggestion(): AssistantSuggestion | null {
    for (const { registration } of this.ranked()) {
      try {
        const suggestion = registration.getSuggestion?.()
        if (suggestion) return suggestion
      } catch (error) {
        console.warn(
          `[assistant] surface '${registration.id}' failed to suggest`,
          error,
        )
      }
    }
    return null
  }

  // ── useSyncExternalStore ──────────────────────────────────────────

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): number => this.version

  /**
   * Surfaces read live closures, so most changes need no bump — only
   * mount and unmount move the version. Call this when a surface's
   * action NAMES change while mounted, which changes the tool set.
   */
  bump(): void {
    this.version++
    for (const listener of this.listeners) listener()
  }
}

// ── React context + hooks ────────────────────────────────────────────

export const AssistantSurfaceRegistryContext =
  createContext<AssistantSurfaceRegistry | null>(null)

/** The registry without subscribing — for imperative reads in callbacks. */
export function useAssistantSurfaceRegistry(): AssistantSurfaceRegistry {
  const registry = useContext(AssistantSurfaceRegistryContext)
  if (!registry) {
    throw new Error(
      'useAssistantSurfaceRegistry must be used within AssistantSurfaceRegistryContext.Provider',
    )
  }
  return registry
}

/** The registry, re-rendering the caller when surfaces mount or unmount. */
export function useAssistantSurfaces(): AssistantSurfaceRegistry {
  const registry = useAssistantSurfaceRegistry()
  useSyncExternalStore(
    registry.subscribe,
    registry.getSnapshot,
    registry.getSnapshot,
  )
  return registry
}
