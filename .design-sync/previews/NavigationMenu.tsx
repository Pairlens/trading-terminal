// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
  Badge,
} from '@pairlens/ui'

export const TopNav = () => (
  <div style={{ padding: 16 }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '8px 12px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        background: 'var(--card)',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 15 }}>Pairlens</span>
      <NavigationMenu>
        <NavigationMenuList>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Markets</NavigationMenuTrigger>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuTrigger>Signals</NavigationMenuTrigger>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="#">Portfolio</NavigationMenuLink>
          </NavigationMenuItem>
          <NavigationMenuItem>
            <NavigationMenuLink href="#">Workflows</NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
      <div style={{ flex: 1 }} />
      <Badge variant="secondary" style={{ color: 'var(--chart-2)' }}>
        Live
      </Badge>
    </div>
  </div>
)

const links = [
  ['BTC / USDT', 'OKX · Binance · Coinbase'],
  ['ETH / USDT', 'OKX · Kraken · Bybit'],
  ['SOL / USDT', 'Jupiter · OKX'],
  ['XRP / USDT', 'Bitstamp · Kraken'],
]

export const MarketsMenu = () => (
  <div style={{ padding: 16, minHeight: 320 }}>
    <style>{`
      [data-slot="navigation-menu-content"]{opacity:1 !important;transform:none !important;}
    `}</style>
    <NavigationMenu defaultValue="markets">
      <NavigationMenuList>
        <NavigationMenuItem value="markets">
          <NavigationMenuTrigger>Markets</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 4,
                width: 420,
                padding: 4,
              }}
            >
              {links.map(([pair, venues]) => (
                <NavigationMenuLink key={pair} href="#">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 500 }}>{pair}</span>
                    <span
                      style={{ fontSize: 12, color: 'var(--muted-foreground)' }}
                    >
                      {venues}
                    </span>
                  </div>
                </NavigationMenuLink>
              ))}
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem value="signals">
          <NavigationMenuTrigger>Signals</NavigationMenuTrigger>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
)
