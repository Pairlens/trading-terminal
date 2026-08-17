// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The ticker as a business, as far as the installed connectors can prove it.
 *
 * A broker quotes and fills; it does not publish a P/E, a float or a revenue
 * trend, and no bundled plugin serves fundamentals. So this pane draws the
 * identity it CAN stand behind (the listing: ticker, company name, market
 * identifier code, venue) and then states plainly that the valuation and
 * growth figures need a provider.
 *
 * The alternative was the thing the design brief calls out by name: a grid of
 * eight labelled cells full of dashes, which reads as a pane that is still
 * loading and never stops. `lib/equities/company-types.ts` is the shape a
 * fundamentals plugin fills to turn this into the real grid.
 */
import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePanePair } from '@pairlens/plugin-sdk'
import { Badge } from '@pairlens/ui/components/ui/badge'

import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { PaneEmpty } from '@/components/panes/pane-primitives'
import { useMarketInstruments } from '@/hooks/use-market-instruments'
import { useSymbolLogo } from '@/hooks/use-symbol-logo'
import { equityTickerOf } from '@/hooks/use-equity-positions'
import { usePaneVenue } from '@/hooks/use-pane-venue'
import { useOptionalChartConfig } from '@/lib/chart-terminal-context'

export function CompanyPane() {
  const activePair = usePanePair()
  if (!activePair) return <PanePairPicker />
  return <CompanyPaneInner pairKey={activePair.pairKey} />
}

function CompanyPaneInner({ pairKey }: { pairKey: string }) {
  const { t } = useTranslation()
  const ticker = equityTickerOf(pairKey)
  const market = useOptionalChartConfig()?.market ?? ''
  const venue = usePaneVenue(market)
  const logoUrl = useSymbolLogo(ticker, 'stocks')

  // The instruments index is the only identity source that is not a quote:
  // the discovery snapshot carries the company name and, where the venue
  // published one, the listing MIC.
  const { items } = useMarketInstruments({
    assetClass: 'stocks',
    symbols: ticker,
  })
  const instrument = items.find(
    (inst) => inst.kind === 'equity' && inst.symbol === ticker,
  )
  const mic = instrument?.kind === 'equity' ? instrument.mic : undefined

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-border px-3 py-2.5">
        {logoUrl ? (
          <img alt="" className="size-7 shrink-0 rounded-full" src={logoUrl} />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <Building2 className="size-3.5 text-muted-foreground/70" />
          </span>
        )}
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold">
            {ticker}
            {mic && (
              <Badge className="font-mono text-[10px]" variant="outline">
                {mic}
              </Badge>
            )}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {instrument?.name ?? t('company.unknownName')}
            {venue.label && ` · ${venue.label}`}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <PaneEmpty
          body={t('company.needsProviderBody')}
          icon={Building2}
          title={t('company.needsProviderTitle')}
        />
      </div>
    </div>
  )
}
