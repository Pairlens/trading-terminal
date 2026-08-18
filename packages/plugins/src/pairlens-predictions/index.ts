// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-predictions` — the prediction-market surfaces, as a plugin.
 *
 * Panels only: no capabilities, no runtime. Every pane here reads
 * `market-data:events` and `trading:positions` from whichever prediction
 * connector is active, so this plugin serves nothing itself. It exists so the
 * event surfaces ship, install, disable and uninstall with the family they
 * belong to rather than riding in `pairlens-core`, which a deployment that
 * drops the predictions family still keeps.
 *
 * An empty `capabilities` array is deliberate and legal (`validateManifest`
 * asks only that the field be an array). It also keeps the plugin out of every
 * capability-shape predicate in the terminal: it is not a venue, not a theme
 * and not a data source, so the boot path activates it in the generic
 * remaining-plugins pass, which is where a panels-only plugin belongs.
 */
import { PREDICTIONS_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensPredictionsManifest: PluginManifest = {
  id: 'pairlens-predictions',
  name: 'Pairlens Predictions',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Prediction-market surfaces: the event board, the outcome ladder, baskets and open contract positions',
  homepage: 'https://pairlens.finance',
  icon: 'https://pairlens.finance/favicon.svg',
  metadata: { family: 'predictions' },
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        id: 'events',
        label: 'Events',
        labelKey: 'panes.events',
        descriptionKey: 'paneDescriptions.events',
        icon: 'Vote',
        category: 'discovery',
        minHeight: 200,
        singleton: true,
      },
      {
        // No `requires`: Kalshi trades from API credentials and Polymarket
        // from a wallet, so neither 'workspace:active-wallet' nor
        // 'workspace:active-pair' is the precondition. The pane itself says
        // what is missing.
        id: 'prediction-positions',
        label: 'Prediction Positions',
        labelKey: 'panes.predictionPositions',
        descriptionKey: 'paneDescriptions.predictionPositions',
        icon: 'Wallet',
        category: 'trading',
        minHeight: 120,
      },
      {
        id: 'categories',
        label: 'Categories',
        labelKey: 'panes.categories',
        descriptionKey: 'paneDescriptions.categories',
        icon: 'Tags',
        category: 'discovery',
        minHeight: 120,
        singleton: true,
      },
      {
        id: 'event-board',
        label: 'Event Board',
        labelKey: 'panes.eventBoard',
        descriptionKey: 'paneDescriptions.eventBoard',
        icon: 'Vote',
        category: 'discovery',
        minHeight: 200,
        singleton: true,
      },
      {
        id: 'odds-movers',
        label: 'Odds Movers',
        labelKey: 'panes.oddsMovers',
        descriptionKey: 'paneDescriptions.oddsMovers',
        icon: 'TrendingUp',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'resolving-soon',
        label: 'Resolving Soon',
        labelKey: 'panes.resolvingSoon',
        descriptionKey: 'paneDescriptions.resolvingSoon',
        icon: 'CalendarClock',
        category: 'discovery',
        minHeight: 100,
      },
      {
        id: 'event-header',
        label: 'Event Header',
        labelKey: 'panes.eventHeader',
        descriptionKey: 'paneDescriptions.eventHeader',
        icon: 'CircleHelp',
        category: 'charting',
        minHeight: 80,
        requires: ['workspace:active-pair'],
      },
      {
        // Deliberately NOT a variant of the price chart. A probability has no
        // meaningful wick, drawings on it are numerology, and one WebGL
        // context per pane is a lot of machinery for a line that moves a few
        // times an hour. What it does that the price chart cannot is draw the
        // whole field on one axis.
        id: 'prediction-chart',
        label: 'Probability Chart',
        labelKey: 'panes.predictionChart',
        descriptionKey: 'paneDescriptions.predictionChart',
        icon: 'TrendingUp',
        category: 'charting',
        minHeight: 180,
        requires: ['workspace:active-pair'],
      },
      {
        // The resolution criteria are not a tooltip. A trader who can size a
        // stake without ever seeing the sentence that settles it is one the
        // desk failed, so the prose gets a pane of its own.
        id: 'event-brief',
        label: 'Event Brief',
        labelKey: 'panes.eventBrief',
        descriptionKey: 'paneDescriptions.eventBrief',
        icon: 'ScrollText',
        category: 'charting',
        minHeight: 140,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'what-moved-it',
        label: 'What Moved It',
        labelKey: 'panes.whatMovedIt',
        descriptionKey: 'paneDescriptions.whatMovedIt',
        icon: 'History',
        category: 'ai-research',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'outcome-ladder',
        label: 'Outcome Ladder',
        labelKey: 'panes.outcomeLadder',
        descriptionKey: 'paneDescriptions.outcomeLadder',
        icon: 'ListOrdered',
        category: 'trading',
        minHeight: 150,
        requires: ['workspace:active-pair'],
      },
      {
        // The one pane in the family that does gate on an account: it stakes
        // several outcomes in one submit, so there is nothing to price until
        // the workspace knows which account is paying.
        id: 'basket-ticket',
        label: 'Basket Ticket',
        labelKey: 'panes.basketTicket',
        descriptionKey: 'paneDescriptions.basketTicket',
        icon: 'ShoppingBasket',
        category: 'trading',
        minHeight: 200,
        singleton: true,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
    ],
    // The prediction desk and the event-market home board ship with the family
    // that owns them: uninstall this plugin and both layouts leave the store,
    // the workspaces menu and Discovery with the panes.
    workspaces: PREDICTIONS_WORKSPACES,
  },
}

export function createPairlensPredictionsPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-predictions: unsupported capability '${params.capability}'`,
      )
    },
  }
}
