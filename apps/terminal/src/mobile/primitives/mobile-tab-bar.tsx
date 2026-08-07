// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Five destinations, Chart in the middle where the thumb lands.
 *
 * Order is fixed: Watchlist · Trade · Chart · Co-pilot · Discover. The active
 * item expands into a labelled pill; the rest are icon-only and share the
 * remaining width. Lucide throughout — no custom glyphs live here.
 *
 * `memo`, and it must show zero re-renders while a ticker streams: it reads
 * only its props, and its props come from MobileNavContext.
 */
import { memo } from 'react'
import {
  ArrowRightLeft,
  CandlestickChart,
  Compass,
  Sparkles,
  Star,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import type { LucideIcon } from 'lucide-react'
import type { MobileTab } from '../mobile-focus-context'

export type MobileTabBarProps = {
  active: MobileTab
  onChange: (tab: MobileTab) => void
  /** 'float' over a bare chart, 'solid' when a sheet is docked above. */
  variant?: 'float' | 'solid'
}

const TABS: Array<{
  id: MobileTab
  icon: LucideIcon
  labelKey: string
  ai?: boolean
}> = [
  { id: 'watchlist', icon: Star, labelKey: 'mobile.shell.tabs.watchlist' },
  { id: 'trade', icon: ArrowRightLeft, labelKey: 'mobile.shell.tabs.trade' },
  { id: 'chart', icon: CandlestickChart, labelKey: 'mobile.shell.tabs.chart' },
  {
    id: 'copilot',
    icon: Sparkles,
    labelKey: 'mobile.shell.tabs.copilot',
    ai: true,
  },
  { id: 'discover', icon: Compass, labelKey: 'mobile.shell.tabs.discover' },
]

export const MobileTabBar = memo(function MobileTabBar({
  active,
  onChange,
  variant = 'float',
}: MobileTabBarProps) {
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t('mobile.shell.tabs.label')}
      className={cn(
        'absolute inset-x-0 bottom-0 z-50 flex items-stretch gap-0.5 px-2 pt-2',
        variant === 'float' ? 'pl-tabbar-float' : 'pl-tabbar-solid',
      )}
      style={{ paddingBottom: 'max(var(--pl-safe-bottom), 30px)' }}
    >
      {TABS.map((tab) => {
        const on = tab.id === active
        const Icon = tab.icon
        return (
          <button
            aria-current={on ? 'page' : undefined}
            className={cn(
              'flex min-h-[46px] items-center justify-center gap-[7px] rounded-[99px]',
              on
                ? 'flex-none bg-white/[0.11] px-[15px] text-foreground'
                : 'flex-1 text-muted-foreground',
            )}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            type="button"
          >
            <Icon
              className={cn(
                'size-[22px]',
                // The AI destination keeps the magic gradient's hue even as an
                // outline glyph — a filled disc among outlines reads as
                // "selected", which is the one thing it must not say.
                tab.ai && (on ? 'text-magic-1' : 'text-magic-1/60'),
              )}
              strokeWidth={on ? 2 : 1.7}
            />
            {on ? (
              <span className="whitespace-nowrap text-[13px] font-semibold leading-none">
                {t(tab.labelKey)}
              </span>
            ) : (
              <span className="sr-only">{t(tab.labelKey)}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
})
