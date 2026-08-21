// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The pieces every NFT Discovery pane draws the same way.
 *
 * Six panes read one provider through one capability, so they fail in exactly
 * the same four ways and there is no reason for six renderings of that. The
 * important one is the fourth. Every NFT hook reports `unsupported`,
 * `throttled`, `error` and `isLoading` separately, and collapsing them into
 * "nothing here" is the bug this codebase files most: a rate limit reaching a
 * pane as an empty list makes a fact about our request budget read as a fact
 * about the chain. `nftPanePhase` names which of the five states a pane is in,
 * once, and every pane branches on the name rather than re-deriving it.
 *
 * The thumbnail is the other shared piece. Collection artwork is a remote URL
 * from a marketplace CDN: it can be absent, it can 404, and it must never take
 * the row's layout with it. So the fallback is the asset class's own glyph at
 * the same box size, and a URL that fails once is remembered so the broken
 * image does not re-request on every re-render.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Gem } from 'lucide-react'
import { cn } from '@pairlens/ui'
import type { LucideIcon } from 'lucide-react'

import type { NftChain, NftMarketplace } from '@pairlens/shared/nft-types'

import type { NftQueryState } from '@/hooks/use-nft-market'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { Shimmer } from '@/components/panes/pane-skeletons'
import { assetClassVisual } from '@/lib/asset-class/visuals'
import { formatNftChange, formatNftPrice } from '@/lib/nft/format'

/** The class's fixed hue, icon and tints. Every NFT pane spends these. */
export const NFT_VISUAL = assetClassVisual('nft')

/**
 * The glyph a cell holds when there is no number.
 *
 * Borrowed from the formatter rather than typed out again, so the panes and
 * `format.ts` can never end up writing "nothing" two different ways.
 */
export const NFT_NO_VALUE = formatNftPrice(null)

/**
 * Literal keys, not a template.
 *
 * The i18n audit can only verify a `t()` call whose key is a literal, and a
 * chain rail built from `nft.chains.${chain}` is exactly where a missing
 * translation hides for a release.
 */
const CHAIN_LABEL_KEYS: Record<NftChain, string> = {
  ethereum: 'nft.chains.ethereum',
  solana: 'nft.chains.solana',
  base: 'nft.chains.base',
  polygon: 'nft.chains.polygon',
  arbitrum: 'nft.chains.arbitrum',
  optimism: 'nft.chains.optimism',
}

export function nftChainLabelKey(chain: NftChain): string {
  return CHAIN_LABEL_KEYS[chain]
}

const MARKETPLACE_LABEL_KEYS: Record<NftMarketplace, string> = {
  opensea: 'nft.marketplaces.opensea',
  blur: 'nft.marketplaces.blur',
  magiceden: 'nft.marketplaces.magiceden',
  looksrare: 'nft.marketplaces.looksrare',
  x2y2: 'nft.marketplaces.x2y2',
  tensor: 'nft.marketplaces.tensor',
  unknown: 'nft.marketplaces.unknown',
}

export function nftMarketplaceLabelKey(marketplace: NftMarketplace): string {
  return MARKETPLACE_LABEL_KEYS[marketplace] ?? MARKETPLACE_LABEL_KEYS.unknown
}

/**
 * Which nothing a pane is showing, or that it is showing something.
 *
 * `ready` wins over every failure: a provider that threw on the last refresh
 * while the previous rows are still on screen is a banner over live data, not
 * an empty pane.
 */
export type NftPanePhase =
  | 'unsupported'
  | 'loading'
  | 'failed'
  | 'empty'
  | 'ready'

export function nftPanePhase(
  status: NftQueryState,
  hasRows: boolean,
): NftPanePhase {
  if (status.unsupported) return 'unsupported'
  if (hasRows) return 'ready'
  if (status.isLoading) return 'loading'
  if (status.error) return 'failed'
  return 'empty'
}

/**
 * The three states that have nothing to draw, each said in its own words.
 *
 * A throttle writes its own sentence and it is a readable one, so it is passed
 * through verbatim. Everything else arrives as plumbing ("All candidates for
 * capability 'market-data:nft' failed"), which is a fine thing to find in a
 * console and a bad thing to put in front of someone looking for a floor.
 */
export function NftPaneFallback({
  phase,
  status,
  icon,
  emptyTitle,
  emptyBody,
}: {
  phase: NftPanePhase
  status: NftQueryState
  icon: LucideIcon
  emptyTitle: string
  emptyBody: string
}) {
  const { t } = useTranslation()

  if (phase === 'unsupported') {
    return (
      <PaneEmpty
        action={
          <Link
            className="mt-3 text-xs text-primary hover:underline"
            to="/plugins"
          >
            {t('nft.browseProviders')}
          </Link>
        }
        body={t('nft.noProviderBody')}
        icon={icon}
        title={t('nft.noProviderTitle')}
      />
    )
  }

  if (phase === 'failed') {
    return (
      <PaneEmpty
        body={
          status.throttled && status.error
            ? status.error
            : t('nft.unavailableBody')
        }
        icon={icon}
        title={
          status.throttled ? t('nft.throttledTitle') : t('nft.unavailableTitle')
        }
      />
    )
  }

  return <PaneEmpty body={emptyBody} icon={icon} title={emptyTitle} />
}

/** What went wrong, above the rows that did arrive. Never instead of them. */
export function NftErrorBanner({
  phase,
  status,
}: {
  phase: NftPanePhase
  status: NftQueryState
}) {
  const { t } = useTranslation()
  if (phase !== 'ready' || !status.error) return null
  return (
    <div className="pt-1.5">
      <PaneErrorBanner
        message={status.throttled ? status.error : t('nft.unavailableBody')}
        venue={t('nft.providerLabel')}
      />
    </div>
  )
}

/**
 * Collection artwork, or the class glyph where there is none.
 *
 * Never an `<img>` that can collapse: the box is sized by the caller and the
 * fallback fills the same box, so a marketplace CDN having a bad afternoon
 * cannot shift a column of fifty rows sideways.
 */
export function NftThumbnail({
  imageUrl,
  className,
}: {
  imageUrl?: string
  className?: string
}) {
  // The URL that failed, not a boolean: a recycled row pointed at a different
  // collection has to get its own attempt rather than inherit a neighbour's.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  if (!imageUrl || failedUrl === imageUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-[5px]',
          NFT_VISUAL.bg,
          NFT_VISUAL.text,
          className,
        )}
      >
        <Gem className="size-1/2" />
      </span>
    )
  }

  return (
    <img
      alt=""
      className={cn(
        'size-6 shrink-0 rounded-[5px] bg-muted object-cover',
        className,
      )}
      loading="lazy"
      onError={() => setFailedUrl(imageUrl)}
      src={imageUrl}
    />
  )
}

/**
 * A fraction as an unsigned percentage: a SHARE, not a move.
 *
 * `formatNftChange` already owns the rounding every NFT surface uses, and a
 * second percent formatter beside it is how two panes end up disagreeing about
 * 3.45%. So the sign is dropped rather than the arithmetic redone: a share of
 * the day's volume is never up or down.
 */
export function formatNftShare(fraction: number | null | undefined): string {
  const text = formatNftChange(fraction)
  return text === null ? NFT_NO_VALUE : text.replace('+', '')
}

/**
 * A table's own rows with the values taken out.
 *
 * Inside the real `<tbody>`, so the ghosts sit on the real column widths and
 * nothing moves sideways when the provider answers.
 */
export function NftSkeletonRows({
  rows = 8,
  columns,
  thumb = false,
}: {
  rows?: number
  /** Total columns, the label column included. */
  columns: number
  thumb?: boolean
}) {
  return (
    <>
      {Array.from({ length: rows }, (_row, index) => (
        <tr key={index}>
          <td className="py-1.5 pr-3">
            <span className="flex items-center gap-2">
              {thumb ? (
                <Shimmer
                  className="size-6 shrink-0 rounded-[5px]"
                  delayIndex={index}
                />
              ) : null}
              <Shimmer
                className="h-3"
                delayIndex={index}
                style={{ width: LABEL_WIDTHS[index % LABEL_WIDTHS.length] }}
              />
            </span>
          </td>
          {Array.from({ length: Math.max(0, columns - 1) }, (_col, cell) => (
            <td className="py-1.5 pr-3 last:pr-0" key={cell}>
              <Shimmer className="ml-auto h-3 w-12" delayIndex={index} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** A list of rows with the values taken out, for the panes that are not tables. */
export function NftSkeletonList({
  rows = 6,
  thumb = true,
}: {
  rows?: number
  thumb?: boolean
}) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, index) => (
        <div className="flex items-center gap-2 py-1.5" key={index}>
          {thumb ? (
            <Shimmer
              className="size-6 shrink-0 rounded-[5px]"
              delayIndex={index}
            />
          ) : null}
          <Shimmer
            className="h-3"
            delayIndex={index}
            style={{ width: LABEL_WIDTHS[index % LABEL_WIDTHS.length] }}
          />
          <Shimmer className="ml-auto h-3 w-12 shrink-0" delayIndex={index} />
        </div>
      ))}
    </div>
  )
}

/**
 * Widths that keep a column of ghosts from reading as a bar chart. Fixed
 * rather than random: a skeleton that reshuffles every render is a second
 * animation competing with the sweep.
 */
const LABEL_WIDTHS = ['72%', '54%', '84%', '61%', '76%', '48%', '68%', '58%']

/** The venue a print filled on, as a chip small enough to sit in a row. */
export function NftMarketplaceBadge({
  marketplace,
}: {
  marketplace: NftMarketplace
}) {
  const { t } = useTranslation()
  return (
    <span className="rounded-[4px] bg-muted/60 px-1 py-px text-[9.5px] font-medium uppercase tracking-[.06em] text-muted-foreground">
      {t(nftMarketplaceLabelKey(marketplace))}
    </span>
  )
}

/** A proportional bar. Same geometry as the on-chain rail's, one hue less. */
export function NftShareBar({
  fraction,
  tone = 'accent',
}: {
  fraction: number
  tone?: 'accent' | 'muted'
}) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, Math.max(0, fraction * 100))}%`,
          background:
            tone === 'accent' ? 'var(--asset-nft)' : 'var(--muted-foreground)',
        }}
      />
    </div>
  )
}

/**
 * A signed 24h move, coloured, or a dash where the provider published none.
 *
 * The distinction matters enough to be one component: a collection whose floor
 * did not move and one whose move nobody reported are different facts, and
 * "0.0%" claims the first when only the second is known.
 */
export function NftChangeCell({
  fraction,
  text,
  className,
}: {
  fraction: number | undefined
  /** Already formatted by `formatNftChange`, or null when there is nothing. */
  text: string | null
  className?: string
}) {
  return (
    <span
      className={cn(
        'tabular-nums',
        text === null
          ? 'text-muted-foreground'
          : (fraction ?? 0) >= 0
            ? 'text-up'
            : 'text-down',
        className,
      )}
    >
      {text ?? NFT_NO_VALUE}
    </span>
  )
}
