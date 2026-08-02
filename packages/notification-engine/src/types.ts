// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Notification Rule DSL ─────────────────────────────────────────────
// Uses the same step+edge shape as WorkflowDSL for ReactFlow compatibility.

export type NotificationRuleDSL = {
  version: 1
  id: string
  name: string
  steps: Array<NotificationStepDSL>
  edges: Array<NotificationEdgeDSL>
  cooldown?: number // seconds between re-firings
  /** Rule-level kill switch. Absent means enabled (default true). */
  enabled?: boolean
  createdAt: number
  updatedAt: number
}

// ── Binding ──────────────────────────────────────────────────────────
// Links a pair-agnostic notification flow to a specific pair+market.
// One flow can have many bindings. One pair can have many flows.

export type NotificationBinding = {
  id: string
  ruleId: string // references a NotificationRuleDSL
  pair: string // e.g. "BTC-USDT"
  market: string // e.g. "okx"
  wallet?: string
  enabled: boolean
  createdAt: number
}

export type NotificationStepDSL = {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export type NotificationEdgeDSL = {
  id: string
  source: string
  sourceHandle?: string // for condition pass/fail branching
  target: string
}

// ── Config Field Schema ──────────────────────────────────────────────
// Schema-driven configuration for step types.

export type ConfigFieldType =
  | 'number'
  | 'string'
  | 'select'
  | 'slider'
  | 'toggle'

export type ConfigField = {
  key: string
  type: ConfigFieldType
  label: string
  default: unknown
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
  placeholder?: string
}

// ── Event Payload ────────────────────────────────────────────────────
// Emitted by event source adapters and flows through the rule.

export type NotificationEventPayload = {
  eventType: string
  timestamp: number
  pair?: string
  market?: string
  price?: number
  /**
   * The price observed on the previous evaluation of the same stream.
   * Lets level alerts fire on threshold CROSSING instead of re-firing on
   * every tick while the price sits past the level. Absent on the first
   * tick after a subscription starts.
   */
  prevPrice?: number
  data: Record<string, unknown>
}

// ── Notification Message ─────────────────────────────────────────────
// Built by the evaluator and delivered to channel steps.

export type NotificationMessage = {
  ruleId: string
  ruleName: string
  title: string
  body: string
  severity: 'info' | 'success' | 'warning' | 'error'
  timestamp: number
  payload: NotificationEventPayload
}
