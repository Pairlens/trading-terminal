// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Human-readable labels for builder-assistant tool calls, in the same shape
 * as the copilot's table and rendered by the same chip.
 *
 * Its own file rather than more rows in `COPILOT_TOOL_LABELS`: that table is
 * asserted to match the copilot's tool set exactly, in both directions, which
 * is the property that catches a renamed or deleted tool. Sharing it would
 * have traded that check away for one import.
 */
import type { ToolLabelMap } from '@/lib/copilot/tool-labels'

export const ASSISTANT_TOOL_LABELS = {
  // ---- Scripts ----
  list_scripts: ['list', 'your scripts'],
  get_script: ['read', 'the script'],
  create_script: ['create', 'a new script'],
  update_script: ['update', 'the code'],
  delete_file: ['remove', 'a file'],
  validate_script: ['validate', 'the script'],
  run_backtest: ['run', 'a backtest'],
  get_sdk_reference: ['read', 'the SDK reference'],

  // ---- Market data ----
  list_venues: ['list', 'connected venues'],
  set_preview_target: ['set', 'the preview target'],

  // ---- Bots (paper only — arming stays the user's) ----
  list_bots: ['list', 'your bots'],
  get_bot: ['read', 'the bot'],
  create_bot: ['create', 'a paper bot'],
  update_bot: ['update', 'the bot'],

  // ---- Conversation ----
  ask_user: ['ask', 'you a question'],
  handoff_to_builder: ['open', 'the other builder'],
} as const satisfies ToolLabelMap
