// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Textarea, Label } from '@pairlens/ui'

export const Default = () => (
  <div style={{ padding: 16, maxWidth: 420, display: 'grid', gap: 6 }}>
    <Label htmlFor="thesis">Trade thesis</Label>
    <Textarea
      id="thesis"
      defaultValue={
        'ETH / USDT reclaimed the 4h EMA with rising volume. Targeting 3,650 with a stop below 3,410. AI co-pilot rated the setup APPROVE.'
      }
    />
  </div>
)

export const Placeholder = () => (
  <div style={{ padding: 16, maxWidth: 420, display: 'grid', gap: 6 }}>
    <Label htmlFor="note">Journal note</Label>
    <Textarea
      id="note"
      placeholder="Why are you taking this trade? Note the signal, venue, and risk before you route the order..."
    />
  </div>
)

export const Invalid = () => (
  <div style={{ padding: 16, maxWidth: 420, display: 'grid', gap: 6 }}>
    <Label htmlFor="prompt">Co-pilot prompt</Label>
    <Textarea
      id="prompt"
      aria-invalid
      defaultValue=""
      placeholder="Ask the co-pilot..."
    />
    <span style={{ fontSize: 12, color: 'var(--destructive)' }}>
      Prompt cannot be empty before requesting analysis.
    </span>
  </div>
)
