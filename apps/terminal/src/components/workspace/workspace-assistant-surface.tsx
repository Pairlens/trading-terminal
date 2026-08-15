// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Which saved workspace is open, published to the assistant ────────
//
// `/workspace/6f2c…` is an id and nothing else. The board underneath it
// publishes its panes through the layout surface, but not what the user
// calls it or what they built it for, which is the part they will use
// when they say "this board".

import type { CustomWorkspaceDefinition } from '@/lib/layout/types'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'

export function WorkspaceAssistantSurface({
  workspace,
}: {
  workspace: CustomWorkspaceDefinition
}) {
  useAssistantSurface({
    id: 'page:workspace',
    // Between the layout board (20) and a chart pane (50): more specific
    // than "a board with six panes", less specific than the chart on it.
    getPriority: () => 30,
    revision: workspace.id,
    getContext: () => ({
      summary: `The user is on their saved workspace "${workspace.name}" (id ${workspace.id})${
        workspace.description ? `: ${workspace.description}` : ''
      }. Its panes can be rearranged with add_pane and remove_pane.`,
      detail: {
        workspaceId: workspace.id,
        name: workspace.name,
        description: workspace.description,
        variables: workspace.variables.map((variable) => variable.name),
      },
    }),
    getSuggestion: () => ({ key: 'assistantDock.suggest.workspaceStore' }),
  })

  return null
}
