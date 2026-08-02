// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Button,
  Badge,
} from '@pairlens/ui'
import { ChevronsUpDown } from 'lucide-react'

// Frozen-clock safety: keep the open panel at its resting height.
const forceOpen = `[data-slot='collapsible-content'] { height: auto !important; }`

export const AdvancedOrder = () => (
  <div style={{ padding: 16, width: 340 }}>
    <style>{forceOpen}</style>
    <Collapsible
      defaultOpen
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 600 }}>Advanced order</span>
        <CollapsibleTrigger
          render={
            <Button variant="ghost" size="icon">
              <ChevronsUpDown />
            </Button>
          }
        />
      </div>
      <CollapsibleContent>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 10,
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>
              Take profit
            </span>
            <span>72,400.00</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--muted-foreground)' }}>Stop loss</span>
            <span style={{ color: 'var(--destructive)' }}>66,100.00</span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ color: 'var(--muted-foreground)' }}>
              Time in force
            </span>
            <Badge variant="secondary">GTC</Badge>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  </div>
)

export const SignalDetail = () => (
  <div style={{ padding: 16, width: 340 }}>
    <style>{forceOpen}</style>
    <Collapsible defaultOpen>
      <CollapsibleTrigger
        render={
          <Button variant="outline" size="sm">
            <ChevronsUpDown />
            ATR breakout · BTC-USDT
          </Button>
        }
      />
      <CollapsibleContent>
        <p
          style={{
            marginTop: 10,
            fontSize: 13,
            color: 'var(--muted-foreground)',
            lineHeight: 1.5,
          }}
        >
          Close broke the 20-period high with ATR expanding 1.8x. Regime filter
          is bullish. Co-pilot verdict:{' '}
          <span style={{ color: 'var(--chart-2)', fontWeight: 600 }}>
            APPROVE
          </span>
          .
        </p>
      </CollapsibleContent>
    </Collapsible>
  </div>
)
