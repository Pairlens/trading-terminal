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
 * class. The pair here is an EVENT, so the board is built around a question
 * and every answer to it rather than around one contract.
 *
 * The event header leads: the question, the field as a strip of selectable
 * answers, its resolution source, and the probability being paid. A contract
 * is a sentence, and the sentence belongs above the chart rather than in a
 * tooltip.
 *
 * The chart is `prediction-chart`, not `chart`. A contract that trades between
 * 0 and 1 has no meaningful wick, drawings on a probability are numerology,
 * and the price chart can only ever draw one outcome — which is the wrong
 * instrument even here, where a binary market has two sides worth seeing
 * against each other.
 *
 * `outcome-ladder` opens the data strip, and that is the change this layout is
 * built around. Every answer is priced, sortable and stakeable from its own
 * row, so trading a prediction starts with reading the field and ends with
 * picking a side — not the other way round. The tape, the news moves and the
 * open contracts sit behind it as tabs.
 *
 * `event-brief` is the other correction. The criteria that decide the payout
 * used to live behind a chip in the header, one hover deep: a trader could
 * read a probability, size a stake and submit without ever seeing the sentence
 * that settles it. It now has a pane on the reading rail, above the event
 * browser, because the question next door is half the analysis and the rules
 * for the question in front of you are the other half.
 */
export const PREDICTION_TERMINAL_LAYOUT = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 58,
      cells: [
        {
          id: 'cell-event-header',
          heightPercent: 21,
          activeTabIndex: 0,
          panes: [{ id: 'pane-event-header', type: 'event-header' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'prediction-chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 39,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-outcome-ladder', type: 'outcome-ladder' },
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
      widthPercent: 19,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 36,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 64,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'col-event',
      widthPercent: 23,
      cells: [
        {
          id: 'cell-event-brief',
          heightPercent: 46,
          activeTabIndex: 0,
          panes: [{ id: 'pane-event-brief', type: 'event-brief' }],
        },
        {
          id: 'cell-events',
          heightPercent: 54,
          activeTabIndex: 0,
          panes: [{ id: 'pane-events', type: 'events' }],
        },
      ],
    },
  ],
} satisfies ContributedWorkspaceLayout

/**
 * Prediction Race — the layout for an event with many runners rather than two.
 * The header carries the runner count and the overround, the chart draws the
 * whole field, and the outcome ladder takes the bottom of the column.
 *
 * The chart is the point of this board. A race asks who is closing on whom,
 * and a single-series price chart answers a different question entirely: it
 * shows the favourite's line and leaves the crossover that decided the market
 * to be inferred from a table. `prediction-chart` puts every drawn runner on
 * one time axis in the colours the ladder and the basket already use, so the
 * three panes read as one race.
 *
 * The ladder is the fix for "show 124 more": every runner priced, sortable,
 * searchable, and stakeable from its own row, and it is where the chart sends
 * you for the runners past its own cap. The basket beside it sums to a stated
 * overround, so sweeping every outcome is visibly not free money. The brief
 * heads the right rail because a race publishes one settlement rule per runner
 * and picking the wrong strike is the cheapest way to lose on a correct call.
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
          heightPercent: 19,
          activeTabIndex: 0,
          panes: [{ id: 'pane-event-header', type: 'event-header' }],
        },
        {
          id: 'cell-chart',
          heightPercent: 43,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'prediction-chart' }],
        },
        {
          id: 'cell-ladder',
          heightPercent: 38,
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
          heightPercent: 30,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-basket',
          heightPercent: 70,
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
          id: 'cell-event-brief',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-event-brief', type: 'event-brief' }],
        },
        {
          id: 'cell-trades',
          heightPercent: 36,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trades', type: 'trades' }],
        },
        {
          id: 'cell-positions',
          heightPercent: 24,
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
 * Prices render through `formatPredictionPrice` on the chips that trade; the
 * reading rails beside the board state probabilities, because there a price is
 * not what you pay, it is what the market believes. No dollar figure appears
 * beside either.
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
    tagline: 'The question, the rules, then the odds.',
    description:
      'The default prediction-market layout: the event header over a probability chart built for contracts rather than candles, with the headlines that moved it below, the book and a ticket that states max payout and max loss before you stake, and the resolution criteria over the neighbouring outcomes on the right.',
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
    tagline: 'Every runner on one chart, and the overround stated.',
    description:
      'For an event with a field rather than two sides: the header with the runner count and the overround, a probability chart that draws every runner on one axis so you can see who is closing on whom, and a ladder that prices the whole field and stakes from the row. The basket sums to the overround, so sweeping the field is visibly not free money.',
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
