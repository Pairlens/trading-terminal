// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Notification Step Type Registry ──────────────────────────────────
//
// Defines the schema for notification step types. Plugins contribute
// channel step types via the 'notification:channel' capability.

import type {
  ConfigField,
  NotificationEventPayload,
  NotificationMessage,
} from './types'

export type HandleDef = {
  id: string
  label?: string
  maxConnections?: number
}

export type NotificationStepCategory = 'event' | 'condition' | 'channel'

export type NotificationStepTypeDefinition = {
  type: string
  label: string
  icon: string
  category: NotificationStepCategory
  handles: {
    inputs: Array<HandleDef>
    outputs: Array<HandleDef>
  }
  configSchema: Array<ConfigField>
  validate: (data: Record<string, unknown>) => Array<string>
  defaultData: () => Record<string, unknown>
  /** Format the notification message from event data (event steps only) */
  formatMessage?: (
    data: Record<string, unknown>,
    payload: NotificationEventPayload,
  ) => { title: string; body: string; severity: string }
  /** Evaluate condition against an event payload (condition steps only) */
  evaluate?: (
    data: Record<string, unknown>,
    payload: NotificationEventPayload,
  ) => boolean
  /** Deliver a notification message (channel steps only) */
  deliver?: (
    data: Record<string, unknown>,
    message: NotificationMessage,
  ) => Promise<void>
  /** True for steps that use pass/fail branching (condition steps) */
  branching?: boolean
}

// ── Registry ─────────────────────────────────────────────────────────

const registry = new Map<string, NotificationStepTypeDefinition>()

export function registerStepType(def: NotificationStepTypeDefinition): void {
  registry.set(def.type, def)
}

export function registerStepTypes(
  defs: Array<NotificationStepTypeDefinition>,
): void {
  for (const def of defs) {
    registry.set(def.type, def)
  }
}

export function unregisterStepTypes(types: Array<string>): void {
  for (const t of types) {
    registry.delete(t)
  }
}

export function getStepType(
  type: string,
): NotificationStepTypeDefinition | undefined {
  return registry.get(type)
}

export function getAllStepTypes(): Array<NotificationStepTypeDefinition> {
  return [...registry.values()]
}

export function clearRegistry(): void {
  registry.clear()
}
