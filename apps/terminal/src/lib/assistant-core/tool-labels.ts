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

import { DATA_TOOL_LABELS } from './data-tools'
import type { ToolLabelMap } from '@/lib/copilot/tool-labels'
import { COPILOT_TOOL_LABELS } from '@/lib/copilot/tool-labels'
import { ASSISTANT_TOOL_LABELS } from '@/lib/assistant/assistant-tool-labels'
import { AUTOMATION_TOOL_LABELS } from '@/lib/assistant/automation-tool-labels'

const TERMINAL_TOOL_LABELS = {
  navigate_to: ['open', 'the page'],
  open_instrument: ['open', 'the instrument'],
  list_nft_collections: ['rank', 'NFT collections'],
  get_nft_collection: ['read', 'the collection'],
  get_nft_book: ['read', 'the NFT ladder'],
  get_prediction_event: ['read', 'the event'],
  search_prediction_events: ['search', 'prediction markets'],
  get_screen: ['read', 'the screen'],
  highlight_ui: ['highlight', 'it on screen'],
  deep_research: ['run', 'deep research'],
  get_alert_step_reference: ['read', 'the alert step reference'],
} as const satisfies ToolLabelMap

/**
 * The board and workspace actions. Published by surfaces rather than by
 * `buildAssistantToolSet`, so the coverage test cannot see them — but the
 * user does, on a chip, which is reason enough for them to read as
 * sentences rather than as identifiers.
 */
const WORKSPACE_TOOL_LABELS = {
  list_pane_types: ['list', 'the panes available'],
  list_workspace_panes: ['list', 'the panes on this board'],
  add_pane: ['add', 'the pane'],
  remove_pane: ['remove', 'the pane'],
  apply_board_layout: ['set', 'the board layout'],
  save_current_workspace: ['create', 'a workspace from this board'],
  list_workspaces: ['list', 'the workspaces'],
  get_workspace: ['read', 'the workspace'],
  create_workspace: ['create', 'the workspace'],
  update_workspace: ['update', 'the workspace'],
  delete_workspace: ['remove', 'the workspace'],
  open_workspace: ['open', 'the workspace'],
  create_workspace_folder: ['create', 'the folder'],
  list_workspace_templates: ['list', 'the workspace templates'],
  create_workspace_from_template: ['create', 'the workspace from a template'],
} as const satisfies ToolLabelMap

export const ASSISTANT_ALL_TOOL_LABELS: ToolLabelMap = {
  ...COPILOT_TOOL_LABELS,
  ...ASSISTANT_TOOL_LABELS,
  ...AUTOMATION_TOOL_LABELS,
  ...TERMINAL_TOOL_LABELS,
  ...WORKSPACE_TOOL_LABELS,
  ...DATA_TOOL_LABELS,
}
