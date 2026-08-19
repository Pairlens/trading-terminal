// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ChevronRight, Search, X } from 'lucide-react'

import { cn } from '@pairlens/ui'

import './store.css'

/** Shared-element morph timing (poster card → product-page visual). */
export const POSTER_MORPH = {
  layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
}

/**
 * The store's search field, wearing the top bar's chip.
 *
 * Both storefronts put their search on the page header, and both used to put a
 * bordered 210px `Input` there, the widest and loudest thing on a bar where
 * every other control is a borderless `--card` chip at 10px (see
 * `components/chrome/header-chrome.ts`). This is that chip with room to type
 * in: same height, same radius, same fill, same focus ring, and the magnifier
 * and the clear button sit inside it rather than beside it.
 *
 * A bare `input` rather than the `Input` primitive on purpose: the primitive's
 * look is carried by `dark:` variants, which survive a merge and would repaint
 * the field in the mode most of the terminal runs in.
 */
export function StoreSearchChip({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  clearLabel: string
}) {
  // `flex` rather than a bare block: an inline input leaves descender space
  // under it, which pushed the chip an eighth of a pixel below its neighbours.
  return (
    <div className="relative flex items-center">
      <Search className="pointer-events-none absolute left-[9px] top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-[26px] w-[196px] rounded-[10px] border-0 bg-card pl-[29px] pr-[26px] text-xs text-foreground shadow-none outline-hidden transition-colors placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-[7px] top-1/2 -translate-y-1/2 rounded-[5px] p-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={clearLabel}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  )
}

/**
 * Two blurred aurora blobs behind storefront content — primary blue top-left,
 * violet top-right. Decorative only; sits behind everything and never
 * intercepts pointer events.
 */
export function StoreAurora({
  glow,
  className,
}: {
  /** Optional per-item glow color for the first blob (product pages). */
  glow?: string
  className?: string
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        className,
      )}
    >
      <div
        className="pl-store-aurora absolute -left-[10%] -top-[12%] h-[55%] w-[46%] rounded-full opacity-35 blur-[100px]"
        style={{
          background: `radial-gradient(circle at 50% 50%, ${
            glow ?? 'color-mix(in oklch, var(--primary) 60%, transparent)'
          }, transparent 68%)`,
          animation: 'pl-store-aurora1 19s ease-in-out infinite',
        }}
      />
      <div
        className="pl-store-aurora absolute -top-[8%] right-[2%] h-[50%] w-[42%] rounded-full opacity-30 blur-[100px]"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, oklch(60% .2 320 / .5), transparent 68%)',
          animation: 'pl-store-aurora2 26s ease-in-out infinite',
        }}
      />
    </div>
  )
}

/** Mono uppercase section eyebrow — the storefront's signature label style. */
export function SectionEyebrow({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * A topic shelf: mono heading row (label + faint sub-label + optional
 * "Show all ›") over a horizontally scrolling track with a hidden scrollbar.
 */
export function StoreShelf({
  label,
  subLabel,
  onShowAll,
  showAllLabel = 'Show all',
  children,
  className,
}: {
  label: string
  subLabel?: string
  onShowAll?: () => void
  showAllLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('mt-[34px] first:mt-0', className)}>
      <div className="mb-[15px] flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2.5">
          <SectionEyebrow>{label}</SectionEyebrow>
          {subLabel && (
            <span className="text-[11px] text-muted-foreground/60">
              {subLabel}
            </span>
          )}
        </div>
        {onShowAll && (
          <button
            type="button"
            onClick={onShowAll}
            className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            {showAllLabel}
            <ChevronRight className="size-3.5" />
          </button>
        )}
      </div>
      <div className="pl-store-track -mx-1 flex gap-4 overflow-x-auto px-1 pb-2 pt-1.5">
        {children}
      </div>
    </section>
  )
}
