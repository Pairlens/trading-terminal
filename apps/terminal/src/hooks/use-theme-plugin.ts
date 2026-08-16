// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

import type { PluginManifest } from '@pairlens/plugin-system'
import type {
  ThemeChartPalette,
  ThemeDefinition,
} from '@pairlens/plugins/themes'

import { usePairlens } from '@/lib/pairlens-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { applyTheme } from '@/lib/theme/apply-theme'

// Re-exported so existing callers keep one import path. New code outside the
// terminal shell should import `@/lib/theme/apply-theme` directly: reaching it
// through this module pulls the plugin provider in with it.
export { applyTheme }

type ThemePluginInfo = {
  id: string
  name: string
  author: string
  manifest: PluginManifest
}

/**
 * The active theme's chart palettes, one per color mode. `light: null` is a
 * meaningful state: the theme declared no light palette, and the chart hook
 * falls back to the ENGINE's light defaults — never to the dark palette.
 */
export type ActiveChartOverrides = {
  dark: ThemeChartPalette | null
  light: ThemeChartPalette | null
}

export type UseThemePluginReturn = {
  activeThemeId: string | null
  availableThemes: Array<ThemePluginInfo>
  activeChartOverrides: ActiveChartOverrides | null
  selectTheme: (id: string | null) => void
}

const defaultThemePluginValue: UseThemePluginReturn = {
  activeThemeId: null,
  availableThemes: [],
  activeChartOverrides: null,
  selectTheme: () => {},
}

export const ThemePluginContext = createContext<UseThemePluginReturn>(
  defaultThemePluginValue,
)

export function useThemePluginContext() {
  return useContext(ThemePluginContext)
}

export function useThemePlugin(): UseThemePluginReturn {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const [activeThemeId, setActiveThemeId] = usePersistedState<string | null>(
    'theme.activePluginId',
    null,
  )
  const [chartOverrides, setChartOverrides] =
    useState<ActiveChartOverrides | null>(null)

  const availableThemes = useMemo<Array<ThemePluginInfo>>(() => {
    const plugins = pluginManager.getActivePlugins()
    return plugins
      .filter((p) =>
        p.manifest.capabilities.some((c) => c.id === 'theme:override'),
      )
      .map((p) => ({
        id: p.manifest.id,
        name: p.manifest.name,
        author: p.manifest.author,
        manifest: p.manifest,
      }))
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion])

  // Clear selection when the active theme plugin is no longer available
  useEffect(() => {
    if (
      activeThemeId &&
      availableThemes.length > 0 &&
      !availableThemes.some((t) => t.id === activeThemeId)
    ) {
      setActiveThemeId(null)
    }
  }, [activeThemeId, availableThemes, setActiveThemeId])

  // Apply / remove the <style> override tag.
  // Depends on pluginStateVersion so it re-runs after plugins load on refresh.
  useEffect(() => {
    if (!activeThemeId) {
      applyTheme(null)
      setChartOverrides(null)
      return
    }

    let cancelled = false

    const run = async () => {
      const plugin = pluginManager
        .getActivePlugins()
        .find((p) => p.manifest.id === activeThemeId)

      if (!plugin) {
        // Plugin not loaded yet — keep the cached style tag intact.
        // It will be replaced once plugins finish activating and
        // pluginStateVersion triggers a re-run of this effect.
        return
      }

      try {
        const def = (await plugin.execute({
          capability: 'theme:override',
          params: {},
          context: {
            pair: '',
            market: '',
            timeframe: '',
            mode: 'paper',
            country: '',
          },
        })) as ThemeDefinition

        if (cancelled) return

        applyTheme(def)
        setChartOverrides({
          dark: def.chart ?? null,
          light: def.chartLight ?? null,
        })
      } catch {
        if (!cancelled) {
          applyTheme(null)
          setChartOverrides(null)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [activeThemeId, pluginManager, pluginStateVersion])

  const selectTheme = useCallback(
    (id: string | null) => {
      setActiveThemeId(id)
    },
    [setActiveThemeId],
  )

  return {
    activeThemeId,
    availableThemes,
    activeChartOverrides: chartOverrides,
    selectTheme,
  }
}
