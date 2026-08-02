// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// Three products, one engine. The same bars, the same EMA and volume pane and
// the same <FastFinancialChart /> call in all three cards — they share a single
// tick stream so they can never drift apart. Everything else is hand-written
// chrome, which is the point being made.
import { useMemo } from 'react'
import { LiveChart } from './LiveChart'
import { TickStream, makeBars } from './chart-kit'
import type { CSSProperties, ReactNode } from 'react'
import type { ChartConfig, ChartSkin } from './chart-kit'

const BASE = 63_200
const CFG: ChartConfig = {
  type: 'candles',
  ema: true,
  bb: false,
  rsi: false,
  vol: true,
}

const TERMINAL: ChartSkin = {
  bg: '#0c0c0d',
  grid: '#26262a',
  text: '#8b8b93',
  fg: '#e8e8ec',
  up: '#f0b429',
  down: '#e5484d',
  ema: '#f0b429',
  bb: '#5a5a63',
  rsi: '#f0b429',
}

const PAPER: ChartSkin = {
  bg: '#faf8f3',
  grid: '#e2ddd1',
  text: '#8a8377',
  fg: '#2b2722',
  up: '#2f6f4f',
  down: '#a8402f',
  ema: '#b08442',
  bb: '#c3bcae',
  rsi: '#2f6f4f',
}

const NEON: ChartSkin = {
  bg: '#080d1c',
  grid: '#182036',
  text: '#6f81ab',
  fg: '#dbe6ff',
  up: '#4ef2c0',
  down: '#ff4d8d',
  ema: '#7c8cff',
  bb: '#2b3a63',
  rsi: '#4ef2c0',
}

function Card({
  children,
  style,
}: {
  children: ReactNode
  style: CSSProperties
}) {
  return (
    <div className="flex min-h-[434px] flex-col overflow-hidden" style={style}>
      {children}
    </div>
  )
}

export function StyleShowcase() {
  const bars = useMemo(() => makeBars(96, 98, BASE, '1m'), [])
  const stream = useMemo(
    () => new TickStream(BASE, '1m', bars[bars.length - 1]),
    [bars],
  )

  const chart = (seriesId: string, skin: ChartSkin) => (
    <LiveChart
      seriesId={seriesId}
      bars={bars}
      timeframe="1m"
      base={BASE}
      cfg={CFG}
      skin={skin}
      stream={stream}
      fill
      minHeight={236}
      // Stacked on a phone the three cards span more than a viewport; a wide
      // margin wakes them together so their bars stay bar-for-bar identical.
      rootMargin="1400px 0px"
    />
  )

  return (
    <div className="grid gap-5 min-[721px]:grid-cols-2 min-[1001px]:grid-cols-3">
      <Card style={{ border: '1px solid #26262a', background: '#0c0c0d' }}>
        <div
          className="flex items-center justify-between gap-2.5 px-3.5 py-2.5"
          style={{ borderBottom: '1px solid #26262a' }}
        >
          <span
            className="font-mono text-[10.5px] font-bold tracking-[0.18em] uppercase"
            style={{ color: '#f0b429' }}
          >
            BTC/USD
          </span>
          <span
            className="font-mono text-[10px] tracking-[0.14em] uppercase"
            style={{ color: '#6a6a72' }}
          >
            SES 04 · L2 · RT
          </span>
        </div>
        {chart('BTC/USD', TERMINAL)}
        <div
          className="flex gap-3.5 px-3.5 py-[9px] font-mono text-[9.5px] tracking-[0.16em] uppercase"
          style={{ borderTop: '1px solid #26262a', color: '#6a6a72' }}
        >
          <span>F1 CHART</span>
          <span>F2 DEPTH</span>
          <span>F3 T&amp;S</span>
          <span style={{ color: '#f0b429' }}>■ LIVE</span>
        </div>
      </Card>

      <Card
        style={{
          borderRadius: 6,
          border: '1px solid #e2ddd1',
          background: '#faf8f3',
        }}
      >
        <div className="px-[22px] pt-5 pb-3.5">
          <p
            className="font-mono text-[9.5px] font-semibold tracking-[0.2em] uppercase"
            style={{ color: '#a09889' }}
          >
            Daily settlement note
          </p>
          <p
            className="mt-2 font-serif text-[22px] font-semibold tracking-[-0.02em]"
            style={{ color: '#2b2722' }}
          >
            Bitcoin, spot
          </p>
        </div>
        {chart('Bitcoin, spot', PAPER)}
        <p
          className="px-[22px] py-3 text-[12.5px] leading-[1.6]"
          style={{ borderTop: '1px solid #e2ddd1', color: '#8a8377' }}
        >
          Close of session · figures in USD · prepared for internal circulation.
        </p>
      </Card>

      <Card
        style={{
          borderRadius: 22,
          border: '1px solid #182036',
          background: '#080d1c',
          boxShadow: '0 0 44px -18px #4ef2c0',
        }}
      >
        <div className="flex items-center justify-between gap-2.5 px-[18px] pt-4 pb-2.5">
          <span
            className="text-[17px] font-extrabold tracking-[-0.02em]"
            style={{ color: '#dbe6ff' }}
          >
            BTC
          </span>
          <span
            className="rounded-full px-[11px] py-1 text-[11px] font-bold"
            style={{ background: 'rgba(78,242,192,.14)', color: '#4ef2c0' }}
          >
            +2.4% today
          </span>
        </div>
        {chart('BTC', NEON)}
        <div className="flex gap-2 px-3.5 pt-3 pb-4">
          <span
            className="flex-1 rounded-full py-[9px] text-center text-[12.5px] font-bold"
            style={{ background: '#4ef2c0', color: '#04231a' }}
          >
            Buy
          </span>
          <span
            className="flex-1 rounded-full border py-[9px] text-center text-[12.5px] font-bold"
            style={{ borderColor: '#223055', color: '#8fa2cc' }}
          >
            Sell
          </span>
        </div>
      </Card>
    </div>
  )
}
