// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * One-press buys from a launchpad row.
 *
 * A quick buy is the ordinary swap with the amount and the execution preset
 * already decided: it spends SOL from the trader's Solana wallet, on the
 * jupiter venue, through the same guarded `placeOrder` the ticket uses, so
 * the risk limits, the vault gate and the identity check all apply. What it
 * skips is the ticket itself, which on a token thirty seconds old is the
 * difference between a fill and a missed one.
 *
 * Solana only. The three launchpad columns are Solana, and a Legendary row on
 * an EVM chain renders without the bolt rather than with one that would need
 * a gas model the EVM connector does not expose.
 */
import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useSwapPresets } from './use-swap-presets'
import type { LaunchpadToken } from '@pairlens/shared/instrument-types'
import { useMarketData } from '@/lib/market-data-provider'
import { useActiveWallet } from '@/lib/active-wallet-context'
import { useWalletsStore } from '@/stores/wallets-store'
import { swapExecutionOf } from '@/lib/trading/swap-presets'

/** The venue and the leg a quick buy spends. Not the chart's USDC: a trader's Solana wallet holds SOL. */
export const QUICK_BUY_MARKET = 'jupiter'
export const QUICK_BUY_QUOTE = 'SOL'

export type QuickBuyReadiness =
  /** A Solana wallet is provisioned and the venue is connected. */
  | 'ready'
  /** The vault could not be read; the wallet may exist. */
  | 'sealed'
  /** No Solana wallet on this device. */
  | 'no-wallet'
  /** Wallets are still loading. */
  | 'loading'

export function useQuickBuy(): {
  readiness: QuickBuyReadiness
  /** Whether a quick buy is in flight for the given mint. */
  isBuying: (address: string) => boolean
  /** Buy `sol` SOL worth of `token`. Resolves when the swap settled or failed. */
  buy: (token: LaunchpadToken, sol: number) => Promise<void>
  /** Send the trader to add a wallet, with the reason in a toast. */
  explain: () => void
} {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { placeOrder, refreshWalletBalances } = useMarketData()
  const { activeWallet } = useActiveWallet()
  const wallets = useWalletsStore((s) => s.wallets)
  const loaded = useWalletsStore((s) => s.loaded)
  const sealed = useWalletsStore((s) => s.sealed)
  const { active: preset } = useSwapPresets('memecoin')
  const [inflight, setInflight] = useState<ReadonlySet<string>>(new Set())

  // The wallet bound to this pane when it is a Solana one, else the first
  // Solana wallet on the device. Same resolution the NFT ticket uses.
  const wallet = useMemo(() => {
    const bound = wallets.find((w) => w.id === activeWallet?.walletId) ?? null
    if (bound && bound.chain === 'solana') return bound
    return wallets.find((w) => w.chain === 'solana') ?? null
  }, [wallets, activeWallet?.walletId])

  const readiness: QuickBuyReadiness = wallet
    ? 'ready'
    : sealed
      ? 'sealed'
      : loaded
        ? 'no-wallet'
        : 'loading'

  const explain = useCallback(() => {
    if (readiness === 'sealed') {
      toast.error(t('memecoins.quickBuy.sealed'))
      return
    }
    toast.error(t('memecoins.quickBuy.noWallet'), {
      action: {
        label: t('memecoins.quickBuy.addWallet'),
        onClick: () => void navigate({ to: '/accounts' }),
      },
    })
  }, [readiness, navigate, t])

  const buy = useCallback(
    async (token: LaunchpadToken, sol: number) => {
      if (!wallet) {
        explain()
        return
      }
      if (!(sol > 0) || !Number.isFinite(sol)) return
      const pair = `${token.address}-${QUICK_BUY_QUOTE}`
      setInflight((prev) => new Set(prev).add(token.address))
      try {
        const result = await placeOrder({
          market: QUICK_BUY_MARKET,
          pair,
          side: 'buy',
          type: 'market',
          size: String(sol),
          walletId: wallet.id,
          slippageBps: preset.slippageBps,
          swap: swapExecutionOf(preset),
          mode: 'live',
          analyticsSource: 'memecoin_board',
        })
        if (result.success) {
          // No fill is journaled here: the swap returns a signature and not an
          // amount, and the board has no SOL price to size the leg with. A
          // guessed figure in the Data Log is worse than the balance refresh
          // below, which is what the ticket's own journal is reconciled to.
          toast.success(
            t('memecoins.quickBuy.bought', { symbol: token.symbol, sol }),
          )
          refreshWalletBalances(QUICK_BUY_MARKET, wallet.id, pair)
        } else {
          toast.error(t('memecoins.quickBuy.failed'), {
            description: result.error ?? t('common.unknownError'),
          })
        }
      } catch (err) {
        toast.error(t('memecoins.quickBuy.failed'), {
          description: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setInflight((prev) => {
          const next = new Set(prev)
          next.delete(token.address)
          return next
        })
      }
    },
    [wallet, explain, placeOrder, preset, refreshWalletBalances, t],
  )

  const isBuying = useCallback(
    (address: string) => inflight.has(address),
    [inflight],
  )

  return { readiness, isBuying, buy, explain }
}
