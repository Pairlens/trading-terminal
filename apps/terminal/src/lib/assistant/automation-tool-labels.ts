// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Chip labels for the assistant's tool calls on Workflows and Notifications.
 *
 * One table for both surfaces: `get_step_reference` exists on each over its
 * own registry, and "Read the step reference" is true either way.
 */
import type { ToolLabelMap } from '@/lib/copilot/tool-labels'

export const AUTOMATION_TOOL_LABELS = {
  // ---- Shared ----
  ask_user: ['ask', 'you a question'],
  handoff_to_builder: ['open', 'another builder'],
  get_step_reference: ['read', 'the step reference'],

  // ---- Workflows ----
  list_workflows: ['list', 'your workflows'],
  get_workflow: ['read', 'the workflow'],
  create_workflow: ['create', 'a workflow'],
  update_workflow: ['update', 'the workflow'],

  // ---- Notifications ----
  list_alerts: ['list', 'your alerts'],
  get_alert: ['read', 'the alert'],
  create_simple_alert: ['create', 'an alert'],
  update_simple_alert: ['update', 'the alert'],
  create_alert_flow: ['create', 'an alert flow'],
  update_alert_flow: ['update', 'the alert flow'],
  bind_alert: ['add', 'a pair to watch'],
} as const satisfies ToolLabelMap
