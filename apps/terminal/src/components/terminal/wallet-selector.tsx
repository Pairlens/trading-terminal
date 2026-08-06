// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect } from 'react'
import { ChevronDown, Wallet } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import type { WalletChain } from '@pairlens/market-engine/adapter'
import { useActiveWallet } from '@/lib/active-wallet-context'
import { useMarketData } from '@/lib/market-data-provider'
import {
  CREDENTIAL_SCHEMAS,
  useCredentialsStore,
} from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'

type WalletSelectorProps = {
  market: string
}

/**
 * `WalletChain` is a lowercase id, and it was reaching the user raw — "Connect
 * a solana wallet". These are proper nouns; they read as a bug in every
 * language and worse in the ones that capitalize the noun beside them
 * ("solana-Wallet"). Not translated: chain names are the same everywhere.
 */
export const CHAIN_NAME: Record<WalletChain, string> = {
  solana: 'Solana',
  ethereum: 'Ethereum',
  bitcoin: 'Bitcoin',
}

export function WalletSelector({ market }: WalletSelectorProps) {
  const { t } = useTranslation()
  const { activeWallet, setActiveWallet } = useActiveWallet()
  const credentials = useCredentialsStore((s) => s.credentials)
  const credLoaded = useCredentialsStore((s) => s.loaded)
  const loadCreds = useCredentialsStore((s) => s.load)
  const wallets = useWalletsStore((s) => s.wallets)
  const walletsLoaded = useWalletsStore((s) => s.loaded)
  const loadWallets = useWalletsStore((s) => s.load)
  const { availableMarkets } = useMarketData()

  useEffect(() => {
    loadCreds()
    loadWallets()
  }, [loadCreds, loadWallets])

  const loaded = credLoaded && walletsLoaded

  // Determine if this market is DEX (needs crypto wallet) or CEX/broker
  // (needs credentials)
  const marketInfo = availableMarkets.find((m) => m.marketId === market)
  const isDex = marketInfo?.walletChain != null
  const isBroker = marketInfo?.assetClasses.includes('stocks') ?? false

  // For DEX: show crypto wallets matching the chain
  // For CEX: show exchange credentials
  const marketCreds = isDex
    ? []
    : credentials.filter((c) => c.market === market)
  const chainWallets = isDex
    ? wallets.filter((w) => w.chain === marketInfo?.walletChain)
    : []

  const items = isDex
    ? chainWallets.map((w) => ({
        id: w.id,
        label: w.label,
        sublabel: `${w.address.slice(0, 6)}...${w.address.slice(-4)}`,
        type: 'wallet' as const,
      }))
    : marketCreds.map((c) => ({
        id: c.id,
        label: c.label,
        sublabel: c.mode.toUpperCase(),
        mode: c.mode,
        type: 'credential' as const,
      }))

  // Auto-select when exactly one item for this market
  useEffect(() => {
    if (!loaded) return
    if (items.length === 1 && activeWallet?.walletId !== items[0]!.id) {
      setActiveWallet({
        walletId: items[0]!.id,
        market,
        type: items[0]!.type,
      })
    }
  }, [loaded, items.length, market]) // deps intentionally coarse: item/wallet identities omitted to avoid re-running per store update

  // Clear wallet if it no longer belongs to current market
  useEffect(() => {
    if (!loaded || !activeWallet) return
    if (activeWallet.market !== market) {
      const match = items.length === 1 ? items[0] : null
      setActiveWallet(
        match ? { walletId: match.id, market, type: match.type } : null,
      )
    }
  }, [market, loaded]) // runs on market switch only; items/activeWallet are read fresh, not reactive

  if (!loaded) return null

  if (items.length === 0) {
    // The chain/venue rides in as a placeholder rather than being glued to a
    // " wallet" / " account" suffix: that word order is English-only, and the
    // chain is not always known (an EVM connector with no wallet configured).
    const chain = marketInfo?.walletChain
    const connectHint = isDex
      ? chain
        ? t('terminal.wallet.connectHintWallet', { chain: CHAIN_NAME[chain] })
        : t('terminal.wallet.connectHintWalletAny')
      : t('terminal.wallet.connectHintAccount', {
          venue: CREDENTIAL_SCHEMAS[market]?.label ?? market.toUpperCase(),
        })

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to="/accounts"
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
                'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            />
          }
        >
          <Wallet className="size-3" />
          {isDex
            ? t('terminal.wallet.connectWallet')
            : t('terminal.wallet.connectAccount')}
        </TooltipTrigger>
        <TooltipContent>{connectHint}</TooltipContent>
      </Tooltip>
    )
  }

  const selected = items.find((i) => i.id === activeWallet?.walletId)

  const modeBadge = (mode: string) =>
    mode === 'live' ? (
      <Badge
        variant="outline"
        className="h-4 border-red-500/30 bg-red-500/10 px-1 text-[9px] text-red-700 dark:text-red-300"
      >
        {t('terminal.modeLive', { defaultValue: 'LIVE' })}
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="h-4 border-amber-500/30 bg-amber-500/10 px-1 text-[9px] text-amber-700 dark:text-amber-300"
      >
        {t('terminal.modePaper', { defaultValue: 'PAPER' })}
      </Badge>
    )

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" className="gap-1 text-xs" />
              }
            />
          }
        >
          <Wallet className="size-3" />
          {selected ? (
            <>
              <span className="max-w-20 truncate">{selected.label}</span>
              {'mode' in selected && selected.mode
                ? modeBadge(selected.mode)
                : null}
            </>
          ) : (
            <span className="text-muted-foreground">
              {isDex
                ? t('terminal.wallet.selectWallet')
                : t('terminal.wallet.selectAccount')}
            </span>
          )}
          <ChevronDown className="size-3" />
        </TooltipTrigger>
        <TooltipContent>
          {selected
            ? selected.label
            : isDex
              ? t('terminal.wallet.selectWallet')
              : t('terminal.wallet.selectAccount')}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="w-auto min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {isDex
              ? t('terminal.wallet.groupWallet')
              : isBroker
                ? t('terminal.wallet.groupBroker')
                : t('terminal.wallet.groupExchange')}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={activeWallet?.walletId ?? ''}
          onValueChange={(walletId) => {
            const item = items.find((i) => i.id === walletId)
            if (item) {
              setActiveWallet({ walletId, market, type: item.type })
            }
          }}
        >
          {items.map((item) => (
            <DropdownMenuRadioItem
              key={item.id}
              value={item.id}
              className="whitespace-nowrap"
            >
              <span className="flex items-center gap-1.5">
                <span className="font-medium">{item.label}</span>
                {'mode' in item && item.mode ? (
                  modeBadge(item.mode)
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {item.sublabel}
                  </span>
                )}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
