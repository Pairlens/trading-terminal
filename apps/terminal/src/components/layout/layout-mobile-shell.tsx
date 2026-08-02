// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'

import { LayoutPaneRenderer } from './layout-pane-renderer'
import { useWorkspace } from '@/lib/layout/workspace-context'
import { usePaneRegistry } from '@/lib/layout/pane-registry'

export function LayoutMobileShell() {
  const { t } = useTranslation()
  const { mobileTabs } = useWorkspace()
  const registry = usePaneRegistry()
  const paneDefinitions = registry.getDefinitions()
  const tabs = mobileTabs ?? []

  const [activeTab, setActiveTab] = useState<string>(
    tabs[0]?.type ?? Object.keys(paneDefinitions)[0] ?? '',
  )
  const [showMore, setShowMore] = useState(false)

  // Pane types not in the primary tab bar
  const morePanes = Object.keys(paneDefinitions).filter(
    (type) => !tabs.some((tab) => tab.type === type),
  )
  const isMoreActive = morePanes.includes(activeTab)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Active pane */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <LayoutPaneRenderer type={activeTab} paneId={`mobile-${activeTab}`} />
      </div>

      {/* Bottom tab bar */}
      <nav className="flex shrink-0 border-t bg-background">
        {tabs.map((tab) => (
          <button
            key={tab.type}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground transition-colors',
              activeTab === tab.type && 'text-foreground',
            )}
            onClick={() => {
              setActiveTab(tab.type)
              setShowMore(false)
            }}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </button>
        ))}
        {morePanes.length > 0 && (
          <button
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground transition-colors',
              isMoreActive && 'text-foreground',
            )}
            onClick={() => setShowMore((v) => !v)}
          >
            <MoreHorizontal className="size-4" />
            More
          </button>
        )}
      </nav>

      {/* More menu overlay */}
      {showMore && (
        <div className="absolute inset-x-0 bottom-[52px] z-50 border-t bg-background p-3 shadow-lg">
          <div className="grid grid-cols-3 gap-2">
            {morePanes.map((type) => (
              <button
                key={type}
                className={cn(
                  'rounded-md border p-3 text-center text-xs',
                  activeTab === type
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'text-muted-foreground',
                )}
                onClick={() => {
                  setActiveTab(type)
                  setShowMore(false)
                }}
              >
                {paneDefinitions[type]
                  ? t(paneDefinitions[type].labelKey)
                  : type}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
