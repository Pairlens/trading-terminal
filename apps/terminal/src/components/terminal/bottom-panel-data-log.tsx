// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { PluginCandle } from '@/hooks/use-candle-stream'
import { formatBookPrice } from '@/lib/format-price'

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
  const recentCandles = candles.slice(-20).reverse()

  return (
    <div className="flex h-full gap-3 overflow-hidden">
      {/* Summary cards */}
      <div className="hidden @xs/pane:flex w-32 @sm/pane:w-48 shrink-0 flex-col gap-2 border-r pr-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          Latest
        </p>
        {latestCandle && (
          <>
            <p
              className={`text-lg font-semibold font-mono ${
                latestCandle.close >= latestCandle.open
                  ? 'text-emerald-500'
                  : 'text-red-400'
              }`}
            >
              {formatBookPrice(latestCandle.close)}
            </p>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Open</span>
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
          <p className="text-sm text-muted-foreground">Waiting for data...</p>
        )}
      </div>

      {/* Recent candles tape */}
      <div className="min-w-0 flex-1 overflow-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="pb-1 pr-3 text-left font-medium">Time</th>
              <th className="pb-1 pr-3 text-right font-medium">Open</th>
              <th className="pb-1 pr-3 text-right font-medium">High</th>
              <th className="pb-1 pr-3 text-right font-medium">Low</th>
              <th className="pb-1 pr-3 text-right font-medium">Close</th>
              <th className="pb-1 text-right font-medium">Volume</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {recentCandles.map((candle) => {
              const isUp = candle.close >= candle.open
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
                      isUp ? 'text-emerald-500' : 'text-red-400'
                    }`}
                  >
                    {formatBookPrice(candle.close)}
                  </td>
                  <td className="py-0.5 text-right">
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
                  No candle data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
