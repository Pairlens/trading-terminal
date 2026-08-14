// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Five destinations, Chart in the middle where the thumb lands.
 *
 * Order is fixed: Watchlist · Trade · Chart · Co-pilot · Discover. The active
 * item expands into a labelled pill; the rest are icon-only and share the
 * remaining width. Lucide throughout — no custom glyphs live here.
 *
 * The active pill SLIDES. It is a single absolutely-positioned element rather
 * than a background on each button, tracked to the live geometry of the
 * active item for the length of the transition. Tracking beats interpolating
 * between two measured rectangles because the item is also growing at the
 * same time — the label reveals from `0fr` to `1fr` and flexbox redistributes
 * the slack every frame — and a pill that animates to a rectangle measured
 * before that growth arrives lands somewhere the button never was. Reading
 * the rect each frame costs one layout on a five-button bar, only while a tab
 * change is in flight, and it is exact in every locale.
 *
 * `active` may be null: while an overlay that belongs to no tab covers the
 * app (Settings, the pair picker) the bar points at nothing and dims, rather
 * than claiming the user is still on the tab they left. The order book is the
 * exception the design asks for and it is expressed in lib/overlay-tabs.ts,
 * not here.
 *
 * `memo`, and it must show zero re-renders while a ticker streams: it reads
 * only its props, and its props come from MobileNavContext.
 */
import { memo, useCallback, useLayoutEffect, useRef } from 'react'
import {
  ArrowRightLeft,
  CandlestickChart,
  Compass,
  Sparkles,
  Star,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { PRESS } from './press'
import type { LucideIcon } from 'lucide-react'
import type { MobileTab } from '../mobile-focus-context'
import { haptic } from '@/lib/haptics'

export type MobileTabBarProps = {
  /** The lit destination, or null while an overlay owns the screen. */
  active: MobileTab | null
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

/** The label reveal (260ms) plus a frame of slack. */
const TRACK_MS = 320

export const MobileTabBar = memo(function MobileTabBar({
  active,
  onChange,
  variant = 'float',
}: MobileTabBarProps) {
  const { t } = useTranslation()
  const navRef = useRef<HTMLElement | null>(null)
  const pillRef = useRef<HTMLDivElement | null>(null)
  const itemsRef = useRef(new Map<MobileTab, HTMLButtonElement>())

  const registerItem = useCallback(
    (id: MobileTab) => (node: HTMLButtonElement | null) => {
      if (node) itemsRef.current.set(id, node)
      else itemsRef.current.delete(id)
    },
    [],
  )

  useLayoutEffect(() => {
    const nav = navRef.current
    const pill = pillRef.current
    if (!nav || !pill) return

    if (active === null) {
      pill.style.opacity = '0'
      return
    }

    let frame = 0
    let deadline = 0

    const paint = (now: number) => {
      const item = itemsRef.current.get(active)
      if (item) {
        const bar = nav.getBoundingClientRect()
        const box = item.getBoundingClientRect()
        pill.style.width = `${box.width}px`
        pill.style.height = `${box.height}px`
        pill.style.transform = `translate3d(${box.left - bar.left}px, ${
          box.top - bar.top
        }px, 0)`
        pill.style.opacity = '1'
      }
      frame = now < deadline ? requestAnimationFrame(paint) : 0
    }

    const start = () => {
      deadline = performance.now() + TRACK_MS
      if (!frame) frame = requestAnimationFrame(paint)
    }

    start()
    // A width change the transition never caused — an orientation flip, a
    // language switch, the keyboard resizing the viewport — still has to move
    // the pill, and neither of those runs this effect.
    const observer = new ResizeObserver(start)
    observer.observe(nav)

    return () => {
      observer.disconnect()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [active])

  return (
    <nav
      aria-label={t('mobile.shell.tabs.label')}
      className={cn(
        'absolute inset-x-0 bottom-0 z-50 flex items-stretch gap-0.5 px-2 pt-2',
        variant === 'float' ? 'pl-tabbar-float' : 'pl-tabbar-solid',
      )}
      ref={navRef}
      // The same reserve `--pl-tabbar-total` is built from, so the chart floor
      // and the bar cannot drift apart.
      style={{ paddingBottom: 'var(--pl-bottom-inset)' }}
    >
      <div aria-hidden className="pl-tab-pill" ref={pillRef} />
      {TABS.map((tab) => {
        const on = tab.id === active
        const Icon = tab.icon
        return (
          <button
            aria-current={on ? 'page' : undefined}
            className={cn(
              'pl-tab-item relative flex min-h-[46px] flex-auto items-center justify-center rounded-[99px] px-[15px]',
              on ? 'text-foreground' : 'text-muted-foreground',
              // Nothing is lit: the bar steps back rather than pointing at a
              // destination the user is no longer looking at.
              active === null && 'opacity-45',
            )}
            key={tab.id}
            onClick={() => {
              // Only a real move earns a tick. Tapping the tab you are already
              // on is a no-op the shell deliberately swallows, and a phone that
              // buzzes for nothing teaches the user to stop trusting it.
              if (tab.id !== active) haptic('selection')
              onChange(tab.id)
            }}
            ref={registerItem(tab.id)}
            type="button"
            // Paint only, straight onto the node: the bar is `memo` for the
            // reason in the header comment and a press must not cost it a
            // render. The fill is `.pl-tab-item`'s own pressed rule, which
            // deliberately does NOT scale — the pill tracks this button's live
            // rect and a transform here would drag it off the tab.
            {...PRESS}
          >
            <Icon
              className={cn(
                'size-[22px] shrink-0',
                // The AI destination keeps the magic gradient's hue even as an
                // outline glyph — a filled disc among outlines reads as
                // "selected", which is the one thing it must not say.
                tab.ai && (on ? 'text-magic-1' : 'text-magic-1/60'),
              )}
              strokeWidth={on ? 2 : 1.7}
            />
            {/* aria-hidden: the 0fr grid clips this label visually but not
                from name-from-content, so without it the active tab's name
                reads twice. The sr-only span below is the single name source
                for every tab, active or not. */}
            <span
              aria-hidden
              className="pl-tab-label"
              data-on={on ? 'true' : undefined}
            >
              <span className="overflow-hidden">
                <span className="block whitespace-nowrap pl-[7px] text-[13px] font-semibold leading-none">
                  {t(tab.labelKey)}
                </span>
              </span>
            </span>
            <span className="sr-only">{t(tab.labelKey)}</span>
          </button>
        )
      })}
    </nav>
  )
})
