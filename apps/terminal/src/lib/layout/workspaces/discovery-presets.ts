// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { TerminalLayout } from '../types'

// Raw discovery/home layout geometry. Kept as a leaf module (no catalog import)
// so the Workspace Store catalog can wrap these into templates without a cycle.

// Default home: everything on this board works without an account. It opens on
// what moved and why rather than on a list of pairs.
//
// Reading order left to right: what the market did (pulse over movers over the
// sector tape), why it did it (the news column, wide enough for headlines that
// do not truncate mid-sentence), and what the user personally holds or hunts
// (the watchlist over the compact scanner). News sits in the middle column
// because it is the column that explains the one beside it; the scanner is the
// rail because it is a jumping-off point rather than something to read.
//
// The three snapshot panes all read what `use-top-coins-snapshot` already
// fetches, so the board costs one REST call rather than three.
export const DISCOVERY_HOME: TerminalLayout = {
  version: 1,
  columns: [
    {
      id: 'col-pulse',
      widthPercent: 56,
      cells: [
        {
          id: 'cell-pulse',
          heightPercent: 15,
          activeTabIndex: 0,
          panes: [{ id: 'pane-market-pulse', type: 'market-pulse' }],
        },
        {
          id: 'cell-movers',
          heightPercent: 47,
          activeTabIndex: 0,
          panes: [{ id: 'pane-movers', type: 'movers' }],
        },
        {
          id: 'cell-sectors',
          heightPercent: 38,
          activeTabIndex: 0,
          panes: [{ id: 'pane-sector-tape', type: 'sector-tape' }],
        },
      ],
    },
    {
      id: 'col-news',
      widthPercent: 26,
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
      id: 'col-rail',
      widthPercent: 18,
      cells: [
        {
          id: 'cell-watchlist',
          heightPercent: 57,
          activeTabIndex: 0,
          panes: [{ id: 'pane-watchlist', type: 'watchlist' }],
        },
        {
          id: 'cell-markets',
          heightPercent: 43,
          activeTabIndex: 0,
          panes: [{ id: 'pane-markets', type: 'markets' }],
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
