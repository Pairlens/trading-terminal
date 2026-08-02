// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useRef, useState } from 'react'

import { FastFinancialChart } from 'fast-financial-charts/react'
import type {
  BuiltInIndicatorType,
  ChartBar,
  ChartType,
  DrawingToolType,
  FastFinancialChartRef,
  IndicatorInstanceInput,
  Timeframe,
} from 'fast-financial-charts/types'

// Generate realistic-looking mock OHLCV data
function generateMockBars(count: number): Array<ChartBar> {
  const bars: Array<ChartBar> = []
  const now = Date.now()
  const intervalMs = 5 * 60 * 1000 // 5m candles
  let price = 42000 + Math.random() * 3000

  for (let i = 0; i < count; i++) {
    const volatility = 50 + Math.random() * 150
    const direction = Math.random() > 0.48 ? 1 : -1
    const move = direction * volatility

    const open = price
    const close = open + move
    const high = Math.max(open, close) + Math.random() * volatility * 0.5
    const low = Math.min(open, close) - Math.random() * volatility * 0.5
    const volume = 10 + Math.random() * 200

    bars.push({
      ts: now - (count - i) * intervalMs,
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume: Math.round(volume * 100) / 100,
    })

    price = close
  }

  return bars
}

const CHART_TYPES: Array<ChartType> = [
  'candles',
  'heikinAshi',
  'line',
  'area',
  'bar',
  'baseline',
  'histogram',
]
const DRAWING_TOOLS: Array<DrawingToolType> = [
  'select',
  'line',
  'rectangle',
  'circle',
  'hline',
  'vline',
  'text',
]

export const Route = createFileRoute('/chart-test')({
  // Mock-data chart playground — dev-only, hidden from production builds.
  beforeLoad: () => {
    if (import.meta.env.PROD) throw notFound()
  },
  component: ChartTestPage,
})

function ChartTestPage() {
  const chartRef = useRef<FastFinancialChartRef>(null)
  const [bars] = useState(() => generateMockBars(300))
  const [chartType, setChartType] = useState<ChartType>('candles')
  const [activeTool, setActiveTool] = useState<DrawingToolType | null>(null)
  const [indicators, setIndicators] = useState<Array<IndicatorInstanceInput>>(
    [],
  )
  const timeframe: Timeframe = '5m'

  const toggleIndicator = (type: BuiltInIndicatorType) => {
    setIndicators((prev) => {
      const exists = prev.find((i) => i.type === type)
      if (exists) {
        return prev.filter((i) => i.type !== type)
      }
      const input: IndicatorInstanceInput = {
        type,
        seriesId: 'BTC-MOCK',
        params:
          type === 'RSI' ? { period: 14 } : { fast: 12, slow: 26, signal: 9 },
      }
      return [...prev, input]
    })
  }

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: 8,
          background: '#111',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ color: '#888', fontSize: 12 }}>Chart Type:</span>
        {CHART_TYPES.map((type) => (
          <button
            key={type}
            onClick={() => setChartType(type)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
              background: chartType === type ? '#4aa8ff' : '#222',
              color: chartType === type ? '#fff' : '#888',
              border: 'none',
              borderRadius: 4,
            }}
          >
            {type}
          </button>
        ))}

        <span style={{ color: '#333', margin: '0 4px' }}>|</span>
        <span style={{ color: '#888', fontSize: 12 }}>Tools:</span>
        {DRAWING_TOOLS.map((tool) => (
          <button
            key={tool}
            onClick={() => setActiveTool(activeTool === tool ? null : tool)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
              background: activeTool === tool ? '#34d399' : '#222',
              color: activeTool === tool ? '#000' : '#888',
              border: 'none',
              borderRadius: 4,
            }}
          >
            {tool}
          </button>
        ))}

        <span style={{ color: '#333', margin: '0 4px' }}>|</span>
        <span style={{ color: '#888', fontSize: 12 }}>Indicators:</span>
        {(['RSI', 'MACD'] as const).map((type) => (
          <button
            key={type}
            onClick={() => toggleIndicator(type)}
            style={{
              padding: '4px 8px',
              fontSize: 11,
              cursor: 'pointer',
              background: indicators.some((i) => i.type === type)
                ? '#ffb020'
                : '#222',
              color: indicators.some((i) => i.type === type) ? '#000' : '#888',
              border: 'none',
              borderRadius: 4,
            }}
          >
            {type}
          </button>
        ))}

        <span style={{ color: '#333', margin: '0 4px' }}>|</span>
        <button
          onClick={() => chartRef.current?.executeCommand({ type: 'undo' })}
          style={{
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            background: '#222',
            color: '#888',
            border: 'none',
            borderRadius: 4,
          }}
        >
          Undo
        </button>
        <button
          onClick={() => chartRef.current?.executeCommand({ type: 'redo' })}
          style={{
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            background: '#222',
            color: '#888',
            border: 'none',
            borderRadius: 4,
          }}
        >
          Redo
        </button>
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <FastFinancialChart
          ref={chartRef}
          compareMode="indexed"
          chartType={chartType}
          activeTool={activeTool}
          indicators={indicators}
          controlled={{ indicators: true }}
          timeScale={{ rightOffset: 10 }}
          baselineConfig={{ baseValue: bars[0]?.close ?? 42000 }}
          series={[
            {
              id: 'BTC-MOCK',
              label: 'BTC/USD',
              bars,
              color: '#4aa8ff',
              pricePrecision: 2,
            },
          ]}
          style={{ width: '100%', height: '100%' }}
          timeframe={timeframe}
        />
      </div>
    </div>
  )
}
