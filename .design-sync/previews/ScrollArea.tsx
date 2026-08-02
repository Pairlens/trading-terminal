// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ScrollArea, Separator, Badge } from '@pairlens/ui'

const markets = [
  ['BTC / USDT', '$68,830.50', '+2.4%', true],
  ['ETH / USDT', '$3,540.12', '+1.1%', true],
  ['SOL / USDT', '$168.44', '-3.7%', false],
  ['XRP / USDT', '$0.6123', '+0.3%', true],
  ['BNB / USDT', '$604.20', '-0.8%', false],
  ['DOGE / USDT', '$0.1642', '+5.2%', true],
  ['ADA / USDT', '$0.4521', '-1.4%', false],
  ['AVAX / USDT', '$38.90', '+2.0%', true],
  ['LINK / USDT', '$17.35', '+0.9%', true],
  ['DOT / USDT', '$7.12', '-2.1%', false],
  ['MATIC / USDT', '$0.7240', '+1.7%', true],
  ['LTC / USDT', '$84.60', '-0.5%', false],
  ['TON / USDT', '$7.88', '+3.3%', true],
  ['TRX / USDT', '$0.1290', '+0.2%', true],
  ['ATOM / USDT', '$9.14', '-1.9%', false],
  ['UNI / USDT', '$10.72', '+4.1%', true],
  ['ARB / USDT', '$1.14', '-3.0%', false],
  ['OP / USDT', '$2.36', '+1.2%', true],
  ['APT / USDT', '$9.55', '-0.7%', false],
  ['NEAR / USDT', '$6.01', '+2.8%', true],
]

export const Watchlist = () => (
  <div style={{ padding: 16 }}>
    <ScrollArea
      style={{
        height: 300,
        width: 320,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
      }}
    >
      <div style={{ padding: 8 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            padding: '4px 8px',
          }}
        >
          Watchlist · 20 pairs
        </div>
        <Separator />
        {markets.map(([pair, price, chg, up], i) => (
          <div key={pair as string}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 500 }}>{pair}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}
                >
                  {price}
                </span>
                <Badge
                  variant={up ? 'secondary' : 'destructive'}
                  style={up ? { color: 'var(--chart-2)' } : undefined}
                >
                  {chg}
                </Badge>
              </div>
            </div>
            {i < markets.length - 1 && <Separator />}
          </div>
        ))}
      </div>
    </ScrollArea>
  </div>
)
