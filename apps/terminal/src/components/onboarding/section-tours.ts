// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Registry of per-section "first open" showcase tours.
//
// Each section the user can navigate to maps to a short, data-driven tour.
// Every step pairs copy (i18n keys) with a looping Remotion scene (see
// `spotlight-tour/scenes/scenes.tsx`) that demonstrates the page in motion.
// Adding a tour step = an entry here + `sectionTours.*` translation keys +
// a scene registered under the same id. The IDs mirror the `activeItem`
// values derived in `routes/_terminal.tsx`.

export type SectionTourId =
  | 'pairs'
  | 'charts'
  | 'notifications'
  | 'workflows'
  | 'indicators'
  | 'accounts'
  | 'plugins'
  | 'workspaces'
  | 'workspace-store'
  | 'bots'

export type SectionTourSceneId =
  | 'pairs-discover'
  | 'pairs-watchlist'
  | 'charts-candles'
  | 'charts-signals'
  | 'alerts-trigger'
  | 'alerts-compose'
  | 'workflows-graph'
  | 'workflows-runs'
  | 'indicators-code'
  | 'indicators-chart'
  | 'accounts-connect'
  | 'accounts-balances'
  | 'plugins-store'
  | 'plugins-sandbox'
  | 'workspaces-layout'
  | 'store-templates'
  | 'bots-strategy'
  | 'bots-running'

export interface SectionTourStep {
  /** i18n key for the step title */
  titleKey: string
  /** i18n key for the step description */
  descriptionKey: string
  /** Remotion scene demonstrating the step */
  scene: SectionTourSceneId
}

export interface SectionTour {
  /** i18n key for the mono eyebrow label above the title */
  eyebrowKey: string
  steps: Array<SectionTourStep>
}

export const SECTION_TOURS: Record<SectionTourId, SectionTour> = {
  pairs: {
    eyebrowKey: 'sectionTours.pairs.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.pairs.intro.title',
        descriptionKey: 'sectionTours.pairs.intro.description',
        scene: 'pairs-discover',
      },
      {
        titleKey: 'sectionTours.pairs.watchlist.title',
        descriptionKey: 'sectionTours.pairs.watchlist.description',
        scene: 'pairs-watchlist',
      },
    ],
  },
  charts: {
    eyebrowKey: 'sectionTours.charts.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.charts.overview.title',
        descriptionKey: 'sectionTours.charts.overview.description',
        scene: 'charts-candles',
      },
      {
        titleKey: 'sectionTours.charts.signals.title',
        descriptionKey: 'sectionTours.charts.signals.description',
        scene: 'charts-signals',
      },
    ],
  },
  notifications: {
    eyebrowKey: 'sectionTours.notifications.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.notifications.intro.title',
        descriptionKey: 'sectionTours.notifications.intro.description',
        scene: 'alerts-trigger',
      },
      {
        titleKey: 'sectionTours.notifications.build.title',
        descriptionKey: 'sectionTours.notifications.build.description',
        scene: 'alerts-compose',
      },
    ],
  },
  workflows: {
    eyebrowKey: 'sectionTours.workflows.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.workflows.intro.title',
        descriptionKey: 'sectionTours.workflows.intro.description',
        scene: 'workflows-graph',
      },
      {
        titleKey: 'sectionTours.workflows.runs.title',
        descriptionKey: 'sectionTours.workflows.runs.description',
        scene: 'workflows-runs',
      },
    ],
  },
  indicators: {
    eyebrowKey: 'sectionTours.indicators.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.indicators.code.title',
        descriptionKey: 'sectionTours.indicators.code.description',
        scene: 'indicators-code',
      },
      {
        titleKey: 'sectionTours.indicators.chart.title',
        descriptionKey: 'sectionTours.indicators.chart.description',
        scene: 'indicators-chart',
      },
    ],
  },
  accounts: {
    eyebrowKey: 'sectionTours.accounts.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.accounts.intro.title',
        descriptionKey: 'sectionTours.accounts.intro.description',
        scene: 'accounts-connect',
      },
      {
        titleKey: 'sectionTours.accounts.balances.title',
        descriptionKey: 'sectionTours.accounts.balances.description',
        scene: 'accounts-balances',
      },
    ],
  },
  plugins: {
    eyebrowKey: 'sectionTours.plugins.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.plugins.intro.title',
        descriptionKey: 'sectionTours.plugins.intro.description',
        scene: 'plugins-store',
      },
      {
        titleKey: 'sectionTours.plugins.sandbox.title',
        descriptionKey: 'sectionTours.plugins.sandbox.description',
        scene: 'plugins-sandbox',
      },
    ],
  },
  workspaces: {
    eyebrowKey: 'sectionTours.workspaces.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.workspaces.intro.title',
        descriptionKey: 'sectionTours.workspaces.intro.description',
        scene: 'workspaces-layout',
      },
    ],
  },
  'workspace-store': {
    eyebrowKey: 'sectionTours.workspaceStore.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.workspaceStore.intro.title',
        descriptionKey: 'sectionTours.workspaceStore.intro.description',
        scene: 'store-templates',
      },
    ],
  },
  bots: {
    eyebrowKey: 'sectionTours.bots.eyebrow',
    steps: [
      {
        titleKey: 'sectionTours.bots.strategy.title',
        descriptionKey: 'sectionTours.bots.strategy.description',
        scene: 'bots-strategy',
      },
      {
        titleKey: 'sectionTours.bots.running.title',
        descriptionKey: 'sectionTours.bots.running.description',
        scene: 'bots-running',
      },
    ],
  },
}
