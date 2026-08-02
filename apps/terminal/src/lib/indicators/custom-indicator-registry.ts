// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { CustomIndicatorDescriptor } from '@pairlens/shared/plugin-types'

// ---------------------------------------------------------------------------
// Custom indicator registry — the terminal-side collection point for every
// script-defined chart indicator, keyed by its chart-engine indicator type
// `custom:<providerId>:<metaId>`. Providers are `chart:indicator` plugins
// (including the first-party user-indicators plugin backed by the editor's
// script store). Charts read this registry to build engine
// IndicatorDefinitions and picker entries; the Python runtime executes the
// descriptors' source on compute.
// ---------------------------------------------------------------------------

export type CustomIndicatorEntry = {
  /** Chart-engine indicator type string */
  type: `custom:${string}`
  providerId: string
  descriptor: CustomIndicatorDescriptor
}

/**
 * Identity of a descriptor's code — entry source plus every helper module.
 * Consumers use it to tell "same indicator, unchanged code" from "recompile":
 * an unchanged key means cached definitions and Python registrations stand.
 */
export function customIndicatorSourceKey(
  descriptor: CustomIndicatorDescriptor,
): string {
  const modules = descriptor.modules
  if (!modules || modules.length === 0) return descriptor.source
  return JSON.stringify([
    descriptor.source,
    modules.map((m) => [m.path, m.source]),
  ])
}

export function customIndicatorType(
  providerId: string,
  metaId: string,
): `custom:${string}` {
  return `custom:${providerId}:${metaId}`
}

export function isCustomIndicatorType(
  type: string,
): type is `custom:${string}` {
  return type.startsWith('custom:')
}

type Listener = () => void

class CustomIndicatorRegistry {
  private entries = new Map<string, CustomIndicatorEntry>()
  private listeners = new Set<Listener>()
  private version = 0

  /** Replace all indicators contributed by one provider (plugin). */
  setProviderIndicators(
    providerId: string,
    descriptors: Array<CustomIndicatorDescriptor>,
  ): void {
    for (const [key, entry] of this.entries) {
      if (entry.providerId === providerId) this.entries.delete(key)
    }
    for (const descriptor of descriptors) {
      if (!descriptor?.meta?.id || typeof descriptor.source !== 'string')
        continue
      // Third-party plugins hand us plain JSON — keep only well-formed
      // modules so a malformed one can't reach the Python runtime.
      const modules = Array.isArray(descriptor.modules)
        ? descriptor.modules.filter(
            (m) => typeof m?.path === 'string' && typeof m.source === 'string',
          )
        : undefined
      const type = customIndicatorType(providerId, descriptor.meta.id)
      this.entries.set(type, {
        type,
        providerId,
        descriptor: modules?.length ? { ...descriptor, modules } : descriptor,
      })
    }
    this.bump()
  }

  removeProvider(providerId: string): void {
    let changed = false
    for (const [key, entry] of this.entries) {
      if (entry.providerId === providerId) {
        this.entries.delete(key)
        changed = true
      }
    }
    if (changed) this.bump()
  }

  get(type: string): CustomIndicatorEntry | undefined {
    return this.entries.get(type)
  }

  getAll(): Array<CustomIndicatorEntry> {
    return Array.from(this.entries.values())
  }

  /** Monotonic change counter — cheap dirty-check for React consumers. */
  getVersion(): number {
    return this.version
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private bump(): void {
    this.version += 1
    for (const fn of this.listeners) fn()
  }
}

export const customIndicatorRegistry = new CustomIndicatorRegistry()
