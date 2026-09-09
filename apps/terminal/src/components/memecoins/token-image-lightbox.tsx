// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The picture, at a size it can be judged at.
 *
 * A memecoin is bought on its image before anything else, and a 32px chip is
 * a promise the trader wants to check. The row's mark and the box here share
 * one `layoutId`, so opening grows the mark out of its row into the 280px
 * image and closing shrinks it back into place: the picture never appears
 * from nowhere, it comes from the row that owns it, which is how the eye
 * keeps track of which of thirty rows it just opened. The lightbox also
 * carries the address and the links, the two other things a trader checks
 * before a buy, and the way into the chart.
 *
 * Hand-rolled rather than the shared Dialog because the morph needs the box
 * to be a motion element inside an `AnimatePresence`, with nothing between
 * it and the row's mark that animates its own position: a parent sliding in
 * would drag the morph off course. What a dialog owes is kept: a modal role,
 * a label, Escape, a backdrop that closes, focus on the close control and
 * focus back on the mark afterwards.
 */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'motion/react'
import { AtSign, Globe, Send, X } from 'lucide-react'
import { Button } from '@pairlens/ui/components/ui/button'
import type { RefObject } from 'react'
import type {
  LaunchpadStage,
  LaunchpadToken,
} from '@pairlens/shared/instrument-types'
import type { chartLinkProps } from '@/lib/market-ref/link'
import {
  SocialLink,
  TokenMark,
} from '@/components/memecoins/memecoin-pane-primitives'

/**
 * The morph's timing: the Plugin Store's poster morph, restated here rather
 * than imported, because the store shell drags the whole storefront into the
 * memecoin column's chunk and the two must not share a module graph.
 */
export const MARK_MORPH = {
  layout: { duration: 0.34, ease: [0.22, 1, 0.36, 1] as const },
}

/**
 * The shared-element id for one token in one column. Column-scoped because
 * the same mint can sit in two columns at once (New and Graduating disagree
 * about a token for a minute), and two elements with one id would confuse
 * the morph about which row to return to.
 */
export function tokenMarkLayoutId(
  stage: LaunchpadStage,
  token: Pick<LaunchpadToken, 'chain' | 'address'>,
): string {
  return `meme-mark-${stage}-${token.chain}-${token.address}`
}

const FADE = { duration: 0.2 }

export function TokenImageLightbox({
  open,
  onClose,
  token,
  layoutId,
  returnFocusTo,
  chartLink,
  onOpenChart,
}: {
  open: boolean
  onClose: () => void
  token: LaunchpadToken
  /** The row mark's id, or undefined under reduced motion (no morph). */
  layoutId: string | undefined
  /** The mark that opened the box, which gets focus back when it closes. */
  returnFocusTo: RefObject<HTMLElement | null>
  chartLink: ReturnType<typeof chartLinkProps> | null
  onOpenChart: () => void
}) {
  const { t } = useTranslation()

  // Escape closes, and focus goes back to the mark that opened the box: a
  // keyboard user who pressed Enter on a row is returned to that row.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    const opener = returnFocusTo.current
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus({ preventScroll: true })
    }
  }, [open, onClose, returnFocusTo])

  if (typeof document === 'undefined') return null

  const titleId = `meme-lightbox-${token.chain}-${token.address}`

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          key="lightbox"
          className="fixed inset-0 z-50 grid place-items-center p-4"
          onClick={onClose}
        >
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
          />
          {/* The box fades in place. No slide: the mark is morphing into
              it, and a parent that moves takes the morph's target with it. */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full max-w-sm rounded-2xl border border-border/40 bg-card p-4 shadow-2xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={FADE}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2
                  id={titleId}
                  className="flex items-center gap-2 text-base font-semibold leading-tight"
                >
                  <span className="truncate">{token.symbol}</span>
                  {token.launchpad ? (
                    <span className="shrink-0 rounded-md bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">
                      {token.launchpad}
                    </span>
                  ) : null}
                </h2>
                {token.name && token.name !== token.symbol ? (
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">
                    {token.name}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                autoFocus
                onClick={onClose}
                aria-label={t('memecoins.row.closeImage')}
                className="-mr-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {/* The same mark as the row, at 280px, sharing the row's id. It
                paints the token's gradient under the image and falls back to
                it if the host refuses a second fetch, so the box never opens
                on a broken-image glyph. */}
            <motion.div
              layoutId={layoutId}
              transition={MARK_MORPH}
              style={{ borderRadius: 16 }}
              // The cursor pairs with the row's zoom-in: the picture is the
              // control that opened the box, so it is the one that closes it.
              className="mx-auto mt-4 size-[280px] max-w-full cursor-zoom-out overflow-hidden"
              onClick={onClose}
            >
              <TokenMark
                iconUrl={token.iconUrl}
                symbol={token.symbol}
                address={token.address}
                className="size-full rounded-none text-[72px]"
              />
            </motion.div>

            <p
              className="mt-3 break-all font-mono text-[10.5px] leading-snug text-muted-foreground"
              title={token.address}
            >
              {token.address}
            </p>

            <div className="mt-4 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1">
                {token.socials.twitter ? (
                  <SocialLink
                    href={token.socials.twitter}
                    label={t('memecoins.row.twitter')}
                    Icon={AtSign}
                    large
                  />
                ) : null}
                {token.socials.telegram ? (
                  <SocialLink
                    href={token.socials.telegram}
                    label={t('memecoins.row.telegram')}
                    Icon={Send}
                    large
                  />
                ) : null}
                {token.socials.website ? (
                  <SocialLink
                    href={token.socials.website}
                    label={t('memecoins.row.website')}
                    Icon={Globe}
                    large
                  />
                ) : null}
              </span>
              {chartLink ? (
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link {...chartLink} onClick={onOpenChart} />}
                >
                  {t('memecoins.openChart', { symbol: token.symbol })}
                </Button>
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
