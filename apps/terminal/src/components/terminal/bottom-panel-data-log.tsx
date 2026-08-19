// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'

import type { PluginCandle } from '@/hooks/use-candle-stream'
import { formatBookPrice } from '@/lib/format-price'
import {
  computeMagnitudeReference,
  magnitudeFillColor,
  magnitudeIntensity,
  magnitudeTextColor,
} from '@/components/terminal/magnitude-intensity'
import { PANE_TABLE_BODY, Th } from '@/components/panes/pane-primitives'

const formatVolume = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 })

const formatTime = (ts: number) =>
  new Date(ts).toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })

type BottomPanelDataLogProps = {
  candles: Array<PluginCandle>
  latestCandle: PluginCandle | null
}

export function BottomPanelDataLog({
  candles,
  latestCandle,
}: BottomPanelDataLogProps) {
  const { t } = useTranslation()
  const recentCandles = useMemo(() => candles.slice(-20).reverse(), [candles])

  // Volume is the one column here worth scanning for outliers, and unlike the
  // order book nothing else competes for the row's colour — so the tint is
  // scaled by volume and tinted by the candle's own direction, which says
  // whether the heavy bar was bought or sold into.
  const volumeReference = useMemo(
    () => computeMagnitudeReference(recentCandles.map((c) => c.volume)),
    [recentCandles],
  )

  return (
    <div className="flex h-full gap-5 overflow-hidden">
      {/* Summary cards */}
      <div className="hidden @xs/pane:flex w-32 @sm/pane:w-48 shrink-0 flex-col gap-2">
        <p className="text-[10px] text-muted-foreground">Latest</p>
        {latestCandle && (
          <>
            <p
              className={`text-lg font-semibold font-mono ${
                latestCandle.close >= latestCandle.open
                  ? 'text-up'
                  : 'text-down'
              }`}
            >
              {formatBookPrice(latestCandle.close)}
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {t('terminal.columns.open')}
                </span>
                <span className="font-medium font-mono">
                  {formatBookPrice(latestCandle.open)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">High</span>
                <span className="font-medium font-mono">
                  {formatBookPrice(latestCandle.high)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Low</span>
                <span className="font-medium font-mono">
                  {formatBookPrice(latestCandle.low)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vol</span>
                <span className="font-medium font-mono">
                  {formatVolume(latestCandle.volume)}
                </span>
              </div>
            </div>
          </>
        )}
        {!latestCandle && (
          <p className="text-sm text-muted-foreground">
            {t('terminal.status.waitingData')}
          </p>
        )}
      </div>

      {/* Recent candles tape */}
      <div className="min-w-0 flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr>
              <Th>Time</Th>
              <Th align="right">{t('terminal.columns.open')}</Th>
              <Th align="right">High</Th>
              <Th align="right">Low</Th>
              <Th align="right">{t('terminal.columns.close')}</Th>
              <Th align="right">Volume</Th>
            </tr>
          </thead>
          <tbody className={PANE_TABLE_BODY}>
            {recentCandles.map((candle) => {
              const isUp = candle.close >= candle.open
              const intensity = magnitudeIntensity(
                candle.volume,
                volumeReference,
              )
              return (
                <tr
                  key={candle.ts}
                  className="border-b border-transparent transition-colors hover:bg-accent/30"
                >
                  <td className="py-0.5 pr-3 text-muted-foreground">
                    {formatTime(candle.ts)}
                  </td>
                  <td className="py-0.5 pr-3 text-right">
                    {formatBookPrice(candle.open)}
                  </td>
                  <td className="py-0.5 pr-3 text-right">
                    {formatBookPrice(candle.high)}
                  </td>
                  <td className="py-0.5 pr-3 text-right">
                    {formatBookPrice(candle.low)}
                  </td>
                  <td
                    className={`py-0.5 pr-3 text-right font-medium ${
                      isUp ? 'text-up' : 'text-down'
                    }`}
                  >
                    {formatBookPrice(candle.close)}
                  </td>
                  <td
                    className="py-0.5 pl-2 text-right transition-colors duration-300 ease-out"
                    style={{
                      backgroundColor: magnitudeFillColor(
                        isUp ? 'up' : 'down',
                        intensity,
                      ),
                      color: magnitudeTextColor(intensity),
                    }}
                  >
                    {formatVolume(candle.volume)}
                  </td>
                </tr>
              )
            })}
            {recentCandles.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="py-4 text-center text-muted-foreground"
                >
                  {t('terminal.status.noCandleData')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
