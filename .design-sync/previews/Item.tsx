// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
} from '@pairlens/ui'

export const ConnectedExchange = () => (
  <div style={{ padding: 16, maxWidth: 440 }}>
    <Item variant="outline">
      <ItemMedia>
        <Avatar>
          <AvatarFallback>OK</AvatarFallback>
        </Avatar>
      </ItemMedia>
      <ItemContent>
        <ItemTitle>OKX</ItemTitle>
        <ItemDescription>Spot · read + trade · US routing</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge variant="secondary" style={{ color: 'var(--chart-2)' }}>
          Connected
        </Badge>
        <Button size="sm" variant="outline">
          Manage
        </Button>
      </ItemActions>
    </Item>
  </div>
)

export const VenueList = () => (
  <div style={{ padding: 16, maxWidth: 440 }}>
    <ItemGroup>
      <Item variant="outline">
        <ItemMedia>
          <Avatar>
            <AvatarFallback>BN</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Binance</ItemTitle>
          <ItemDescription>412 pairs · WS live</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary" style={{ color: 'var(--chart-2)' }}>
            Live
          </Badge>
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item variant="outline">
        <ItemMedia>
          <Avatar>
            <AvatarFallback>CB</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>Coinbase</ItemTitle>
          <ItemDescription>228 pairs · WS live</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="secondary" style={{ color: 'var(--chart-2)' }}>
            Live
          </Badge>
        </ItemActions>
      </Item>
      <ItemSeparator />
      <Item variant="outline">
        <ItemMedia>
          <Avatar>
            <AvatarFallback>BY</AvatarFallback>
          </Avatar>
        </ItemMedia>
        <ItemContent>
          <ItemTitle>ByBit</ItemTitle>
          <ItemDescription>Blocked in your region</ItemDescription>
        </ItemContent>
        <ItemActions>
          <Badge variant="outline" style={{ color: 'var(--destructive)' }}>
            Restricted
          </Badge>
        </ItemActions>
      </Item>
    </ItemGroup>
  </div>
)

export const Variants = () => (
  <div style={{ padding: 16, maxWidth: 440, display: 'grid', gap: 10 }}>
    <Item variant="default">
      <ItemContent>
        <ItemTitle>BTC / USDT</ItemTitle>
        <ItemDescription>default</ItemDescription>
      </ItemContent>
      <ItemActions>
        <span style={{ color: 'var(--chart-2)' }}>+2.4%</span>
      </ItemActions>
    </Item>
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>ETH / USDT</ItemTitle>
        <ItemDescription>outline</ItemDescription>
      </ItemContent>
      <ItemActions>
        <span style={{ color: 'var(--destructive)' }}>-1.1%</span>
      </ItemActions>
    </Item>
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>SOL / USDT</ItemTitle>
        <ItemDescription>muted</ItemDescription>
      </ItemContent>
      <ItemActions>
        <span style={{ color: 'var(--chart-2)' }}>+5.8%</span>
      </ItemActions>
    </Item>
  </div>
)
