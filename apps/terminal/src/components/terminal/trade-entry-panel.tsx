// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from '@tanstack/react-router'
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
import { Switch } from '@pairlens/ui/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@pairlens/ui/components/ui/tabs'
import { executeWorkflow } from '@pairlens/workflow-engine/executor'
import { checkWorkflowMarketCompat } from '@pairlens/workflow-engine/market-compat'
import { isTokenAddress } from '@pairlens/shared/market-ref'
import { TradeConfirmButton } from './trade-confirm-button'
import { TradeConnectGate } from './trade-connect-gate'
import { FundingEntryRow } from './funding-entry-row'
import { PredictionOrderSummary } from './prediction-payout-card'
import { CHAIN_NAME } from './wallet-selector'
import type { RefObject } from 'react'

import type { OrderExecutor } from '@pairlens/workflow-engine/types'
import type { BalanceRecord } from '@/stores/balances-store'
import { OutcomeSwitch } from '@/components/predictions/outcome-switch'
import { track } from '@/lib/analytics-events'

import { splitPairAssets } from '@/lib/pairs'
import { tokenTicker } from '@/lib/dex/token-label'
import { useDisplayTokenByAddress } from '@/stores/token-directory-store'
import {
  formatAmount,
  formatPredictionPrice,
  formatPrice,
} from '@/lib/format-price'
import { useContractSize } from '@/lib/futures/contract-size'
import {
  balanceScopeFor,
  credentialsForMarket,
} from '@/lib/venues/credential-alias'
import {
  clampLeverage,
  contractsToBase,
  estimateLiquidationPrice,
  leveragePresets,
  perpNotional,
} from '@/lib/futures/ticket-math'
import {
  centsToPrice,
  clampPriceCents,
  contractsForAmount,
  normalizeContracts,
  predictionFillPrice,
  predictionSibling,
  priceToCents,
} from '@/lib/predictions/ticket-math'
import { formatResolutionDate } from '@/lib/format-time'
import { predictionCollateral } from '@/lib/predictions/collateral'
import { predictionQuestionOf } from '@/components/pair-picker/pair-picker-data'
import {
  registerPredictionOutcome,
  usePredictionDirectoryStore,
  usePredictionOutcome,
} from '@/stores/prediction-directory-store'
import { PairLogo, PairSymbol } from '@/components/pair-picker/pair-avatar'

import { useMarketData } from '@/lib/market-data-provider'
import {
  useOptionalCandleData,
  useOptionalTickerData,
} from '@/lib/chart-terminal-context'
import { liveQuotePrice } from '@/lib/live-price'
import { useRiskConfigStore } from '@/stores/risk-config-store'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import {
  evaluatePositionSize,
  orderNotionalUsd,
} from '@/lib/risk/position-size'
import { usePaneWallet } from '@/lib/layout/pane-context'
import { isRegionExplicitlySet } from '@/lib/region-settings'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { useEquitySessionPhase } from '@/hooks/use-equity-session'
import { useTradeConfirmMode } from '@/hooks/use-trade-confirm'
import { tradeHoldMs } from '@/lib/settings/trade-confirm'
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
import { requireUnlockForTrade } from '@/lib/security/lock-store'
import { VaultUnlockDialog } from '@/components/security/vault-unlock-dialog'
import i18n from '@/lib/i18n'
import { stepCompatReason, stepTypeLabelById } from '@/lib/registry-labels'
import { chartLinkProps } from '@/lib/market-ref/link'

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
  const { t } = useTranslation()
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
                ? t('terminal.trade.limitBuy')
                : t('terminal.trade.limitSell')
              : isBuy
                ? t('terminal.trade.bought')
                : t('terminal.trade.sold')}
          </span>
        </motion.div>

        <motion.div
          initial={{ x: -8, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mt-0.5 flex min-w-0 items-center gap-1.5"
        >
          <PairSymbol symbol={pairKey} className="min-w-0 text-xs" />
          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase text-muted-foreground">
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
  const balances = useSyncExternalStore(
    subscribeBalances,
    getBalances,
    getBalances,
  )
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
  const { t } = useTranslation()
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
          <DialogTitle>
            {t('terminal.trade.presetsTitle', { quote: quoteAsset })}
          </DialogTitle>
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
              + {t('terminal.trade.addPreset')}
            </button>
          )}
        </div>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={handleSave}>
            {t('common.save')}
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
  const { t } = useTranslation()
  const navigate = useNavigate()
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
  const [unlockOpen, setUnlockOpen] = useState(false)

  const [, setAssetClassMap] = usePersistedState<Record<string, string>>(
    'pair-picker.assetClassMap',
    {},
  )

  const {
    placeOrder,
    placeUnattendedOrder,
    status: mdStatus,
    availableMarkets,
    refreshWalletBalances,
  } = useMarketData()
  const wallet = usePaneWallet()
  const credentials = useCredentialsStore((s) => s.credentials)
  const loaded = useCredentialsStore((s) => s.loaded)
  // A sealed vault empties the store because it could not read, not because
  // there is nothing there — so "Connect account" would send a user who
  // already has keys off to enter them a second time.
  const credentialsSealed = useCredentialsStore((s) => s.sealed)
  const load = useCredentialsStore((s) => s.load)
  const cryptoWallets = useWalletsStore((s) => s.wallets)
  const walletsLoaded = useWalletsStore((s) => s.loaded)
  const walletsSealed = useWalletsStore((s) => s.sealed)
  const loadWallets = useWalletsStore((s) => s.load)
  const wfWorkflows = useWorkflowStore((s) => s.workflows)
  const wfLoad = useWorkflowStore((s) => s.load)

  // DEX markets trade from a crypto wallet (on-chain swaps); CEX markets
  // trade from exchange API credentials.
  const marketInfo = availableMarkets.find((m) => m.marketId === market)
  // Polymarket is BOTH: it signs with an EVM key AND it is an event exchange.
  // Only the first half is a DEX question, so the two are separate flags —
  // `usesWallet` gates which credential store this ticket reads, `isDex` gates
  // the swap paths (slippage, input-leg sizing, on-chain journaling). Reading
  // one for the other is what would have sent a contract order down a swap.
  const isPrediction = marketInfo?.assetClasses.includes('prediction') ?? false
  const usesWallet = marketInfo?.walletChain != null
  const isDex = usesWallet && !isPrediction
  // Resting limit orders (Jupiter Trigger / KyberSwap LO) where supported
  const dexSupportsLimit = isDex && marketInfo?.dexLimitOrders === true
  // Equities trade on a session clock, which crypto does not. Read off the
  // connector's declared asset classes rather than a venue allowlist, so a
  // second stock broker inherits the session controls for free.
  const isEquities = marketInfo?.assetClasses?.includes('stocks') === true
  // Perpetual futures. Independent of every flag above: a perp venue is a CEX
  // that takes API keys (so `usesWallet` stays false and the credential path
  // is unchanged), it is not a swap, not an event contract and not an equity.
  // What it adds is leverage, a reduce-only intent, and a size denominated in
  // contracts rather than in the base asset.
  const isPerp = marketInfo?.assetClasses.includes('crypto-perp') ?? false
  const maxLeverage = marketInfo?.maxLeverage ?? 1

  // Derived here rather than beside the other pair state above, because a
  // stock's key is the bare ticker and its quote can only come from the venue.
  const { base: baseAsset, quote: quoteAsset } = splitPairAssets(pairKey, {
    equity: isEquities,
  })

  // What the ticket CALLS the base asset, which on a DEX pair is not what it
  // is keyed by: the leg is a contract address, and `Sell 0xdac17f958d2ee52…`
  // above a size field is a ticket nobody can read. Display only — the balance
  // lookups below and everything in `OrderParams` keep the raw leg, because
  // the address is the identity and a ticker is hundreds of tokens.
  const basePin = useDisplayTokenByAddress(
    isTokenAddress(baseAsset) ? baseAsset : undefined,
    market,
  )
  const baseLabel = tokenTicker(baseAsset, basePin).label

  // Base units per contract, for the base-equivalent hint and the risk guard.
  // `known` is what decides whether the hint renders at all: on a venue whose
  // contract IS one unit of the base, restating the count would be noise.
  const { contractSize, known: contractSizeKnown } = useContractSize(
    market,
    pairKey,
  )
  const showBaseEquivalent = isPerp && contractSizeKnown && contractSize !== 1

  const [presets, setPresets] = usePersistedState<Array<number>>(
    `trade:presets:${quoteAsset}`,
    [10, 25, 50, 100],
  )
  // A separate slot rather than a swapped key: `usePersistedState` binds its
  // key at mount, and a prediction pair's "quote" is a date fragment
  // (`KXBTCD-26AUG15-T53`) that would name a nonsense preset bucket. Three
  // slots, not four: the fourth chip in the row is Max, which is a balance and
  // not a preset.
  const [predictionPresets, setPredictionPresets] = usePersistedState<
    Array<number>
  >('trade:presets:predictionUsd', [25, 50, 100])

  // ── Prediction identity ──
  // The pair key is a venue ticker; what it MEANS was pinned by the row that
  // opened it. Splitting it on '-' (which the spot path above does) would read
  // `KXBTCD-26AUG15-T53` as the pair KXBTCD/26AUG15.
  const pinnedOutcome = usePredictionOutcome(pairKey)
  const directoryEntries = usePredictionDirectoryStore((s) => s.outcomes)
  const outcomeLabel = pinnedOutcome?.outcome ?? ''
  const question = pinnedOutcome ? predictionQuestionOf(pinnedOutcome) : pairKey
  const resolvesAt = pinnedOutcome?.endMs
  const sibling = useMemo(
    () =>
      isPrediction
        ? predictionSibling(pairKey, market, directoryEntries)
        : null,
    [isPrediction, pairKey, market, directoryEntries],
  )
  // Kalshi takes no market order at all — every order carries a price. The
  // toggle is hidden rather than disabled: an order type this venue never
  // accepts is not a choice the user declined, it is one that does not exist.
  const limitOnly = isPrediction && marketInfo?.limitOnly === true

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

  // Alias-resolved: a futures venue signs with its spot sibling's key, so a
  // raw `c.market === market` filter finds nothing for `binance-futures` no
  // matter how many Binance keys are stored, and the connect gate below then
  // blurs a ticket for an account that is already connected.
  const marketCreds = credentialsForMarket(credentials, market)
  const selectedCred =
    wallet && !usesWallet
      ? marketCreds.find((c) => c.id === wallet.walletId)
      : undefined
  const selectedWallet =
    wallet && usesWallet
      ? cryptoWallets.find((w) => w.id === wallet.walletId)
      : undefined

  // Wallets that can sign for this venue. One EVM key covers every EVM chain,
  // so the match is on the chain, not the market.
  const chainWallets = usesWallet
    ? cryptoWallets.filter((w) => w.chain === marketInfo?.walletChain)
    : []

  // Nothing on this ticket can reach an order book: no API keys for the
  // exchange, no wallet for the chain, or a connector that only streams prices.
  // Blur it behind the connect gate rather than leaving a form that looks
  // perfectly live right up to the rejection.
  //
  // A sealed vault is excluded on purpose — the store is empty because it could
  // not be read, not because there is nothing in it, and "connect an account"
  // would send a user who already has keys off to enter them a second time.
  const needsConnect =
    marketInfo != null &&
    !(usesWallet ? walletsSealed : credentialsSealed) &&
    (usesWallet ? walletsLoaded : loaded) &&
    (!marketInfo.capabilities.includes('trade') ||
      (usesWallet ? chainWallets.length === 0 : marketCreds.length === 0))

  // Every wallet venue's balances are recorded under the namespaced key, not
  // the bare wallet id — the same wallet holds independent balances per venue.
  // An aliased venue is the same shape: one exchange key holds a spot balance
  // and a futures margin balance, and they are not the same number.
  const balanceMap = useBalanceMap(
    usesWallet
      ? wallet
        ? dexBalanceCredentialKey(wallet.walletId, market)
        : undefined
      : wallet
        ? balanceScopeFor(wallet.walletId, market)
        : undefined,
  )

  const [slippageBps, setSlippageBps] = usePersistedState<number>(
    'trade:slippageBps',
    100,
  )

  // Pre-market / after-hours routing for equities. Deliberately NOT persisted:
  // those sessions are thin, and a toggle left on from last night would send
  // tomorrow's order somewhere the trader stopped thinking about.
  const [extendedHours, setExtendedHours] = useState(false)
  // Only plain limit orders are eligible at the venue, so the flag cannot
  // survive a switch to Market or Workflow.
  const extendedHoursEligible = isEquities && orderType === 'limit'
  useEffect(() => {
    if (!extendedHoursEligible && extendedHours) setExtendedHours(false)
  }, [extendedHoursEligible, extendedHours])

  // Where the trading day is, from the broker's own calendar. Null on a crypto
  // venue, and null until the first read lands — neither of which may be read
  // as "the market is open".
  const sessionPhase = useEquitySessionPhase(isEquities)
  /**
   * Outside regular hours the venue accepts nothing but a limit order: those
   * sessions have no continuous auction to fill a market order against. The
   * ticket coerces the type and says why, rather than letting the trader
   * compose an order the venue will reject after they press Buy.
   */
  const outsideRegularHours =
    isEquities && sessionPhase !== null && sessionPhase !== 'rth'
  useEffect(() => {
    if (outsideRegularHours && orderType !== 'limit') setOrderType('limit')
  }, [outsideRegularHours, orderType])

  // Pre-market and after-hours default the routing ON: an order entered at
  // 07:40 is meant for the session the trader is looking at, and the previous
  // default queued it silently for the next open. Still one tap to clear, and
  // still never persisted — once the user has an opinion on this ticket, it is
  // theirs until the pair changes.
  const [extendedHoursTouched, setExtendedHoursTouched] = useState(false)
  useEffect(() => {
    setExtendedHoursTouched(false)
  }, [market, pairKey])
  useEffect(() => {
    if (extendedHoursTouched || !extendedHoursEligible) return
    if (sessionPhase === 'pre' || sessionPhase === 'post') {
      setExtendedHours(true)
    }
  }, [extendedHoursTouched, extendedHoursEligible, sessionPhase])

  // Leverage and reduce-only. Deliberately NOT persisted, for the reason
  // `extendedHours` is not: 25x left over from last night is a decision the
  // trader stopped thinking about, and a reduce-only flag carried onto a
  // market where nothing is open turns the next order into a rejection.
  const [leverage, setLeverage] = useState(1)
  // Whether the user MOVED the selector on this market and pair. Leverage is
  // account state at the venue, not an order field: sending the ticket's
  // default 1x would quietly rewrite a 20x symbol the trader set up elsewhere,
  // and would do it on orders that are only closing a position. So it rides
  // only on a deliberate choice, and never on a reduce-only order.
  const [leverageDirty, setLeverageDirty] = useState(false)
  const [reduceOnly, setReduceOnly] = useState(false)
  useEffect(() => {
    // Both reset on every venue or contract change. The clamp is separate
    // from the reset because a venue switch can also LOWER the ceiling, and
    // 100x silently surviving onto a 20x venue is a rejection at submit.
    setLeverage((current) => clampLeverage(current, maxLeverage))
  }, [maxLeverage])
  useEffect(() => {
    setLeverage(1)
    setLeverageDirty(false)
    setReduceOnly(false)
  }, [market, pairKey])

  // A price is denominated in the instrument that is on screen. Moving to a
  // prediction outcome must therefore drop whatever the previous pair left in
  // the field: `60000` from a BTC-USDT draft is a valid-looking number that
  // the cents converter now refuses, but an empty field is what lets the price
  // field re-seed itself from this venue's own book.
  const pricedPairRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isPrediction) {
      pricedPairRef.current = null
      return
    }
    if (pricedPairRef.current === pairKey) return
    pricedPairRef.current = pairKey
    setLimitPrice('')
  }, [isPrediction, pairKey])

  // Prediction venues never run workflows (the step catalogue is spot-shaped),
  // and a limit-only venue is coerced the same way the DEX branch below does.
  useEffect(() => {
    if (!isPrediction) return
    if (limitOnly && orderType !== 'limit') setOrderType('limit')
    else if (orderType === 'workflow') setOrderType('market')
  }, [isPrediction, limitOnly, orderType])

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
  // Venue-scoped: a futures connector records its margin balances under its own
  // namespace, so the bare credential id measures a futures order against a
  // portfolio of zero — and a zero denominator turns the cap off entirely.
  const { totalValueUsd, priceUsd } = usePortfolioValue(
    selectedCred ? balanceScopeFor(selectedCred.id, market) : undefined,
  )

  // The connector's display name as the middle rung, matching the phone
  // ticket. `CREDENTIAL_SCHEMAS` is keyed on the CREDENTIAL market, so a venue
  // that borrows another's key has no entry of its own and the label fell
  // straight through to the shouted market id, 'BINANCE-FUTURES'.
  const exchangeLabel =
    CREDENTIAL_SCHEMAS[market]?.label ??
    marketInfo?.displayName ??
    market.toUpperCase()
  const showRegionHint =
    !regionHintDismissed && marketCreds.length > 0 && !isRegionExplicitlySet()

  const sizeAsset = sizeCcy === 'base' ? baseLabel : quoteAsset
  const availableBase = balanceMap.get(baseAsset)?.total ?? '0'
  const availableQuote = balanceMap.get(quoteAsset)?.total ?? '0'
  // One shared rule with the phone's ticket — see `predictionCollateral`.
  const collateral = predictionCollateral((c) => balanceMap.get(c)?.total)
  // What the Max chip stakes. Floored to cents rather than rounded: a chip
  // that asks for a hundredth of a cent more than the account holds is a
  // rejection the user cannot see the cause of.
  const maxCollateral = (() => {
    const total = Number(collateral.total)
    if (!Number.isFinite(total) || total <= 0) return ''
    return String(Math.floor(total * 100) / 100)
  })()
  const availableDisplay = isPrediction
    ? `${formatAvailable(collateral.total)} ${collateral.currency}`
    : side === 'sell'
      ? `${formatAvailable(availableBase)} ${baseLabel}`
      : `${formatAvailable(availableQuote)} ${quoteAsset}`

  // ── Live price sample ──
  // The ref above is written by the stream without waking this component, and
  // on a desk whose holdings are all stablecoins nothing else re-renders the
  // form — the notional, the liquidation estimate and the prediction payout
  // sat frozen at whatever the price was when the ticket last happened to
  // repaint. `TicketPriceSampler` is the bounded fix: it subscribes to the
  // per-tick contexts itself and wakes this form at most once a second.
  //
  // Mounted only where a figure actually moves on its own — a market order. A
  // limit ticket prices off the field the user typed.
  const [priceSample, setPriceSample] = useState<TicketPriceSample | null>(null)
  const samplingPrice = (isPerp || isPrediction) && orderType === 'market'
  // Identity-stable when nothing moved, so a quiet book does not re-render the
  // fields being typed into once a second.
  const handlePriceSample = useCallback((sample: TicketPriceSample) => {
    setPriceSample((prev) =>
      prev &&
      prev.last === sample.last &&
      prev.bid === sample.bid &&
      prev.ask === sample.ask
        ? prev
        : sample,
    )
  }, [])

  // ── Prediction order figures ──
  // Cents in the field, dollars on the wire. The conversion happens here and
  // in `handleSubmit`, nowhere else.
  //
  // `predictionLimitPrice` is null for anything outside (0, 100) cents, and
  // every consumer below refuses on null rather than substituting a bound: a
  // price left over from another instrument is not a price, and clamping it
  // silently bought contracts at the venue's worst offer.
  const predictionLimitPrice = isPrediction ? centsToPrice(limitPrice) : null
  const predictionPriceInvalid =
    isPrediction &&
    orderType === 'limit' &&
    limitPrice !== '' &&
    predictionLimitPrice === null
  // The price the order is SIZED against, which is the far touch on a market
  // order — a 61/68 book is a 10% difference in how many contracts $100 buys.
  const predictionPrice = isPrediction
    ? predictionFillPrice({
        limitPrice: orderType === 'limit' ? predictionLimitPrice : null,
        bid: priceSample?.bid ?? pricesRef.current.bestBid,
        ask: priceSample?.ask ?? pricesRef.current.bestAsk,
        last: priceSample?.last ?? pricesRef.current.latestPrice ?? null,
        side,
      })
    : null
  // Dollars in the field, contracts on the wire. The field holds what the user
  // typed; this is the only thing that reaches `placeOrder`, and the summary
  // and the submit gate both read it so the three can never disagree.
  const contracts = isPrediction
    ? Number(
        contractsForAmount({
          amountUsd: Number(size),
          price: predictionPrice,
          side,
        }),
      )
    : 0

  // ── Perp order figures ──
  // The reference price is the limit price when there is one and the live last
  // price otherwise, exactly as the risk guard picks it — so the notional this
  // ticket shows is the notional the guard will measure. On a market order it
  // comes from the sampler above rather than the ref, for the reason stated
  // there.
  const perpReferencePrice = !isPerp
    ? null
    : orderType === 'limit'
      ? Number(limitPrice) || null
      : (priceSample?.last ?? pricesRef.current.latestPrice ?? null)
  const perpContracts = isPerp ? Number(size) : 0
  const perpBaseEquivalent =
    showBaseEquivalent && perpContracts > 0
      ? contractsToBase(perpContracts, contractSize)
      : null
  const perpNotionalValue = isPerp
    ? perpNotional({
        contracts: perpContracts,
        contractSize,
        price: perpReferencePrice,
      })
    : null
  const perpLiquidation = isPerp
    ? estimateLiquidationPrice({
        entryPrice: perpReferencePrice,
        leverage,
        side,
      })
    : null

  const canSubmit =
    (usesWallet ? selectedWallet : selectedCred) &&
    mdStatus === 'connected' &&
    !submitting &&
    Number(size) > 0 &&
    // A prediction amount that buys less than one whole contract is not an
    // order the venue can take, however valid the dollar figure looks.
    (!isPrediction || contracts >= 1) &&
    (orderType === 'market' ||
      (orderType === 'limit' &&
        (isPrediction
          ? predictionLimitPrice !== null
          : Number(limitPrice) > 0)) ||
      (orderType === 'workflow' &&
        selectedWorkflowId !== null &&
        workflowCompatIssues.length === 0))

  // Live funds (DEX swaps are always on-chain; CEX honors the credential mode)
  // get a longer hold + an explicit "funds commit" note.
  const isLiveOrder = usesWallet || selectedCred?.mode === 'live'

  // Press & hold by default, single click if the user asked for one. The
  // button applies the gesture; the note under it has to say which one is on,
  // or a click-mode user is told to hold a button that fires on release.
  const [confirmMode] = useTradeConfirmMode()
  const submitHint = useMemo(() => {
    const hold = confirmMode === 'hold'
    if (orderType === 'workflow') {
      return hold
        ? t('terminal.trade.holdToRun')
        : t('terminal.trade.clickToRun')
    }
    if (isLiveOrder) {
      return hold
        ? t('terminal.trade.holdToConfirmLive')
        : t('terminal.trade.clickToConfirmLive')
    }
    return hold
      ? t('terminal.trade.holdToPlace')
      : t('terminal.trade.clickToPlace')
  }, [confirmMode, orderType, isLiveOrder, t])

  const handleSideChange = (newSide: 'buy' | 'sell') => {
    setSide(newSide)
    setSellPct(0)
  }

  const handleSellPctChange = (pct: number) => {
    setSellPct(pct)
    setSize(computeSellSize(availableBase, pct))
    setSizeCcy('base')
  }

  // Taking the other side of the same question is a pair switch, not a form
  // toggle: the two outcomes are two instruments with two books. Pin first, so
  // the destination knows what it is before the route resolves it.
  const handleSwitchOutcome = () => {
    if (!sibling) return
    if (!directoryEntries[sibling.pairKey] && pinnedOutcome) {
      registerPredictionOutcome(sibling.pairKey, {
        ...pinnedOutcome,
        outcome: sibling.label,
        name: `${question} - ${sibling.label}`,
      })
    }
    setAssetClassMap((prev) => ({ ...prev, [sibling.pairKey]: 'prediction' }))
    // The venue rides in the address, so the sibling opens on the SAME venue
    // this outcome came from. Both outcomes of one market are two books on
    // one venue; resolving by class could land the other one elsewhere.
    const venue = pinnedOutcome?.market ?? market
    void navigate(
      chartLinkProps({ cls: 'prediction', market: venue, id: sibling.pairKey }),
    )
  }

  const handleSubmit = async () => {
    if (!canSubmit) return

    // ── Prediction path: contracts at a probability price ──
    //
    // Ordered before the wallet branch on purpose: Polymarket satisfies both
    // tests and its orders are contracts, not swaps.
    if (isPrediction) {
      const account = usesWallet ? selectedWallet : selectedCred
      if (!account) return
      const priceDollars = predictionLimitPrice
      // Belt and braces behind the disabled button: an out-of-range field
      // must never reach the venue as a clamped worst-case price.
      if (orderType === 'limit' && priceDollars === null) return
      setSubmitting(true)
      try {
        const result = await placeOrder({
          market,
          pair: pairKey,
          side,
          type: orderType === 'limit' ? 'limit' : 'market',
          // Contracts, whole. The venue counts them, and the field's dollars
          // were converted once, above, where the summary read the same figure.
          size: normalizeContracts(contracts),
          ...(orderType === 'limit' && priceDollars !== null
            ? { price: String(priceDollars) }
            : {}),
          // The connector keys its slots by whatever provisioned them — a
          // credential id for Kalshi, a wallet id for Polymarket — and reads
          // both out of this one param.
          credentialId: account.id,
        })
        if (result.success) {
          showTradeToast({
            side,
            orderType: orderType === 'limit' ? 'limit' : 'market',
            // What was sent, not what was typed: the toast is the receipt.
            size: String(contracts),
            sizeAsset: t('terminal.trade.contracts'),
            pairKey,
            market,
            price:
              orderType === 'limit' && priceDollars !== null
                ? formatPredictionPrice(priceDollars)
                : undefined,
          })
          setSize('')
        } else {
          toast.error(t('terminal.trade.orderRejected'), {
            description: result.error ?? t('common.unknownError'),
          })
        }
      } catch (err) {
        toast.error(t('terminal.trade.orderFailed'), {
          description: String(err),
        })
      } finally {
        setSubmitting(false)
      }
      return
    }

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
            toast.error(t('terminal.trade.limitOrderFailed'), {
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
          toast.error(t('terminal.trade.swapFailed'), {
            description: result.error ?? t('common.unknownError'),
          })
        }
      } catch (err) {
        toast.error(t('terminal.trade.swapFailed'), {
          description: String(err),
        })
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
            toast.error(t('terminal.trade.workflowUnsupported'), {
              description: compatIssues
                .map(
                  (i) =>
                    `${stepTypeLabelById(t, 'workflows', i.stepType, i.stepLabel)}: ${stepCompatReason(t, 'workflows', i.stepType, i.reason)}`,
                )
                .join(' · '),
            })
            return
          }
        }

        // One identity check for the whole run, here, while the user is still
        // in front of the screen. The steps below deliberately do NOT go
        // through the gated `placeOrder`: a workflow can hold a `wait` of up
        // to 24 hours before it places the stop-loss it owes, by which time
        // the idle trigger has locked the terminal and the gate would cancel
        // that order outright — leaving a live position unprotected.
        const allowed = await requireUnlockForTrade()
        if (!allowed) {
          toast.error(i18n.t('security.lock.orderCancelled'))
          return
        }

        // Build OrderExecutor from plugin manager
        const orderExecutor: OrderExecutor = {
          placeMarketOrder: async (params) => {
            const r = await placeUnattendedOrder({
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
            const r = await placeUnattendedOrder({
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
              const r = await placeUnattendedOrder({
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
            const r = await placeUnattendedOrder({
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
              // Only when the venue actually told us. An unknown contract size
              // passed as 1 is a claim, and on a 0.001 BTC contract it is a
              // thousandfold overstatement — the guard resolves it itself.
              ...(isPerp && contractSizeKnown ? { contractSize } : {}),
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
              toast.error(t('terminal.trade.orderBlocked'), {
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
        // A perp size is a CONTRACT COUNT, which is what ccxt's unified
        // interface takes for contract markets. There is no second leg to
        // denominate it in, so `tgtCcy` — which is the spot venues' base/quote
        // switch — must never ride along.
        if (isPerp) {
          orderSize = String(size)
          tgtCcy = undefined
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
          ...(extendedHours && extendedHoursEligible
            ? { extendedHours: true }
            : {}),
          // Leverage is applied per order (the connector sets it on the symbol
          // first, idempotently), which is why it rides ONLY when the user
          // moved the selector and never on a reduce-only order: it is account
          // state at the venue, and a close should not rewrite it. Matches the
          // positions pane, which closes without leverage for the same reason.
          ...(isPerp && leverageDirty && !reduceOnly ? { leverage } : {}),
          ...(isPerp && contractSizeKnown ? { contractSize } : {}),
          ...(isPerp && reduceOnly ? { reduceOnly: true } : {}),
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
          toast.error(t('terminal.trade.orderRejected'), {
            description: result.error ?? 'Unknown error',
          })
        }
      }
    } catch (err) {
      toast.error(t('terminal.trade.orderFailed'), {
        description: String(err),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const modeBadge = usesWallet ? (
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
      {t('terminal.modePaper', { defaultValue: 'PAPER' })}
    </Badge>
  ) : null

  const body = (
    <div className="flex shrink-0 flex-col">
      <div className="flex flex-col gap-2.5 p-2.5">
        {/* Wallet status. The "nothing connected here" case belongs to the
            connect gate below — what's left is a vault that can't be read, and
            an account that exists but hasn't been picked for this pane. */}
        {(usesWallet ? walletsSealed : credentialsSealed) ? (
          <button
            type="button"
            className="text-center text-xs text-amber-600 hover:underline dark:text-amber-400"
            onClick={() => setUnlockOpen(true)}
          >
            {i18n.t('security.vault.sealed')}{' '}
            {i18n.t('security.vault.sealedBannerAction')} →
          </button>
        ) : usesWallet ? (
          walletsLoaded &&
          !selectedWallet &&
          chainWallets.length > 0 && (
            <Link
              to="/accounts"
              className="text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {`${t('terminal.wallet.selectWalletTopBar')} →`}
            </Link>
          )
        ) : (
          loaded &&
          !selectedCred &&
          marketCreds.length > 0 && (
            <Link
              to="/accounts"
              className="text-center text-xs text-muted-foreground hover:text-foreground"
            >
              {`${t('terminal.wallet.selectAccountTopBar')} →`}
            </Link>
          )
        )}

        <VaultUnlockDialog open={unlockOpen} onOpenChange={setUnlockOpen} />

        {showRegionHint && (
          <div className="flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
            <MapPin className="mt-0.5 size-3 shrink-0" />
            <span>
              {t('terminal.trade.regionDefaulting')}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => useSettingsDialogStore.getState().open('region')}
              >
                {t('terminal.trade.setRegion')}
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

        {/* What this ticket is actually betting on. The pair key says
            KXBTCD-26AUG15-T53; the question is the only readable identity. */}
        {isPrediction && (
          <div className="flex flex-col gap-1.5 rounded-xl border bg-muted/20 px-2.5 py-2">
            <p className="text-xs font-medium leading-snug">{question}</p>
            <div className="flex items-center justify-between gap-2">
              {sibling ? (
                <div className="flex min-w-0 flex-1 gap-1 rounded-xl bg-secondary p-1">
                  <span className="flex-1 truncate rounded-lg bg-background py-1 text-center text-xs font-semibold">
                    {outcomeLabel || t('terminal.trade.thisOutcome')}
                  </span>
                  <button
                    className="flex-1 truncate rounded-lg py-1 text-center text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
                    onClick={handleSwitchOutcome}
                    type="button"
                  >
                    {sibling.label}
                  </button>
                </div>
              ) : outcomeLabel ? (
                <Badge
                  className="h-4 min-w-0 px-1.5 font-mono text-[10px] tracking-[.08em]"
                  variant="outline"
                >
                  <span className="truncate">{outcomeLabel}</span>
                </Badge>
              ) : (
                <span />
              )}
              {/* When the collateral comes back. A 68¢ price a month out and
                  the same price an hour out are different bets, and the pair
                  key carries neither date. */}
              {resolvesAt !== undefined && (
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {t('terminal.trade.resolvesOn', {
                    date: formatResolutionDate(resolvesAt),
                  })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Every other answer to the same question, one click each. The
            Yes/No toggle above is the fallback for a venue the browser cannot
            reach, where there is no field to list. */}
        {isPrediction && <OutcomeSwitch market={market} pairKey={pairKey} />}

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
            {t('terminal.trade.buy')}
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
            {t('terminal.trade.sell')}
          </button>
        </div>

        {/* Order type tabs — DEX venues get Market + Limit (when the venue
            supports resting orders); CEX venues additionally get Workflow */}
        {(!isDex || dexSupportsLimit) && !limitOnly && (
          <Tabs
            value={orderType}
            onValueChange={(v) =>
              setOrderType(v as 'market' | 'limit' | 'workflow')
            }
          >
            <TabsList className="h-8 w-full rounded-xl bg-secondary">
              {/* Disabled rather than hidden outside regular hours: the choice
                  exists, the session is what removed it, and a control that
                  vanishes teaches nobody that. */}
              <TabsTrigger
                value="market"
                disabled={outsideRegularHours}
                className="flex-1 rounded-lg text-xs"
              >
                {t('terminal.trade.orderTypeMarket')}
              </TabsTrigger>
              <TabsTrigger value="limit" className="flex-1 rounded-lg text-xs">
                {t('terminal.trade.orderTypeLimit')}
              </TabsTrigger>
              {!isDex && !isPrediction && (
                <TabsTrigger
                  value="workflow"
                  disabled={outsideRegularHours}
                  className="flex-1 rounded-lg text-xs"
                >
                  {t('terminal.trade.workflow')}
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        )}

        {/* Why the choice is gone. One line, under the control it explains. */}
        {outsideRegularHours && sessionPhase !== null && (
          <p className="text-[10.5px] leading-snug text-[var(--chart-4)]">
            {t(
              sessionPhase === 'closed'
                ? 'session.ticketClosedNote'
                : 'session.ticketExtendedNote',
            )}
          </p>
        )}

        {/* Workflow selector */}
        {orderType === 'workflow' && (
          <div className="space-y-1">
            <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
              {t('terminal.trade.workflow')}
            </span>
            {wfWorkflows.length === 0 ? (
              <Link
                to="/workflows"
                className="block text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {t('terminal.trade.createFirstWorkflow')} →
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
                  <option value="">{t('terminal.trade.selectWorkflow')}</option>
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
                      {t('terminal.trade.notSupportedOn', {
                        venue: marketInfo?.displayName ?? market,
                      })}
                    </div>
                    <ul className="mt-0.5 space-y-0.5 text-[10px] text-amber-600/90 dark:text-amber-400/90">
                      {workflowCompatIssues.map((issue) => (
                        <li key={issue.stepId}>
                          {stepTypeLabelById(
                            t,
                            'workflows',
                            issue.stepType,
                            issue.stepLabel,
                          )}{' '}
                          —{' '}
                          {stepCompatReason(
                            t,
                            'workflows',
                            issue.stepType,
                            issue.reason,
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Link
                  to="/workflows"
                  className="block text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {t('terminal.trade.editWorkflows')} →
                </Link>
              </>
            )}
          </div>
        )}

        {/* Leverage. Presets rather than a free field: the venue accepts
            integers within its own ceiling, and the row always ends at that
            ceiling so the top of the range is visible rather than implied.
            Never persisted — see the state declaration. */}
        {isPerp && maxLeverage > 1 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
                {t('terminal.trade.leverage')}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                {leverage}x
              </span>
            </div>
            <div className="flex gap-1">
              {leveragePresets(maxLeverage).map((lev) => (
                <button
                  key={lev}
                  type="button"
                  className={cn(
                    'flex-1 rounded-md border px-1 py-0.5 font-mono text-[11.5px] tabular-nums transition-colors',
                    leverage === lev
                      ? 'border-primary text-foreground'
                      : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                  style={
                    leverage === lev
                      ? {
                          backgroundColor:
                            'color-mix(in oklch, var(--primary) 14%, transparent)',
                        }
                      : undefined
                  }
                  onClick={() => {
                    setLeverage(lev)
                    setLeverageDirty(true)
                  }}
                >
                  {lev}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Amount input. A prediction ticket takes DOLLARS and shows what they
            buy: traders decide in money, both venues settle in contracts, and
            the count under the field is the conversion stated rather than left
            to be done in the head. No base/quote switch either way on a
            contract ticket — there is no second leg to denominate in. */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
              {isPerp
                ? t('terminal.trade.contracts')
                : t('terminal.trade.amount')}
            </span>
            {/* No base/quote switch on a contract ticket: there is no second
                leg to denominate the size in. */}
            {!isPrediction && !isPerp && (
              <button
                type="button"
                onClick={() =>
                  setSizeCcy((c) => (c === 'base' ? 'quote' : 'base'))
                }
                className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground hover:bg-accent transition-colors"
              >
                {sizeAsset}
              </button>
            )}
          </div>
          <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {t('terminal.trade.available', { amount: availableDisplay })}
          </div>
          {isPrediction ? (
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
                $
              </span>
              <Input
                aria-label={t('terminal.trade.amount')}
                className="h-9 rounded-lg pl-6 pr-[104px] font-mono text-[15px] font-semibold tabular-nums"
                inputMode="decimal"
                onChange={(e) => setSize(e.target.value)}
                placeholder="0"
                type="number"
                value={size}
              />
              {/* What the amount actually buys, floored to whole contracts.
                  This is the number that goes on the wire. */}
              <span className="pointer-events-none absolute right-2.5 top-1/2 max-w-[96px] -translate-y-1/2 truncate font-mono text-[10px] tabular-nums text-muted-foreground">
                {contracts >= 1
                  ? t('terminal.trade.contractCount', {
                      count: contracts,
                      formatted: contracts.toLocaleString(),
                    })
                  : ''}
              </span>
            </div>
          ) : (
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
          )}
          {/* What the contracts are worth in the base asset. Rendered only
              where the venue's contract is NOT one unit of the base, which is
              the only place the count is ambiguous — KuCoin's XBTUSDTM is
              0.001 BTC, so "10" is 0.01 BTC and reads as ten without it. */}
          {perpBaseEquivalent !== null && (
            <div className="font-mono text-[10px] tabular-nums text-muted-foreground">
              ≈ {formatAmount(perpBaseEquivalent)} {baseAsset}
            </div>
          )}
        </div>

        {/* Stake presets, in collateral. Max is the whole balance, floored to
            cents so the chip can never ask for more than the account holds. */}
        {isPrediction && (
          <div className="flex items-center gap-1">
            {predictionPresets.map((p) => (
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
                ${p}
              </button>
            ))}
            <button
              type="button"
              className={cn(
                'flex-1 rounded-md border px-1 py-1 text-[11.5px] transition-colors',
                maxCollateral !== '' && size === maxCollateral
                  ? 'border-primary text-foreground'
                  : 'border-border bg-muted/30 text-muted-foreground hover:text-foreground',
              )}
              disabled={maxCollateral === ''}
              onClick={() => setSize(maxCollateral)}
            >
              {t('terminal.trade.maxAmount')}
            </button>
            <button
              type="button"
              className="ml-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setPresetsConfigOpen(true)}
            >
              <Settings2 className="size-3" />
            </button>
          </div>
        )}

        {/* Preset row (buy mode or quote-denominated sell). Not for perps: the
            presets are amounts of the quote currency, and a perp ticket sizes
            in contracts, where "100" would mean a hundred contracts. */}
        {!isPrediction &&
          !isPerp &&
          (side === 'buy' || sizeCcy === 'quote') && (
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

        {/* Sell % slider. Not for predictions or perps: on both, a sell is
            opening the opposite exposure, not liquidating a base-asset
            balance — there is no base balance to take a percentage of. */}
        {side === 'sell' && !isPrediction && !isPerp && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
                {t('terminal.trade.sell')}
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
                {t('terminal.trade.slippage')}
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
            cents={isPrediction}
            invalid={predictionPriceInvalid}
            onChange={setLimitPrice}
            pairKey={pairKey}
            pricesRef={pricesRef}
            side={side}
            value={limitPrice}
          />
        )}

        {/* Pre-market / after-hours routing (equities limit orders only —
            the venue accepts nothing else in those sessions). Defaulted ON
            only while one of those sessions is actually running, and never
            remembered: the thin book is the whole point of making this a
            deliberate choice each time. */}
        {extendedHoursEligible && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <label
                htmlFor="trade-extended-hours"
                className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground"
              >
                {t('terminal.trade.extendedHours')}
              </label>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/70">
                {t('terminal.trade.extendedHoursHint')}
              </p>
            </div>
            {/* The id lands on the hidden form input, not the role="switch"
                element, so the label is wired for a click but leaves the
                control itself unnamed to a screen reader. */}
            <Switch
              id="trade-extended-hours"
              aria-label={t('terminal.trade.extendedHours')}
              checked={extendedHours}
              onCheckedChange={(checked) => {
                // The user now owns this switch for as long as the ticket
                // stays on this pair, so the session default stops applying.
                setExtendedHoursTouched(true)
                setExtendedHours(checked)
              }}
              className="mt-0.5 shrink-0"
            />
          </div>
        )}

        {/* Reduce-only. The intent flag that makes a closing order safe: the
            venue shrinks the position and refuses to flip it, so a size larger
            than what is open cannot open the opposite side by accident. */}
        {isPerp && (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <label
                htmlFor="trade-reduce-only"
                className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground"
              >
                {t('terminal.trade.reduceOnly')}
              </label>
              <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/70">
                {t('terminal.trade.reduceOnlyHint')}
              </p>
            </div>
            <Switch
              id="trade-reduce-only"
              aria-label={t('terminal.trade.reduceOnly')}
              checked={reduceOnly}
              onCheckedChange={setReduceOnly}
              className="mt-0.5 shrink-0"
            />
          </div>
        )}

        {/* What this order commits and where it would die. The liquidation
            level is explicitly an estimate: the real one depends on the whole
            margin balance, the venue's maintenance tier and funding paid since
            entry, none of which exist before the position does. */}
        {samplingPrice && <TicketPriceSampler onSample={handlePriceSample} />}

        {isPerp && (
          <div className="flex flex-col gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-[.16em]">
                {t('terminal.trade.notional')}
              </span>
              <span className="text-foreground">
                {perpNotionalValue === null
                  ? '—'
                  : `${perpNotionalValue.toFixed(2)} ${quoteAsset}`}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="uppercase tracking-[.16em]">
                {t('terminal.trade.estLiquidation')}
              </span>
              <span className={perpLiquidation === null ? '' : 'text-down'}>
                {perpLiquidation === null ? '—' : formatPrice(perpLiquidation)}
              </span>
            </div>
          </div>
        )}

        {/* What holding it costs. Renders nothing where the venue publishes no
            rate for this contract. */}
        {isPerp && <FundingEntryRow market={market} pairKey={pairKey} />}

        {/* What this order returns and what it can lose. A bought contract
            risks the premium; a sold one risks the rest of the dollar it may
            have to pay out. Both return the whole dollar when they are right. */}
        {isPrediction && (
          <PredictionOrderSummary
            contracts={contracts}
            outcomeLabel={outcomeLabel}
            price={predictionPrice}
            side={side}
          />
        )}

        {/* Submit — press & hold to commit (single click if the user set that
            in settings). Conveys the criticality of the moment (a fuller hold
            for live funds); the toast is the confirmation. */}
        <TradeConfirmButton
          side={side === 'buy' ? 'buy' : 'sell'}
          disabled={!canSubmit}
          busy={submitting}
          busyLabel={t('terminal.trade.submitting')}
          holdMs={tradeHoldMs(isLiveOrder)}
          hint={submitHint}
          onConfirm={handleSubmit}
          label={
            <span className="flex items-center gap-1.5">
              {orderType === 'workflow'
                ? t('terminal.trade.runWorkflow')
                : side === 'buy'
                  ? t('terminal.trade.buyAsset', {
                      asset: isPrediction
                        ? outcomeLabel || t('terminal.trade.contracts')
                        : baseLabel,
                    })
                  : t('terminal.trade.sellAsset', {
                      asset: isPrediction
                        ? outcomeLabel || t('terminal.trade.contracts')
                        : baseLabel,
                    })}
              {modeBadge}
            </span>
          }
        />
      </div>

      {/* Presets config dialog */}
      <PresetsConfigDialog
        presets={isPrediction ? predictionPresets : presets}
        onChange={isPrediction ? setPredictionPresets : setPresets}
        open={presetsConfigOpen}
        onOpenChange={setPresetsConfigOpen}
        quoteAsset={isPrediction ? collateral.currency : quoteAsset}
      />
    </div>
  )

  // `needsConnect` already implies a resolved marketInfo — the second half of
  // the guard is what tells the type checker so.
  if (!needsConnect || !marketInfo) return body

  const gateChain = marketInfo.walletChain

  // The ticket stays on screen — blurred and inert — so the pane keeps its
  // shape and the gate reads as a lock over this venue's ticket rather than a
  // generic empty state.
  return (
    <div className="relative shrink-0">
      <div
        aria-hidden
        inert
        className="pointer-events-none select-none opacity-70 blur-[2.5px]"
      >
        {body}
      </div>
      <TradeConnectGate
        market={market}
        venueLabel={gateChain ? CHAIN_NAME[gateChain] : exchangeLabel}
        chain={gateChain}
        readOnly={!marketInfo.capabilities.includes('trade')}
      />
    </div>
  )
})

// ── Ticket price sampler ──────────────────────────────────────────────
//
// Renders null, subscribes to the two per-tick contexts, and wakes its parent
// at most once a second. Same shape as the phone ticket's `LivePriceProbe`
// (which cannot be imported: `src/mobile/` is a one-way dependency), and same
// reason for existing — the tick reaches this function, not the 900-line form
// whose fields the user is typing into.
//
// Mounted only while a market order is on screen for a venue whose figures
// move on their own: a perp's notional and liquidation estimate, a prediction
// ticket's contract count and payout. A limit ticket prices off its own typed
// field, and a spot ticket has no derived figure at all.
//
// Both touches ride along with the last price because a probability ticket
// sizes against the far touch — the spread on a 61/68 book is 10% of the
// position, which is not a rounding difference.
const PRICE_SAMPLE_MS = 1000

type TicketPriceSample = {
  last: number | null
  bid: number | null
  ask: number | null
}

const TicketPriceSampler = memo(function TicketPriceSampler({
  onSample,
}: {
  onSample: (sample: TicketPriceSample) => void
}) {
  const ticker = useOptionalTickerData()
  const candleData = useOptionalCandleData()
  const latest: TicketPriceSample = {
    last:
      // The one that matters most: a price read off half a book would prefill
      // an order ticket. Null falls through to the last close.
      liveQuotePrice(ticker) ?? candleData?.latestCandle?.close ?? null,
    bid: ticker?.bestBid ?? null,
    ask: ticker?.bestAsk ?? null,
  }

  const latestRef = useRef(latest)
  latestRef.current = latest
  const lastEmit = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const now = Date.now()
    const due = lastEmit.current + PRICE_SAMPLE_MS
    if (now >= due) {
      lastEmit.current = now
      onSample(latestRef.current)
      return
    }
    if (timer.current) return
    timer.current = setTimeout(() => {
      timer.current = null
      lastEmit.current = Date.now()
      onSample(latestRef.current)
    }, due - now)
  })

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return null
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
  pairKey,
  cents = false,
  invalid = false,
}: {
  side: 'buy' | 'sell'
  value: string
  onChange: (value: string) => void
  pricesRef: RefObject<LivePrices>
  pairKey: string
  /** Probability venue: the field reads and writes CENTS, not dollars. */
  cents?: boolean
  /** The typed value is not a price this venue can take. */
  invalid?: boolean
}) {
  const { t } = useTranslation()
  const tickerData = useOptionalTickerData()
  const candleData = useOptionalCandleData()
  const bestBid = tickerData?.bestBid ?? pricesRef.current.bestBid
  const bestAsk = tickerData?.bestAsk ?? pricesRef.current.bestAsk
  const latestPrice =
    candleData?.latestCandle?.close ?? pricesRef.current.latestPrice
  const reference =
    side === 'buy' ? (bestAsk ?? latestPrice) : (bestBid ?? latestPrice)

  // Seeding happens HERE, and only for a probability venue, because this is
  // the one component in the ticket that already subscribes to the live book —
  // the panel above deliberately holds prices in a ref so a moving market
  // cannot re-render the fields being typed into.
  //
  // Keyed on "did the user touch this field for THIS pair", not on "have we
  // seeded once". The panel clears the field when the pair changes, and child
  // effects run before parent ones, so a once-only guard would spend its one
  // shot before the clear landed and leave the field empty forever. This
  // converges instead: it re-seeds an empty field until the user types in it,
  // and then leaves a field they deliberately emptied alone.
  const touchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!cents || reference == null) return
    if (value !== '' || touchedFor.current === pairKey) return
    // Clamped: priceToCents(0.9996) is exactly 100, which is not a tradeable
    // probability, and outcomes really do quote above 99.95 cents near resolve.
    onChange(String(clampPriceCents(priceToCents(reference))))
  }, [cents, pairKey, reference, value, onChange])

  return (
    <div className="space-y-1">
      <span className="font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground">
        {cents ? t('terminal.trade.priceCents') : t('terminal.trade.price')}
      </span>
      <Input
        type="number"
        placeholder={
          reference == null
            ? '—'
            : cents
              ? String(clampPriceCents(priceToCents(reference)))
              : reference.toString()
        }
        className={cn(
          'h-8 rounded-lg font-mono text-sm tabular-nums',
          invalid && 'border-destructive focus-visible:ring-destructive/40',
        )}
        value={value}
        onChange={(e) => {
          touchedFor.current = pairKey
          onChange(e.target.value)
        }}
      />
      {invalid && (
        <p className="text-[10px] leading-snug text-destructive">
          {t('terminal.trade.priceCentsRange')}
        </p>
      )}
    </div>
  )
}
