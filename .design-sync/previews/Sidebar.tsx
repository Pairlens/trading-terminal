// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  SidebarSeparator,
  SidebarInset,
  Avatar,
  AvatarFallback,
  Badge,
} from '@pairlens/ui'

const Ic = ({ d }: { d: string }) => (
  <svg
    width={16}
    height={16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
)

const icons = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  markets: 'M3 3v18h18M7 15l4-4 3 3 5-6',
  positions: 'M12 2v20M2 12h20',
  workflows:
    'M6 3v12M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9c0 6-12 3-12 9',
}

export const TradingSidebar = () => (
  <div style={{ padding: 16 }}>
    <SidebarProvider style={{ minHeight: 400, height: 400 }}>
      <Sidebar collapsible="none" style={{ height: 400 }}>
        <SidebarHeader>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--primary)',
                color: 'var(--primary-foreground)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              P
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Pairlens</span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                Spot terminal
              </span>
            </div>
          </div>
        </SidebarHeader>
        <SidebarSeparator />
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Trading</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <Ic d={icons.dashboard} />
                    <span>Dashboard</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Ic d={icons.markets} />
                    <span>Markets</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>14</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Ic d={icons.positions} />
                    <span>Positions</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>3</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <Ic d={icons.workflows} />
                    <span>Workflows</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <SidebarGroup>
            <SidebarGroupLabel>Watchlist</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <span>BTC / USDT</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton>OKX · $68,830</SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton>
                        Binance · $68,842
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton>
                    <span>ETH / USDT</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 8px',
            }}
          >
            <Avatar>
              <AvatarFallback>JM</AvatarFallback>
            </Avatar>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>ai.agent</span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                Local only
              </span>
            </div>
            <Badge variant="secondary">Pro</Badge>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <div style={{ padding: 20 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              marginBottom: 12,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 600 }}>BTC / USDT</h2>
            <span style={{ fontSize: 20, fontWeight: 600 }}>$68,830.50</span>
            <Badge variant="secondary" style={{ color: 'var(--chart-2)' }}>
              +2.4%
            </Badge>
          </div>
          <div
            style={{
              height: 200,
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background:
                'linear-gradient(180deg, color-mix(in oklab, var(--chart-2) 12%, transparent), transparent)',
              display: 'flex',
              alignItems: 'flex-end',
              padding: 12,
            }}
          >
            <svg
              width="100%"
              height="150"
              viewBox="0 0 400 150"
              preserveAspectRatio="none"
            >
              <polyline
                points="0,120 40,110 80,118 120,90 160,96 200,70 240,80 280,50 320,58 360,30 400,40"
                fill="none"
                stroke="var(--chart-2)"
                strokeWidth={2}
              />
            </svg>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  </div>
)
