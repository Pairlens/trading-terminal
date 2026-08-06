// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Turning "what's on screen right now" into a saveable workspace.
 *
 * The pair and discovery routes render a layout with no variables behind it —
 * their panes read the active pair from route context, so a raw copy of that
 * layout would open empty in a custom workspace, which has no route to read
 * from. A save from those surfaces therefore derives the `$pair`/`$wallet`
 * variables the panes need, seeds them with whatever the user was actually
 * looking at, and binds the panes to them. A save from a custom workspace
 * already has variables and bindings, and keeps both.
 *
 * What a pane needs comes from the live pane registry (`requires`), not from a
 * fixed list of pane types: the layout being saved is whatever the user
 * assembled, plugin panes included, and the registry is the same source the
 * layout reducer binds against when a pane is added by hand.
 */
import { normalizeLayout } from './utils'
import type {
  PaneDefinition,
  PaneInstance,
  TerminalLayout,
  WorkspaceVariableDefinition,
  WorkspaceVariableType,
} from './types'

/**
 * The pane requirements a saved layout can satisfy on its own. `active-timeframe`
 * is a bindable slot too, but no pane declares a requirement for it — a pane
 * that needs one carries its own, so there is nothing to derive.
 */
const DERIVABLE_SLOTS = [
  {
    requirement: 'workspace:active-pair',
    slot: 'active-pair',
    name: '$pair',
    fallbackLabel: 'Pair',
    type: 'pair' as WorkspaceVariableType,
  },
  {
    requirement: 'workspace:active-wallet',
    slot: 'active-wallet',
    name: '$wallet',
    fallbackLabel: 'Account',
    type: 'wallet' as WorkspaceVariableType,
  },
] as const

type SlotSpec = (typeof DERIVABLE_SLOTS)[number]

export type SaveWorkspaceInput = {
  /** The live layout, as held by the layout reducer. */
  layout: TerminalLayout
  /** The pane registry's definitions — what each pane type requires. */
  paneDefinitions: Record<string, PaneDefinition>
  /** Variables of the workspace being saved from — empty on route surfaces. */
  variables?: ReadonlyArray<WorkspaceVariableDefinition>
  name: string
  description?: string
  icon?: string
  /** What the source surface is pointed at, used to seed derived variables. */
  activePair?: { pairKey: string; market: string } | null
  activeWallet?: { walletId: string; market: string } | null
  /** Translated labels for derived variables; English is the fallback. */
  labels?: { pair?: string; wallet?: string }
}

export type SaveWorkspaceParams = {
  name: string
  description?: string
  icon?: string
  variables: Array<WorkspaceVariableDefinition>
  defaultLayout: TerminalLayout
}

function eachPane(layout: TerminalLayout): Array<PaneInstance> {
  const panes: Array<PaneInstance> = []
  for (const column of layout.columns ?? []) {
    for (const cell of column.cells ?? []) {
      for (const pane of cell.panes ?? []) {
        if (pane?.type) panes.push(pane)
      }
    }
  }
  return panes
}

function requires(
  definition: PaneDefinition | undefined,
  requirement: string,
): boolean {
  return definition?.requires?.includes(requirement) ?? false
}

/** The slots at least one pane in this layout needs a variable for. */
function neededSlots(
  layout: TerminalLayout,
  paneDefinitions: Record<string, PaneDefinition>,
): Array<SlotSpec> {
  return DERIVABLE_SLOTS.filter((spec) =>
    eachPane(layout).some((pane) =>
      requires(paneDefinitions[pane.type], spec.requirement),
    ),
  )
}

function seedFor(
  spec: SlotSpec,
  input: SaveWorkspaceInput,
): unknown | undefined {
  if (spec.type === 'pair') {
    return input.activePair
      ? { pairKey: input.activePair.pairKey, market: input.activePair.market }
      : undefined
  }
  return input.activeWallet
    ? {
        walletId: input.activeWallet.walletId,
        market: input.activeWallet.market,
      }
    : undefined
}

function labelFor(spec: SlotSpec, input: SaveWorkspaceInput): string {
  const override =
    spec.type === 'pair' ? input.labels?.pair : input.labels?.wallet
  return override?.trim() || spec.fallbackLabel
}

/**
 * Bind every pane that needs a slot to the variable filling it. Idempotent:
 * a pane that already declares a binding keeps it, so a workspace saved from
 * another workspace never has its own wiring overwritten.
 */
function bindPanes(
  layout: TerminalLayout,
  paneDefinitions: Record<string, PaneDefinition>,
  variables: ReadonlyArray<WorkspaceVariableDefinition>,
): TerminalLayout {
  const varForType = new Map<WorkspaceVariableType, string>()
  for (const spec of DERIVABLE_SLOTS) {
    const match = variables.find((v) => v.type === spec.type)
    if (match) varForType.set(spec.type, match.name)
  }

  return {
    ...layout,
    columns: (layout.columns ?? []).map((column) => ({
      ...column,
      cells: (column.cells ?? []).map((cell) => ({
        ...cell,
        panes: (cell.panes ?? []).map((pane) => {
          const bindings: Record<string, string> = { ...pane.bindings }
          for (const spec of DERIVABLE_SLOTS) {
            const variableName = varForType.get(spec.type)
            if (!variableName || bindings[spec.slot]) continue
            if (!requires(paneDefinitions[pane.type], spec.requirement))
              continue
            bindings[spec.slot] = variableName
          }
          const next: PaneInstance = { ...pane }
          if (Object.keys(bindings).length > 0) next.bindings = bindings
          else delete next.bindings
          return next
        }),
      })),
    })),
  }
}

/** Map the current layout onto the params `createWorkspace` expects. */
export function workspaceParamsFromLayout(
  input: SaveWorkspaceInput,
): SaveWorkspaceParams {
  const layout = normalizeLayout(input.layout)
  const existing = input.variables ?? []
  const variables: Array<WorkspaceVariableDefinition> =
    existing.length > 0
      ? existing.map((v) => ({ ...v }))
      : neededSlots(layout, input.paneDefinitions).map((spec) => {
          const defaultValue = seedFor(spec, input)
          return {
            name: spec.name,
            label: labelFor(spec, input),
            type: spec.type,
            ...(defaultValue === undefined ? {} : { defaultValue }),
          }
        })

  return {
    name: input.name,
    description: input.description,
    icon: input.icon,
    variables,
    defaultLayout: bindPanes(layout, input.paneDefinitions, variables),
  }
}

/**
 * Suffix a candidate name until it stops colliding, so saving a copy twice
 * doesn't leave two identically-named entries in the tree. The caller supplies
 * an already-translated base ("Scalping copy") — the numbering is language
 * neutral.
 */
export function uniqueWorkspaceName(
  base: string,
  taken: ReadonlyArray<string>,
): string {
  if (!base) return ''
  const names = new Set(taken)
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
}
