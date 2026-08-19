// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ComponentType } from 'react'

import type { ContributedStatusBarItem } from '@pairlens/plugin-system'
import { usePairlens } from '@/lib/pairlens-provider'
import { getPaneIcon } from '@/lib/layout/pane-icons'
import { localizedText } from '@/lib/plugin-text'

type ResolvedStatusBarItem = {
  pluginId: string
  item: ContributedStatusBarItem
  component: unknown // React component or null
}

export function StatusBar() {
  const { pluginManager, pluginStateVersion } = usePairlens()

  const items = useMemo(() => {
    const left: Array<ResolvedStatusBarItem> = []
    const right: Array<ResolvedStatusBarItem> = []

    for (const plugin of pluginManager.getActivePlugins()) {
      for (const item of plugin.manifest.contributes?.statusBarItems ?? []) {
        const resolved: ResolvedStatusBarItem = {
          pluginId: plugin.manifest.id,
          item,
          component: plugin.getStatusBarComponent?.(item.id) ?? null,
        }
        if (item.alignment === 'left') left.push(resolved)
        else right.push(resolved)
      }
    }

    // Sort by priority (lower = closer to edge)
    left.sort((a, b) => (a.item.priority ?? 50) - (b.item.priority ?? 50))
    right.sort((a, b) => (a.item.priority ?? 50) - (b.item.priority ?? 50))

    return { left, right }
    // pluginStateVersion is the re-run trigger; pluginManager reads are non-reactive
  }, [pluginManager, pluginStateVersion])

  // Don't render the bar if no plugins contribute status bar items
  if (items.left.length === 0 && items.right.length === 0) return null

  return (
    <div className="flex h-6 shrink-0 items-center justify-between px-3 text-[10px] text-muted-foreground">
      <div className="flex items-center gap-3">
        {items.left.map((r) => (
          <StatusBarItemView key={`${r.pluginId}:${r.item.id}`} resolved={r} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        {items.right.map((r) => (
          <StatusBarItemView key={`${r.pluginId}:${r.item.id}`} resolved={r} />
        ))}
      </div>
    </div>
  )
}

function StatusBarItemView({ resolved }: { resolved: ResolvedStatusBarItem }) {
  const { t } = useTranslation()
  const { item, component: CustomComponent } = resolved

  // If the plugin provides a valid custom component, render it
  if (CustomComponent && typeof CustomComponent === 'function') {
    const Component = CustomComponent as ComponentType
    return <Component />
  }

  // Default: render label with optional icon
  const Icon = item.icon ? getPaneIcon(item.icon) : null
  const label = item.labelKey ? t(item.labelKey) : localizedText(item.label)
  const tooltip = item.tooltipKey
    ? t(item.tooltipKey)
    : localizedText(item.tooltip)

  return (
    <span className="flex items-center gap-1" title={tooltip}>
      {Icon && <Icon className="size-3" />}
      {label}
    </span>
  )
}
