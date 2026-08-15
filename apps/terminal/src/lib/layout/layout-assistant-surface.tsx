// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The workspace, published to the assistant ────────────────────────
//
// The first surface to publish real ACTIONS rather than just context,
// and a good demonstration of why the registry exists: the layout
// reducer lives below the routed content, so "add an order book to my
// workspace" cannot be a global tool. It can only be offered by the
// board that is currently mounted, which is exactly what this does.
//
// Mounted inside LayoutProvider, so it withdraws itself the moment the
// user leaves a board.

import { useMemo } from 'react'
import { z } from 'zod'

import { usePaneRegistry } from './pane-registry'
import { useLayout } from './context'
import type { AssistantAction } from '@/lib/assistant-core/types'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'

export function LayoutAssistantSurface() {
  const { layout, dispatch } = useLayout()
  const registry = usePaneRegistry()

  // Read live inside each action rather than closing over a snapshot:
  // the model may add three panes in one turn, and the second call must
  // see what the first one did.
  const actions = useMemo<Array<AssistantAction>>(
    () => [
      {
        name: 'list_workspace_panes',
        description:
          'List the panes on the workspace the user is looking at, and every pane type that could be added. Call this before add_pane so you use a real type id.',
        inputSchema: z.object({}),
        execute: () => ({
          open: layout.columns.flatMap((column) =>
            column.cells.flatMap((cell) =>
              cell.panes.map((pane) => ({ id: pane.id, type: pane.type })),
            ),
          ),
          available: Object.keys(registry.getDefinitions()),
        }),
      },
      {
        name: 'add_pane',
        description:
          'Add a pane to the workspace the user is looking at. Use a type id from list_workspace_panes. It lands in a new column on the right.',
        inputSchema: z.object({
          paneType: z
            .string()
            .describe('A pane type id, e.g. orderbook, trades, watchlist'),
        }),
        execute: ({ paneType }: { paneType: string }) => {
          const known = paneType in registry.getDefinitions()
          if (!known) {
            return {
              error: `'${paneType}' is not a pane type on this workspace. Call list_workspace_panes for the available ids.`,
            }
          }
          dispatch({
            type: 'ADD_PANE_NEW_COLUMN',
            paneType,
            columnIndex: layout.columns.length,
          })
          return { added: paneType }
        },
      },
      {
        name: 'remove_pane',
        description:
          'Remove a pane from the workspace the user is looking at, by the pane id from list_workspace_panes.',
        inputSchema: z.object({
          paneId: z.string().describe('A pane id from list_workspace_panes'),
        }),
        execute: ({ paneId }: { paneId: string }) => {
          const exists = layout.columns.some((column) =>
            column.cells.some((cell) =>
              cell.panes.some((pane) => pane.id === paneId),
            ),
          )
          if (!exists) {
            return { error: `There is no pane '${paneId}' on this workspace.` }
          }
          dispatch({ type: 'REMOVE_PANE', paneId })
          return { removed: paneId }
        },
      },
    ],
    [layout, dispatch, registry],
  )

  useAssistantSurface({
    id: 'workspace-layout',
    // Below the chart: the chart is what "this" usually means, but the
    // board is the thing that can be rearranged.
    getPriority: () => 20,
    getActions: () => actions,
    getContext: () => ({
      summary: `The user is on a workspace board with ${layout.columns.reduce(
        (total, column) =>
          total +
          column.cells.reduce((cells, cell) => cells + cell.panes.length, 0),
        0,
      )} panes. It can be rearranged with add_pane and remove_pane.`,
    }),
  })

  return null
}
