// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from '@pairlens/ui'

export const TimeframePicker = () => (
  <div style={{ padding: 16, minHeight: 320 }}>
    <Select defaultValue="4h" defaultOpen>
      <SelectTrigger style={{ width: 200 }}>
        <SelectValue placeholder="Timeframe" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Intraday</SelectLabel>
          <SelectItem value="1m">1 minute</SelectItem>
          <SelectItem value="15m">15 minutes</SelectItem>
          <SelectItem value="1h">1 hour</SelectItem>
          <SelectItem value="4h">4 hours</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Higher</SelectLabel>
          <SelectItem value="1d">1 day</SelectItem>
          <SelectItem value="1w">1 week</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
)

export const Closed = () => (
  <div style={{ padding: 16 }}>
    <Select defaultValue="okx">
      <SelectTrigger style={{ width: 200 }}>
        <SelectValue placeholder="Venue" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="okx">OKX</SelectItem>
        <SelectItem value="binance">Binance</SelectItem>
        <SelectItem value="coinbase">Coinbase</SelectItem>
        <SelectItem value="kraken">Kraken</SelectItem>
      </SelectContent>
    </Select>
  </div>
)
