// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxLabel,
  Label,
} from '@pairlens/ui'

const PAIRS = [
  ['btc', 'BTC / USDT'],
  ['eth', 'ETH / USDT'],
  ['sol', 'SOL / USDT'],
  ['xrp', 'XRP / USDT'],
  ['doge', 'DOGE / USDT'],
]

export const PairSearch = () => (
  <div style={{ padding: 16, minHeight: 320, width: 280 }}>
    <div style={{ display: 'grid', gap: 6 }}>
      <Label>Search markets</Label>
      <Combobox defaultOpen defaultValue="sol">
        <ComboboxInput placeholder="Search pairs..." style={{ width: 240 }} />
        <ComboboxContent>
          <ComboboxList>
            {PAIRS.map(([value, label]) => (
              <ComboboxItem key={value} value={value}>
                {label}
              </ComboboxItem>
            ))}
            <ComboboxEmpty>No markets found</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  </div>
)

export const VenueGrouped = () => (
  <div style={{ padding: 16, minHeight: 320, width: 280 }}>
    <div style={{ display: 'grid', gap: 6 }}>
      <Label>Route order to</Label>
      <Combobox defaultOpen defaultValue="okx">
        <ComboboxInput placeholder="Search venues..." style={{ width: 240 }} />
        <ComboboxContent>
          <ComboboxList>
            <ComboboxGroup>
              <ComboboxLabel>CEX</ComboboxLabel>
              <ComboboxItem value="okx">OKX</ComboboxItem>
              <ComboboxItem value="binance">Binance</ComboboxItem>
              <ComboboxItem value="coinbase">Coinbase</ComboboxItem>
            </ComboboxGroup>
            <ComboboxGroup>
              <ComboboxLabel>DEX</ComboboxLabel>
              <ComboboxItem value="jupiter">Jupiter (Solana)</ComboboxItem>
              <ComboboxItem value="kyber">KyberSwap (EVM)</ComboboxItem>
            </ComboboxGroup>
            <ComboboxEmpty>No venues found</ComboboxEmpty>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  </div>
)
