// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * `pairlens-equities` — the stock-desk surfaces and workspace presets, as a
 * plugin.
 *
 * Panels and presets, no capabilities and no runtime. The panes read the
 * session calendar, quotes and fundamentals from whichever broker connector is
 * active, so this plugin serves nothing itself. It carries the stock
 * workspaces and the panes those layouts are built from, so a deployment that
 * drops the family (or a user who disables it) loses the equities entries from
 * the Workspace Store and the workspaces menu along with the Alpaca connector.
 *
 * Same shape and same reasoning as `pairlens-dex`: an empty `capabilities`
 * array is deliberate and legal, and it keeps the plugin out of every
 * capability-shape predicate in the terminal, so the boot path activates it in
 * the generic remaining-plugins pass.
 */
import { EQUITIES_WORKSPACES } from './workspaces'
import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'

export const pairlensEquitiesManifest: PluginManifest = {
  id: 'pairlens-equities',
  name: 'Pairlens Equities',
  version: '0.1.0',
  author: 'Pairlens',
  description:
    'Stock surfaces: the session clock, Level 1 quotes, company fundamentals, insider filings and the earnings calendar',
  homepage: 'https://pairlens.finance',
  icon: 'https://pairlens.finance/favicon.svg',
  metadata: { family: 'equities' },
  capabilities: [],
  config: {},
  contributes: {
    panels: [
      {
        id: 'session',
        label: 'Session',
        labelKey: 'panes.session',
        descriptionKey: 'paneDescriptions.session',
        icon: 'Clock',
        category: 'discovery',
        minHeight: 80,
      },
      {
        id: 'earnings-calendar',
        label: 'Earnings Calendar',
        labelKey: 'panes.earningsCalendar',
        descriptionKey: 'paneDescriptions.earningsCalendar',
        icon: 'CalendarDays',
        category: 'discovery',
        minHeight: 120,
      },
      {
        id: 'economic-calendar',
        label: 'Economic Calendar',
        labelKey: 'panes.economicCalendar',
        descriptionKey: 'paneDescriptions.economicCalendar',
        icon: 'CalendarRange',
        category: 'discovery',
        minHeight: 120,
      },
      {
        // No `requires`: the market is open or closed whatever pair is on
        // screen, which is exactly why this sits above the ticket.
        id: 'session-clock',
        label: 'Session Clock',
        labelKey: 'panes.sessionClock',
        descriptionKey: 'paneDescriptions.sessionClock',
        icon: 'Clock',
        category: 'charting',
        minHeight: 60,
      },
      {
        id: 'level-1',
        label: 'Level 1',
        labelKey: 'panes.level1',
        descriptionKey: 'paneDescriptions.level1',
        icon: 'BookOpen',
        category: 'charting',
        minHeight: 100,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'company',
        label: 'Company',
        labelKey: 'panes.company',
        descriptionKey: 'paneDescriptions.company',
        icon: 'Building2',
        category: 'charting',
        minHeight: 140,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'insider-activity',
        label: 'Insider Activity',
        labelKey: 'panes.insiderActivity',
        descriptionKey: 'paneDescriptions.insiderActivity',
        icon: 'UserRound',
        category: 'charting',
        minHeight: 120,
        requires: ['workspace:active-pair'],
      },
      {
        id: 'your-position',
        label: 'Your Position',
        labelKey: 'panes.yourPosition',
        descriptionKey: 'paneDescriptions.yourPosition',
        icon: 'Wallet',
        category: 'trading',
        minHeight: 100,
        requires: ['workspace:active-pair', 'workspace:active-wallet'],
      },
    ],
    workspaces: EQUITIES_WORKSPACES,
  },
}

export function createPairlensEquitiesPlugin(
  manifest: PluginManifest,
): PluginInstance {
  return {
    manifest,
    status: 'installed',
    config: {},
    async execute(params): Promise<unknown> {
      throw new Error(
        `pairlens-equities: unsupported capability '${params.capability}'`,
      )
    },
  }
}
