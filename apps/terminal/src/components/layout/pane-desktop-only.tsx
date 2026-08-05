// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useState } from 'react'
import { MonitorDown } from 'lucide-react'

import { Button } from '@pairlens/ui/components/ui/button'
import { DesktopDownloadDialog } from '@/components/feedback/desktop-download-dialog'
import { useAvailableMarkets } from '@/hooks/use-available-markets'

/**
 * Shown when the active connector cannot work in a browser build at all
 * (`useCandleStream().desktopOnly`, from a connector's PlatformRestrictedError).
 *
 * Coinbase, Gate, KuCoin and MEXC serve their public REST without an
 * `Access-Control-Allow-Origin` header and stream no usable candle history, so
 * a browser tab has no way to reach them — KuCoin cannot even open a socket,
 * since its WS URL comes from a REST POST that is itself blocked. Desktop
 * fetches from Rust and is unaffected.
 *
 * This is deliberately NOT the `PaneDataUnavailable` "no data for this pair"
 * message: the pair is fine, the platform is the constraint, and the honest
 * recovery is either another connector or the desktop app. Saying so beats a
 * chart that hangs and then renders a single live candle.
 */
export function PaneDesktopOnly({
  market,
  onSelectMarket,
}: {
  market: string
  onSelectMarket: (market: string) => void
}) {
  const [downloadOpen, setDownloadOpen] = useState(false)
  const { markets } = useAvailableMarkets()
  const current = markets.find((m) => m.value === market)
  // Only offer venues that actually work here, or the CTA just moves the wall.
  const alternatives = markets
    .filter((m) => m.value !== market && !m.requiresDesktop)
    .slice(0, 4)

  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-xs text-center">
        <MonitorDown className="mx-auto mb-3 size-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">
          {current?.label ?? market} needs the desktop app
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          This exchange doesn’t allow browsers to read its market data directly.
          The desktop app connects to it natively.
        </p>

        <Button
          size="sm"
          className="mt-4 h-7 gap-1.5 px-3 text-xs"
          onClick={() => setDownloadOpen(true)}
        >
          <MonitorDown className="size-3.5" />
          Get the desktop app
        </Button>

        {alternatives.length > 0 && (
          <>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Or use a connector that works here
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {alternatives.map((m) => (
                <Button
                  key={m.value}
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs"
                  onClick={() => onSelectMarket(m.value)}
                >
                  {m.iconUrl && (
                    <img
                      src={m.iconUrl}
                      alt=""
                      className="size-3.5 rounded-full"
                    />
                  )}
                  {m.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      <DesktopDownloadDialog
        open={downloadOpen}
        onOpenChange={setDownloadOpen}
      />
    </div>
  )
}
