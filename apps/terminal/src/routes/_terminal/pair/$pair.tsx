// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The old chart route, kept as a one-way door to the new one.
 *
 * `/pair/BTC-USDT` named an instrument but not a tape, so it could not say
 * which venue's price it meant. It is now resolved once, here, and replaced
 * with the canonical `/{class}/{venue}/{id}`. Bookmarks, shared links, the
 * docs, and anything a user pasted into a note keep working, and they land on
 * an address that reproduces what the sender saw.
 *
 * `replace` rather than a push: the legacy URL should not sit in the back
 * stack waiting to redirect again on the way out.
 */
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Loader2, Unplug } from 'lucide-react'

import { marketRefToPath } from '@pairlens/shared/market-ref'

import type { LegacyAssetClassMap } from '@/lib/market-ref/legacy'
import { PAGE_FRAME } from '@/components/chrome/page-chrome'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useMarketData } from '@/lib/market-data-provider'
import { useMarketRefResolver } from '@/lib/market-ref/use-market-ref'
import { legacySymbolToInstrumentRef } from '@/lib/market-ref/legacy'

export const Route = createFileRoute('/_terminal/pair/$pair')({
  component: LegacyPairRedirect,
})

function LegacyPairRedirect() {
  const { t } = useTranslation()
  const { pair } = Route.useParams()
  const navigate = useNavigate()
  const { pluginsReady } = useMarketData()
  const resolve = useMarketRefResolver()
  // The same symbol → class side table every pair picker wrote. It is what
  // makes this redirect mostly lossless: a link the user themselves saved was
  // usually reached through a picker, so the class was recorded at the time.
  const [assetClassMap] = usePersistedState<LegacyAssetClassMap>(
    'pair-picker.assetClassMap',
    {},
  )

  const resolution = pluginsReady
    ? resolve(legacySymbolToInstrumentRef(pair, assetClassMap))
    : null

  useEffect(() => {
    if (!resolution?.ok) return
    void navigate({ to: marketRefToPath(resolution.ref), replace: true })
  }, [resolution, navigate])

  if (!resolution?.ok) {
    // Still booting, or genuinely nothing serves it. Both look the same for a
    // beat; only the second one persists.
    return (
      <main className={PAGE_FRAME}>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          {resolution ? (
            <>
              <Unplug className="size-10 opacity-40" />
              <p className="text-sm font-medium">
                {t('routes.unresolvedPair.title')}
              </p>
              <p className="max-w-xs text-center text-xs opacity-70">
                {t('routes.unresolvedPair.description', { pair })}
              </p>
            </>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
          )}
        </div>
      </main>
    )
  }

  return (
    <main className={PAGE_FRAME}>
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground/60" />
      </div>
    </main>
  )
}
