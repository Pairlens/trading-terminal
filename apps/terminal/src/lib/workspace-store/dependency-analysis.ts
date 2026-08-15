// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { PluginManifest, PluginStatus } from '@pairlens/plugin-system'

import type { TerminalLayout } from '@/lib/layout/types'
import type { WorkspaceTemplate } from './types'
import { paneTypeKey } from '@/lib/layout/pane-registry'
import { localizedText } from '@/lib/plugin-text'
import {
  BOOTSTRAP_PLUGINS,
  BOOTSTRAP_PLUGIN_IDS,
} from '@/lib/plugins/bootstrap-bundle'
import {
  getPluginTrust,
  pluginRequiresFullTrust,
} from '@/lib/plugins/plugin-ledger'

// ── Static plugin index ─────────────────────────────────────────────
//
// Built once from the bundled plugins so a template's dependencies resolve
// even when the owning plugin isn't installed (e.g. a bootstrap plugin the
// user uninstalled, or a connector that ships disabled). It IMPORTS the
// pane-type keying rule from DynamicPaneRegistry rather than restating it —
// the two had drifted apart once already, and a mismatch here shows up as a
// template pane with no owner rather than as an error.

export type PaneMeta = {
  type: string
  label: string
  icon: string // lucide icon name
  pluginId: string
}

const STATIC_MANIFESTS = new Map<string, PluginManifest>()
const STATIC_PANE_OWNER = new Map<string, string>() // pane type key → pluginId
const STATIC_PANE_META = new Map<string, PaneMeta>()

for (const { manifest } of BOOTSTRAP_PLUGINS) {
  STATIC_MANIFESTS.set(manifest.id, manifest)
  for (const panel of manifest.contributes?.panels ?? []) {
    const type = paneTypeKey(manifest.id, panel.id)
    STATIC_PANE_OWNER.set(type, manifest.id)
    STATIC_PANE_META.set(type, {
      type,
      // Module-load time, so this freezes at the launch language; the
      // pane picker resolves its own label per render.
      label: localizedText(panel.label) ?? panel.id,
      icon: panel.icon,
      pluginId: manifest.id,
    })
  }
}

/** Static metadata (label, icon, owner) for a template pane type, if known. */
export function paneMeta(type: string): PaneMeta | null {
  return STATIC_PANE_META.get(type) ?? null
}

// ── Report shapes ───────────────────────────────────────────────────

export type RequiredPluginStatus =
  | 'active' // installed and running — ready
  | 'disabled' // installed but not active — can be enabled
  | 'missing-bundled' // not installed, but ships with Pairlens (re-installable locally)
  | 'missing-remote' // not installed, must be fetched from the Plugin Store
  | 'unknown' // referenced but no manifest could be resolved

export type RequiredPlugin = {
  pluginId: string
  name: string
  status: RequiredPluginStatus
  /** Contributes UI → runs in the main realm with full access to the app. */
  requiresFullTrust: boolean
  /** Already trusted: bundled with Pairlens, or the user granted full trust. */
  trusted: boolean
  /** Ships with Pairlens (first-party / bundled). */
  bootstrap: boolean
  reason?: string
  /** Template pane types this plugin provides (for display). */
  panes: Array<string>
}

export type TemplateReadiness = 'ready' | 'needs-enable' | 'needs-install'

export type TemplateDependencyReport = {
  plugins: Array<RequiredPlugin>
  readiness: TemplateReadiness
  /** Full-access plugins that are NOT yet trusted — the security gate. */
  untrustedFullTrust: Array<RequiredPlugin>
  missingCount: number
  disabledCount: number
}

// ── Analysis ────────────────────────────────────────────────────────

/** Every distinct pane type used anywhere in a layout. Tolerates malformed data
 * (untrusted third-party store layouts) rather than throwing during render. */
export function collectPaneTypes(layout: TerminalLayout): Array<string> {
  const types = new Set<string>()
  for (const col of layout.columns ?? []) {
    for (const cell of col.cells ?? []) {
      for (const pane of cell.panes ?? []) {
        if (pane?.type) types.add(pane.type)
      }
    }
  }
  return [...types]
}

type InstalledPlugin = { manifest: PluginManifest; status: PluginStatus }

/**
 * Resolve a template's plugin dependencies against the current install state.
 *
 * `resolvePaneOwner` (optional) lets the caller consult the live pane registry
 * first — useful when third-party plugins have registered panes. It falls back
 * to the static bundle index, which also covers not-yet-installed plugins.
 */
export function analyzeTemplateDependencies(
  template: WorkspaceTemplate,
  installed: ReadonlyArray<InstalledPlugin>,
  resolvePaneOwner?: (paneType: string) => string | null,
): TemplateDependencyReport {
  const installedById = new Map(installed.map((p) => [p.manifest.id, p]))

  // pluginId → the template pane types it serves
  const panesByPlugin = new Map<string, Array<string>>()
  for (const paneType of collectPaneTypes(template.layout)) {
    const owner =
      resolvePaneOwner?.(paneType) ?? STATIC_PANE_OWNER.get(paneType) ?? null
    if (!owner) continue
    const list = panesByPlugin.get(owner) ?? []
    list.push(paneType)
    panesByPlugin.set(owner, list)
  }

  // Union of panel-owning plugins and explicitly declared requirements.
  const requiredIds = new Set<string>([
    ...panesByPlugin.keys(),
    ...(template.requiredPlugins ?? []).map((r) => r.pluginId),
  ])
  const reasonById = new Map(
    (template.requiredPlugins ?? []).map((r) => [r.pluginId, r.reason]),
  )

  const plugins: Array<RequiredPlugin> = [...requiredIds].map((pluginId) => {
    const instance = installedById.get(pluginId)
    const manifest =
      instance?.manifest ?? STATIC_MANIFESTS.get(pluginId) ?? null
    const bootstrap = BOOTSTRAP_PLUGIN_IDS.has(pluginId)

    let status: RequiredPluginStatus
    if (instance) {
      status = instance.status === 'active' ? 'active' : 'disabled'
    } else if (bootstrap) {
      // Bundled with Pairlens — re-installable locally whether or not the user
      // previously tombstoned it.
      status = 'missing-bundled'
    } else {
      status = manifest ? 'missing-remote' : 'unknown'
    }

    const requiresFullTrust = manifest
      ? pluginRequiresFullTrust(manifest)
      : false
    const trusted = bootstrap || getPluginTrust(pluginId) === 'full'

    return {
      pluginId,
      name: manifest?.name ?? pluginId,
      status,
      requiresFullTrust,
      trusted,
      bootstrap,
      reason: reasonById.get(pluginId),
      panes: panesByPlugin.get(pluginId) ?? [],
    }
  })

  // Stable, meaningful order: unmet first, then by name.
  const severity: Record<RequiredPluginStatus, number> = {
    'missing-remote': 0,
    unknown: 0,
    'missing-bundled': 1,
    disabled: 2,
    active: 3,
  }
  plugins.sort(
    (a, b) =>
      severity[a.status] - severity[b.status] || a.name.localeCompare(b.name),
  )

  const isMissing = (s: RequiredPluginStatus) =>
    s === 'missing-bundled' || s === 'missing-remote' || s === 'unknown'
  const missingCount = plugins.filter((p) => isMissing(p.status)).length
  const disabledCount = plugins.filter((p) => p.status === 'disabled').length

  const readiness: TemplateReadiness =
    missingCount > 0
      ? 'needs-install'
      : disabledCount > 0
        ? 'needs-enable'
        : 'ready'

  const untrustedFullTrust = plugins.filter(
    (p) => p.requiresFullTrust && !p.trusted,
  )

  return {
    plugins,
    readiness,
    untrustedFullTrust,
    missingCount,
    disabledCount,
  }
}
