// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { Bell, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { Switch } from '@pairlens/ui/components/ui/switch'

import type { PluginManifest } from '@pairlens/plugin-system'
import type { ThemeDefinition } from '@pairlens/plugins/themes'
import { usePairlens } from '@/lib/pairlens-provider'

/**
 * Fixed candle series for the chart mock — stable so every theme is compared
 * on the same shape. Values are [open, high, low, close] in viewBox units.
 */
const CANDLES: Array<[number, number, number, number]> = [
  [62, 70, 55, 66],
  [66, 74, 62, 71],
  [71, 73, 58, 61],
  [61, 66, 52, 56],
  [56, 68, 54, 65],
  [65, 78, 63, 75],
  [75, 80, 68, 71],
  [71, 76, 60, 63],
  [63, 72, 61, 70],
  [70, 84, 68, 81],
  [81, 88, 76, 79],
  [79, 90, 77, 87],
]

/** Scoped mini candlestick chart drawn from the theme's chart overrides. */
function CandleChartMock({ chart }: { chart: ThemeDefinition['chart'] }) {
  const width = 300
  const height = 120
  const step = width / CANDLES.length
  const y = (v: number) => height - (v - 45) * (height / 50)
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      aria-hidden
      style={{ background: chart?.background ?? 'var(--card)' }}
    >
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={0}
          x2={width}
          y1={height * f}
          y2={height * f}
          stroke={chart?.grid ?? 'var(--border)'}
          strokeWidth={1}
        />
      ))}
      {CANDLES.map(([open, high, low, close], i) => {
        const up = close >= open
        const color = up
          ? (chart?.upCandle ?? 'var(--chart-2)')
          : (chart?.downCandle ?? 'var(--destructive)')
        const cx = i * step + step / 2
        const bodyTop = y(Math.max(open, close))
        const bodyHeight = Math.max(2, Math.abs(y(open) - y(close)))
        return (
          <g key={i}>
            <line
              x1={cx}
              x2={cx}
              y1={y(high)}
              y2={y(low)}
              stroke={color}
              strokeWidth={1.2}
            />
            <rect
              x={cx - step * 0.28}
              width={step * 0.56}
              y={bodyTop}
              height={bodyHeight}
              fill={color}
              rx={1}
            />
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Live theme preview — real design-system components rendered inside a
 * wrapper that scopes the theme's actual CSS variables, with a light/dark
 * switcher. Faithful by construction: the DS reads the same tokens the theme
 * overrides, so what you see is what applying the theme produces.
 */
export function ThemePreview({ manifest }: { manifest: PluginManifest }) {
  const { t } = useTranslation()
  const { pluginManager } = usePairlens()
  const { resolvedTheme } = useTheme()
  const [mode, setMode] = useState<'light' | 'dark'>(
    resolvedTheme === 'light' ? 'light' : 'dark',
  )
  const [def, setDef] = useState<ThemeDefinition | null>(null)

  useEffect(() => {
    let cancelled = false
    const plugin = pluginManager
      .getInstalledPlugins()
      .find((p) => p.manifest.id === manifest.id)
    if (!plugin) return
    void plugin
      .execute({
        capability: 'theme:override',
        params: {},
        context: {
          pair: '',
          market: '',
          timeframe: '',
          mode: 'paper',
          country: '',
        },
      })
      .then((result) => {
        if (!cancelled) setDef(result as ThemeDefinition)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [manifest.id, pluginManager])

  if (!def) return null

  const vars = def[mode]

  return (
    <div>
      {/* Mode switcher */}
      <div className="mb-3 inline-flex rounded-lg border border-border/70 p-0.5">
        {(
          [
            ['light', Sun, t('pluginStore.lightMode', 'Light')],
            ['dark', Moon, t('pluginStore.darkMode', 'Dark')],
          ] as const
        ).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              mode === value
                ? 'bg-muted text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Scoped theme sandbox — the theme's variables applied inline */}
      <div
        style={{
          ...(vars as React.CSSProperties),
          background: 'var(--background)',
          color: 'var(--foreground)',
        }}
        className="overflow-hidden rounded-[14px] border border-border/70"
      >
        <div className="flex max-md:flex-col">
          {/* Mini sidebar rail */}
          <div
            aria-hidden
            className="flex w-10 shrink-0 flex-col items-center gap-2.5 py-3 max-md:hidden"
            style={{
              background: 'var(--sidebar)',
              color: 'var(--sidebar-foreground)',
            }}
          >
            <span
              className="size-4 rounded-[5px]"
              style={{ background: 'var(--sidebar-primary)' }}
            />
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-4 rounded-[5px] opacity-40"
                style={{ background: 'var(--sidebar-accent)' }}
              />
            ))}
          </div>

          {/* Mock terminal slice */}
          <div className="min-w-0 flex-1 space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">BTC-USDT</span>
              <Badge variant="secondary" className="text-[10px]">
                {t('pluginStore.themePreview.spot', 'Spot')}
              </Badge>
              <span
                className="font-mono text-sm tabular-nums"
                style={{ color: def.chart?.upCandle ?? 'var(--chart-2)' }}
              >
                67,412.50 +2.4%
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Bell className="size-3.5 text-muted-foreground" />
                <Switch defaultChecked aria-label="Alerts" />
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-border/70">
              <CandleChartMock chart={def.chart} />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder={t('pluginStore.themePreview.amount', 'Amount')}
                className="h-8 w-32 text-xs"
                readOnly
              />
              <Button size="sm">
                {t('pluginStore.themePreview.buy', 'Buy')}
              </Button>
              <Button size="sm" variant="outline">
                {t('pluginStore.themePreview.sell', 'Sell')}
              </Button>
              <Button size="sm" variant="destructive" className="ml-auto">
                {t('pluginStore.themePreview.close', 'Close position')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
