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
 * class, shaped for a binary contract. The event header leads: a contract is a
 * question, and the question, its resolution source and the probability being
 * paid belong above the chart rather than in a tooltip.
 *
 * The data strip opens on `what-moved-it`, which stamps each headline with the
 * probability move it caused, and keeps the tape and open contracts behind it.
 * The right column still carries the event browser, because on a prediction
 * market the question next door (the other outcomes, the adjacent strikes) is
 * half the analysis, with open contracts under it.
 */
export const PREDICTION_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 62,
      cells: [
        {
          id: 'cell-event-header',
          heightPercent: 20,
          activeTabIndex: 0,
          panes: [{ id: 'pane-event-header', type: 'event-header' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 49,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 31,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-what-moved-it', type: 'what-moved-it' },
            { id: 'pane-trades', type: 'trades' },
            {
              id: 'pane-prediction-positions',
              type: 'prediction-positions',
            },
          ],
        },
      ],
    },
    {
      id: 'col-market',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 38,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 62,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'col-event',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-events',
          heightPercent: 61,
          activeTabIndex: 0,
          panes: [{ id: 'pane-events', type: 'events' }],
        },
        {
          id: 'cell-positions',
          heightPercent: 39,
          activeTabIndex: 0,
          panes: [
            {
              id: 'pane-prediction-positions-2',
              type: 'prediction-positions',
            },
          ],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Prediction Race — the layout for an event with many runners rather than two.
 * The header carries the runner count and the overround, the chart stacks the
 * shares, and the outcome ladder takes the bottom of the column.
 *
 * The ladder is the fix for "show 124 more": every runner priced, sortable,
 * searchable, and stakeable from its own row. The basket beside it sums to a
 * stated overround, so sweeping every outcome is visibly not free money.
 */
export const PREDICTION_RACE_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 63,
      cells: [
        {
          id: 'cell-event-header',
          heightPercent: 16,
          activeTabIndex: 0,
          panes: [{ id: 'pane-event-header', type: 'event-header' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 44,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-ladder',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-outcome-ladder', type: 'outcome-ladder' }],
        },
      ],
    },
    {
      id: 'col-basket',
      widthPercent: 17,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 33,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-basket',
          heightPercent: 67,
          activeTabIndex: 0,
          panes: [{ id: 'pane-basket-ticket', type: 'basket-ticket' }],
        },
      ],
    },
    {
      id: 'col-tape',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-trades',
          heightPercent: 71,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trades', type: 'trades' }],
        },
        {
          id: 'cell-positions',
          heightPercent: 29,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-prediction-positions', type: 'prediction-positions' },
          ],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Prediction Discovery — the home board for event markets. The scanner on the
 * default board reads a catalog of pairs, and prediction outcomes are never in
 * it: they are born and resolved daily. So the event board takes the wide
 * column here, with a category rail to narrow it and a right rail carrying the
 * biggest odds moves over what settles soonest.
 *
 * Everything on it renders through `formatPredictionPrice`, so no dollar
 * figure ever appears beside a 78c contract.
 */
export const PREDICTION_DISCOVERY_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-categories',
      widthPercent: 14,
      cells: [
        {
          id: 'cell-categories',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-categories', type: 'categories' }],
        },
      ],
    },
    {
      id: 'col-board',
      widthPercent: 66,
      cells: [
        {
          id: 'cell-event-board',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-event-board', type: 'event-board' }],
        },
      ],
    },
    {
      id: 'col-rail',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-odds-movers',
          heightPercent: 52,
          activeTabIndex: 0,
          panes: [{ id: 'pane-odds-movers', type: 'odds-movers' }],
        },
        {
          id: 'cell-resolving',
          heightPercent: 48,
          activeTabIndex: 0,
          panes: [{ id: 'pane-resolving-soon', type: 'resolving-soon' }],
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
    tagline: 'The question first, then the odds.',
    description:
      'The default prediction-market layout: the event header over a probability chart, with the headlines that moved it below, the book and a ticket that states max payout and max loss before you stake, and the neighbouring outcomes on the right.',
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
      'A home board built for event contracts: a category rail beside the event board, with the biggest odds moves over the contracts closest to settling. Install a prediction venue such as Kalshi or Polymarket to fill it.',
    facets: {
      traderTypes: ['news-trader', 'swing-trader'],
      assetClasses: ['predictions'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['discovery', 'predictions', 'events'],
    layout: PREDICTION_DISCOVERY_LAYOUT,
  },
  {
    id: 'template:prediction-race',
    name: 'Prediction Race',
    menuLabel: 'Race',
    context: 'pair',
    routeMenu: true,
    icon: 'ListOrdered',
    tagline: 'Every runner priced, and the overround stated.',
    description:
      'For an event with a field rather than two sides: the header with the runner count and the overround, a stacked-shares chart, and a ladder that prices every runner and stakes from the row. The basket sums to the overround, so sweeping the field is visibly not free money.',
    facets: {
      traderTypes: ['news-trader', 'swing-trader'],
      assetClasses: ['predictions'],
      screenSizes: ['standard', 'wide'],
    },
    tags: ['predictions', 'events', 'race'],
    layout: PREDICTION_RACE_LAYOUT,
    // No default market: a contract expires, so seeding a copied workspace
    // with one would chart a settled outcome next month.
    pairDefault: null,
  },
]
