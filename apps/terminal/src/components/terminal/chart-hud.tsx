// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import type { ChartHudPayload } from 'fast-financial-charts/types'

const fmt = (value: number, digits = 2) =>
  value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, 4),
  })

const fmtVol = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 2 })

type ChartHudProps = {
  hud: ChartHudPayload
}

export function ChartHud({ hud }: ChartHudProps) {
  if (!hud.hoveredBar) return null

  const { open, high, low, close, volume } = hud.hoveredBar
  const isUp = close >= open

  return (
    <div className="flex items-center gap-3 rounded-md border bg-card/90 px-2.5 py-1 text-xs font-mono shadow-sm backdrop-blur-sm">
      <span>
        <span className="text-muted-foreground mr-1">O</span>
        {fmt(open)}
      </span>
      <span>
        <span className="text-muted-foreground mr-1">H</span>
        {fmt(high)}
      </span>
      <span>
        <span className="text-muted-foreground mr-1">L</span>
        {fmt(low)}
      </span>
      <span className={isUp ? 'text-emerald-500' : 'text-red-400'}>
        <span className="text-muted-foreground mr-1">C</span>
        {fmt(close)}
      </span>
      <span>
        <span className="text-muted-foreground mr-1">V</span>
        {fmtVol(volume)}
      </span>
    </div>
  )
}
