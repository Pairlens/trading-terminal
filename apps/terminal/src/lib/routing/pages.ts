// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── What a terminal address is allowed to say ────────────────────────
//
// One table, three readers: the assistant's `navigate_to` tool builds
// links from it, the built-in route surface reads an address back out of
// it to say what the user is looking at, and the routes themselves reuse
// its id validator.
//
// Each page names ONE search param that carries the thing it is showing:
// the workflow being edited, the bot being watched, the script open in
// the workbench. That param is the whole point — an address that says
// only `/workflows` cannot be linked, cannot be walked back to with the
// back button, and leaves the assistant with nothing better to say than
// "you are on the workflows page".

/**
 * Ids we let through from a URL. Covers every id the terminal mints
 * (uuids, base-36 script ids, plugin and template ids with a colon) and
 * nothing that could smuggle a path or a query of its own.
 */
const ENTITY_ID_RE = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,127}$/

/** A search value narrowed to an id, or undefined. For `validateSearch`. */
export function parseEntityId(value: unknown): string | undefined {
  return typeof value === 'string' && ENTITY_ID_RE.test(value)
    ? value
    : undefined
}

export type TerminalPage = {
  path: string
  /** Model-facing, for the `navigate_to` menu: what the page is for. */
  label: string
  /** Prose, for the screen block: "the user is on ___". */
  screen: string
  /** Suffix of the `assistantDock.suggest.*` key the orb offers here. */
  suggestion: string
  /** The search param naming the one thing the page is showing. */
  targetParam?: string
  /** Model-facing: what an id in that param means. */
  targetLabel?: string
  /** What that id is, in the screen block: "editing the ___ `id`". */
  targetNoun?: string
}

const PAGES = {
  discovery: {
    path: '/',
    label: 'Discovery: markets, movers and news',
    screen: 'the Discovery board: markets, movers and news',
    suggestion: 'discovery',
    targetParam: 'section',
    targetLabel:
      'an asset-class section: spot, perp, dex, stocks or prediction',
    targetNoun: 'section',
  },
  accounts: {
    path: '/accounts',
    label: 'Accounts: connected venues and wallets',
    screen: 'the Accounts page, where venues and wallets are connected',
    suggestion: 'accounts',
  },
  bots: {
    path: '/bots',
    label: 'Bots: deployed strategies',
    screen: 'the Bots page',
    suggestion: 'bots',
    targetParam: 'bot',
    targetLabel: 'a bot id from list_bots',
    targetNoun: 'bot',
  },
  indicators: {
    path: '/indicators',
    label: 'Indicators and strategies workbench: write and test Python scripts',
    screen: 'the indicator and strategy workbench',
    suggestion: 'indicators',
    targetParam: 'script',
    targetLabel: 'a script id from list_scripts',
    targetNoun: 'script',
  },
  workflows: {
    path: '/workflows',
    label: 'Workflows: trade automation',
    screen: 'the Workflows page',
    suggestion: 'workflows',
    targetParam: 'workflow',
    targetLabel: 'a workflow id from list_workflows',
    targetNoun: 'workflow',
  },
  notifications: {
    path: '/notifications',
    label: 'Alerts and notifications',
    screen: 'the alerts and notifications page',
    suggestion: 'notifications',
    targetParam: 'alert',
    targetLabel: 'an alert rule id from list_alerts',
    targetNoun: 'alert rule',
  },
  plugins: {
    path: '/plugins',
    label: 'Plugin store',
    screen: 'the Plugin Store',
    suggestion: 'plugins',
    targetParam: 'manage',
    targetLabel: 'a plugin id, to open its product page',
    targetNoun: 'plugin',
  },
  workspaceStore: {
    path: '/workspace-store',
    label: 'Workspace store: layout templates',
    screen: 'the Workspace Store',
    suggestion: 'workspaceStore',
    targetParam: 'template',
    targetLabel: 'a workspace template id',
    targetNoun: 'workspace template',
  },
} as const satisfies Record<string, TerminalPage>

export type TerminalPageId = keyof typeof PAGES

/**
 * Widened on the way out. The literal object gives us the page ids for
 * free; readers want uniform access to the optional fields, which a
 * union of literal shapes will not give them.
 */
export const TERMINAL_PAGES: Record<TerminalPageId, TerminalPage> = PAGES

export const TERMINAL_PAGE_IDS = Object.keys(PAGES) as Array<TerminalPageId>

/**
 * The address for a page, with the thing it should be showing. An
 * unusable target is dropped rather than encoded: landing on the page is
 * still the right outcome, a 404-shaped query is not.
 */
export function pageLink(page: TerminalPageId, target?: string | null): string {
  const entry: TerminalPage = TERMINAL_PAGES[page]
  const id = target ? parseEntityId(target) : undefined
  if (!entry.targetParam || !id) return entry.path
  return `${entry.path}?${entry.targetParam}=${encodeURIComponent(id)}`
}

/** The page an address belongs to. Longest prefix wins. */
export function pageForPath(pathname: string): TerminalPageId | null {
  let best: TerminalPageId | null = null
  for (const id of TERMINAL_PAGE_IDS) {
    const { path } = TERMINAL_PAGES[id]
    if (path === '/') continue
    if (!pathname.startsWith(path)) continue
    if (!best || path.length > TERMINAL_PAGES[best].path.length) best = id
  }
  if (best) return best
  return pathname === '/' ? 'discovery' : null
}
