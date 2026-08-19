// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Building workspaces, as actions the assistant can run ────────────
//
// `layout-assistant-surface.tsx` can rearrange the board the user is
// standing on. This is the other half: discovering every pane the
// terminal has, and turning that into SAVED workspaces — with folders,
// from scratch or from a store template — without the user ever opening
// the create dialog.
//
// Two things are deliberate here.
//
// The pane catalogue is read from the LIVE registry on every call, never
// from a list kept in this file. What panes exist depends on which
// plugins are installed, so a fixed list would be wrong for most users
// and stale for the rest — and a board built from type ids that do not
// exist renders as a wall of blanks rather than failing.
//
// The workspace tree is reached through its store directly, the way the
// watchlist and alert tools reach theirs: the whole agent loop runs in
// the terminal process, so `getState()` here is the same store the
// sidebar renders from, and a board created mid-turn is in the tree
// before the sentence describing it finishes streaming.

import { z } from 'zod'

import { PANE_CATEGORY_DEFINITIONS } from '@pairlens/shared/pane-categories'

import type { AssistantAction, AssistantSurfaceFocus } from './types'
import type {
  CustomWorkspaceDefinition,
  PaneDefinition,
  TerminalLayout,
  WorkspaceFolder,
  WorkspaceVariableDefinition,
} from '@/lib/layout/types'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import {
  layoutFromSpec,
  layoutToSpec,
  paneTypesOf,
} from '@/lib/layout/layout-spec'
import { saveLayout } from '@/lib/layout/persistence'
import {
  uniqueWorkspaceName,
  workspaceParamsFromLayout,
} from '@/lib/layout/save-workspace'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'
import {
  DEFAULT_WORKSPACE_ICON,
  WORKSPACE_ICONS,
} from '@/components/workspace/workspace-icons'
import { templateToWorkspaceParams } from '@/lib/workspace-store/catalog'

export type WorkspaceAuthoringDeps = {
  /** The live pane registry's definitions. Read per call, never cached. */
  getPaneDefinitions: () => Record<string, PaneDefinition>
  /** Which plugin owns a pane type, so the model can say where it came from. */
  getPluginForPane: (paneType: string) => string | null
  /** i18n lookup for pane labels and variable labels. */
  translate: (key: string) => string
  /** The ranked instrument focus, used to seed a new board's $pair. */
  getFocus: () => AssistantSurfaceFocus | null
  /** Put a saved workspace on screen. */
  openWorkspace: (workspaceId: string) => void
  /** The store templates a copy can be made from. */
  listTemplates: () => Promise<Array<WorkspaceTemplate>>
  /** The phone has no board view, so a workspace there is saved, not opened. */
  isPhone: () => boolean
  /** The current path, to refuse rewriting the board that is on screen. */
  currentPath: () => string
}

// ── The layout argument ──────────────────────────────────────────────

const LAYOUT_SCHEMA = z
  .object({
    columns: z
      .array(
        z.object({
          width: z
            .number()
            .optional()
            .describe(
              'Share of the board width, roughly a percentage. Omit for an even split.',
            ),
          cells: z
            .array(
              z.object({
                height: z
                  .number()
                  .optional()
                  .describe(
                    'Share of this column height. Omit for an even split.',
                  ),
                panes: z
                  .array(z.string())
                  .describe(
                    'Pane type ids from list_pane_types. More than one renders the cell as tabs.',
                  ),
              }),
            )
            .describe('Cells stacked top to bottom in this column.'),
        }),
      )
      .describe('Columns, left to right.'),
  })
  .describe(
    'The board geometry: columns left to right, each holding cells stacked top to bottom, each cell holding one pane or several as tabs.',
  )

type LayoutArg = z.infer<typeof LAYOUT_SCHEMA>

const ICON_FIELD = z
  .string()
  .optional()
  .describe(
    `A lucide icon name. One of: ${Object.keys(WORKSPACE_ICONS).join(', ')}.`,
  )

const FOLDER_FIELD = z
  .string()
  .optional()
  .describe(
    'A folder id or folder name from list_workspaces. Omit to leave it at the top level.',
  )

// ── Store helpers ────────────────────────────────────────────────────

/** The tree is lazy-loaded, so every action reads it through here. */
function workspaces() {
  useCustomWorkspacesStore.getState().load()
  return useCustomWorkspacesStore.getState()
}

/** "Research / Perps" — the path a user would read in the sidebar. */
export function folderPath(
  folder: WorkspaceFolder,
  folders: ReadonlyArray<WorkspaceFolder>,
): string {
  const names = [folder.name]
  let parentId = folder.parentId
  // Bounded: a cycle here would be corrupt data, not a deep tree.
  while (parentId && names.length < 16) {
    const parent = folders.find((entry) => entry.id === parentId)
    if (!parent) break
    names.unshift(parent.name)
    parentId = parent.parentId
  }
  return names.join(' / ')
}

/**
 * Resolve a folder argument, which may be an id or a name. Models are far
 * better with names than with an id they read once, and a name matching
 * nothing has to fail loudly: silently filing the board at the root puts
 * it exactly where the user will not look for it.
 */
function resolveFolder(
  value: string | undefined,
  folders: ReadonlyArray<WorkspaceFolder>,
): { folderId: string | null } | { error: string } {
  if (!value) return { folderId: null }
  const byId = folders.find((folder) => folder.id === value)
  if (byId) return { folderId: byId.id }

  const wanted = value.trim().toLowerCase()
  const matches = folders.filter(
    (folder) => folder.name.trim().toLowerCase() === wanted,
  )
  if (matches.length === 1) return { folderId: matches[0].id }
  if (matches.length > 1) {
    return {
      error: `More than one folder is called "${value}". Use its id from list_workspaces instead.`,
    }
  }
  const known = folders.map((folder) => folder.name).join(', ')
  return {
    error: `There is no workspace folder "${value}". ${
      known
        ? `The folders are: ${known}.`
        : 'There are no folders yet; create one with create_workspace_folder.'
    }`,
  }
}

function iconOrDefault(icon: string | undefined): string {
  return icon && icon in WORKSPACE_ICONS ? icon : DEFAULT_WORKSPACE_ICON
}

function summarize(
  workspace: CustomWorkspaceDefinition,
  folders: ReadonlyArray<WorkspaceFolder>,
) {
  const folder = workspace.folderId
    ? folders.find((entry) => entry.id === workspace.folderId)
    : null
  return {
    workspaceId: workspace.id,
    name: workspace.name,
    description: workspace.description ?? null,
    icon: workspace.icon ?? DEFAULT_WORKSPACE_ICON,
    folder: folder ? folderPath(folder, folders) : null,
    folderId: workspace.folderId ?? null,
    panes: paneTypesOf(workspace.defaultLayout).length,
    variables: workspace.variables.map((variable) => variable.name),
    url: `/workspace/${workspace.id}`,
  }
}

// ── The actions ──────────────────────────────────────────────────────

export function buildWorkspaceAuthoringActions(
  deps: WorkspaceAuthoringDeps,
): Array<AssistantAction> {
  const label = (definition: PaneDefinition) =>
    deps.translate(definition.labelKey)
  const describe = (definition: PaneDefinition) =>
    definition.descriptionKey
      ? deps.translate(definition.descriptionKey)
      : undefined

  /** Name it uniquely, save it, file it, and open it. */
  const persist = (params: {
    name: string
    description?: string
    icon?: string
    variables: Array<WorkspaceVariableDefinition>
    defaultLayout: TerminalLayout
    folderId: string | null
    open: boolean
  }) => {
    const store = workspaces()
    const name = uniqueWorkspaceName(
      params.name.trim(),
      store.workspaces.map((workspace) => workspace.name),
    )
    const workspaceId = store.createWorkspace({
      name,
      description: params.description,
      icon: iconOrDefault(params.icon),
      variables: params.variables,
      defaultLayout: params.defaultLayout,
      folderId: params.folderId,
    })

    const after = useCustomWorkspacesStore.getState()
    const created = after.workspaces.find((entry) => entry.id === workspaceId)
    const phone = deps.isPhone()
    const opened = params.open && !phone
    if (opened) deps.openWorkspace(workspaceId)

    return {
      created: created
        ? summarize(created, after.folders)
        : { workspaceId, name },
      opened,
      note: opened
        ? 'The workspace is open on screen. Its panes can be adjusted from here with add_pane and remove_pane.'
        : phone
          ? 'Saved. Saved workspaces open on the desktop terminal; the phone shell has no board view.'
          : 'Saved to the workspace tree in the sidebar. Open it with open_workspace.',
    }
  }

  return [
    {
      name: 'list_pane_types',
      description:
        'Every pane this terminal can put on a board, and what each one shows. Call this before building or changing any layout so every pane type id is real: the catalogue is whatever the installed plugins contribute, so it differs between users.',
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe('Filter by name, description or type id.'),
        category: z
          .string()
          .optional()
          .describe(
            `Filter to one category: ${PANE_CATEGORY_DEFINITIONS.map((category) => category.id).join(', ')}.`,
          ),
      }),
      execute: ({
        search,
        category,
      }: {
        search?: string
        category?: string
      }) => {
        const query = search?.trim().toLowerCase()
        const panes = Object.values(deps.getPaneDefinitions())
          // The placeholder is what an empty cell renders. Offering it as
          // a choice only invites boards built out of blanks.
          .filter((definition) => definition.type !== 'empty')
          .filter((definition) => !category || definition.category === category)
          .filter((definition) => {
            if (!query) return true
            return `${definition.type} ${label(definition)} ${describe(definition) ?? ''}`
              .toLowerCase()
              .includes(query)
          })
          .map((definition) => ({
            type: definition.type,
            label: label(definition),
            description: describe(definition),
            category: definition.category ?? null,
            // What the pane needs to render: a pair, an account, or a
            // capability only some venues serve. These are what get wired
            // to the workspace's own variables when a board is created.
            requires: definition.requires ?? [],
            singleton: definition.singleton ?? false,
            desktopOnly: definition.requiresDesktop ?? false,
            plugin: deps.getPluginForPane(definition.type),
          }))
          .sort((a, b) => a.type.localeCompare(b.type))

        return {
          count: panes.length,
          categories: PANE_CATEGORY_DEFINITIONS.map((entry) => ({
            id: entry.id,
            label: entry.label,
          })),
          panes,
          note: 'A pane requiring workspace:active-pair or workspace:active-wallet is bound automatically to the new workspace’s $pair / $wallet variable.',
        }
      },
    },

    {
      name: 'list_workspaces',
      description:
        'The user’s saved workspaces and the folders they are organised in.',
      inputSchema: z.object({}),
      execute: () => {
        const store = workspaces()
        return {
          workspaces: store.workspaces.map((workspace) =>
            summarize(workspace, store.folders),
          ),
          folders: store.folders.map((folder) => ({
            folderId: folder.id,
            name: folder.name,
            path: folderPath(folder, store.folders),
            parentId: folder.parentId,
          })),
        }
      },
    },

    {
      name: 'get_workspace',
      description:
        'Read one saved workspace in full: its layout column by column, and the variables its panes are bound to.',
      inputSchema: z.object({
        workspaceId: z.string().describe('An id from list_workspaces'),
      }),
      execute: ({ workspaceId }: { workspaceId: string }) => {
        const store = workspaces()
        const workspace = store.workspaces.find(
          (entry) => entry.id === workspaceId,
        )
        if (!workspace) return notFound(workspaceId)

        const definitions = deps.getPaneDefinitions()
        return {
          ...summarize(workspace, store.folders),
          layout: layoutToSpec(workspace.defaultLayout),
          paneLabels: Object.fromEntries(
            [...new Set(paneTypesOf(workspace.defaultLayout))].map((type) => [
              type,
              definitions[type] ? label(definitions[type]) : 'not installed',
            ]),
          ),
          variableDetail: workspace.variables,
        }
      },
    },

    {
      name: 'create_workspace',
      description:
        'Build the user a new saved workspace and put it in their sidebar. Call list_pane_types first so every pane type id is real. Panes that follow a pair or an account are wired to the workspace’s own variables, seeded with whatever instrument is on screen.',
      inputSchema: z.object({
        name: z.string().describe('What to call it, e.g. "Perps desk"'),
        description: z
          .string()
          .optional()
          .describe('One line on what the board is for.'),
        icon: ICON_FIELD,
        folder: FOLDER_FIELD,
        layout: LAYOUT_SCHEMA,
        open: z
          .boolean()
          .optional()
          .describe('Open it right away. Defaults to true.'),
      }),
      execute: (args: {
        name: string
        description?: string
        icon?: string
        folder?: string
        layout: LayoutArg
        open?: boolean
      }) => {
        if (!args.name.trim()) return { error: 'A workspace needs a name.' }
        const store = workspaces()
        const target = resolveFolder(args.folder, store.folders)
        if ('error' in target) return target

        const built = layoutFromSpec(args.layout, deps.getPaneDefinitions())
        if ('error' in built) return built

        // Seeded from the ranked focus rather than a route: the assistant
        // sits above the routes, and the registry already resolves which
        // instrument the user is actually looking at.
        const focus = deps.getFocus()
        const params = workspaceParamsFromLayout({
          layout: built.layout,
          paneDefinitions: deps.getPaneDefinitions(),
          name: args.name.trim(),
          description: args.description?.trim() || undefined,
          icon: iconOrDefault(args.icon),
          activePair:
            focus?.pair && focus.market
              ? { pairKey: focus.pair, market: focus.market }
              : null,
          labels: {
            pair: deps.translate('workspace.variables.typePair'),
            wallet: deps.translate('accounts.account'),
          },
        })

        return persist({
          ...params,
          folderId: target.folderId,
          open: args.open !== false,
        })
      },
    },

    {
      name: 'update_workspace',
      description:
        'Rename a saved workspace, change its description, icon or folder, or replace its layout. To rearrange the board the user is looking at right now, use add_pane, remove_pane or apply_board_layout: those act on the live board.',
      inputSchema: z.object({
        workspaceId: z.string().describe('An id from list_workspaces'),
        name: z.string().optional(),
        description: z.string().optional(),
        icon: ICON_FIELD,
        folder: FOLDER_FIELD,
        layout: LAYOUT_SCHEMA.optional().describe(
          'Replace the whole layout. Only for a workspace that is not the one on screen.',
        ),
      }),
      execute: (args: {
        workspaceId: string
        name?: string
        description?: string
        icon?: string
        folder?: string
        layout?: LayoutArg
      }) => {
        const store = workspaces()
        const workspace = store.workspaces.find(
          (entry) => entry.id === args.workspaceId,
        )
        if (!workspace) return notFound(args.workspaceId)

        const patch: Partial<CustomWorkspaceDefinition> = {}
        if (args.name?.trim()) patch.name = args.name.trim()
        if (args.description !== undefined) {
          patch.description = args.description.trim() || undefined
        }
        if (args.icon) patch.icon = iconOrDefault(args.icon)
        if (args.folder !== undefined) {
          const target = resolveFolder(args.folder, store.folders)
          if ('error' in target) return target
          patch.folderId = target.folderId
        }

        if (args.layout) {
          // The open board holds its own reducer state and autosaves over
          // this key, so a rewrite underneath it would be either ignored
          // or lost. Say so rather than report a change that never lands.
          if (deps.currentPath() === `/workspace/${args.workspaceId}`) {
            return {
              error:
                'That workspace is the board on screen. Use apply_board_layout to rebuild it live.',
            }
          }
          const built = layoutFromSpec(args.layout, deps.getPaneDefinitions())
          if ('error' in built) return built

          const params = workspaceParamsFromLayout({
            layout: built.layout,
            paneDefinitions: deps.getPaneDefinitions(),
            variables: workspace.variables,
            name: patch.name ?? workspace.name,
          })
          patch.defaultLayout = params.defaultLayout
          // A workspace opened before carries a saved arrangement that
          // would win over the new default. Replace that too, so "change
          // my board" changes the board rather than the reset button.
          saveLayout(
            params.defaultLayout,
            `pairlens:workspace.${args.workspaceId}.layout`,
          )
        }

        store.updateWorkspace(args.workspaceId, patch)
        const after = useCustomWorkspacesStore.getState()
        const updated = after.workspaces.find(
          (entry) => entry.id === args.workspaceId,
        )
        return {
          updated: updated
            ? summarize(updated, after.folders)
            : { workspaceId: args.workspaceId },
        }
      },
    },

    {
      name: 'delete_workspace',
      // The user answers on a card before this runs: a board they spent
      // an afternoon arranging is not something to remove on inference.
      needsApproval: true,
      description:
        'Delete one of the user’s saved workspaces, along with the arrangement saved for it. This cannot be undone.',
      inputSchema: z.object({
        workspaceId: z.string().describe('An id from list_workspaces'),
      }),
      execute: ({ workspaceId }: { workspaceId: string }) => {
        const store = workspaces()
        const workspace = store.workspaces.find(
          (entry) => entry.id === workspaceId,
        )
        if (!workspace) return notFound(workspaceId)
        store.deleteWorkspace(workspaceId)
        return { deleted: { workspaceId, name: workspace.name } }
      },
    },

    {
      name: 'create_workspace_folder',
      description:
        'Add a folder to the workspace tree, so a set of boards can live together.',
      inputSchema: z.object({
        name: z.string().describe('Folder name, e.g. "Research"'),
        parentFolder: z
          .string()
          .optional()
          .describe('An id or name from list_workspaces to nest it under.'),
      }),
      execute: ({
        name,
        parentFolder,
      }: {
        name: string
        parentFolder?: string
      }) => {
        if (!name.trim()) return { error: 'A folder needs a name.' }
        const store = workspaces()
        const parent = resolveFolder(parentFolder, store.folders)
        if ('error' in parent) return parent
        const folderId = store.createFolder(name.trim(), parent.folderId)
        return { folderId, name: name.trim() }
      },
    },

    {
      name: 'open_workspace',
      description: 'Put one of the user’s saved workspaces on screen.',
      inputSchema: z.object({
        workspaceId: z.string().describe('An id from list_workspaces'),
      }),
      execute: ({ workspaceId }: { workspaceId: string }) => {
        const store = workspaces()
        const workspace = store.workspaces.find(
          (entry) => entry.id === workspaceId,
        )
        if (!workspace) return notFound(workspaceId)
        if (deps.isPhone()) {
          return {
            error:
              'Saved workspaces are a desktop board. The phone terminal shows the watchlist, trade, chart, assistant and discover tabs instead.',
          }
        }
        deps.openWorkspace(workspaceId)
        return { opened: workspace.name, url: `/workspace/${workspaceId}` }
      },
    },

    {
      name: 'list_workspace_templates',
      description:
        'Ready-made workspace layouts: the bundled Workspace Store catalogue plus anything the installed plugins contribute. Copy one with create_workspace_from_template rather than rebuilding it pane by pane.',
      inputSchema: z.object({
        search: z
          .string()
          .optional()
          .describe(
            'Filter by name, tagline, tag, asset class or trader type.',
          ),
      }),
      execute: async ({ search }: { search?: string }) => {
        const templates = await deps.listTemplates()
        const query = search?.trim().toLowerCase()
        const matches = templates.filter((template) => {
          if (!query) return true
          return [
            template.name,
            template.tagline,
            template.description,
            ...(template.tags ?? []),
            ...template.facets.assetClasses,
            ...template.facets.traderTypes,
          ]
            .join(' ')
            .toLowerCase()
            .includes(query)
        })
        return {
          count: matches.length,
          templates: matches.map((template) => ({
            templateId: template.id,
            name: template.name,
            tagline: template.tagline,
            assetClasses: template.facets.assetClasses,
            traderTypes: template.facets.traderTypes,
            screenSizes: template.facets.screenSizes,
            panes: paneTypesOf(template.layout).length,
          })),
        }
      },
    },

    {
      name: 'create_workspace_from_template',
      description:
        'Copy a workspace template into the user’s own saved workspaces, optionally renamed and filed in a folder.',
      inputSchema: z.object({
        templateId: z.string().describe('An id from list_workspace_templates'),
        name: z
          .string()
          .optional()
          .describe('Rename the copy. Defaults to the template name.'),
        folder: FOLDER_FIELD,
        open: z
          .boolean()
          .optional()
          .describe('Open it right away. Defaults to true.'),
      }),
      execute: async (args: {
        templateId: string
        name?: string
        folder?: string
        open?: boolean
      }) => {
        const templates = await deps.listTemplates()
        const template = templates.find((entry) => entry.id === args.templateId)
        if (!template) {
          return {
            error: `There is no workspace template "${args.templateId}". Call list_workspace_templates for the ids that exist.`,
          }
        }
        const store = workspaces()
        const target = resolveFolder(args.folder, store.folders)
        if ('error' in target) return target

        const params = templateToWorkspaceParams(template)
        const definitions = deps.getPaneDefinitions()
        const missing = [...new Set(paneTypesOf(params.defaultLayout))].filter(
          (type) => !definitions[type],
        )

        return {
          ...persist({
            ...params,
            name: args.name?.trim() || params.name,
            folderId: target.folderId,
            open: args.open !== false,
          }),
          // Never silently: a template built around a plugin the user does
          // not have is mostly a board of blanks, and the fix is one visit
          // to the Plugin Store.
          ...(missing.length > 0
            ? {
                missingPanes: missing,
                missingPanesNote:
                  'These panes belong to plugins that are not installed. They render empty until the user installs them from the Plugin Store.',
              }
            : {}),
        }
      },
    },
  ]
}

function notFound(workspaceId: string) {
  return {
    error: `There is no saved workspace with id "${workspaceId}". Call list_workspaces for the ones that exist.`,
  }
}
