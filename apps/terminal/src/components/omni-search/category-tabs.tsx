// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'

import type { OmniSearchCategory } from './omni-search-types'

const CATEGORIES: Array<{ id: OmniSearchCategory; labelKey: string }> = [
  { id: 'all', labelKey: 'search.categories.all' },
  { id: 'pairs', labelKey: 'search.categories.pairs' },
  { id: 'pages', labelKey: 'search.categories.pages' },
  { id: 'workspaces', labelKey: 'search.categories.workspaces' },
  { id: 'workflows', labelKey: 'search.categories.workflows' },
  { id: 'notifications', labelKey: 'search.categories.notifications' },
  { id: 'panes', labelKey: 'search.categories.panes' },
  { id: 'plugins', labelKey: 'search.categories.plugins' },
  { id: 'actions', labelKey: 'search.categories.actions' },
]

type CategoryTabsProps = {
  active: OmniSearchCategory
  onChange: (category: OmniSearchCategory) => void
  counts: Record<OmniSearchCategory, number>
  /** True while a query prefix (>, #, @) scopes the search — tabs are inert. */
  locked?: boolean
  /** True while the server-side pair search is in flight. */
  isLoading?: boolean
}

export function CategoryTabs({
  active,
  onChange,
  counts,
  locked = false,
  isLoading = false,
}: CategoryTabsProps) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-2 pb-1 pt-1.5">
      {CATEGORIES.map((cat) => {
        const count = cat.id === 'all' ? 0 : (counts[cat.id] ?? 0)
        const isActive = active === cat.id
        // Hide empty categories (except 'all') when there are no results;
        // when locked, only the scoped category stays visible.
        if (cat.id !== 'all' && count === 0) return null
        if (locked && !isActive) return null
        return (
          <button
            key={cat.id}
            type="button"
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors duration-[var(--dur-fast)]',
              isActive
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground',
            )}
            onClick={() => {
              if (!locked) onChange(cat.id)
            }}
          >
            {t(cat.labelKey)}
            {cat.id !== 'all' && count > 0 && (
              <span
                className={cn(
                  'font-mono text-[10px] tabular-nums',
                  isActive
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/60',
                )}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
      {isLoading && (
        <Loader2 className="ml-auto mr-1 size-3 shrink-0 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
