// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Chip labels for the whole assistant tool set ─────────────────────
//
// The three old tables each covered exactly one chat's tools, which is
// why they were kept apart. One chat means one table: the union, plus
// the handful of tools only a terminal-wide assistant has.
//
// A tool with no entry still renders — `formatToolLabel` humanizes the
// raw name — so a plugin-published action is never a blank chip.

import type { ToolLabelMap } from '@/lib/copilot/tool-labels'
import { COPILOT_TOOL_LABELS } from '@/lib/copilot/tool-labels'
import { ASSISTANT_TOOL_LABELS } from '@/lib/assistant/assistant-tool-labels'
import { AUTOMATION_TOOL_LABELS } from '@/lib/assistant/automation-tool-labels'

const TERMINAL_TOOL_LABELS = {
  navigate_to: ['open', 'the page'],
  get_screen: ['read', 'the screen'],
  deep_research: ['run', 'deep research'],
  get_alert_step_reference: ['read', 'the alert step reference'],
} as const satisfies ToolLabelMap

export const ASSISTANT_ALL_TOOL_LABELS: ToolLabelMap = {
  ...COPILOT_TOOL_LABELS,
  ...ASSISTANT_TOOL_LABELS,
  ...AUTOMATION_TOOL_LABELS,
  ...TERMINAL_TOOL_LABELS,
}
