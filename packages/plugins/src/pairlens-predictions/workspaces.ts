// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Workspace presets shipped by `pairlens-predictions`.
 *
 * A leaf data module: type-only imports, plain object literals, no runtime
 * dependency on the plugin system or on ccxt. The terminal imports it through
 * its own subpath (`@pairlens/plugins/pairlens-predictions/workspaces`) to seed
 * the prediction class default at boot.
 */
import type {
  ContributedWorkspace,
  ContributedWorkspaceLayout,
} from '@pairlens/shared/plugin-types'

/**
 * Prediction Terminal — the default pair layout for the `prediction` asset
 * class. The Events browser gets a real column: on a prediction market the
 * question next door (the other outcomes of the same event, the adjacent
 * strikes) is half the analysis, where a spot desk would show a copilot
 * conversation. The data strip opens on the tape and carries
 * `prediction-positions` (open contracts) instead of the spot positions pane.
 */
export const PREDICTION_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 52,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 68,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 27,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trades', type: 'trades' },
            {
              id: 'pane-prediction-positions',
              type: 'prediction-positions',
            },
            { id: 'pane-data-log', type: 'data-log' },
          ],
        },
        {
          id: 'cell-risk',
          heightPercent: 5,
          activeTabIndex: 0,
          panes: [{ id: 'pane-risk', type: 'risk' }],
        },
      ],
    },
    {
      id: 'col-market',
      widthPercent: 22,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'col-events',
      widthPercent: 26,
      cells: [
        {
          id: 'cell-events',
          heightPercent: 58,
          activeTabIndex: 0,
          panes: [{ id: 'pane-events', type: 'events' }],
        },
        {
          id: 'cell-copilot',
          heightPercent: 42,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Prediction Discovery — the home board for event markets. The scanner on the
 * default board reads a catalog of pairs, and prediction outcomes are never in
 * it: they are born and resolved daily. So the event browser takes the wide
 * column here, with the news wire beside it (an event contract is a headline
 * with a price) and a light rail carrying the watchlist over sentiment.
 */
export const PREDICTION_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-events',
      widthPercent: 58,
      cells: [
        {
          id: 'cell-events',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-events', type: 'events' }],
        },
      ],
    },
    {
      id: 'col-news',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-news',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-news', type: 'news' }],
        },
      ],
    },
    {
      id: 'col-pulse',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-watchlist',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-watchlist', type: 'watchlist' }],
        },
        {
          id: 'cell-sentiment',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-fear-greed', type: 'fear-greed' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Id of the event-market home board. Exported because the terminal's markets
 * pane offers this exact board as the way out of its predictions empty state,
 * and a bare string in a core pane is a rename waiting to break silently.
 */
export const PREDICTION_DISCOVERY_TEMPLATE_ID = 'template:prediction-discovery'

export const PREDICTIONS_WORKSPACES: Array<ContributedWorkspace> = [
  {
    id: 'template:prediction-terminal',
    name: 'Prediction Terminal',
    menuLabel: 'Default',
    context: 'pair',
    routeMenu: true,
    icon: 'Scale',
    tagline: 'Chart the odds with the whole event beside them.',
    description:
      'The default prediction-market layout: a probability chart with the tape and your open contracts below it, the order book and ticket in the middle, and the event browser beside the AI Copilot, because the neighbouring outcomes are half the analysis.',
    facets: {
      traderTypes: ['news-trader', 'swing-trader'],
      assetClasses: ['predictions'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['predictions', 'events', 'contracts'],
    layout: PREDICTION_TERMINAL_LAYOUT,
    // No default market: a contract expires, so seeding a copied workspace
    // with one would chart a settled outcome next month.
    pairDefault: null,
  },
  {
    id: PREDICTION_DISCOVERY_TEMPLATE_ID,
    name: 'Prediction Discovery',
    // The Predictions section of Discovery opens on this board, so it is that
    // section's Default entry rather than one option among many.
    menuLabel: 'Default',
    context: 'discovery',
    routeMenu: true,
    icon: 'Vote',
    tagline: 'Browse live event markets, not a catalog of pairs.',
    description:
      'A home board built for event contracts: the event browser takes the wide column, the news wire runs beside it, and a light rail carries your watchlist over the sentiment gauge. Install a prediction venue such as Kalshi or Polymarket to fill the board.',
    facets: {
      traderTypes: ['news-trader', 'swing-trader'],
      assetClasses: ['predictions'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'predictions', 'events'],
    layout: PREDICTION_DISCOVERY_LAYOUT,
  },
]
