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
//
// Building a board is the other half, and it lives one level up in
// `assistant-core/workspace-authoring-surface.tsx`: the pane catalogue
// and the saved-workspace tree are not about the screen, so they are
// published from above the routes. What has to stay here is anything
// that acts on THIS board — including replacing its whole geometry, and
// saving what the user has assembled as a workspace of their own.

import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { usePaneRegistry } from './pane-registry'
import { useLayout } from './context'
import { useWorkspace } from './workspace-context'
import { layoutFromSpec, layoutToSpec } from './layout-spec'
import {
  uniqueWorkspaceName,
  workspaceParamsFromLayout,
} from './save-workspace'
import type { AssistantAction } from '@/lib/assistant-core/types'
import { useAssistantSurface } from '@/lib/assistant-core/use-assistant-surface'
import { useActivePair } from '@/lib/active-pair-context'
import { useActiveWallet } from '@/lib/active-wallet-context'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'
import {
  DEFAULT_WORKSPACE_ICON,
  WORKSPACE_ICONS,
} from '@/components/workspace/workspace-icons'
import { track } from '@/lib/analytics-events'
import { workspaceAnalyticsKind } from '@/lib/analytics-panels'

const BOARD_LAYOUT_SCHEMA = z.object({
  columns: z.array(
    z.object({
      width: z
        .number()
        .optional()
        .describe('Share of the board width. Omit for an even split.'),
      cells: z.array(
        z.object({
          height: z
            .number()
            .optional()
            .describe('Share of the column height. Omit for an even split.'),
          panes: z
            .array(z.string())
            .describe(
              'Pane type ids from list_pane_types. More than one renders as tabs.',
            ),
        }),
      ),
    }),
  ),
})

export function LayoutAssistantSurface() {
  const { layout, dispatch } = useLayout()
  const registry = usePaneRegistry()
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { activePair } = useActivePair()
  const { activeWallet } = useActiveWallet()

  // Read live inside each action rather than closing over a snapshot:
  // the model may add three panes in one turn, and the second call must
  // see what the first one did.
  const actions = useMemo<Array<AssistantAction>>(
    () => [
      {
        name: 'list_workspace_panes',
        description:
          'List the panes on the workspace the user is looking at, and every pane type that could be added. Call this before add_pane so you use a real type id. For what each pane type actually shows, call list_pane_types.',
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
      {
        name: 'apply_board_layout',
        // Approval-gated, unlike add_pane: this throws away an
        // arrangement the user may have spent a while on, and the card
        // shows them the geometry before it lands.
        needsApproval: true,
        description:
          'Rebuild the board the user is looking at, replacing every pane on it. Use this to restructure a board in one step rather than a dozen add_pane calls. Call list_pane_types first. To build a NEW saved workspace instead of changing this one, use create_workspace.',
        inputSchema: z.object({ layout: BOARD_LAYOUT_SCHEMA }),
        execute: ({
          layout: spec,
        }: {
          layout: z.infer<typeof BOARD_LAYOUT_SCHEMA>
        }) => {
          const built = layoutFromSpec(spec, registry.getDefinitions())
          if ('error' in built) return built
          dispatch({ type: 'APPLY_PRESET', layout: built.layout })
          return {
            applied: layoutToSpec(built.layout),
            note: 'The board on screen now has this geometry. It is saved as the user’s arrangement for this surface.',
          }
        },
      },
      {
        name: 'save_current_workspace',
        description:
          'Save the board the user is looking at as a workspace of their own, in the sidebar tree. Panes that follow the on-screen pair or account are wired to the new workspace’s variables, seeded with what is on screen.',
        inputSchema: z.object({
          name: z.string().describe('What to call it'),
          description: z.string().optional(),
          icon: z
            .string()
            .optional()
            .describe(
              `A lucide icon name. One of: ${Object.keys(WORKSPACE_ICONS).join(', ')}.`,
            ),
          open: z
            .boolean()
            .optional()
            .describe('Open the saved copy right away. Defaults to true.'),
        }),
        execute: ({
          name,
          description,
          icon,
          open,
        }: {
          name: string
          description?: string
          icon?: string
          open?: boolean
        }) => {
          if (!name.trim()) return { error: 'A workspace needs a name.' }
          const store = useCustomWorkspacesStore.getState()
          store.load()
          const taken = useCustomWorkspacesStore
            .getState()
            .workspaces.map((entry) => entry.name)
          const id = useCustomWorkspacesStore.getState().createWorkspace(
            workspaceParamsFromLayout({
              layout,
              paneDefinitions: registry.getDefinitions(),
              variables: workspace.variables,
              name: uniqueWorkspaceName(name.trim(), taken),
              description: description?.trim() || undefined,
              icon:
                icon && icon in WORKSPACE_ICONS ? icon : DEFAULT_WORKSPACE_ICON,
              activePair,
              activeWallet,
              // "Account", not "Wallet": outside the DEX connectors a
              // wallet variable resolves to a connected exchange account.
              labels: {
                pair: t('workspace.variables.typePair'),
                wallet: t('accounts.account'),
              },
            }),
          )
          track('workspace_layout_saved', {
            workspace: workspaceAnalyticsKind(workspace.storageKey),
            mode: 'new',
          })
          if (open !== false) {
            void navigate({
              to: '/workspace/$workspaceId',
              params: { workspaceId: id },
            })
          }
          return { workspaceId: id, url: `/workspace/${id}` }
        },
      },
    ],
    [
      layout,
      dispatch,
      registry,
      workspace,
      navigate,
      t,
      activePair,
      activeWallet,
    ],
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
      )} panes. It can be rearranged with add_pane and remove_pane, rebuilt in one step with apply_board_layout, or saved to their own workspaces with save_current_workspace.`,
    }),
  })

  return null
}
