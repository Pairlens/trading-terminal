// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Source chain, target chain, the bridge, its fee and how long it takes.
 *
 * Every number is a live LI.FI route for the exact size on screen: what lands,
 * the floor under it, the bridge's own fee, the source chain's gas, and the
 * bridge that would carry it. Fee and gas stay two figures because two different
 * things go wrong with them, and the guaranteed floor is shown next to the
 * estimate because that is the number a transfer is executed against.
 *
 * The confirm step is not decoration. A quote goes stale in a minute, bridges
 * re-price, and "Bridge" on a stale panel is consent to a number that has moved.
 * So the pane freezes the terms it is asking about, states them one more time,
 * and the connector re-quotes at signing time and refuses anything worse than
 * what was confirmed. Calldata never travels through this component.
 *
 * What it will not do is quote a Solana leg. That needs a Solana signer and a
 * different transaction shape, so the route comes back as a typed refusal and
 * the pane says so, rather than pricing a transfer it cannot send.
 */
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Loader2, Waypoints } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { usePanePair } from '@pairlens/plugin-sdk'

import type { DexChain } from '@/lib/dex/chain-catalog'
import type { BridgeQuote } from '@/lib/dex/bridge-types'
import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { PanePairPicker } from '@/components/layout/pane-pair-picker'
import { useLpSourceState } from '@/components/dex/use-lp-source-state'
import {
  QUOTE_STALE_MS,
  useBridgePlugin,
  useBridgeQuote,
} from '@/hooks/use-bridge'
import { DEX_CHAINS, dexChain, explorerTxUrl } from '@/lib/dex/chain-catalog'
import { bridgeRefusalKey, isBridgeRefusal } from '@/lib/dex/bridge-types'
import { executeBridgeTransfer } from '@/lib/dex/bridge-execution'
import { splitPairKey } from '@/lib/dex/pair-legs'
import { formatAmount, formatCompactUsd } from '@/lib/format-price'
import { useWalletsStore } from '@/stores/wallets-store'

/** Typing an amount must not fire a quote per keystroke. */
const AMOUNT_DEBOUNCE_MS = 400

export function RouteBridgePane() {
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)
  // Pair first, then wallet: the pane needs a chain to bridge OUT of before
  // "connect an account" is the useful thing to say.
  if (!activePair) return <PanePairPicker />
  if (state.gate) return state.gate
  return (
    <RouteBridgePaneInner
      market={activePair.market}
      pairKey={activePair.pairKey}
      walletId={state.wallet!.id}
      walletAddress={state.wallet!.address}
    />
  )
}

/** EVM chains a transfer can leave from or land on, in rail order. */
function evmChains(): Array<DexChain> {
  return DEX_CHAINS.filter((chain) => chain.walletChain === 'ethereum')
}

function RouteBridgePaneInner({
  market,
  pairKey,
  walletId,
  walletAddress,
}: {
  market: string
  pairKey: string | undefined
  walletId: string
  walletAddress: string
}) {
  const { t } = useTranslation()
  const plugin = useBridgePlugin()
  const touchWallet = useWalletsStore((s) => s.touchWallet)
  const chains = evmChains()
  const from = dexChain(market)

  // Assets offered without asking anyone to paste an address: the chain's own
  // coin, its canonical stable, and whatever the board is charting.
  const base = splitPairKey(pairKey)?.base ?? null
  const assets = useMemo(() => {
    if (!from) return []
    const out: Array<string> = []
    const seen = new Set<string>()
    for (const symbol of [from.nativeSymbol, from.quoteSymbol, base]) {
      if (!symbol) continue
      const key = symbol.toUpperCase()
      if (seen.has(key) || key.startsWith('0X')) continue
      seen.add(key)
      out.push(symbol)
    }
    return out
  }, [from, base])

  const [symbol, setSymbol] = useState<string | null>(null)
  const [toMarket, setToMarket] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [debouncedAmount, setDebouncedAmount] = useState('')
  const [confirming, setConfirming] = useState<BridgeQuote | null>(null)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState<{ hash: string; market: string } | null>(
    null,
  )
  const [failure, setFailure] = useState<string | null>(null)

  const asset = symbol ?? assets[0] ?? null
  const destination =
    toMarket ?? chains.find((chain) => chain.market !== market)?.market ?? null

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedAmount(amount),
      AMOUNT_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [amount])

  const quote = useBridgeQuote(
    {
      fromMarket: market,
      toMarket: destination,
      symbol: asset,
      amount: debouncedAmount,
      address: walletAddress,
    },
    // Frozen while a confirm is open: the terms being agreed to must not move
    // under the cursor.
    confirming === null,
  )

  const response = quote.data
  const refused = isBridgeRefusal(response) ? response : null
  const priced = response && !isBridgeRefusal(response) ? response : null
  const stale = priced !== null && Date.now() - priced.quotedAt > QUOTE_STALE_MS

  if (!from || from.walletChain !== 'ethereum') {
    return (
      <PaneEmpty
        icon={Waypoints}
        title={t('routeBridge.notEvmTitle')}
        body={t('routeBridge.notEvmBody', {
          chain: from?.displayName ?? market,
        })}
      />
    )
  }

  if (!plugin) {
    return (
      <PaneEmpty
        icon={Waypoints}
        title={t('routeBridge.noConnectorTitle')}
        body={t('routeBridge.noConnectorBody')}
      />
    )
  }

  async function send(accepted: BridgeQuote) {
    setSending(true)
    setFailure(null)
    try {
      const result = await executeBridgeTransfer(plugin, {
        fromMarket: accepted.fromMarket,
        toMarket: accepted.toMarket,
        symbol: accepted.symbol,
        amount: debouncedAmount,
        walletId,
        walletAddress,
        acceptedAmountOutMin: accepted.amountOutMin ?? 0,
      })
      if (result.success && result.sourceTxHash) {
        setSent({ hash: result.sourceTxHash, market: accepted.fromMarket })
        setConfirming(null)
        setAmount('')
        setDebouncedAmount('')
        void touchWallet(walletId)
      } else {
        setFailure(result.error ?? t('routeBridge.sendFailed'))
      }
    } catch (err) {
      setFailure(
        err instanceof Error ? err.message : t('routeBridge.sendFailed'),
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h2 className="truncate text-[13px] font-semibold">
            {t('routeBridge.title')}
          </h2>
          <p className="truncate text-[10px] text-muted-foreground">
            {t('routeBridge.subtitle', { chain: from.displayName })}
          </p>
        </div>
        {priced ? (
          <span
            className={cn(
              'shrink-0 rounded-md px-2 py-0.5 font-mono text-[10px]',
              stale
                ? 'bg-[var(--chart-4)]/15 text-[var(--chart-4)]'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {stale ? t('routeBridge.expired') : priced.tool}
          </span>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-col gap-2.5 px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            {assets.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setSymbol(option)
                  setConfirming(null)
                }}
                aria-pressed={option === asset}
                className={cn(
                  'rounded-md px-1.5 py-0.5 font-mono text-[10.5px] transition-colors',
                  option === asset
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {option}
              </button>
            ))}
          </div>

          <Input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^0-9.]/g, ''))
              setConfirming(null)
              setSent(null)
            }}
            inputMode="decimal"
            placeholder={t('routeBridge.amountPlaceholder', {
              asset: asset ?? '',
            })}
            aria-label={t('routeBridge.amountLabel')}
            className="h-8 font-mono text-xs [font-variant-numeric:tabular-nums]"
          />

          <div>
            <p className="mb-1 text-[10px] text-muted-foreground">
              {t('routeBridge.destination')}
            </p>
            <div className="flex flex-wrap gap-1">
              {chains
                .filter((chain) => chain.market !== market)
                .map((chain) => (
                  <button
                    key={chain.market}
                    type="button"
                    onClick={() => {
                      setToMarket(chain.market)
                      setConfirming(null)
                    }}
                    aria-pressed={chain.market === destination}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] transition-colors',
                      chain.market === destination
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <img
                      src={chain.iconUrl}
                      alt=""
                      className="size-3 rounded-full"
                    />
                    <span className="font-mono">{chain.abbr}</span>
                  </button>
                ))}
            </div>
          </div>

          {quote.error ? (
            <PaneErrorBanner
              venue={t('routeBridge.provider')}
              message={quote.error}
            />
          ) : null}
          {failure ? (
            <PaneErrorBanner
              venue={t('routeBridge.provider')}
              message={failure}
            />
          ) : null}

          {refused ? (
            <p className="rounded-md border border-border/70 bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
              {t(bridgeRefusalKey(refused.reason), {
                chain:
                  dexChain(refused.market ?? '')?.displayName ??
                  refused.market ??
                  '',
                asset: refused.symbol ?? asset ?? '',
              })}
            </p>
          ) : null}

          {sent ? (
            <p className="rounded-md border border-up/30 bg-up/10 px-2.5 py-1.5 text-[11px] leading-relaxed">
              {t('routeBridge.sentBody')}{' '}
              <a
                href={explorerTxUrl(sent.market, sent.hash) ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline underline-offset-2"
              >
                {`${sent.hash.slice(0, 10)}…`}
              </a>
            </p>
          ) : null}

          {quote.isLoading ? (
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t('routeBridge.quoting')}
            </p>
          ) : null}

          {priced ? (
            <QuoteReadout
              quote={priced}
              destination={dexChain(priced.toMarket)}
            />
          ) : null}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border px-3 py-2">
        {confirming ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] leading-relaxed">
              {t('routeBridge.confirmBody', {
                amount: formatAmount(confirming.amount),
                asset: confirming.symbol,
                from:
                  dexChain(confirming.fromMarket)?.displayName ??
                  confirming.fromMarket,
                to:
                  dexChain(confirming.toMarket)?.displayName ??
                  confirming.toMarket,
                min:
                  confirming.amountOutMin === null
                    ? '—'
                    : `${formatAmount(confirming.amountOutMin)} ${confirming.toSymbol}`,
                tool: confirming.tool,
              })}
            </p>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              {t('routeBridge.confirmCost', {
                fee:
                  confirming.feeUsd === null
                    ? '—'
                    : formatCompactUsd(confirming.feeUsd),
                gas:
                  confirming.gasUsd === null
                    ? '—'
                    : formatCompactUsd(confirming.gasUsd),
                wallet: `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`,
              })}
            </p>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-7 flex-1 text-[11px]"
                disabled={sending}
                onClick={() => void send(confirming)}
              >
                {sending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  t('routeBridge.confirmAction')
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-[11px]"
                disabled={sending}
                onClick={() => setConfirming(null)}
              >
                {t('routeBridge.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            className="h-7 w-full text-[11px]"
            disabled={!priced || quote.isFetching}
            onClick={() => {
              if (!priced) return
              // A stale quote is refreshed rather than confirmed: the pane must
              // never ask somebody to agree to a number it knows has moved.
              if (Date.now() - priced.quotedAt > QUOTE_STALE_MS) {
                quote.refetch()
                return
              }
              setSent(null)
              setFailure(null)
              setConfirming(priced)
            }}
          >
            {stale ? t('routeBridge.requote') : t('routeBridge.review')}
          </Button>
        )}
      </footer>
    </div>
  )
}

function QuoteReadout({
  quote,
  destination,
}: {
  quote: BridgeQuote
  destination: DexChain | null
}) {
  const { t } = useTranslation()
  return (
    <div className="rounded-md border border-border/70">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-2.5 py-1.5">
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {t('routeBridge.youReceive')}
          <ArrowRight className="size-3" />
          <span className="truncate">
            {destination?.displayName ?? quote.toMarket}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[15px] font-semibold [font-variant-numeric:tabular-nums]">
          {quote.amountOut === null ? '—' : formatAmount(quote.amountOut)}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 px-2.5 py-1.5 text-[11px]">
        <Row
          label={t('routeBridge.minReceived')}
          value={
            quote.amountOutMin === null
              ? '—'
              : `${formatAmount(quote.amountOutMin)} ${quote.toSymbol}`
          }
        />
        <Row
          label={t('routeBridge.bridgeFee')}
          value={quote.feeUsd === null ? '—' : formatCompactUsd(quote.feeUsd)}
        />
        <Row
          label={t('routeBridge.networkGas')}
          value={quote.gasUsd === null ? '—' : formatCompactUsd(quote.gasUsd)}
        />
        <Row
          label={t('routeBridge.eta')}
          value={
            quote.etaSeconds === null
              ? '—'
              : quote.etaSeconds < 90
                ? t('routeBridge.etaSeconds', { seconds: quote.etaSeconds })
                : t('routeBridge.etaMinutes', {
                    minutes: Math.round(quote.etaSeconds / 60),
                  })
          }
        />
      </dl>
      <p className="border-t border-border/70 px-2.5 py-1 text-[10px] text-muted-foreground">
        {quote.feeIncluded
          ? t('routeBridge.feeIncluded', { tool: quote.tool })
          : t('routeBridge.feeExtra', { tool: quote.tool })}
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-1">
      <dt className="truncate text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-mono [font-variant-numeric:tabular-nums]">
        {value}
      </dd>
    </div>
  )
}
