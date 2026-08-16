// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Loading state for the master-detail sections ─────────────────────
//
// The counterpart to `lazyPageChunk`: what Workflows, Bots, Indicators and
// Notifications show while their chunk is in the air. It reuses the real
// layout constants from `./master-detail`, so the skeleton lands the list
// column and the header rule exactly where the page is about to put them and
// cannot drift when those change.
//
// It replaces a line of centred grey text. The text was honest but it painted
// nothing where the page was going to be, so the arrival read as a jump rather
// than as a fill.

import * as React from 'react'

import { Skeleton } from '@pairlens/ui/components/ui/skeleton'
import { cn } from '@pairlens/ui/lib/utils'

import {
  MASTER_DETAIL_LIST_CLASS,
  MASTER_DETAIL_LIST_HEADER_CLASS,
} from '@/components/master-detail'
import { PENDING_SHOW_AFTER_MS } from '@/lib/pending-pacing'

/**
 * Renders nothing until `delayMs` has passed, then its children.
 *
 * As a Suspense fallback this is what makes a fast chunk swap in silently:
 * React unmounts the fallback the moment the child is ready, so a page that
 * beats the threshold never paints a loading state at all. The floor on the
 * other side lives in `lazyPageChunk` — see that module for why it cannot
 * live here.
 */
export function PendingAfter({
  children,
  delayMs = PENDING_SHOW_AFTER_MS,
}: {
  children: React.ReactNode
  delayMs?: number
}) {
  const [show, setShow] = React.useState(delayMs <= 0)

  React.useEffect(() => {
    if (delayMs <= 0) return
    const id = window.setTimeout(() => setShow(true), delayMs)
    return () => window.clearTimeout(id)
  }, [delayMs])

  return show ? <>{children}</> : null
}

/** Pulse the placeholder, unless the user has asked us not to move things. */
const BAR = 'motion-reduce:animate-none'

/**
 * Fixed widths rather than random ones: a skeleton that reshuffles on every
 * render is a second animation nobody asked for.
 */
const LIST_ROW_WIDTHS = [
  'w-[78%]',
  'w-[62%]',
  'w-[85%]',
  'w-[54%]',
  'w-[71%]',
  'w-[66%]',
  'w-[80%]',
] as const

/** What fills the right-hand side, which is the only part that differs. */
export type MasterDetailBody = 'canvas' | 'detail' | 'editor'

export function MasterDetailSkeleton({
  label,
  body,
}: {
  /** Announced to screen readers. The visual skeleton says nothing. */
  label: string
  body: MasterDetailBody
}) {
  return (
    <div
      className="flex h-full min-h-0"
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      <div className={MASTER_DETAIL_LIST_CLASS}>
        <div className={MASTER_DETAIL_LIST_HEADER_CLASS}>
          <Skeleton className={cn('h-3 w-20', BAR)} />
          <Skeleton className={cn('size-5 rounded-md', BAR)} />
        </div>
        <div className="flex flex-col gap-1 p-1.5">
          {LIST_ROW_WIDTHS.map((width) => (
            <div
              key={width}
              className="flex h-7 items-center gap-2 rounded-md px-2"
            >
              <Skeleton className={cn('size-3.5 shrink-0 rounded-sm', BAR)} />
              <Skeleton className={cn('h-2.5', width, BAR)} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        {body === 'canvas' ? <CanvasBody /> : null}
        {body === 'detail' ? <DetailBody /> : null}
        {body === 'editor' ? <EditorBody /> : null}
      </div>
    </div>
  )
}

/**
 * Workflows and Notifications open onto a node canvas. No header rule on this
 * side: the canvas runs to the top of the pane.
 */
function CanvasBody() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-5">
        <CanvasNode />
        <Skeleton className={cn('h-8 w-0.5', BAR)} />
        <CanvasNode />
      </div>
    </div>
  )
}

/** One step on the canvas: outlined like the real node, so it reads as one. */
function CanvasNode() {
  return (
    <div className="flex w-44 flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Skeleton className={cn('size-4 shrink-0 rounded-sm', BAR)} />
        <Skeleton className={cn('h-2.5 w-20', BAR)} />
      </div>
      <Skeleton className={cn('h-2 w-28', BAR)} />
    </div>
  )
}

/** Bots: an identity header, a strip of stats, then the equity chart. */
function DetailBody() {
  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Skeleton className={cn('size-4 rounded-sm', BAR)} />
        <Skeleton className={cn('h-3 w-36', BAR)} />
        <Skeleton className={cn('ml-auto h-5 w-16 rounded-full', BAR)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-lg border border-border p-3"
            >
              <Skeleton className={cn('h-2.5 w-14', BAR)} />
              <Skeleton className={cn('h-4 w-20', BAR)} />
            </div>
          ))}
        </div>
        <Skeleton className={cn('min-h-0 flex-1 rounded-lg', BAR)} />
      </div>
    </>
  )
}

/** Indicators: the file tabs, then the code pane. */
function EditorBody() {
  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Skeleton className={cn('size-4 rounded-sm', BAR)} />
        <Skeleton className={cn('h-3 w-28', BAR)} />
        <Skeleton className={cn('ml-auto h-5 w-24 rounded-md', BAR)} />
      </div>
      {/* Capped rather than fluid: run the lines to the full width of a wide
          pane and they stop reading as code and start reading as prose. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="flex w-full max-w-2xl flex-col gap-2">
          {CODE_LINE_WIDTHS.map((width, i) => (
            <Skeleton key={i} className={cn('h-2.5', width, BAR)} />
          ))}
        </div>
      </div>
    </>
  )
}

/** Indented the way a short Python indicator is, so it reads as code. */
const CODE_LINE_WIDTHS = [
  'w-[42%]',
  'w-[64%]',
  'w-[28%]',
  'w-[55%]',
  'w-[71%]',
  'w-[38%]',
  'w-[60%]',
  'w-[33%]',
] as const
