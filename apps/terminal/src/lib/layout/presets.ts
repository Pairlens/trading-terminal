// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { layoutId, normalizeLayout } from './utils'
import type { TerminalLayout } from './types'

/**
 * Default — Chart+Data left, a narrow Order Book+Trade rail in the middle,
 * and the AI copilot as its own full-height column: the conversation (or its
 * sign-in invitation) gets room to breathe instead of sharing a column.
 *
 * The data strip opens on Trades rather than Positions. A fresh terminal has
 * no positions to show, so the first tab was an empty state on every install;
 * the tape is live the moment the chart is, and it reads as the natural
 * companion to the candles above it.
 */
export const PRESET_DEFAULT: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 55,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 71,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 24,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
            { id: 'pane-depth', type: 'depth' },
            { id: 'pane-pair-info', type: 'pair-info' },
            { id: 'pane-research', type: 'research' },
            { id: 'pane-social', type: 'social' },
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
      widthPercent: 21,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 52,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 48,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'col-copilot',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-copilot',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/**
 * Perps Terminal — the default pair layout for the `perp` asset class. Same
 * skeleton as PRESET_DEFAULT so a spot trader feels at home, but the data
 * strip carries `futures-positions` (entry, mark, liquidation, per-venue
 * contracts) instead of the spot positions pane, which reads nothing from a
 * futures account.
 */
export const PRESET_PERPS_TERMINAL: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 55,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 71,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 24,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-futures-positions', type: 'futures-positions' },
            { id: 'pane-data-log', type: 'data-log' },
            { id: 'pane-depth', type: 'depth' },
            { id: 'pane-pair-info', type: 'pair-info' },
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
      widthPercent: 21,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 52,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 48,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'col-copilot',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-copilot',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/**
 * Prediction Terminal — the default pair layout for the `prediction` asset
 * class. The Events browser gets a real column: on a prediction market the
 * question next door (the other outcomes of the same event, the adjacent
 * strikes) is half the analysis, where a spot desk would show a copilot
 * conversation. The data strip opens on the tape and carries
 * `prediction-positions` (open contracts) instead of the spot positions pane.
 */
export const PRESET_PREDICTION_TERMINAL: TerminalLayout = {
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
}

/**
 * DEX Terminal — the default pair layout for the `dex` asset class. No order
 * book column: DEX data providers synthesize bid/ask from pool state, so a
 * book pane would render fabricated depth. Pair Info leads the data strip
 * (pool stats always stream from the data providers, while the tape depends
 * on the venue), the swap ticket pairs with Recent Tickers for new listings,
 * and the social feed rides next to the copilot.
 */
export const PRESET_DEX_TERMINAL: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 56,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 70,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 25,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-pair-info', type: 'pair-info' },
            { id: 'pane-trades', type: 'trades' },
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
      id: 'col-swap',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-recent',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-recent-tickers', type: 'recent-tickers' }],
        },
      ],
    },
    {
      id: 'col-right',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-copilot',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
        {
          id: 'cell-social',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-social', type: 'social' }],
        },
      ],
    },
  ],
}

/**
 * Equities Terminal — the default pair layout for the `stocks` asset class.
 * No order book column either: the broker feed quotes top-of-book, not
 * depth. The ticket sits above the symbol's news wire — catalysts move
 * stocks the way order flow moves crypto — and positions ride the data
 * strip beside the tape.
 */
export const PRESET_EQUITIES_TERMINAL: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 55,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 66,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 29,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trades', type: 'trades' },
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
            { id: 'pane-pair-info', type: 'pair-info' },
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
      widthPercent: 21,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-news',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [{ id: 'pane-symbol-news', type: 'symbol-news' }],
        },
      ],
    },
    {
      id: 'col-copilot',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-copilot',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/** Chart Focus — Single column: Chart (77%) + Positions/Copilot tabs (18%) + Risk (5%) */
export const PRESET_CHART_FOCUS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-main',
      widthPercent: 100,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 77,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 18,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
            { id: 'pane-copilot', type: 'copilot' },
            { id: 'pane-trade-entry', type: 'trade-entry' },
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
  ],
}

/** Trading — 3 columns: Orderbook+Trade (20%), Chart+Positions+Risk (55%), Copilot (25%) */
export const PRESET_TRADING: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 20,
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
      id: 'col-center',
      widthPercent: 55,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 67,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-positions',
          heightPercent: 28,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
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
      id: 'col-right',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-copilot',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/**
 * Analysis — Chart+Data+Risk left (58%), a squeezed Order Book+Trade rail
 * (18%), and the AI copilot as its own full-height column (24%).
 */
export const PRESET_ANALYSIS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 58,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 67,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-data',
          heightPercent: 28,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
            { id: 'pane-research', type: 'research' },
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
      widthPercent: 18,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 52,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-trade',
          heightPercent: 48,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
      ],
    },
    {
      id: 'col-copilot',
      widthPercent: 24,
      cells: [
        {
          id: 'cell-copilot',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/**
 * Dual Charts — two side-by-side chart panes (TradingView 2-chart layout).
 * Each pane persists its own market/timeframe/chart-type via its pane id;
 * pick a different pair per pane with the pane's pair picker.
 */
export const PRESET_DUAL_CHARTS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-chart-1',
      widthPercent: 50,
      cells: [
        {
          id: 'cell-chart-1',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-1', type: 'chart' }],
        },
      ],
    },
    {
      id: 'col-chart-2',
      widthPercent: 50,
      cells: [
        {
          id: 'cell-chart-2',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-2', type: 'chart' }],
        },
      ],
    },
  ],
}

/** Quad Charts — 2×2 chart grid (TradingView 4-chart layout). */
export const PRESET_QUAD_CHARTS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-charts-left',
      widthPercent: 50,
      cells: [
        {
          id: 'cell-chart-1',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-1', type: 'chart' }],
        },
        {
          id: 'cell-chart-3',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-3', type: 'chart' }],
        },
      ],
    },
    {
      id: 'col-charts-right',
      widthPercent: 50,
      cells: [
        {
          id: 'cell-chart-2',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-2', type: 'chart' }],
        },
        {
          id: 'cell-chart-4',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-4', type: 'chart' }],
        },
      ],
    },
  ],
}

/** Triple Charts — one large chart left, two stacked right. */
export const PRESET_TRIPLE_CHARTS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-chart-main',
      widthPercent: 60,
      cells: [
        {
          id: 'cell-chart-1',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-1', type: 'chart' }],
        },
      ],
    },
    {
      id: 'col-charts-side',
      widthPercent: 40,
      cells: [
        {
          id: 'cell-chart-2',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-2', type: 'chart' }],
        },
        {
          id: 'cell-chart-3',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart-3', type: 'chart' }],
        },
      ],
    },
  ],
}

/* ─── Screen-size presets ─── */

/** Laptop (≤1440px) — 1-2 columns, vertical priority */
export const LAPTOP_FOCUSED: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-main',
      widthPercent: 100,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 75,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-bottom',
          heightPercent: 20,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
            { id: 'pane-copilot', type: 'copilot' },
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
  ],
}

export const LAPTOP_SPLIT: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 65,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 67,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-positions',
          heightPercent: 28,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
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
      id: 'col-right',
      widthPercent: 35,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-copilot',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/** Ultrawide (2560–3840px) — 3-4 columns, most panels visible */
export const ULTRAWIDE_FULL_DASHBOARD: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-orderbook',
      widthPercent: 15,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
      ],
    },
    {
      id: 'col-chart',
      widthPercent: 45,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 72,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-risk',
          heightPercent: 28,
          activeTabIndex: 0,
          panes: [{ id: 'pane-risk', type: 'risk' }],
        },
      ],
    },
    {
      id: 'col-data',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-positions',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
          ],
        },
        {
          id: 'cell-research',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-research', type: 'research' }],
        },
      ],
    },
    {
      id: 'col-right',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 35,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-copilot',
          heightPercent: 65,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

export const ULTRAWIDE_WIDE_TRADING: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-depth',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-depth', type: 'depth' }],
        },
      ],
    },
    {
      id: 'col-center',
      widthPercent: 50,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 65,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-positions',
          heightPercent: 30,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
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
      id: 'col-right',
      widthPercent: 32,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 35,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-copilot',
          heightPercent: 65,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/** 4K (3840px+) — all panels, generous sizing */
export const FOURK_COMMAND_CENTER: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 15,
      cells: [
        {
          id: 'cell-orderbook',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-orderbook', type: 'orderbook' }],
        },
        {
          id: 'cell-pair-info',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-pair-info', type: 'pair-info' }],
        },
      ],
    },
    {
      id: 'col-chart',
      widthPercent: 40,
      cells: [
        {
          id: 'cell-chart',
          heightPercent: 65,
          activeTabIndex: 0,
          panes: [{ id: 'pane-chart', type: 'chart' }],
        },
        {
          id: 'cell-research',
          heightPercent: 30,
          activeTabIndex: 0,
          panes: [{ id: 'pane-research', type: 'research' }],
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
      id: 'col-data',
      widthPercent: 20,
      cells: [
        {
          id: 'cell-positions',
          heightPercent: 55,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-positions', type: 'positions' },
            { id: 'pane-data-log', type: 'data-log' },
          ],
        },
        {
          id: 'cell-social',
          heightPercent: 45,
          activeTabIndex: 0,
          panes: [{ id: 'pane-social', type: 'social' }],
        },
      ],
    },
    {
      id: 'col-right',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-trade',
          heightPercent: 35,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trade-entry', type: 'trade-entry' }],
        },
        {
          id: 'cell-copilot',
          heightPercent: 65,
          activeTabIndex: 0,
          panes: [{ id: 'pane-copilot', type: 'copilot' }],
        },
      ],
    },
  ],
}

/** Create an NxM grid layout where every cell has a single empty placeholder pane. */
export function createGridLayout(cols: number, rows: number): TerminalLayout {
  const widthPercent = Math.round((100 / cols) * 100) / 100
  const heightPercent = Math.round((100 / rows) * 100) / 100
  return {
    version: 1,
    columns: Array.from({ length: cols }, () => ({
      id: layoutId(),
      widthPercent,
      cells: Array.from({ length: rows }, () => ({
        id: layoutId(),
        heightPercent,
        activeTabIndex: 0,
        panes: [{ id: layoutId(), type: 'empty' }],
      })),
    })),
  }
}

/** Merge a grid into an existing layout at the given position. */
export function mergeGridIntoLayout(
  existing: TerminalLayout,
  cols: number,
  rows: number,
  position: 'left' | 'right' | 'top' | 'bottom',
): TerminalLayout {
  if (position === 'left' || position === 'right') {
    const gridColumns = createGridLayout(cols, rows).columns
    const allColumns =
      position === 'left'
        ? [...gridColumns, ...existing.columns]
        : [...existing.columns, ...gridColumns]
    return normalizeLayout({ version: 1, columns: allColumns })
  }

  // top/bottom: add empty cells to each existing column
  const heightPercent = Math.round((100 / rows) * 100) / 100
  const columns = existing.columns.map((col) => {
    const emptyCells = Array.from({ length: rows }, () => ({
      id: layoutId(),
      heightPercent,
      activeTabIndex: 0,
      panes: [{ id: layoutId(), type: 'empty' as const }],
    }))
    const cells =
      position === 'top'
        ? [...emptyCells, ...col.cells]
        : [...col.cells, ...emptyCells]
    return { ...col, cells }
  })

  return normalizeLayout({ version: 1, columns })
}
