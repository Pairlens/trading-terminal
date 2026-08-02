// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * VS Code-style service registry for cross-plugin communication.
 *
 * Plugins register named services (e.g. 'chart-actions') that other
 * plugins can discover and call. One service per name — last registration
 * wins (with a console warning if a different plugin overwrites).
 */
export class ServiceRegistry {
  private services = new Map<string, { pluginId: string; service: unknown }>()
  private listeners = new Map<string, Set<() => void>>()

  register(pluginId: string, name: string, service: unknown): () => void {
    const existing = this.services.get(name)
    if (existing && existing.pluginId !== pluginId) {
      console.warn(
        `[ServiceRegistry] Service '${name}' overwritten by '${pluginId}' (was '${existing.pluginId}')`,
      )
    }
    this.services.set(name, { pluginId, service })
    this.notify(name)

    return () => {
      const current = this.services.get(name)
      if (current?.pluginId === pluginId && current?.service === service) {
        this.services.delete(name)
        this.notify(name)
      }
    }
  }

  get<T>(name: string): T | null {
    const entry = this.services.get(name)
    return entry ? (entry.service as T) : null
  }

  unregisterAll(pluginId: string): void {
    const toDelete: Array<string> = []
    for (const [name, entry] of this.services) {
      if (entry.pluginId === pluginId) {
        toDelete.push(name)
      }
    }
    for (const name of toDelete) {
      this.services.delete(name)
      this.notify(name)
    }
  }

  onChange(name: string, callback: () => void): () => void {
    let set = this.listeners.get(name)
    if (!set) {
      set = new Set()
      this.listeners.set(name, set)
    }
    set.add(callback)
    return () => {
      set.delete(callback)
      if (set.size === 0 && this.listeners.get(name) === set) {
        this.listeners.delete(name)
      }
    }
  }

  private notify(name: string): void {
    const set = this.listeners.get(name)
    if (set) {
      for (const cb of set) cb()
    }
  }
}
