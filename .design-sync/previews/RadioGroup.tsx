// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { RadioGroup, RadioGroupItem, Label } from '@pairlens/ui'

export const OrderType = () => (
  <div style={{ padding: 16, width: 260 }}>
    <RadioGroup defaultValue="limit" style={{ gap: 12 }}>
      {[
        ['market', 'Market', 'Fill immediately at best price'],
        ['limit', 'Limit', 'Rest at your chosen price'],
        ['stop', 'Stop', 'Trigger when price crosses'],
      ].map(([value, title, desc]) => (
        <div key={value} style={{ display: 'flex', gap: 10 }}>
          <RadioGroupItem
            value={value}
            id={`ot-${value}`}
            style={{ marginTop: 2 }}
          />
          <div style={{ display: 'grid', gap: 2 }}>
            <Label htmlFor={`ot-${value}`} style={{ fontWeight: 500 }}>
              {title}
            </Label>
            <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
              {desc}
            </span>
          </div>
        </div>
      ))}
    </RadioGroup>
  </div>
)

export const RiskProfile = () => (
  <div style={{ padding: 16, width: 240 }}>
    <RadioGroup defaultValue="balanced" style={{ gap: 10 }}>
      {[
        ['conservative', 'Conservative — 1% risk / trade'],
        ['balanced', 'Balanced — 2% risk / trade'],
        ['aggressive', 'Aggressive — 5% risk / trade'],
      ].map(([value, label]) => (
        <div
          key={value}
          style={{ display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <RadioGroupItem value={value} id={`rp-${value}`} />
          <Label htmlFor={`rp-${value}`}>{label}</Label>
        </div>
      ))}
    </RadioGroup>
  </div>
)

export const Disabled = () => (
  <div style={{ padding: 16, width: 240 }}>
    <RadioGroup defaultValue="okx" disabled style={{ gap: 10 }}>
      {[
        ['okx', 'OKX'],
        ['binance', 'Binance'],
        ['coinbase', 'Coinbase'],
      ].map(([value, label]) => (
        <div
          key={value}
          style={{ display: 'flex', alignItems: 'center', gap: 10 }}
        >
          <RadioGroupItem value={value} id={`venue-${value}`} />
          <Label htmlFor={`venue-${value}`}>{label}</Label>
        </div>
      ))}
    </RadioGroup>
  </div>
)
