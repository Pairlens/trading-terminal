// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useNavigate } from '@tanstack/react-router'
import { Bell, Check, Plus, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import { Separator } from '@pairlens/ui/components/ui/separator'
import type { MarketOption } from '@/hooks/use-available-markets'
import { LayoutToolbar } from '@/components/layout/layout-toolbar'
import { PageHeader } from '@/components/page-header'
import { ConnectionIndicator } from '@/components/terminal/connection-indicator'
import { LatencyIndicator } from '@/components/terminal/latency-indicator'
import { MarketPicker } from '@/components/terminal/market-picker'
import { WalletSelector } from '@/components/terminal/wallet-selector'
import { PairSwitcher } from '@/components/pair-picker/pair-switcher'
import { formatPrice } from '@/lib/format-price'
import { useOptionalTickerData } from '@/lib/chart-terminal-context'
import { useNotificationStore } from '@/stores/notification-store'

type TerminalTopBarProps = {
  marketOptions: Array<MarketOption>
  pairKey: string
  assetClass?: string
  isWatched: boolean
  onStarClick: () => void
  market: string
  onMarketChange: (market: string) => void
  /** Speculative pre-connect when a venue in the dropdown is hovered/focused. */
  onMarketHover?: (market: string) => void
  workspacesOpen?: boolean
  onWorkspacesOpenChange?: (open: boolean) => void
}

export function TerminalTopBar({
  marketOptions,
  pairKey,
  assetClass,
  isWatched,
  onStarClick,
  market,
  onMarketChange,
  onMarketHover,
  workspacesOpen,
  onWorkspacesOpenChange,
}: TerminalTopBarProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const rules = useNotificationStore((s) => s.rules)
  const bindings = useNotificationStore((s) => s.bindings)
  const addBinding = useNotificationStore((s) => s.addBinding)
  const removeBinding = useNotificationStore((s) => s.removeBinding)

  return (
    <PageHeader
      actions={
        <LayoutToolbar
          open={workspacesOpen}
          onOpenChange={onWorkspacesOpenChange}
        />
      }
    >
      <PairSwitcher pairKey={pairKey} assetClass={assetClass} />
      <Button
        size="icon-xs"
        variant="ghost"
        className="size-6"
        onClick={onStarClick}
        aria-label={t('terminal.manageWatchlists')}
      >
        <Star
          className={cn(
            'size-3.5',
            isWatched
              ? 'fill-amber-400 text-amber-400'
              : 'text-muted-foreground',
          )}
        />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost"
              className="size-6"
              aria-label={t('terminal.createAlert')}
            />
          }
        >
          <Bell
            className={cn(
              'size-3.5',
              bindings.some((b) => b.pair === pairKey && b.market === market)
                ? 'fill-primary text-primary'
                : 'text-muted-foreground',
            )}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto min-w-48">
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t('notifications.flows')}</DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {rules.length === 0 && (
            <DropdownMenuItem disabled>
              <span className="text-muted-foreground text-xs">
                {t('notifications.noFlows')}
              </span>
            </DropdownMenuItem>
          )}
          {rules.map((rule) => {
            const existingBinding = bindings.find(
              (b) =>
                b.ruleId === rule.id &&
                b.pair === pairKey &&
                b.market === market,
            )
            return (
              <DropdownMenuItem
                key={rule.id}
                onClick={() => {
                  if (existingBinding) {
                    removeBinding(existingBinding.id)
                  } else {
                    addBinding(rule.id, pairKey, market)
                  }
                }}
              >
                <Check
                  className={cn(
                    'mr-2 size-3.5',
                    existingBinding ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {rule.name}
              </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate({ to: '/notifications' })}>
            <Plus className="mr-2 size-3.5" />
            {t('notifications.newFlow')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 self-stretch" />

      {/* Market + Wallet — grouped as a trading context pair */}
      <MarketPicker
        market={market}
        marketOptions={marketOptions}
        onMarketChange={onMarketChange}
        onMarketHover={onMarketHover}
        aria-label={t('terminal.market')}
      />

      <WalletSelector market={market} />

      <LivePriceTicker />

      <ConnectionIndicator />

      <LatencyIndicator
        market={market}
        pairKey={pairKey}
        venueLabel={marketOptions.find((m) => m.value === market)?.label}
      />
    </PageHeader>
  )
}

// ── Live price ticker ─────────────────────────────────────────────────
//
// Isolated in its own component so per-tick ticker context updates only
// re-render this small readout — not the whole top bar (market dropdown,
// layout toolbar, wallet selector, ...).
function LivePriceTicker() {
  const tickerData = useOptionalTickerData()
  const bestBid = tickerData?.bestBid ?? null
  const bestAsk = tickerData?.bestAsk ?? null
  const spread = tickerData?.spread ?? null

  if (bestBid == null || bestAsk == null) return null

  return (
    <>
      <Separator orientation="vertical" className="mx-1 self-stretch" />
      <div className="flex items-center gap-1.5 font-mono text-xs">
        <span className="text-green-400">{formatPrice(bestBid)}</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="text-red-400">{formatPrice(bestAsk)}</span>
        {spread != null && (
          <span className="text-muted-foreground/60">
            ({formatPrice(spread)})
          </span>
        )}
      </div>
    </>
  )
}
