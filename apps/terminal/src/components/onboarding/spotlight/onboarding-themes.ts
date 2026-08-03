// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Theme picking on the onboarding route.
 *
 * The terminal shell applies `theme:override` plugins through
 * `useThemePlugin` (mounted by `_terminal`'s ThemePluginBridge), but the
 * onboarding route deliberately lives outside that shell — no PairlensProvider,
 * no plugin manager, no connectors. So the step reads the bundled theme
 * plugins directly (they are pure, side-effect-free variable maps), applies
 * the winning definition through the shell's own `applyTheme`, and persists
 * the choice under the exact key `useThemePlugin` reads on first launch
 * (`pairlens:theme.activePluginId`). Nothing here is a parallel mechanism:
 * the terminal picks the selection up unchanged once onboarding finishes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  PluginInstance,
  PluginManifest,
} from '@pairlens/plugin-system/types'
import type * as themeExports from '@pairlens/plugins/themes'
import type { ThemeDefinition } from '@pairlens/plugins/themes'
import { applyTheme } from '@/hooks/use-theme-plugin'
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'
import { emitWrite } from '@/lib/sync/sync-channel'

/** The same persisted key `useThemePlugin` uses (via usePersistedState). */
const ACTIVE_THEME_KEY = 'theme.activePluginId'

export type OnboardingThemeOption = {
  id: string
  name: string
  swatches: { light: Array<string>; dark: Array<string> }
  definition: ThemeDefinition
}

type ThemesModule = typeof themeExports
type ThemeFactory = (manifest: PluginManifest) => PluginInstance

/**
 * The bundled `theme:override` plugins, mirroring BOOTSTRAP_THEME_PLUGINS.
 * Listed here rather than imported from the bootstrap bundle because that
 * module pulls in every market connector — far too much for a first-run
 * page that only needs seventeen maps of CSS variables.
 */
function bundledEntries(
  m: ThemesModule,
): Array<[PluginManifest, ThemeFactory]> {
  return [
    [m.pairlensThemeManifest, m.createPairlensThemePlugin],
    [m.zenTradingManifest, m.createZenTradingPlugin],
    [m.cyberpunkNeonManifest, m.createCyberpunkNeonPlugin],
    [m.earthTonesManifest, m.createEarthTonesPlugin],
    [m.terminalClassicManifest, m.createTerminalClassicPlugin],
    [m.cryptoGoldManifest, m.createCryptoGoldPlugin],
    [m.arcticBlueManifest, m.createArcticBluePlugin],
    [m.infraredManifest, m.createInfraredPlugin],
    [m.emeraldMatrixManifest, m.createEmeraldMatrixPlugin],
    [m.royalVioletManifest, m.createRoyalVioletPlugin],
    [m.midnightEmberManifest, m.createMidnightEmberPlugin],
    [m.sakuraBloomManifest, m.createSakuraBloomPlugin],
    [m.electricLimeManifest, m.createElectricLimePlugin],
    [m.burntOrangeManifest, m.createBurntOrangePlugin],
    [m.nightCityManifest, m.createNightCityPlugin],
    [m.eyeComfortManifest, m.createEyeComfortPlugin],
    [m.highContrastManifest, m.createHighContrastPlugin],
  ]
}

/** Theme plugins ignore the context; they resolve to a static definition. */
const EXECUTE_CONTEXT = {
  pair: '',
  market: '',
  timeframe: '',
  mode: 'paper',
  country: '',
} as const

async function loadBundledThemes(): Promise<Array<OnboardingThemeOption>> {
  const themes = await import('@pairlens/plugins/themes')
  const out: Array<OnboardingThemeOption> = []
  for (const [manifest, factory] of bundledEntries(themes)) {
    try {
      const definition = (await factory(manifest).execute({
        capability: 'theme:override',
        params: {},
        context: EXECUTE_CONTEXT,
      })) as ThemeDefinition
      out.push({
        id: manifest.id,
        name: manifest.name,
        swatches: manifest.theme?.previewColors ?? { light: [], dark: [] },
        definition,
      })
    } catch {
      // A theme that fails to resolve simply isn't offered.
    }
  }
  return out
}

function readActiveThemeId(): string | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${ACTIVE_THEME_KEY}`)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return null
  }
}

function writeActiveThemeId(id: string | null): void {
  try {
    localStorage.setItem(
      `${STORAGE_PREFIX}${ACTIVE_THEME_KEY}`,
      JSON.stringify(id),
    )
  } catch {
    // Ignore storage errors (quota, private browsing).
  }
  // Same broadcast usePersistedState emits, so a terminal window already open
  // in this browser/desktop session repaints with the new theme too.
  emitWrite(ACTIVE_THEME_KEY, id)
}

export type OnboardingThemesState = {
  themes: Array<OnboardingThemeOption>
  activeThemeId: string | null
  selectTheme: (id: string | null) => void
}

/**
 * Loads the bundled themes once the theme step is reached (the import is a
 * separate chunk — the welcome frame never pays for it) and applies the
 * user's pick live.
 */
export function useOnboardingThemes(enabled: boolean): OnboardingThemesState {
  const [themes, setThemes] = useState<Array<OnboardingThemeOption>>([])
  const [activeThemeId, setActiveThemeId] = useState<string | null>(() =>
    readActiveThemeId(),
  )
  const requested = useRef(false)

  useEffect(() => {
    if (!enabled || requested.current) return
    requested.current = true
    let cancelled = false
    void loadBundledThemes()
      .then((list) => {
        if (!cancelled) setThemes(list)
      })
      .catch(() => {
        requested.current = false
      })
    return () => {
      cancelled = true
    }
  }, [enabled])

  const selectTheme = useCallback(
    (id: string | null) => {
      const definition = id
        ? (themes.find((theme) => theme.id === id)?.definition ?? null)
        : null
      if (id && !definition) return
      setActiveThemeId(id)
      applyTheme(definition)
      writeActiveThemeId(id)
    },
    [themes],
  )

  return { themes, activeThemeId, selectTheme }
}
