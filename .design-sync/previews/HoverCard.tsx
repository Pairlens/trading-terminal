// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
} from '@pairlens/ui'

// Force resting state against the frozen capture clock (zoom/fade entrance).
const freeze = `
  [data-slot='hover-card-content'] {
    transform: none !important;
    opacity: 1 !important;
    animation: none !important;
  }
`

export const TokenSummary = () => (
  <div style={{ padding: 16, minHeight: 320 }}>
    <style>{freeze}</style>
    <HoverCard defaultOpen>
      <HoverCardTrigger render={<Button variant="link">BTC/USDT</Button>} />
      <HoverCardContent style={{ width: 288 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <Avatar>
            <AvatarFallback>₿</AvatarFallback>
          </Avatar>
          <div style={{ display: 'grid', gap: 6, flex: 1 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontWeight: 600 }}>Bitcoin</span>
              <Badge variant="secondary">OKX</Badge>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 600 }}>$68,430.10</span>
              <span style={{ color: 'var(--chart-2)', fontSize: 13 }}>
                +2.41%
              </span>
            </div>
            <p
              style={{
                color: 'var(--muted-foreground)',
                fontSize: 12,
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              24h vol $1.2B · Spread 0.4 bps · Regime: trending up
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  </div>
)
