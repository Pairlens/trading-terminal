// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@pairlens/ui'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
} from 'recharts'

const priceData = [
  { t: '09:00', price: 61240 },
  { t: '10:00', price: 61980 },
  { t: '11:00', price: 61510 },
  { t: '12:00', price: 62870 },
  { t: '13:00', price: 63420 },
  { t: '14:00', price: 63110 },
  { t: '15:00', price: 64580 },
  { t: '16:00', price: 65290 },
  { t: '17:00', price: 66040 },
  { t: '18:00', price: 65710 },
  { t: '19:00', price: 66830 },
]

const volumeData = [
  { t: 'Mon', vol: 128 },
  { t: 'Tue', vol: 96 },
  { t: 'Wed', vol: 172 },
  { t: 'Thu', vol: 143 },
  { t: 'Fri', vol: 209 },
  { t: 'Sat', vol: 88 },
  { t: 'Sun', vol: 61 },
]

const priceConfig = {
  price: { label: 'BTC/USDT', color: 'var(--chart-2)' },
}

const volConfig = {
  vol: { label: 'Volume (M)', color: 'var(--chart-1)' },
}

const axisTick = { fontSize: 11 }

export const PriceArea = () => (
  <div style={{ padding: 16, width: 460 }}>
    <ChartContainer config={priceConfig}>
      <AreaChart data={priceData} margin={{ left: 8, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillPrice" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor="var(--color-price)"
              stopOpacity={0.4}
            />
            <stop
              offset="95%"
              stopColor="var(--color-price)"
              stopOpacity={0.05}
            />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="t" tickLine={false} axisLine={false} tick={axisTick} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          dataKey="price"
          type="monotone"
          stroke="var(--color-price)"
          strokeWidth={2}
          fill="url(#fillPrice)"
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  </div>
)

export const PriceLine = () => (
  <div style={{ padding: 16, width: 460 }}>
    <ChartContainer config={priceConfig}>
      <LineChart data={priceData} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="t" tickLine={false} axisLine={false} tick={axisTick} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line
          dataKey="price"
          type="monotone"
          stroke="var(--color-price)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  </div>
)

export const VolumeBars = () => (
  <div style={{ padding: 16, width: 460 }}>
    <ChartContainer config={volConfig}>
      <BarChart data={volumeData} margin={{ left: 8, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="t" tickLine={false} axisLine={false} tick={axisTick} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="vol"
          fill="var(--color-vol)"
          radius={4}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  </div>
)
