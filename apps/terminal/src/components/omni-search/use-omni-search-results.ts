// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useTheme } from 'next-themes'

import { rankItems } from './fuzzy'
import type {
  ActionResult,
  NotificationResult,
  OmniSearchCategory,
  OmniSearchResult,
  PageResult,
  PairResult,
  PaneResult,
  PluginResult,
  ResultGroup,
  WorkflowResult,
  WorkspaceResult,
} from './omni-search-types'
import { instrumentToPairEntry } from '@/components/pair-picker/pair-picker-data'
import { useInstrumentSearch } from '@/hooks/use-instrument-search'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useThemePluginContext } from '@/hooks/use-theme-plugin'
import { usePaneRegistry } from '@/lib/layout/pane-registry'
import { usePairlens } from '@/lib/pairlens-provider'
import { toggleFullscreen } from '@/lib/fullscreen'
import { isStandalone, openTerminalWindow } from '@/lib/platform'
import { useOptimisticSession } from '@/lib/session'
import { authClient, hasAppServer } from '@/lib/auth-client'
import { useCreateWorkspaceDialogStore } from '@/stores/create-workspace-dialog-store'
import { useCustomWorkspacesStore } from '@/stores/custom-workspaces-store'
import { useNotificationStore } from '@/stores/notification-store'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { useWatchlistsStore } from '@/stores/watchlists-store'
import { useWorkflowStore } from '@/stores/workflow-store'

const MAX_PAIRS_IN_ALL = 8
const MAX_ACTIONS_IN_ALL = 6

/** VS Code-style query prefixes that scope the search to one category. */
const PREFIX_CATEGORY: Record<string, OmniSearchCategory> = {
  '>': 'actions',
  '#': 'pairs',
  '@': 'panes',
}

type ScoredCategory<T> = { items: Array<T>; topScore: number }

type UseOmniSearchResultsReturn = {
  groups: Array<ResultGroup>
  categoryCounts: Record<OmniSearchCategory, number>
  isLoading: boolean
  /** Category forced by a query prefix (>, #, @), or null. */
  prefixCategory: OmniSearchCategory | null
}

export function useOmniSearchResults(
  query: string,
  activeCategory: OmniSearchCategory,
  recentActionIds: Array<string>,
): UseOmniSearchResultsReturn {
  const { t } = useTranslation()
  const { resolvedTheme, setTheme } = useTheme()
  const { pluginManager, pluginStateVersion } = usePairlens()
  const { session } = useOptimisticSession()
  const registry = usePaneRegistry()
  const allSymbolsSet = useWatchlistsStore((s) => s.allSymbolsSet)
  const workspaces = useCustomWorkspacesStore((s) => s.workspaces)
  const workflows = useWorkflowStore((s) => s.workflows)
  const notificationRules = useNotificationStore((s) => s.rules)
  const openSettings = useSettingsDialogStore((s) => s.open)
  const { availableThemes, activeThemeId, selectTheme } =
    useThemePluginContext()

  // ── Query parsing ───────────────────────────────────────────────────
  // A leading prefix character scopes the search to one category.
  const trimmed = query.trim()
  const prefixCategory = PREFIX_CATEGORY[trimmed[0]] ?? null
  // Query used for fuzzy matching — spaces preserved, prefix stripped.
  const q = (prefixCategory ? trimmed.slice(1) : trimmed).trim().toLowerCase()
  const effectiveCategory = prefixCategory ?? activeCategory

  // Pair-flavored query: separators normalized so "btc usdt" → "btc-usdt".
  const pairQ = q.replace(/[\s/]+/g, '-')
  const pairSearchEnabled =
    effectiveCategory === 'all' || effectiveCategory === 'pairs'

  // Pair search (server-backed, 2+ chars)
  const { items: instruments } = useMarketInstruments()
  const {
    data: searchResults,
    isSearchActive,
    isLoading,
  } = useInstrumentSearch(pairSearchEnabled ? q : '')
  const [recentPairs] = usePersistedState<Array<string>>(
    'pair-picker.recent',
    [],
  )

  // ── Pairs ───────────────────────────────────────────────────────────

  const allPairs = useMemo(
    () => (instruments?.length ? instruments.map(instrumentToPairEntry) : []),
    [instruments],
  )

  const pairsBySymbol = useMemo(
    () => new Map(allPairs.map((p) => [p.symbol, p])),
    [allPairs],
  )

  const pairResults = useMemo<{
    items: Array<PairResult>
    isFallback: boolean
  }>(() => {
    if (pairQ.length === 0) {
      // Empty state: recent + watched
      const recent = recentPairs
        .map((s) => pairsBySymbol.get(s))
        .filter(Boolean)
        .slice(0, 8)
        .map(
          (pair): PairResult => ({
            type: 'pair',
            pair: pair!,
            isWatched: allSymbolsSet.has(pair!.symbol),
          }),
        )
      const watched = [...allSymbolsSet]
        .map((s) => pairsBySymbol.get(s))
        .filter(Boolean)
        .filter((p) => !recentPairs.includes(p!.symbol))
        .slice(0, 8)
        .map(
          (pair): PairResult => ({
            type: 'pair',
            pair: pair!,
            isWatched: true,
          }),
        )
      const browse = [...recent, ...watched]
      if (browse.length > 0) return { items: browse, isFallback: false }

      // Fresh install: no recents, no watchlist — show top-ranked markets
      // so the pairs group is never empty.
      const top = [...allPairs]
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 6)
        .map((pair): PairResult => ({ type: 'pair', pair, isWatched: false }))
      return { items: top, isFallback: true }
    }

    // Server search (2+ chars)
    if (isSearchActive && searchResults) {
      const items = searchResults
        .map(instrumentToPairEntry)
        .sort((a, b) => {
          const af = allSymbolsSet.has(a.symbol) ? 0 : 1
          const bf = allSymbolsSet.has(b.symbol) ? 0 : 1
          if (af !== bf) return af - bf
          return a.rank - b.rank
        })
        .map(
          (pair): PairResult => ({
            type: 'pair',
            pair,
            isWatched: allSymbolsSet.has(pair.symbol),
          }),
        )
      return { items, isFallback: false }
    }

    // Client filter (1-char)
    if (pairQ.length === 1) {
      const items = allPairs
        .filter(
          (p) =>
            p.symbol.toLowerCase().includes(pairQ) ||
            p.name.toLowerCase().includes(pairQ) ||
            p.base.toLowerCase().includes(pairQ),
        )
        .sort((a, b) => {
          const af = allSymbolsSet.has(a.symbol) ? 0 : 1
          const bf = allSymbolsSet.has(b.symbol) ? 0 : 1
          if (af !== bf) return af - bf
          return a.rank - b.rank
        })
        .slice(0, 20)
        .map(
          (pair): PairResult => ({
            type: 'pair',
            pair,
            isWatched: allSymbolsSet.has(pair.symbol),
          }),
        )
      return { items, isFallback: false }
    }

    return { items: [], isFallback: false }
  }, [
    pairQ,
    isSearchActive,
    searchResults,
    allPairs,
    pairsBySymbol,
    recentPairs,
    allSymbolsSet,
  ])

  // ── Pages ─────────────────────────────────────────────────────────

  const pageResults = useMemo<ScoredCategory<PageResult>>(() => {
    type PageDef = PageResult & { keywords: Array<string> }
    const pages: Array<PageDef> = [
      {
        type: 'page',
        id: 'discovery',
        name: t('discovery.title'),
        icon: 'Home',
        path: '/',
        keywords: ['home', 'discovery', 'discover', 'markets', 'overview'],
      },
      {
        type: 'page',
        id: 'plugins',
        name: t('nav.plugins'),
        icon: 'Blocks',
        path: '/plugins',
        keywords: ['extensions', 'connectors', 'marketplace', 'store'],
      },
      {
        type: 'page',
        id: 'accounts',
        name: t('nav.accounts'),
        icon: 'Wallet',
        path: '/accounts',
        keywords: ['portfolio', 'wallet', 'balances', 'exchange', 'keys'],
      },
      {
        type: 'page',
        id: 'workflows',
        name: t('nav.workflows'),
        icon: 'Waypoints',
        path: '/workflows',
        keywords: ['automation', 'rules'],
      },
      {
        type: 'page',
        id: 'bots',
        name: t('nav.bots'),
        icon: 'Bot',
        path: '/bots',
        keywords: ['bots', 'automation', 'strategy', 'trading', 'algo'],
      },
      {
        type: 'page',
        id: 'notifications',
        name: t('nav.notifications'),
        icon: 'Bell',
        path: '/notifications',
        keywords: ['alerts', 'alarms'],
      },
      {
        type: 'page',
        id: 'workspace-store',
        name: t('nav.workspaceStore'),
        icon: 'Store',
        path: '/workspace-store',
        keywords: ['templates', 'gallery', 'layouts'],
      },
    ]
    if (!q) return { items: pages, topScore: 0 }
    const ranked = rankItems(q, pages, {
      primary: (p) => p.name,
      keywords: (p) => p.keywords,
    })
    return {
      items: ranked.map(({ item, ranges }) => ({
        ...item,
        matchRanges: ranges,
      })),
      topScore: ranked[0]?.score ?? 0,
    }
  }, [q, t])

  // ── Workspaces ────────────────────────────────────────────────────

  const workspaceResults = useMemo<ScoredCategory<WorkspaceResult>>(() => {
    const items: Array<WorkspaceResult> = workspaces.map((ws) => ({
      type: 'workspace',
      id: ws.id,
      name: ws.name,
      description: ws.description,
      icon: ws.icon,
    }))
    if (!q) return { items, topScore: 0 }
    const ranked = rankItems(q, items, {
      primary: (w) => w.name,
      secondary: (w) => w.description,
    })
    return {
      items: ranked.map(({ item, ranges }) => ({
        ...item,
        matchRanges: ranges,
      })),
      topScore: ranked[0]?.score ?? 0,
    }
  }, [q, workspaces])

  // ── Workflows ───────────────────────────────────────────────────────

  const workflowResults = useMemo<ScoredCategory<WorkflowResult>>(() => {
    const items: Array<WorkflowResult> = workflows.map((w) => ({
      type: 'workflow',
      id: w.id,
      name: w.name,
      description: w.description,
    }))
    if (!q) return { items, topScore: 0 }
    const ranked = rankItems(q, items, {
      primary: (w) => w.name,
      secondary: (w) => w.description,
    })
    return {
      items: ranked.map(({ item, ranges }) => ({
        ...item,
        matchRanges: ranges,
      })),
      topScore: ranked[0]?.score ?? 0,
    }
  }, [q, workflows])

  // ── Notifications ──────────────────────────────────────────────────

  const notificationResults = useMemo<
    ScoredCategory<NotificationResult>
  >(() => {
    const items: Array<NotificationResult> = notificationRules.map((r) => ({
      type: 'notification',
      id: r.id,
      name: r.name,
    }))
    if (!q) return { items, topScore: 0 }
    const ranked = rankItems(q, items, { primary: (r) => r.name })
    return {
      items: ranked.map(({ item, ranges }) => ({
        ...item,
        matchRanges: ranges,
      })),
      topScore: ranked[0]?.score ?? 0,
    }
  }, [q, notificationRules])

  // ── Panes ─────────────────────────────────────────────────────────

  const paneDefinitions = registry.getDefinitions()
  const paneResults = useMemo<ScoredCategory<PaneResult>>(() => {
    const items: Array<PaneResult> = Object.entries(paneDefinitions)
      .filter(([key]) => key !== 'empty')
      .map(([key, def]) => ({
        type: 'pane' as const,
        paneType: key,
        label: t(def.labelKey),
        icon: def.icon,
        category: def.category,
      }))
    if (!q) return { items, topScore: 0 }
    const ranked = rankItems(q, items, {
      primary: (p) => p.label,
      secondary: (p) => p.category,
      keywords: (p) => [p.paneType],
    })
    return {
      items: ranked.map(({ item, ranges }) => ({
        ...item,
        matchRanges: ranges,
      })),
      topScore: ranked[0]?.score ?? 0,
    }
  }, [paneDefinitions, q, t])

  // ── Plugins ───────────────────────────────────────────────────────

  const pluginResults = useMemo<ScoredCategory<PluginResult>>(() => {
    const allPlugins = pluginManager.getInstalledPlugins()
    const items: Array<PluginResult> = allPlugins.map((p) => ({
      type: 'plugin' as const,
      id: p.manifest.id,
      name: p.manifest.name,
      description: p.manifest.description,
      icon: undefined,
      enabled: p.status === 'active',
    }))
    if (!q) return { items, topScore: 0 }
    const ranked = rankItems(q, items, {
      primary: (p) => p.name,
      secondary: (p) => p.description,
      keywords: (p) => [p.id],
    })
    return {
      items: ranked.map(({ item, ranges }) => ({
        ...item,
        matchRanges: ranges,
      })),
      topScore: ranked[0]?.score ?? 0,
    }
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [q, pluginManager, pluginStateVersion])

  // ── Actions ───────────────────────────────────────────────────────

  const actionDefs = useMemo<Array<ActionResult>>(() => {
    const isDark = resolvedTheme === 'dark'
    const items: Array<ActionResult> = [
      {
        type: 'action',
        id: isDark ? 'toggle-theme' : 'toggle-theme-dark',
        label: isDark
          ? t('search.actions.lightMode')
          : t('search.actions.darkMode'),
        icon: isDark ? 'Sun' : 'Moon',
        keywords: ['theme', 'dark mode', 'light mode', 'night', 'appearance'],
        execute: () => setTheme(isDark ? 'light' : 'dark'),
      },
      {
        type: 'action',
        id: 'open-settings',
        label: t('search.actions.openSettings'),
        icon: 'Settings2',
        keywords: ['preferences', 'options', 'config'],
        execute: openSettings,
      },
      {
        type: 'action',
        id: 'new-window',
        label: t('search.actions.newWindow'),
        icon: 'AppWindow',
        keywords: ['duplicate', 'window', 'tab'],
        // Duplicate the current view into a new window (browser-tab style)
        execute: () =>
          void openTerminalWindow(
            window.location.pathname + window.location.search,
          ),
      },
      {
        type: 'action',
        id: 'reload-window',
        label: t('search.actions.reload'),
        icon: 'RefreshCw',
        keywords: ['refresh', 'restart'],
        execute: () => window.location.reload(),
      },
      // Web only: on desktop the native window controls own fullscreen.
      ...(isStandalone
        ? []
        : [
            {
              type: 'action',
              id: 'toggle-fullscreen',
              label: t('search.actions.fullscreen'),
              icon: 'Maximize',
              keywords: ['full screen', 'maximize', 'focus', 'zen'],
              execute: () => void toggleFullscreen(),
            } satisfies ActionResult,
          ]),
      {
        type: 'action',
        id: 'new-workspace',
        label: t('nav.newWorkspace'),
        icon: 'SquarePlus',
        keywords: ['create workspace', 'add workspace', 'layout'],
        execute: () => useCreateWorkspaceDialogStore.getState().open(),
      },
    ]

    // Deep links into every settings section
    const settingsSections: Array<{
      id: string
      nameKey: string
      icon: string
      keywords: Array<string>
    }> = [
      {
        id: 'profile',
        nameKey: 'settings.nav.profile',
        icon: 'CircleUser',
        keywords: ['account', 'avatar', 'name'],
      },
      {
        id: 'billing',
        nameKey: 'settings.nav.billing',
        icon: 'Sparkles',
        keywords: [
          'billing',
          'subscription',
          'plan',
          'upgrade',
          'credits',
          'usage',
          'pro',
          'max',
        ],
      },
      {
        id: 'plugins',
        nameKey: 'settings.nav.plugins',
        icon: 'Puzzle',
        keywords: ['extensions', 'connectors'],
      },
      {
        id: 'region',
        nameKey: 'settings.nav.region',
        icon: 'MapPin',
        keywords: ['country', 'location', 'geo'],
      },
      {
        id: 'currency',
        nameKey: 'settings.nav.currency',
        icon: 'Coins',
        keywords: ['fiat', 'usd', 'eur'],
      },
      {
        id: 'risk',
        nameKey: 'settings.nav.risk',
        icon: 'ShieldCheck',
        keywords: ['guardrails', 'limits', 'stop loss'],
      },
      {
        id: 'security',
        nameKey: 'settings.nav.security',
        icon: 'Lock',
        keywords: ['lock', 'password', 'privacy', 'screen lock'],
      },
      {
        id: 'appearance',
        nameKey: 'settings.nav.appearance',
        icon: 'Paintbrush',
        keywords: ['theme', 'colors', 'font'],
      },
      {
        id: 'keyboard',
        nameKey: 'settings.nav.keyboard',
        icon: 'Keyboard',
        keywords: ['shortcuts', 'keybindings', 'hotkeys', 'keymap'],
      },
      {
        id: 'performance',
        nameKey: 'settings.nav.performance',
        icon: 'Gauge',
        keywords: ['fps', 'rendering', 'speed'],
      },
      {
        id: 'language',
        nameKey: 'settings.nav.language',
        icon: 'Globe',
        keywords: ['locale', 'translation', 'idioma'],
      },
    ]
    // Only meaningful when there is an account to sync with — a standalone
    // build has no App Server and hides the section entirely.
    if (hasAppServer) {
      settingsSections.push({
        id: 'cloud-sync',
        nameKey: 'settings.nav.cloudSync',
        icon: 'Cloud',
        keywords: ['sync', 'cloud', 'backup', 'account', 'devices'],
      })
    }
    // Desktop-only section: the deep link would open an empty pane in a
    // browser build, so it isn't offered there.
    if (isStandalone) {
      settingsSections.push({
        id: 'desktop',
        nameKey: 'settings.nav.desktop',
        icon: 'AppWindow',
        keywords: [
          'close',
          'window',
          'background',
          'tray',
          'quit',
          'dock',
          'menu bar',
        ],
      })
    }
    for (const section of settingsSections) {
      items.push({
        type: 'action',
        id: `settings-${section.id}`,
        label: t('search.actions.settingsSection', {
          name: t(section.nameKey),
        }),
        icon: section.icon,
        keywords: ['settings', 'preferences', ...section.keywords],
        execute: () => openSettings(section.id),
      })
    }

    if (session && hasAppServer) {
      items.push({
        type: 'action',
        id: 'sign-out',
        label: t('search.actions.signOut'),
        icon: 'LogOut',
        keywords: ['logout', 'log out'],
        execute: () => void authClient.signOut(),
      })
    }

    // Theme switching actions
    if (availableThemes.length > 0) {
      // "Reset to default" action when a theme is active
      if (activeThemeId) {
        items.push({
          type: 'action',
          id: 'theme-reset',
          label: t('search.actions.resetTheme'),
          icon: 'Palette',
          keywords: ['theme', 'default'],
          execute: () => selectTheme(null),
        })
      }
      // One action per available theme (skip currently active)
      for (const theme of availableThemes) {
        if (theme.id === activeThemeId) continue
        items.push({
          type: 'action',
          id: `theme-${theme.id}`,
          label: t('search.actions.switchTheme', { name: theme.name }),
          icon: 'Palette',
          keywords: ['theme', 'skin'],
          execute: () => selectTheme(theme.id),
        })
      }
    }

    return items
  }, [
    resolvedTheme,
    setTheme,
    openSettings,
    session,
    availableThemes,
    activeThemeId,
    selectTheme,
    t,
  ])

  // ── Plugin commands ─────────────────────────────────────────────
  const pluginCommandDefs = useMemo<Array<ActionResult>>(() => {
    const active = pluginManager.getActivePlugins()
    const commands: Array<ActionResult> = []
    for (const plugin of active) {
      for (const cmd of plugin.manifest.contributes?.commands ?? []) {
        commands.push({
          type: 'action',
          id: `${plugin.manifest.id}:${cmd.id}`,
          label: cmd.labelKey ? t(cmd.labelKey) : cmd.label,
          icon: cmd.icon ?? 'Terminal',
          shortcut: cmd.shortcut,
          keywords: [plugin.manifest.name, cmd.id],
          execute: () =>
            plugin.executeCommand?.(cmd.id, pluginManager.getContext()),
        })
      }
    }
    return commands
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion, t])

  const allActionResults = useMemo<ScoredCategory<ActionResult>>(() => {
    const defs = [...actionDefs, ...pluginCommandDefs]
    const recencyRank = new Map(recentActionIds.map((id, i) => [id, i]))

    if (!q) {
      // Browse mode: recently used first, then declared order (stable sort).
      const items = [...defs].sort(
        (a, b) =>
          (recencyRank.get(a.id) ?? Infinity) -
          (recencyRank.get(b.id) ?? Infinity),
      )
      return { items, topScore: 0 }
    }

    const ranked = rankItems(q, defs, {
      primary: (a) => a.label,
      keywords: (a) => a.keywords,
    })
    // Recently used commands get a small boost among matches.
    const boosted = ranked
      .map((r) => ({
        ...r,
        score: r.score + (recencyRank.has(r.item.id) ? 2 : 0),
      }))
      .sort((a, b) => b.score - a.score)
    return {
      items: boosted.map(({ item, ranges }) => ({
        ...item,
        matchRanges: ranges,
      })),
      topScore: boosted[0]?.score ?? 0,
    }
  }, [q, actionDefs, pluginCommandDefs, recentActionIds])

  // ── Build groups ──────────────────────────────────────────────────

  const { groups, categoryCounts } = useMemo(() => {
    const counts: Record<OmniSearchCategory, number> = {
      all: 0,
      pairs: pairResults.items.length,
      pages: pageResults.items.length,
      workspaces: workspaceResults.items.length,
      workflows: workflowResults.items.length,
      notifications: notificationResults.items.length,
      panes: paneResults.items.length,
      plugins: pluginResults.items.length,
      actions: allActionResults.items.length,
    }
    counts.all =
      counts.pairs +
      counts.pages +
      counts.workspaces +
      counts.workflows +
      counts.notifications +
      counts.panes +
      counts.plugins +
      counts.actions

    const buildGroups = (): Array<ResultGroup> => {
      if (effectiveCategory !== 'all') {
        const categoryMap: Record<
          Exclude<OmniSearchCategory, 'all'>,
          { label: string; results: Array<OmniSearchResult> }
        > = {
          pairs: {
            label: t('search.categories.pairs'),
            results: pairResults.items,
          },
          pages: {
            label: t('search.categories.pages'),
            results: pageResults.items,
          },
          workspaces: {
            label: t('search.categories.workspaces'),
            results: workspaceResults.items,
          },
          workflows: {
            label: t('search.categories.workflows'),
            results: workflowResults.items,
          },
          notifications: {
            label: t('search.categories.notifications'),
            results: notificationResults.items,
          },
          panes: {
            label: t('search.categories.panes'),
            results: paneResults.items,
          },
          plugins: {
            label: t('search.categories.plugins'),
            results: pluginResults.items,
          },
          actions: {
            label: t('search.categories.actions'),
            results: allActionResults.items,
          },
        }
        const entry = categoryMap[effectiveCategory]
        return entry.results.length > 0
          ? [
              {
                category: effectiveCategory,
                label: entry.label,
                results: entry.results,
              },
            ]
          : []
      }

      // "All" tab — pairs first, remaining groups ranked by best match.
      const result: Array<ResultGroup> = []

      if (pairResults.items.length > 0) {
        result.push({
          category: 'pairs',
          label: q
            ? t('search.categories.pairs')
            : pairResults.isFallback
              ? t('search.topMarkets')
              : t('search.recentAndWatched'),
          results: pairResults.items.slice(0, MAX_PAIRS_IN_ALL),
        })
      }

      type Candidate = ResultGroup & { topScore: number }
      const candidates: Array<Candidate> = []

      if (pageResults.items.length > 0) {
        candidates.push({
          category: 'pages',
          label: t('search.categories.pages'),
          results: pageResults.items,
          topScore: pageResults.topScore,
        })
      }
      if (workspaceResults.items.length > 0) {
        candidates.push({
          category: 'workspaces',
          label: t('search.categories.workspaces'),
          results: workspaceResults.items,
          topScore: workspaceResults.topScore,
        })
      }
      if (workflowResults.items.length > 0) {
        candidates.push({
          category: 'workflows',
          label: t('search.categories.workflows'),
          results: workflowResults.items.slice(0, 4),
          topScore: workflowResults.topScore,
        })
      }
      if (notificationResults.items.length > 0) {
        candidates.push({
          category: 'notifications',
          label: t('search.categories.notifications'),
          results: notificationResults.items.slice(0, 4),
          topScore: notificationResults.topScore,
        })
      }
      if (paneResults.items.length > 0 && q) {
        // Only show panes in "All" when searching
        candidates.push({
          category: 'panes',
          label: t('search.categories.panes'),
          results: paneResults.items.slice(0, 6),
          topScore: paneResults.topScore,
        })
      }
      if (pluginResults.items.length > 0 && q) {
        // Only show plugins in "All" when searching
        candidates.push({
          category: 'plugins',
          label: t('search.categories.plugins'),
          results: pluginResults.items.slice(0, 4),
          topScore: pluginResults.topScore,
        })
      }
      if (allActionResults.items.length > 0) {
        candidates.push({
          category: 'actions',
          label: t('search.categories.actions'),
          results: allActionResults.items.slice(0, MAX_ACTIONS_IN_ALL),
          topScore: allActionResults.topScore,
        })
      }

      // While searching, surface the strongest-matching group first.
      if (q) candidates.sort((a, b) => b.topScore - a.topScore)

      for (const c of candidates) {
        result.push({
          category: c.category,
          label: c.label,
          results: c.results,
        })
      }

      return result
    }

    return { groups: buildGroups(), categoryCounts: counts }
  }, [
    effectiveCategory,
    q,
    pairResults,
    pageResults,
    workspaceResults,
    workflowResults,
    notificationResults,
    paneResults,
    pluginResults,
    allActionResults,
    t,
  ])

  return { groups, categoryCounts, isLoading, prefixCategory }
}
