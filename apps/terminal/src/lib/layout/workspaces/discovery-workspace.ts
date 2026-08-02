// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { LayoutGrid, Newspaper, Star, TrendingUp } from 'lucide-react'

import { DISCOVERY_HOME } from './discovery-presets'
import type { WorkspaceConfig } from '../types'
import { routePresets } from '@/lib/workspace-store/catalog'

export const DISCOVERY_WORKSPACE: WorkspaceConfig = {
  storageKey: 'pairlens:discovery.layout',

  // Every pane on the default board works without an account — signing in
  // is a lean-in, never a prerequisite for a useful home.
  defaultPreset: DISCOVERY_HOME,
  // Quick-apply layouts derived from the Workspace Store (single source).
  presets: routePresets('discovery'),

  mobileTabs: [
    { type: 'markets', label: 'Markets', icon: LayoutGrid },
    { type: 'watchlist', label: 'Watchlist', icon: Star },
    { type: 'top-coins', label: 'Top Coins', icon: TrendingUp },
    { type: 'news', label: 'News', icon: Newspaper },
  ],
}
