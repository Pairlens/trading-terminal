// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupTextarea,
  Label,
} from '@pairlens/ui'

export const WithUnitAddon = () => (
  <div style={{ padding: 16, maxWidth: 340, display: 'grid', gap: 6 }}>
    <Label>Limit price</Label>
    <InputGroup>
      <InputGroupInput placeholder="68,240.50" defaultValue="68,240.50" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>USDT</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  </div>
)

export const WithButton = () => (
  <div style={{ padding: 16, maxWidth: 340, display: 'grid', gap: 6 }}>
    <Label>Order size</Label>
    <InputGroup>
      <InputGroupAddon>
        <InputGroupText>BTC</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="0.00" defaultValue="0.125" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton variant="outline" size="sm">
          Max
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
)

export const AiPrompt = () => (
  <div style={{ padding: 16, maxWidth: 380, display: 'grid', gap: 6 }}>
    <Label>Ask the co-pilot</Label>
    <InputGroup>
      <InputGroupTextarea placeholder="Is the ETH/USDT breakout worth taking here?" />
      <InputGroupAddon align="block-end">
        <InputGroupText>gpt-oss-120b</InputGroupText>
        <InputGroupButton variant="default" size="sm" className="ml-auto">
          Analyze
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  </div>
)
