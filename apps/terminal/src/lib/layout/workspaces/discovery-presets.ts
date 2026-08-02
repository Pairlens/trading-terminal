// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { TerminalLayout } from '../types'

// Raw discovery/home layout geometry. Kept as a leaf module (no catalog import)
// so the Workspace Store catalog can wrap these into templates without a cycle.

// Default home: everything on this board works without an account —
// markets scanner, a market-pulse rail (sentiment + top coins tabbed with
// the local watchlist), and the news feed as its own full-height column.
export const DISCOVERY_HOME: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-main',
      widthPercent: 47,
      cells: [
        {
          id: 'cell-markets',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-markets', type: 'markets' }],
        },
      ],
    },
    {
      id: 'col-pulse',
      widthPercent: 25,
      cells: [
        {
          // Tall enough that the 30-day trendline reads as a curve, not a strip
          id: 'cell-sentiment',
          heightPercent: 34,
          activeTabIndex: 0,
          panes: [{ id: 'pane-fear-greed', type: 'fear-greed' }],
        },
        {
          id: 'cell-coins',
          heightPercent: 66,
          activeTabIndex: 0,
          panes: [
            { id: 'pane-trending', type: 'top-coins' },
            { id: 'pane-watchlist', type: 'watchlist' },
          ],
        },
      ],
    },
    {
      id: 'col-news',
      widthPercent: 28,
      cells: [
        {
          id: 'cell-news',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-news', type: 'news' }],
        },
      ],
    },
  ],
}

export const DISCOVERY_MARKETS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-main',
      widthPercent: 100,
      cells: [
        {
          id: 'cell-markets',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-markets', type: 'markets' }],
        },
      ],
    },
  ],
}

export const DISCOVERY_OVERVIEW: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 65,
      cells: [
        {
          id: 'cell-markets',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-markets', type: 'markets' }],
        },
      ],
    },
    {
      id: 'col-right',
      widthPercent: 35,
      cells: [
        {
          id: 'cell-trending',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trending', type: 'top-coins' }],
        },
        {
          id: 'cell-watchlist',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-watchlist', type: 'watchlist' }],
        },
      ],
    },
  ],
}

export const DISCOVERY_ANALYSIS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 40,
      cells: [
        {
          id: 'cell-markets',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-markets', type: 'markets' }],
        },
      ],
    },
    {
      id: 'col-center',
      widthPercent: 35,
      cells: [
        {
          id: 'cell-heatmap',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-heatmap', type: 'heatmap' }],
        },
      ],
    },
    {
      id: 'col-right',
      widthPercent: 25,
      cells: [
        {
          id: 'cell-trending',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trending', type: 'top-coins' }],
        },
        {
          id: 'cell-watchlist',
          heightPercent: 50,
          activeTabIndex: 0,
          panes: [{ id: 'pane-watchlist', type: 'watchlist' }],
        },
      ],
    },
  ],
}

export const DISCOVERY_NEWS: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-left',
      widthPercent: 55,
      cells: [
        {
          id: 'cell-markets',
          heightPercent: 100,
          activeTabIndex: 0,
          panes: [{ id: 'pane-markets', type: 'markets' }],
        },
      ],
    },
    {
      id: 'col-right',
      widthPercent: 45,
      cells: [
        {
          id: 'cell-trending',
          heightPercent: 40,
          activeTabIndex: 0,
          panes: [{ id: 'pane-trending', type: 'top-coins' }],
        },
        {
          id: 'cell-news',
          heightPercent: 60,
          activeTabIndex: 0,
          panes: [{ id: 'pane-news', type: 'news' }],
        },
      ],
    },
  ],
}
