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
import type { ThemeDefinition } from '@pairlens/plugins/themes'

import { usePairlens } from '@/lib/pairlens-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'

const STYLE_ID = 'pairlens-theme-override'
const CSS_CACHE_KEY = 'pairlens:theme.cachedCss'

type ThemePluginInfo = {
  id: string
  name: string
  author: string
  manifest: PluginManifest
}

export type UseThemePluginReturn = {
  activeThemeId: string | null
  availableThemes: Array<ThemePluginInfo>
  activeChartOverrides: ThemeDefinition['chart'] | null
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

function injectStyleTag(vars: Record<string, string>, selector: string) {
  const entries = Object.entries(vars)
  if (entries.length === 0) return ''
  const rules = entries.map(([k, v]) => `  ${k}: ${v};`).join('\n')
  return `${selector} {\n${rules}\n}`
}

function applyTheme(theme: ThemeDefinition | null) {
  let tag = document.getElementById(STYLE_ID) as HTMLStyleElement | null

  if (!theme) {
    tag?.remove()
    try {
      localStorage.removeItem(CSS_CACHE_KEY)
    } catch {
      /* ignore */
    }
    return
  }

  if (!tag) {
    tag = document.createElement('style')
    tag.id = STYLE_ID
    document.head.appendChild(tag)
  }

  const lightCss = injectStyleTag(theme.light, ':root')
  const darkCss = injectStyleTag(theme.dark, '.dark')
  const css = `${lightCss}\n${darkCss}`
  tag.textContent = css

  // Cache for the blocking script to restore on next page load
  try {
    localStorage.setItem(CSS_CACHE_KEY, css)
  } catch {
    /* ignore */
  }
}

export function useThemePlugin(): UseThemePluginReturn {
  const { pluginManager, pluginStateVersion } = usePairlens()
  const [activeThemeId, setActiveThemeId] = usePersistedState<string | null>(
    'theme.activePluginId',
    null,
  )
  const [chartOverrides, setChartOverrides] = useState<
    ThemeDefinition['chart'] | null
  >(null)

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
        setChartOverrides(def.chart ?? null)
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
