// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'
import { ArrowLeftRight, Globe, MapPin } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Button } from '@pairlens/ui/components/ui/button'
import { track } from '@/lib/analytics-events'

import { useGeoRestrictionStore } from '@/stores/geo-restriction-store'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { getCountryLabel, getCountrySetting } from '@/lib/region-settings'
import { switchActiveMarket } from '@/lib/switch-market'

/**
 * App-level dialog shown when the currently selected connector is unavailable
 * for the user's region. Detection lives in use-candle-stream (proactive static
 * blocks + reactive 451/403 probes) and reports into useGeoRestrictionStore;
 * this dialog only renders the result and offers recovery actions.
 *
 * It is gated on the *active* connector (`terminal.market`) so switching away
 * dismisses it automatically, and acts as a cache when switching back.
 */
export function GeoRestrictionDialog() {
  const restriction = useGeoRestrictionStore((s) => s.restriction)
  const clear = useGeoRestrictionStore((s) => s.clear)
  const { markets, defaultMarket } = useAvailableMarkets()
  const [activeMarket] = usePersistedState<string>(
    'terminal.market',
    defaultMarket,
  )

  const open = !!restriction && restriction.market === activeMarket
  const blockedMarket = restriction?.market
  useEffect(() => {
    if (open && blockedMarket) {
      track('geo_restriction_shown', { venue: blockedMarket })
    }
  }, [open, blockedMarket])
  if (!open || !restriction) return null

  const region = getCountrySetting()
  const regionLabel = getCountryLabel(region)

  // Suggest the first available connector other than the blocked one.
  const alternative = markets.find((m) => m.value !== restriction.market)

  const handleChangeRegion = () => {
    clear()
    useSettingsDialogStore.getState().open('region')
  }

  const handleSwitch = () => {
    if (!alternative) return
    switchActiveMarket(alternative.value)
    // The market gate will hide the dialog once terminal.market updates, but
    // clear proactively so it can't flicker on a stale frame.
    clear()
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && clear()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Globe className="h-5 w-5" />
          </div>
          <DialogTitle>{restriction.exchange} isn’t available here</DialogTitle>
          <DialogDescription>
            {restriction.exchange} doesn’t serve market data for your region, so
            this connector can’t load data. Switch to another connector, or
            update your region if it’s set incorrectly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Your region:</span>
          <span className="font-medium">{regionLabel ?? 'Not set'}</span>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleChangeRegion}>
            <MapPin className="h-4 w-4" />
            Change region
          </Button>
          {alternative && (
            <Button onClick={handleSwitch}>
              <ArrowLeftRight className="h-4 w-4" />
              Switch to {alternative.label}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
