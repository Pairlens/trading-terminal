// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'

import { buildWorkspaceAuthoringActions } from '../workspace-authoring-tools'
import type { WorkspaceAuthoringDeps } from '../workspace-authoring-tools'
import type { AssistantAction } from '../types'
import type { PaneDefinition } from '@/lib/layout/types'
import type { WorkspaceTemplate } from '@/lib/workspace-store/types'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'

// A catalogue small enough to reason about, shaped like the real one:
// a pane that follows the pair, a pane that follows the account, a pane
// that needs neither, and the placeholder that must never be offered.
const PANES: Record<string, PaneDefinition> = {
  chart: {
    type: 'chart',
    labelKey: 'panes.chart',
    icon: 'CandlestickChart',
    category: 'charting',
    requires: ['workspace:active-pair'],
  },
  orderbook: {
    type: 'orderbook',
    labelKey: 'panes.orderbook',
    icon: 'ListOrdered',
    category: 'trading',
    requires: ['workspace:active-pair'],
  },
  portfolio: {
    type: 'portfolio',
    labelKey: 'panes.portfolio',
    icon: 'Wallet',
    category: 'trading',
    requires: ['workspace:active-wallet'],
  },
  watchlist: {
    type: 'watchlist',
    labelKey: 'panes.watchlist',
    icon: 'Star',
    category: 'discovery',
    singleton: true,
  },
  empty: { type: 'empty', labelKey: 'panes.empty', icon: 'Plus' },
}

const TEMPLATE: WorkspaceTemplate = {
  id: 'template:test-desk',
  name: 'Test Desk',
  tagline: 'Chart and book',
  description: 'A two-pane board for testing.',
  icon: 'Crosshair',
  author: 'Pairlens',
  facets: {
    traderTypes: ['scalper'],
    assetClasses: ['crypto-spot'],
    screenSizes: ['standard'],
  },
  variables: [
    {
      name: '$pair',
      label: 'Pair',
      type: 'pair',
      defaultValue: { pairKey: 'BTC-USDT', market: 'okx' },
    },
  ],
  layout: {
    version: 1,
    columns: [
      {
        id: 'c0',
        widthPercent: 100,
        cells: [
          {
            id: 'e0',
            activeTabIndex: 0,
            heightPercent: 100,
            panes: [
              { id: 'p0', type: 'chart' },
              { id: 'p1', type: 'moon-phase' },
            ],
          },
        ],
      },
    ],
  },
}

type Recorder = {
  opened: Array<string>
  path: string
  phone: boolean
}

function makeDeps(recorder: Recorder): WorkspaceAuthoringDeps {
  return {
    getPaneDefinitions: () => PANES,
    getPluginForPane: (type) => (type === 'empty' ? null : 'pairlens-core'),
    // The real translator returns the English string; the key is enough
    // to assert that labels are resolved rather than passed through raw.
    translate: (key) => `t(${key})`,
    getFocus: () => ({ market: 'okx', pair: 'ETH-USDT' }),
    openWorkspace: (id) => recorder.opened.push(id),
    listTemplates: async () => [TEMPLATE],
    isPhone: () => recorder.phone,
    currentPath: () => recorder.path,
  }
}

function actionMap(deps: WorkspaceAuthoringDeps) {
  const actions = buildWorkspaceAuthoringActions(deps)
  return new Map<string, AssistantAction>(
    actions.map((action) => [action.name, action]),
  )
}

/** Run an action the way the surface tool wrapper does. */
async function run(
  actions: Map<string, AssistantAction>,
  name: string,
  args: unknown = {},
): Promise<Record<string, unknown>> {
  const action = actions.get(name)
  if (!action) throw new Error(`no action ${name}`)
  return (await action.execute(args as never)) as Record<string, unknown>
}

const ONE_COLUMN = { columns: [{ cells: [{ panes: ['chart'] }] }] }

let recorder: Recorder
let actions: Map<string, AssistantAction>

beforeEach(() => {
  useCustomWorkspacesStore.setState({
    workspaces: [],
    folders: [],
    loaded: true,
  })
  recorder = { opened: [], path: '/', phone: false }
  actions = actionMap(makeDeps(recorder))
})

describe('list_pane_types', () => {
  test('offers every real pane, translated, and never the placeholder', async () => {
    const result = await run(actions, 'list_pane_types')
    const panes = result.panes as Array<Record<string, unknown>>

    expect(panes.map((pane) => pane.type)).toEqual([
      'chart',
      'orderbook',
      'portfolio',
      'watchlist',
    ])
    expect(panes[0].label).toBe('t(panes.chart)')
    expect(panes[0].requires).toEqual(['workspace:active-pair'])
    expect(panes[3].singleton).toBe(true)
    expect(panes[0].plugin).toBe('pairlens-core')
  })

  test('filters by search and by category', async () => {
    const searched = await run(actions, 'list_pane_types', {
      search: 'orderbook',
    })
    expect(
      (searched.panes as Array<{ type: string }>).map((p) => p.type),
    ).toEqual(['orderbook'])

    const scoped = await run(actions, 'list_pane_types', {
      category: 'trading',
    })
    expect(
      (scoped.panes as Array<{ type: string }>).map((p) => p.type),
    ).toEqual(['orderbook', 'portfolio'])
  })
})

describe('create_workspace', () => {
  test('saves a board, derives its variables and binds the panes', async () => {
    const result = await run(actions, 'create_workspace', {
      name: 'Perps desk',
      description: 'Funding and flow',
      icon: 'Flame',
      layout: {
        columns: [
          { width: 70, cells: [{ panes: ['chart'] }] },
          {
            width: 30,
            cells: [{ panes: ['orderbook'] }, { panes: ['portfolio'] }],
          },
        ],
      },
    })

    const created = result.created as Record<string, unknown>
    expect(created.name).toBe('Perps desk')
    expect(created.icon).toBe('Flame')
    expect(created.panes).toBe(3)
    expect(created.variables).toEqual(['$pair', '$wallet'])

    const saved = useCustomWorkspacesStore
      .getState()
      .workspaces.find((workspace) => workspace.id === created.workspaceId)!
    expect(saved.defaultLayout.columns).toHaveLength(2)

    // The pair variable is seeded from what the user was looking at, so
    // the board renders a chart the moment it opens rather than a picker.
    const pair = saved.variables.find((variable) => variable.name === '$pair')!
    expect(pair.defaultValue).toEqual({ pairKey: 'ETH-USDT', market: 'okx' })

    const panes = saved.defaultLayout.columns.flatMap((column) =>
      column.cells.flatMap((cell) => cell.panes),
    )
    expect(panes.find((pane) => pane.type === 'chart')?.bindings).toEqual({
      'active-pair': '$pair',
    })
    expect(panes.find((pane) => pane.type === 'portfolio')?.bindings).toEqual({
      'active-wallet': '$wallet',
    })
  })

  test('opens the new board by default, and can be told not to', async () => {
    const opened = await run(actions, 'create_workspace', {
      name: 'One',
      layout: ONE_COLUMN,
    })
    expect(opened.opened).toBe(true)
    expect(recorder.opened).toHaveLength(1)

    const quiet = await run(actions, 'create_workspace', {
      name: 'Two',
      layout: ONE_COLUMN,
      open: false,
    })
    expect(quiet.opened).toBe(false)
    expect(recorder.opened).toHaveLength(1)
  })

  test('saves without opening on a phone, and says so', async () => {
    recorder.phone = true
    const result = await run(actions, 'create_workspace', {
      name: 'Phone board',
      layout: ONE_COLUMN,
    })
    expect(result.opened).toBe(false)
    expect(recorder.opened).toHaveLength(0)
    expect(useCustomWorkspacesStore.getState().workspaces).toHaveLength(1)
  })

  test('refuses a pane type that does not exist, and saves nothing', async () => {
    const result = await run(actions, 'create_workspace', {
      name: 'Nope',
      layout: { columns: [{ cells: [{ panes: ['chart', 'hologram'] }] }] },
    })
    expect(result.error).toContain('hologram')
    expect(useCustomWorkspacesStore.getState().workspaces).toHaveLength(0)
  })

  test('numbers a name that is already taken instead of shadowing it', async () => {
    await run(actions, 'create_workspace', { name: 'Desk', layout: ONE_COLUMN })
    const second = await run(actions, 'create_workspace', {
      name: 'Desk',
      layout: ONE_COLUMN,
    })
    expect((second.created as { name: string }).name).toBe('Desk 2')
  })
})

describe('folders', () => {
  test('files a workspace into a folder named rather than identified', async () => {
    const folder = await run(actions, 'create_workspace_folder', {
      name: 'Research',
    })
    const created = await run(actions, 'create_workspace', {
      name: 'Filed',
      folder: 'research',
      layout: ONE_COLUMN,
    })

    const summary = created.created as Record<string, unknown>
    expect(summary.folderId).toBe(folder.folderId as string)
    expect(summary.folder).toBe('Research')
  })

  test('nests a folder and reports its path', async () => {
    await run(actions, 'create_workspace_folder', { name: 'Research' })
    await run(actions, 'create_workspace_folder', {
      name: 'Perps',
      parentFolder: 'Research',
    })
    const listed = await run(actions, 'list_workspaces')
    const paths = (listed.folders as Array<{ path: string }>).map((f) => f.path)
    expect(paths).toContain('Research / Perps')
  })

  test('refuses a folder that does not exist rather than filing at the root', async () => {
    const result = await run(actions, 'create_workspace', {
      name: 'Homeless',
      folder: 'Nowhere',
      layout: ONE_COLUMN,
    })
    expect(result.error).toContain('Nowhere')
    expect(useCustomWorkspacesStore.getState().workspaces).toHaveLength(0)
  })
})

describe('update_workspace', () => {
  test('renames, refiles and re-layouts a board that is not on screen', async () => {
    const created = await run(actions, 'create_workspace', {
      name: 'Before',
      layout: ONE_COLUMN,
      open: false,
    })
    const workspaceId = (created.created as { workspaceId: string }).workspaceId

    const result = await run(actions, 'update_workspace', {
      workspaceId,
      name: 'After',
      layout: {
        columns: [
          { cells: [{ panes: ['chart'] }] },
          { cells: [{ panes: ['orderbook'] }] },
        ],
      },
    })

    const updated = result.updated as Record<string, unknown>
    expect(updated.name).toBe('After')
    expect(updated.panes).toBe(2)
  })

  test('refuses to rewrite the board the user is standing on', async () => {
    const created = await run(actions, 'create_workspace', {
      name: 'Live',
      layout: ONE_COLUMN,
      open: false,
    })
    const workspaceId = (created.created as { workspaceId: string }).workspaceId
    recorder.path = `/workspace/${workspaceId}`

    const result = await run(actions, 'update_workspace', {
      workspaceId,
      layout: ONE_COLUMN,
    })
    expect(result.error).toContain('apply_board_layout')
  })

  test('reports an id that is not a workspace', async () => {
    const result = await run(actions, 'update_workspace', {
      workspaceId: 'nope',
      name: 'x',
    })
    expect(result.error).toContain('nope')
  })
})

describe('delete_workspace', () => {
  test('waits for the user before it runs', () => {
    expect(actions.get('delete_workspace')?.needsApproval).toBe(true)
  })

  test('removes the board once approved', async () => {
    const created = await run(actions, 'create_workspace', {
      name: 'Doomed',
      layout: ONE_COLUMN,
      open: false,
    })
    const workspaceId = (created.created as { workspaceId: string }).workspaceId

    const result = await run(actions, 'delete_workspace', { workspaceId })
    expect((result.deleted as { name: string }).name).toBe('Doomed')
    expect(useCustomWorkspacesStore.getState().workspaces).toHaveLength(0)
  })
})

describe('templates', () => {
  test('lists what can be copied', async () => {
    const result = await run(actions, 'list_workspace_templates', {
      search: 'scalper',
    })
    expect(result.count).toBe(1)
    expect(
      (result.templates as Array<{ templateId: string }>)[0].templateId,
    ).toBe('template:test-desk')
  })

  test('copies one, renamed, and names the panes it cannot render', async () => {
    const result = await run(actions, 'create_workspace_from_template', {
      templateId: 'template:test-desk',
      name: 'My desk',
      open: false,
    })

    expect((result.created as { name: string }).name).toBe('My desk')
    // The template carries a pane no installed plugin provides. Silence
    // here would leave the user with a board of blanks and no reason why.
    expect(result.missingPanes).toEqual(['moon-phase'])
  })

  test('refuses a template id that does not exist', async () => {
    const result = await run(actions, 'create_workspace_from_template', {
      templateId: 'template:invented',
    })
    expect(result.error).toContain('list_workspace_templates')
  })
})

describe('open_workspace', () => {
  test('navigates to a saved board', async () => {
    const created = await run(actions, 'create_workspace', {
      name: 'Openable',
      layout: ONE_COLUMN,
      open: false,
    })
    const workspaceId = (created.created as { workspaceId: string }).workspaceId

    const result = await run(actions, 'open_workspace', { workspaceId })
    expect(result.opened).toBe('Openable')
    expect(recorder.opened).toEqual([workspaceId])
  })

  test('says plainly that the phone has no board view', async () => {
    const created = await run(actions, 'create_workspace', {
      name: 'Desktop only',
      layout: ONE_COLUMN,
      open: false,
    })
    recorder.phone = true
    const result = await run(actions, 'open_workspace', {
      workspaceId: (created.created as { workspaceId: string }).workspaceId,
    })
    expect(result.error).toContain('desktop')
    expect(recorder.opened).toHaveLength(0)
  })
})
