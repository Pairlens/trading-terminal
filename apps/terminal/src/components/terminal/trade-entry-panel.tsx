// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { memo, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  MapPin,
  Settings2,
  Timer,
} from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import { Slider } from '@pairlens/ui/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@pairlens/ui/components/ui/tabs'
import { executeWorkflow } from '@pairlens/workflow-engine/executor'
import { checkWorkflowMarketCompat } from '@pairlens/workflow-engine/market-compat'
import { HoldToConfirmButton } from './hold-to-confirm-button'
import type { RefObject } from 'react'

import type { OrderExecutor } from '@pairlens/workflow-engine/types'
import type { BalanceRecord } from '@/stores/balances-store'
import { track } from '@/lib/analytics-events'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'

import { useMarketData } from '@/lib/market-data-provider'
import {
  useOptionalCandleData,
  useOptionalTickerData,
} from '@/lib/chart-terminal-context'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import {
  evaluatePositionSize,
  orderNotionalUsd,
} from '@/lib/risk/position-size'
import { usePaneWallet } from '@/lib/layout/pane-context'
import { isRegionExplicitlySet } from '@/lib/region-settings'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import {
  CREDENTIAL_SCHEMAS,
  useCredentialsStore,
} from '@/stores/credentials-store'
import { useWalletsStore } from '@/stores/wallets-store'
import {
  dexBalanceCredentialKey,
  getBalances,
  subscribeBalances,
} from '@/stores/balances-store'
import { upsertOrderEvent } from '@/stores/order-events-store'
import { useWorkflowStore } from '@/stores/workflow-store'
import { useWorkflowRunStore } from '@/stores/workflow-run-store'
import { showLiveWorkflowToast } from '@/components/workflows/workflow-execution-toast'

// ── Trade toast ───────────────────────────────────────────────────────

type TradeToastProps = {
  side: 'buy' | 'sell'
  orderType: 'market' | 'limit'
  size: string
  sizeAsset: string
  pairKey: string
  market: string
  price?: string
}

function TradeToast({
  side,
  orderType,
  size,
  sizeAsset,
  pairKey,
  market,
  price,
}: TradeToastProps) {
  const isBuy = side === 'buy'
  const isLimit = orderType === 'limit'
  const Icon = isLimit ? Timer : isBuy ? ArrowUpRight : ArrowDownRight
  const base = pairKey.split('-')[0] ?? ''
  const quote = pairKey.split('-')[1] ?? ''
  const accentVar = isBuy ? '--up' : '--down'

  const formattedSize = (() => {
    const n = Number(size)
    if (!Number.isFinite(n)) return size
    if (n >= 1_000)
      return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
    if (Number.isInteger(n)) return n.toLocaleString()
    if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, '')
    if (n > 0) return n.toPrecision(4).replace(/\.?0+$/, '')
    return size
  })()

  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0, y: 10 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', bounce: 0.4, duration: 0.6 }}
      className="flex w-80 items-center gap-3 rounded-xl border bg-popover px-4 py-3 text-popover-foreground shadow-lg"
      style={{
        borderColor: `color-mix(in oklch, var(${accentVar}) 40%, transparent)`,
      }}
    >
      {/* Pair logo */}
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.1, type: 'spring', bounce: 0.5 }}
        className="shrink-0"
      >
        <PairLogo base={base} quote={quote} size="sm" />
      </motion.div>

      {/* Left: pair identity + action */}
      <div className="min-w-0 flex-1">
        <motion.div
          initial={{ x: -8, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="flex items-center gap-1.5"
        >
          <Icon className="size-3.5" style={{ color: `var(${accentVar})` }} />
          <span
            className="text-xs font-bold uppercase tracking-wide"
            style={{ color: `var(${accentVar})` }}
          >
            {isLimit
              ? isBuy
                ? 'Limit Buy'
                : 'Limit Sell'
              : isBuy
                ? 'Bought'
                : 'Sold'}
          </span>
        </motion.div>

        <motion.div
          initial={{ x: -8, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-0.5 flex items-center gap-1.5"
        >
          <PairSymbol symbol={pairKey} className="text-xs" />
          <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
            {market}
          </span>
        </motion.div>

        {isLimit && price && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 0.35 }}
            className="mt-0.5 font-mono text-[10px] text-muted-foreground"
          >
            @ {price} {quote}
          </motion.p>
        )}
      </div>

      {/* Right: amount */}
      <motion.div
        initial={{ opacity: 0, x: 8 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="shrink-0 text-right"
      >
        <p className="font-mono text-base font-bold leading-tight">
          {formattedSize}
        </p>
        <p className="font-mono text-[10px] text-muted-foreground">
          {sizeAsset}
        </p>
      </motion.div>
    </motion.div>
  )
}

function showTradeToast(opts: TradeToastProps) {
  toast.custom(
    (id) => (
      <div onClick={() => toast.dismiss(id)} className="cursor-pointer">
        <TradeToast {...opts} />
      </div>
    ),
    { duration: 5000 },
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

function useBalanceMap(credentialId?: string): Map<string, BalanceRecord> {
  const balances = useSyncExternalStore(subscribeBalances, getBalances)
  const map = new Map<string, BalanceRecord>()
  for (const b of balances) {
    if (credentialId && b.credentialId !== credentialId) continue
    map.set(b.currency, b)
  }
  return map
}

function computeSellSize(available: string, pct: number): string {
  const n = parseFloat(available) * (pct / 100)
  if (!Number.isFinite(n) || n <= 0) return ''
  return n.toFixed(8).replace(/\.?0+$/, '')
}

function formatAvailable(v: string): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000)
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  if (n > 0) return n.toPrecision(4)
  return '0'
}

// ── Preset Config Dialog ──────────────────────────────────────────────

function PresetsConfigDialog({
  presets,
  onChange,
  open,
  onOpenChange,
  quoteAsset,
}: {
  presets: Array<number>
  onChange: (presets: Array<number>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  quoteAsset: string
}) {
  const [draft, setDraft] = useState<Array<string>>([])

  useEffect(() => {
    if (open) setDraft(presets.map(String))
  }, [open, presets])

  const updateSlot = (i: number, v: string) => {
    setDraft((prev) => prev.map((s, j) => (j === i ? v : s)))
  }

  const addSlot = () => setDraft((prev) => [...prev, ''])
  const removeSlot = (i: number) =>
    setDraft((prev) => prev.filter((_, j) => j !== i))

  const handleSave = () => {
    const parsed = draft.map(Number).filter((n) => Number.isFinite(n) && n > 0)
    if (parsed.length === 0) return
    onChange(parsed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Amount Presets ({quoteAsset})</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {draft.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="number"
                className="h-7 flex-1 font-mono text-xs"
                value={v}
                onChange={(e) => updateSlot(i, e.target.value)}
                placeholder="0"
              />
              {draft.length > 1 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => removeSlot(i)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {draft.length < 6 && (
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={addSlot}
            >
              + Add preset
            </button>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Trade Entry Panel ─────────────────────────────────────────────────

export type LivePrices = {
  latestPrice: number | undefined
  bestBid: number | null
  bestAsk: number | null
}

type TradeEntryPanelProps = {
  market: string
  pairKey: string
  /**
   * Latest prices via a stable ref instead of props — ticker/candle data
   * updates several times per second, and passing it as props would
   * re-render this whole form on every tick. Submit handlers read fresh
   * values from the ref at call time.
   */
  pricesRef: RefObject<LivePrices>
}

export const TradeEntryPanel = memo(function TradeEntryPanel({
  market,
  pairKey,
  pricesRef,
}: TradeEntryPanelProps) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'workflow'>(
    'market',
  )
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(
    null,
  )
  const [sizeCcy, setSizeCcy] = usePersistedState<'base' | 'quote'>(
    'trade:sizeCcy',
    'quote',
  )
  const [size, setSize] = useState('')
  const [limitPrice, setLimitPrice] = useState('')
  const [sellPct, setSellPct] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [presetsConfigOpen, setPresetsConfigOpen] = useState(false)
  const [regionHintDismissed, setRegionHintDismissed] = useState(false)

  const baseAsset = pairKey.split('-')[0] ?? pairKey
  const quoteAsset = pairKey.split('-')[1] ?? 'USDT'

  const [presets, setPresets] = usePersistedState<Array<number>>(
    `trade:presets:${quoteAsset}`,
    [10, 25, 50, 100],
  )

  const {
    placeOrder,
    status: mdStatus,
    availableMarkets,
    refreshWalletBalances,
  } = useMarketData()
  const wallet = usePaneWallet()
  const credentials = useCredentialsStore((s) => s.credentials)
  const loaded = useCredentialsStore((s) => s.loaded)
  const load = useCredentialsStore((s) => s.load)
  const cryptoWallets = useWalletsStore((s) => s.wallets)
  const walletsLoaded = useWalletsStore((s) => s.loaded)
  const loadWallets = useWalletsStore((s) => s.load)
  const wfWorkflows = useWorkflowStore((s) => s.workflows)
  const wfLoad = useWorkflowStore((s) => s.load)

  // DEX markets trade from a crypto wallet (on-chain swaps); CEX markets
  // trade from exchange API credentials.
  const marketInfo = availableMarkets.find((m) => m.marketId === market)
  const isDex = marketInfo?.walletChain != null
  // Resting limit orders (Jupiter Trigger / KyberSwap LO) where supported
  const dexSupportsLimit = isDex && marketInfo?.dexLimitOrders === true

  // Steps in the selected workflow this venue cannot execute (e.g. a
  // stop-loss on an exchange without native trigger orders). Blocks
  // submission — running would place some orders and then fail mid-flow.
  const workflowCompatIssues = useMemo(() => {
    if (orderType !== 'workflow' || !selectedWorkflowId || !marketInfo)
      return []
    const workflow = wfWorkflows.find((w) => w.id === selectedWorkflowId)
    if (!workflow) return []
    return checkWorkflowMarketCompat(workflow, marketInfo)
  }, [orderType, selectedWorkflowId, wfWorkflows, marketInfo])

  useEffect(() => {
    load()
    loadWallets()
    wfLoad()
  }, [load, loadWallets, wfLoad])

  const marketCreds = credentials.filter((c) => c.market === market)
  const selectedCred =
    wallet && !isDex
      ? marketCreds.find((c) => c.id === wallet.walletId)
      : undefined
  const selectedWallet =
    wallet && isDex
      ? cryptoWallets.find((w) => w.id === wallet.walletId)
      : undefined

  const balanceMap = useBalanceMap(
    isDex
      ? wallet
        ? dexBalanceCredentialKey(wallet.walletId, market)
        : undefined
      : wallet?.walletId,
  )

  const [slippageBps, setSlippageBps] = usePersistedState<number>(
    'trade:slippageBps',
    100,
  )

  // DEX venues support market swaps and (where the venue offers it) resting
  // limit orders — never workflows.
  useEffect(() => {
    if (!isDex) return
    if (
      orderType === 'workflow' ||
      (orderType === 'limit' && !dexSupportsLimit)
    ) {
      setOrderType('market')
    }
  }, [isDex, dexSupportsLimit, orderType])

  // Keep on-chain balances fresh for the pair on screen (covers the sell
  // side's Avail display for tokens outside the default scan set)
  const selectedWalletId = selectedWallet?.id
  useEffect(() => {
    if (!isDex || !selectedWalletId) return
    refreshWalletBalances(market, selectedWalletId, pairKey)
  }, [isDex, selectedWalletId, market, pairKey, refreshWalletBalances])

  // Portfolio value + per-asset USD prices, for the maxPositionSize guard.
  const { totalValueUsd, priceUsd } = usePortfolioValue(selectedCred?.id)

  const exchangeLabel =
    CREDENTIAL_SCHEMAS[market]?.label ?? market.toUpperCase()
  const showRegionHint =
    !regionHintDismissed && marketCreds.length > 0 && !isRegionExplicitlySet()

  const sizeAsset = sizeCcy === 'base' ? baseAsset : quoteAsset
  const availableBase = balanceMap.get(baseAsset)?.total ?? '0'
  const availableQuote = balanceMap.get(quoteAsset)?.total ?? '0'
  const availableDisplay =
    side === 'sell'
      ? `${formatAvailable(availableBase)} ${baseAsset}`
      : `${formatAvailable(availableQuote)} ${quoteAsset}`

  const canSubmit =
    (isDex ? selectedWallet : selectedCred) &&
    mdStatus === 'connected' &&
    !submitting &&
    Number(size) > 0 &&
    (orderType === 'market' ||
      (orderType === 'limit' && Number(limitPrice) > 0) ||
      (orderType === 'workflow' &&
        selectedWorkflowId !== null &&
        workflowCompatIssues.length === 0))

  // Live funds (DEX swaps are always on-chain; CEX honors the credential mode)
  // get a longer hold + an explicit "funds commit" note.
  const isLiveOrder = isDex || selectedCred?.mode === 'live'

  const handleSideChange = (newSide: 'buy' | 'sell') => {
    setSide(newSide)
    setSellPct(0)
  }

  const handleSellPctChange = (pct: number) => {
    setSellPct(pct)
    setSize(computeSellSize(availableBase, pct))
    setSizeCcy('base')
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    // ── DEX path: on-chain swap / resting limit order from a wallet ──
    if (isDex) {
      if (!selectedWallet) return
      setSubmitting(true)
      try {
        if (orderType === 'limit') {
          // Limit orders are denominated in the BASE token at the limit
          // price (the connector escrows the matching input leg).
          const baseSize =
            sizeCcy === 'quote'
              ? (Number(size) / Number(limitPrice)).toFixed(8)
              : String(size)

          const result = await placeOrder({
            market,
            pair: pairKey,
            side,
            type: 'limit',
            size: baseSize,
            price: String(limitPrice),
            walletId: selectedWallet.id,
            mode: 'live',
          })

          if (result.success) {
            upsertOrderEvent({
              orderId: result.orderId ?? crypto.randomUUID(),
              market,
              pair: pairKey,
              side,
              type: 'limit',
              size: baseSize,
              price: String(limitPrice),
              fillSize: '0',
              avgPrice: '0',
              mode: 'live',
              status: 'live',
              fee: '0',
              feeCcy: '',
              ts: Date.now(),
            })
            showTradeToast({
              side,
              orderType: 'limit',
              size,
              sizeAsset,
              pairKey,
              market,
              price: limitPrice,
            })
            setSize('')
            setSellPct(0)
            refreshWalletBalances(market, selectedWallet.id, pairKey)
          } else {
            toast.error('Limit order failed', {
              description: result.error ?? 'Unknown error',
            })
          }
          return
        }

        // DEX connectors interpret market-swap size as the INPUT-token
        // amount: a buy spends the quote token, a sell spends the base
        // token. Convert if the form is denominated in the other leg.
        const price = pricesRef.current.latestPrice
        let orderSize = String(size)
        if (side === 'buy' && sizeCcy === 'base') {
          if (!price) throw new Error('No live price to convert base amount')
          orderSize = (Number(size) * price).toFixed(8)
        } else if (side === 'sell' && sizeCcy === 'quote') {
          if (!price) throw new Error('No live price to convert quote amount')
          orderSize = (Number(size) / price).toFixed(8)
        }

        const result = await placeOrder({
          market,
          pair: pairKey,
          side,
          type: 'market',
          size: orderSize,
          walletId: selectedWallet.id,
          slippageBps,
          mode: 'live',
        })

        if (result.success) {
          // Swaps fill atomically — journal the trade locally (there is no
          // exchange order stream to echo it back).
          const fillPrice = price ?? 0
          const baseFill =
            side === 'buy'
              ? fillPrice > 0
                ? Number(orderSize) / fillPrice
                : 0
              : Number(orderSize)
          upsertOrderEvent({
            orderId: result.orderId ?? crypto.randomUUID(),
            market,
            pair: pairKey,
            side,
            type: 'market',
            size: baseFill.toFixed(8),
            price: String(fillPrice),
            fillSize: baseFill.toFixed(8),
            avgPrice: String(fillPrice),
            mode: 'live',
            status: 'filled',
            fee: '0',
            feeCcy: '',
            ts: Date.now(),
          })
          showTradeToast({
            side,
            orderType: 'market',
            size,
            sizeAsset,
            pairKey,
            market,
          })
          setSize('')
          setSellPct(0)
          refreshWalletBalances(market, selectedWallet.id, pairKey)
        } else {
          toast.error('Swap failed', {
            description: result.error ?? 'Unknown error',
          })
        }
      } catch (err) {
        toast.error('Swap failed', { description: String(err) })
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (!selectedCred) return
    setSubmitting(true)
    try {
      if (orderType === 'workflow') {
        // Workflow execution
        const workflow = wfWorkflows.find((w) => w.id === selectedWorkflowId)
        if (!workflow) {
          throw new Error('Workflow not found')
        }

        // Safety net behind the disabled submit button: never start a run
        // whose steps this venue cannot execute.
        if (marketInfo) {
          const compatIssues = checkWorkflowMarketCompat(workflow, marketInfo)
          if (compatIssues.length > 0) {
            toast.error('Workflow not supported on this market', {
              description: compatIssues
                .map((i) => `${i.stepLabel}: ${i.reason}`)
                .join(' · '),
            })
            return
          }
        }

        // Build OrderExecutor from plugin manager
        const orderExecutor: OrderExecutor = {
          placeMarketOrder: async (params) => {
            const r = await placeOrder({
              market: params.market,
              pair: params.pair,
              side: params.side,
              type: 'market',
              size: params.size,
              tgtCcy: params.tgtCcy ?? 'base_ccy',
              credentialId: selectedCred.id,
              analyticsSource: 'workflow',
            })
            return r
          },
          placeLimitOrder: async (params) => {
            const r = await placeOrder({
              market: params.market,
              pair: params.pair,
              side: params.side,
              type: 'limit',
              size: params.size,
              price: params.price,
              credentialId: selectedCred.id,
              analyticsSource: 'workflow',
            })
            return r
          },
          placeConditionalOrder: async (params) => {
            // Connectors advertising triggerOrders place a real exchange-
            // native trigger order that rests on the venue and activates at
            // the trigger price (market or limit execution).
            if (marketInfo?.triggerOrders) {
              const r = await placeOrder({
                market: params.market,
                pair: params.pair,
                side: params.side,
                type: params.orderType,
                size: params.size,
                price:
                  params.orderType === 'limit' ? params.limitPrice : undefined,
                trigger: {
                  triggerPrice: params.triggerPrice,
                  triggerType: params.triggerType,
                },
                credentialId: selectedCred.id,
                analyticsSource: 'workflow',
              })
              return r
            }

            // Fallback for venues without native trigger orders. A
            // take-profit is safely representable as a resting limit order
            // (exit price is on the far side of the market, so it rests
            // until the trigger level trades). A stop-loss is NOT — a limit
            // at a below-market trigger fills immediately at market price,
            // which is the opposite of what the user asked for. Fail it
            // loudly instead of silently placing the wrong order.
            if (params.triggerType === 'sl') {
              return {
                success: false,
                error:
                  'Stop-loss needs exchange-native trigger orders, which this connector does not support — no order was placed',
              }
            }
            const r = await placeOrder({
              market: params.market,
              pair: params.pair,
              side: params.side,
              type: 'limit',
              size: params.size,
              price: params.limitPrice ?? params.triggerPrice,
              credentialId: selectedCred.id,
              analyticsSource: 'workflow',
            })
            return r
          },
          getCurrentPrice: async () => pricesRef.current.latestPrice ?? 0,
        }

        // Show live toast immediately, feed it progress as steps execute
        const { onStepComplete, onComplete } = showLiveWorkflowToast(
          workflow.name,
        )

        const result = await executeWorkflow(
          workflow,
          {
            workflowId: workflow.id,
            market,
            pair: pairKey,
            side,
            amount: size,
            tgtCcy: sizeCcy === 'base' ? 'base_ccy' : 'quote_ccy',
            mode: selectedCred.mode ?? 'paper',
          },
          orderExecutor,
          { onStepComplete },
        )

        onComplete(result)
        track('workflow_run_completed', {
          status: result.status,
          step_count: result.results.length,
        })
        useWorkflowRunStore.getState().record({
          timestamp: Date.now(),
          pair: pairKey,
          market,
          mode: selectedCred.mode ?? 'paper',
          result,
        })
        setSize('')
        setSellPct(0)
      } else {
        // ── maxPositionSize guard (single order as a % of portfolio) ──
        const risk = useRiskConfigStore.getState()
        if (risk.maxPositionSize > 0 && risk.positionSizeAction !== 'off') {
          const refPrice =
            orderType === 'limit'
              ? Number(limitPrice)
              : (pricesRef.current.latestPrice ?? null)
          const notionalUsd = orderNotionalUsd(
            {
              pair: pairKey,
              size: Number(size),
              quoteDenominated: sizeCcy === 'quote',
              price: refPrice,
            },
            priceUsd,
          )
          const { exceeds, ratioPct } = evaluatePositionSize(
            notionalUsd,
            totalValueUsd,
            risk.maxPositionSize,
          )
          if (exceeds) {
            const blocks =
              risk.positionSizeAction === 'block_all' ||
              (risk.positionSizeAction === 'block_buys' && side === 'buy')
            if (blocks) {
              toast.error('Order blocked by risk limit', {
                description: `Position is ${ratioPct.toFixed(1)}% of portfolio, over your ${risk.maxPositionSize}% max. Adjust in Settings › Risk.`,
              })
              return
            }
            toast.warning(
              `Large position: ${ratioPct.toFixed(1)}% of portfolio (max ${risk.maxPositionSize}%)`,
            )
          }
        }

        // Standard Market/Limit order
        let orderSize = String(size)
        let tgtCcy: string | undefined =
          sizeCcy === 'base' ? 'base_ccy' : 'quote_ccy'

        if (orderType === 'limit') {
          tgtCcy = undefined
          if (sizeCcy === 'quote' && Number(limitPrice) > 0) {
            orderSize = (Number(size) / Number(limitPrice)).toFixed(8)
          }
        }

        const result = await placeOrder({
          market,
          pair: pairKey,
          side,
          type: orderType,
          size: orderSize,
          credentialId: selectedCred.id,
          ...(tgtCcy ? { tgtCcy } : {}),
          ...(orderType === 'limit' ? { price: String(limitPrice) } : {}),
        })

        if (result.success) {
          showTradeToast({
            side,
            orderType,
            size,
            sizeAsset,
            pairKey,
            market,
            price: orderType === 'limit' ? limitPrice : undefined,
          })
          setSize('')
          setSellPct(0)
        } else {
          toast.error('Order rejected', {
            description: result.error ?? 'Unknown error',
          })
        }
      }
    } catch (err) {
      toast.error('Order failed', { description: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  const modeBadge = isDex ? (
    <Badge
      variant="outline"
      className="h-4 border-primary/30 bg-primary/10 px-1.5 font-mono text-[10px] tracking-[.08em] text-primary"
    >
      ON-CHAIN
    </Badge>
  ) : selectedCred?.mode === 'paper' ? (
    <Badge
      variant="outline"
      className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 font-mono text-[10px] tracking-[.08em] text-amber-700 dark:text-amber-300"
    >
      PAPER
    </Badge>
  ) : null

  return (
    <div className="flex shrink-0 flex-col">
      <div className="flex flex-col gap-2.5 p-2.5">
        {/* Wallet status */}
        {isDex
          ? walletsLoaded &&
            !selectedWallet && (
              <Link
                to="/accounts"
                className="text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {cryptoWallets.some((w) => w.chain === marketInfo?.walletChain)
                  ? 'Select wallet in top bar →'
                  : `Connect ${marketInfo?.walletChain ?? 'crypto'} wallet →`}
              </Link>
            )
          : loaded &&
            !selectedCred && (
              <Link
                to="/accounts"
                className="text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {marketCreds.length === 0
                  ? `Connect ${exchangeLabel} account →`
                  : 'Select account in top bar →'}
              </Link>
            )}

        {showRegionHint && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            <MapPin className="mt-0.5 size-3 shrink-0" />
            <span>
              Region defaulting to Global.{' '}
              <button
                type="button"
                className="underline"
                onClick={() => useSettingsDialogStore.getState().open('region')}
              >
                Set your region
              </button>
            </span>
            <button
              type="button"
              className="ml-auto shrink-0 opacity-70 hover:opacity-100"
              onClick={() => setRegionHintDismissed(true)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Buy / Sell toggle */}
        <div className="flex gap-1 rounded-xl bg-secondary p-1">
          <button
            type="button"
            className={cn(
              'flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors',
              side === 'buy'
                ? 'text-up'
                : 'bg-transparent text-muted-foreground hover:text-foreground',
            )}
            style={
              side === 'buy'
                ? {
                    backgroundColor:
                      'color-mix(in oklch, var(--up) 18%, transparent)',
                    boxShadow:
                      'inset 0 0 0 1px color-mix(in oklch, var(--up) 40%, transparent)',
                  }
                : undefined
            }
            onClick={() => handleSideChange('buy')}
          >
            Buy
          </button>
          <button
            type="button"
            className={cn(
              'flex-1 rounded-lg py-1.5 text-sm font-semibold transition-colors',
              side === 'sell'
                ? 'text-down'
                : 'bg-transparent text-muted-foreground hover:text-foreground',
            )}
            style={
              side === 'sell'
                ? {
                    backgroundColor:
                      'color-mix(in oklch, var(--down) 18%, transparent)',
                    boxShadow:
                      'inset 0 0 0 1px color-mix(in oklch, var(--down) 40%, transparent)',
                  }
                : undefined
            }
            onClick={() => handleSideChange('sell')}
          >
            Sell
          </button>
        </div>

        {/* Order type tabs — DEX venues get Market + Limit (when the venue
            supports resting orders); CEX venues additionally get Workflow */}
        {(!isDex || dexSupportsLimit) && (
          <Tabs
            value={orderType}
            onValueChange={(v) =>
              setOrderType(v as 'market' | 'limit' | 'workflow')
            }
          >
            <TabsList className="h-8 w-full rounded-xl bg-secondary">
              <TabsTrigger value="market" className="flex-1 rounded-lg text-xs">
                Market
              </TabsTrigger>
              <TabsTrigger value="limit" className="flex-1 rounded-lg text-xs">
                Limit
              </TabsTrigger>
              {!isDex && (
                <TabsTrigger
                  value="workflow"
                  className="flex-1 rounded-lg text-xs"
                >
                  Workflow
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        )}

        {/* Workflow selector */}
        {orderType === 'workflow' && (
          <div className="space-y-1">
            <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
              Workflow
            </span>
            {wfWorkflows.length === 0 ? (
              <Link
                to="/workflows"
                className="block text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Create your first workflow →
              </Link>
            ) : (
              <>
                <select
                  className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs"
                  value={selectedWorkflowId ?? ''}
                  onChange={(e) =>
                    setSelectedWorkflowId(e.target.value || null)
                  }
                >
                  <option value="">Select a workflow</option>
                  {wfWorkflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name}
                    </option>
                  ))}
                </select>
                {workflowCompatIssues.length > 0 && (
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="size-3 shrink-0" />
                      Not supported on {marketInfo?.displayName ?? market}
                    </div>
                    <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-600/90 dark:text-amber-400/90">
                      {workflowCompatIssues.map((issue) => (
                        <li key={issue.stepId}>
                          {issue.stepLabel} — {issue.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link
                  to="/workflows"
                  className="block text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Edit workflows →
                </Link>
              </>
            )}
          </div>
        )}

        {/* Amount input */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
              Amount
            </span>
            <button
              type="button"
              onClick={() =>
                setSizeCcy((c) => (c === 'base' ? 'quote' : 'base'))
              }
              className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground hover:bg-accent transition-colors"
            >
              {sizeAsset}
            </button>
          </div>
          <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
            Avail: {availableDisplay}
          </div>
          <Input
            type="number"
            placeholder="0.00"
            className="h-8 rounded-lg font-mono text-sm tabular-nums"
            value={size}
            onChange={(e) => {
              setSize(e.target.value)
              setSellPct(0)
            }}
          />
        </div>

        {/* Preset row (buy mode or quote-denominated sell) */}
        {(side === 'buy' || sizeCcy === 'quote') && (
          <div className="flex items-center gap-1">
            {presets.map((p) => (
              <button
                key={p}
                type="button"
                className={cn(
                  'flex-1 rounded-md border px-1 py-1 font-mono text-[11.5px] tabular-nums transition-colors',
                  size === String(p)
                    ? 'border-primary text-foreground'
                    : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
                )}
                style={
                  size === String(p)
                    ? {
                        backgroundColor:
                          'color-mix(in oklch, var(--primary) 14%, transparent)',
                      }
                    : undefined
                }
                onClick={() => setSize(String(p))}
              >
                {p}
              </button>
            ))}
            <button
              type="button"
              className="ml-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setPresetsConfigOpen(true)}
            >
              <Settings2 className="size-3" />
            </button>
          </div>
        )}

        {/* Sell % slider */}
        {side === 'sell' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
                Sell
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {sellPct}%
              </span>
            </div>
            <Slider
              value={[sellPct]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) =>
                handleSellPctChange(Array.isArray(v) ? (v[0] ?? 0) : v)
              }
              className="[&_[data-slot=slider-range]]:bg-[var(--down)] [&_[data-slot=slider-thumb]]:border-[color:color-mix(in_oklch,var(--down)_60%,transparent)]"
            />
            <div className="flex gap-1">
              {[25, 50, 75, 100].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  className={cn(
                    'flex-1 rounded-md border px-1 py-0.5 font-mono text-[11.5px] tabular-nums transition-colors',
                    sellPct === pct
                      ? 'border-down text-down'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                  style={
                    sellPct === pct
                      ? {
                          backgroundColor:
                            'color-mix(in oklch, var(--down) 12%, transparent)',
                        }
                      : undefined
                  }
                  onClick={() => handleSellPctChange(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Slippage tolerance (DEX market swaps only — limit orders fill
            at the resting price) */}
        {isDex && orderType === 'market' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
                Slippage
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {(slippageBps / 100).toFixed(slippageBps % 100 === 0 ? 0 : 1)}%
              </span>
            </div>
            <div className="flex gap-1">
              {[10, 50, 100, 300].map((bps) => (
                <button
                  key={bps}
                  type="button"
                  className={cn(
                    'flex-1 rounded-md border px-1 py-0.5 font-mono text-[11.5px] tabular-nums transition-colors',
                    slippageBps === bps
                      ? 'border-primary text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                  style={
                    slippageBps === bps
                      ? {
                          backgroundColor:
                            'color-mix(in oklch, var(--primary) 14%, transparent)',
                        }
                      : undefined
                  }
                  onClick={() => setSlippageBps(bps)}
                >
                  {bps / 100}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Limit price (only for limit orders) */}
        {orderType === 'limit' && (
          <LimitPriceField
            side={side}
            value={limitPrice}
            onChange={setLimitPrice}
            pricesRef={pricesRef}
          />
        )}

        {/* Submit — press & hold to commit. Conveys the criticality of the
            moment (a fuller hold for live funds); the toast is the confirmation. */}
        <HoldToConfirmButton
          side={side === 'buy' ? 'buy' : 'sell'}
          disabled={!canSubmit}
          busy={submitting}
          busyLabel="Submitting…"
          holdMs={isLiveOrder ? 720 : 480}
          hint={
            orderType === 'workflow'
              ? 'Press & hold to run'
              : isLiveOrder
                ? 'Press & hold to confirm · funds commit immediately'
                : 'Press & hold to place'
          }
          onConfirm={handleSubmit}
          label={
            <span className="flex items-center gap-1.5">
              {orderType === 'workflow'
                ? 'Run Workflow'
                : `${side === 'buy' ? 'Buy' : 'Sell'} ${baseAsset}`}
              {modeBadge}
            </span>
          }
        />
      </div>

      {/* Presets config dialog */}
      <PresetsConfigDialog
        presets={presets}
        onChange={setPresets}
        open={presetsConfigOpen}
        onOpenChange={setPresetsConfigOpen}
        quoteAsset={quoteAsset}
      />
    </div>
  )
})

// ── Limit price field ─────────────────────────────────────────────────
//
// Subscribes to the per-tick stream contexts itself so the live placeholder
// (best ask/bid) stays fresh without re-rendering the whole panel. Only
// mounted while the limit order type is selected.
function LimitPriceField({
  side,
  value,
  onChange,
  pricesRef,
}: {
  side: 'buy' | 'sell'
  value: string
  onChange: (value: string) => void
  pricesRef: RefObject<LivePrices>
}) {
  const tickerData = useOptionalTickerData()
  const candleData = useOptionalCandleData()
  const bestBid = tickerData?.bestBid ?? pricesRef.current.bestBid
  const bestAsk = tickerData?.bestAsk ?? pricesRef.current.bestAsk
  const latestPrice =
    candleData?.latestCandle?.close ?? pricesRef.current.latestPrice

  return (
    <div className="space-y-1">
      <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
        Price
      </span>
      <Input
        type="number"
        placeholder={
          (side === 'buy'
            ? (bestAsk ?? latestPrice)
            : (bestBid ?? latestPrice)
          )?.toString() ?? '—'
        }
        className="h-8 rounded-lg font-mono text-sm tabular-nums"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}
