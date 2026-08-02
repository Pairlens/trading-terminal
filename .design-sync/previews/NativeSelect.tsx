// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  NativeSelect,
  NativeSelectOption,
  NativeSelectOptGroup,
  Label,
} from '@pairlens/ui'

export const Venue = () => (
  <div style={{ padding: 16, display: 'grid', gap: 6 }}>
    <Label htmlFor="venue">Trading venue</Label>
    <NativeSelect id="venue" defaultValue="okx" style={{ width: 220 }}>
      <NativeSelectOptGroup label="CEX">
        <NativeSelectOption value="okx">OKX</NativeSelectOption>
        <NativeSelectOption value="binance">Binance</NativeSelectOption>
        <NativeSelectOption value="coinbase">Coinbase</NativeSelectOption>
        <NativeSelectOption value="kraken">Kraken</NativeSelectOption>
      </NativeSelectOptGroup>
      <NativeSelectOptGroup label="DEX">
        <NativeSelectOption value="jupiter">
          Jupiter (Solana)
        </NativeSelectOption>
        <NativeSelectOption value="kyber">KyberSwap (EVM)</NativeSelectOption>
      </NativeSelectOptGroup>
    </NativeSelect>
  </div>
)

export const Timeframe = () => (
  <div style={{ padding: 16, display: 'grid', gap: 6 }}>
    <Label htmlFor="tf">Timeframe</Label>
    <NativeSelect id="tf" defaultValue="4h" style={{ width: 160 }}>
      <NativeSelectOption value="1m">1 minute</NativeSelectOption>
      <NativeSelectOption value="15m">15 minutes</NativeSelectOption>
      <NativeSelectOption value="1h">1 hour</NativeSelectOption>
      <NativeSelectOption value="4h">4 hours</NativeSelectOption>
      <NativeSelectOption value="1d">1 day</NativeSelectOption>
    </NativeSelect>
  </div>
)

export const Small = () => (
  <div style={{ padding: 16, display: 'grid', gap: 6 }}>
    <Label htmlFor="pair-sm">Pair</Label>
    <NativeSelect
      id="pair-sm"
      size="sm"
      defaultValue="btc"
      style={{ width: 160 }}
    >
      <NativeSelectOption value="btc">BTC / USDT</NativeSelectOption>
      <NativeSelectOption value="eth">ETH / USDT</NativeSelectOption>
      <NativeSelectOption value="sol">SOL / USDT</NativeSelectOption>
    </NativeSelect>
  </div>
)
