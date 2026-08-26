// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Shown when the selected venue cannot be reached from a browser build.
 *
 * Coinbase, Gate, KuCoin and MEXC serve their public REST without an
 * `Access-Control-Allow-Origin` header and stream no candle history, so a
 * browser tab has no way in — KuCoin cannot even open a socket, since its WS
 * URL comes from a REST POST that is itself blocked. Desktop fetches from Rust
 * and is unaffected, which is why this is a platform statement and not a
 * "no data for this pair" one (that is `PaneDataUnavailable`).
 *
 * It replaces the WHOLE workspace rather than sitting in the chart alone: the
 * chart is not the only pane bound to the venue, and the others have no
 * equivalent branch — they would simply hold their last values and look live.
 * One honest wall beats six panes quietly going stale. See `LayoutShell`.
 *
 * Every browser-capable venue OF THE SAME ASSET CLASS is offered, not a
 * sample: the list IS the recovery, and picking for the user only hides the
 * one they wanted. Other classes are not a narrower recovery, they are the
 * same wall with a different name on it.
 *
 * When the caller names the pair, each of those venues is asked live whether it
 * carries it (`VenueAlternatives`), so the way out of one wall can't be a click
 * into the next one.
 */
import { useState } from 'react'
import { Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'

import { DesktopDownloadDialog } from '@/components/feedback/desktop-download-dialog'
import { OS_ICON } from '@/components/feedback/os-icons'
import { detectOs } from '@/lib/desktop-download'
import { VenueAlternatives } from '@/components/layout/venue-alternatives'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { alternativeVenuesFor } from '@/lib/market-ref/resolve'

export function DesktopOnlyState({
  market,
  pairKey,
  onSelectMarket,
}: {
  market: string
  /**
   * The pair on screen, when the caller knows it. With it the alternatives are
   * checked against each venue before they are offered; without it they are
   * listed as they always were, since there is no question to ask.
   */
  pairKey?: string
  onSelectMarket: (market: string) => void
}) {
  const { t } = useTranslation()
  const [downloadOpen, setDownloadOpen] = useState(false)
  const { markets } = useAvailableMarkets()

  const current = markets.find((m) => m.value === market)
  // Offer only venues that actually work here AND serve the same asset class,
  // or the CTA moves the wall instead of removing it: Kalshi behind the
  // browser wall used to offer OKX, whose answer to an event contract id is
  // the same blank screen. A venue-bound class gets no list at all, which
  // leaves the download as the one real way through.
  const alternatives = alternativeVenuesFor(current, markets)

  // The machine's own platform mark, the same three the install page uses —
  // it says WHICH build is one click away, which a generic monitor cannot.
  const os = detectOs()
  const OsIcon = os ? OS_ICON[os] : null

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6">
      <Empty className="max-w-lg">
        <EmptyHeader className="gap-3">
          <EmptyMedia variant="icon" className="size-11 rounded-xl">
            {OsIcon ? (
              <OsIcon className="size-5" />
            ) : (
              <Monitor className="size-5" />
            )}
          </EmptyMedia>
          <EmptyTitle className="text-base">
            {t('desktopCta.wall.title', {
              venue: current?.label ?? market,
            })}
          </EmptyTitle>
          <EmptyDescription className="leading-relaxed">
            {t('desktopCta.wall.description')}
          </EmptyDescription>
        </EmptyHeader>

        <Button
          size="lg"
          className="mt-4 gap-2"
          onClick={() => setDownloadOpen(true)}
        >
          {OsIcon ? <OsIcon className="size-4" /> : null}
          {t('nav.getDesktopApp')}
        </Button>

        {alternatives.length > 0 && (
          <div className="mt-8 w-full">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {t('desktopCta.wall.alternatives')}
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
            {pairKey ? (
              <VenueAlternatives
                className="mt-4"
                onSelect={onSelectMarket}
                pairKey={pairKey}
                venues={alternatives}
              />
            ) : (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {alternatives.map((m) => (
                  <Button
                    key={m.value}
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-2.5 text-xs"
                    onClick={() => onSelectMarket(m.value)}
                  >
                    {m.iconUrl && (
                      <img
                        src={m.iconUrl}
                        alt=""
                        className="size-4 rounded-full"
                      />
                    )}
                    {m.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </Empty>

      <DesktopDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
      />
    </div>
  )
}
