// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Claim the fees, take part of the range back, or put more into it.
 *
 * Three transactions against the position manager that issued the NFT, and
 * every one of them goes through the same two steps: a section that says what
 * would happen, then a confirmation card that states exactly what will be
 * signed — the action, the position, the chain, the manager contract, the
 * amounts and the minimum those amounts may not fall below. Nothing here
 * submits from a single click, because nothing here is reversible.
 *
 * WHAT IS DELIBERATELY ABSENT. There is no "re-centre" and no range editor.
 * Moving a band is not an edit: it burns the position and mints a new one at
 * new ticks, which is a different NFT, a different token id and a fresh set of
 * approvals. Shipping it as a slider next to these three would make an
 * irreversible replacement look like an adjustment.
 *
 * AMOUNTS ARE IN THE POOL'S OWN ORDER. `token0` and `token1` here are exactly
 * the manager's `amount0Desired` / `amount1Desired`, so a reader can check the
 * confirmation card against the transaction field for field. The pane beside
 * this one orients a position to the pair on the chart, which is the right
 * choice for reading a range and the wrong one for signing.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  SlidersHorizontal,
  XCircle,
} from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { usePanePair } from '@pairlens/plugin-sdk'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { Slider } from '@pairlens/ui/components/ui/slider'
import { Tabs, TabsList, TabsTrigger } from '@pairlens/ui/components/ui/tabs'

import type { LpPositionEntry, LpWriteAction } from '@/lib/dex/lp-types'
import type { DepositShape } from '@/lib/dex/lp-manage-math'

import { PaneEmpty, PaneErrorBanner } from '@/components/panes/pane-primitives'
import { DexPaneHeader } from '@/components/dex/dex-pane-primitives'
import { RangeBadge } from '@/components/dex/lp-pane-primitives'
import {
  shortWalletLabel,
  useLpSourceState,
} from '@/components/dex/use-lp-source-state'
import {
  sortLpPositions,
  useLpChains,
  useLpPositions,
} from '@/hooks/use-lp-positions'
import { useLpWrite } from '@/hooks/use-lp-write'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { dexChain, explorerTxUrl } from '@/lib/dex/chain-catalog'
import {
  LP_DEFAULT_SLIPPAGE_BPS,
  LP_SLIPPAGE_PRESETS_BPS,
  REMOVE_PERCENT_PRESETS,
  amountToWireString,
  clampRemovePercent,
  counterpartAmount,
  depositShape,
  hasClaimableFees,
  minAfterSlippage,
  parseAmountInput,
  removalPreview,
} from '@/lib/dex/lp-manage-math'
import { formatAmount } from '@/lib/format-price'
import {
  dexBalanceCredentialKey,
  getBalances,
  subscribeBalances,
} from '@/stores/balances-store'
import { useWalletsStore } from '@/stores/wallets-store'

type Section = 'collect' | 'remove' | 'add'

/** Which position is on screen. Manager included: token ids repeat across them. */
function positionKey(entry: LpPositionEntry): string {
  return `${entry.market}:${entry.managerAddress}:${entry.tokenId}`
}

export function ManageLiquidityPane() {
  const activePair = usePanePair()
  const state = useLpSourceState(activePair)
  if (!state.wallet) return state.gate
  return <ManageLiquidityPaneInner wallet={state.wallet} pair={activePair} />
}

function ManageLiquidityPaneInner({
  wallet,
  pair,
}: {
  wallet: { id: string; address: string }
  pair: { market: string; pairKey: string } | null
}) {
  const { t } = useTranslation()
  const chains = useLpChains()
  const wallets = useWalletsStore((s) => s.wallets)
  const { positions, isPending, errors } = useLpPositions(
    chains,
    wallet.address,
    pair,
  )
  const write = useLpWrite()

  const sorted = useMemo(
    () => sortLpPositions(positions, pair?.market),
    [positions, pair?.market],
  )
  // Position reads now span both signing families, and only one of them has a
  // position manager to call. Solana ranges stay visible in the LP panes and
  // are filtered OUT of the picker here rather than listed and then refused.
  const writable = useMemo(
    () =>
      sorted.filter(
        (entry) => dexChain(entry.market)?.walletChain === 'ethereum',
      ),
    [sorted],
  )
  const readOnly = sorted.length - writable.length

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected =
    writable.find((entry) => positionKey(entry) === selectedKey) ??
    writable[0] ??
    null

  // The wallet that signs for the SELECTED position's chain, which is not
  // necessarily the one the header names: the LP panes read every family the
  // user has a key for, and an EVM position cannot be signed with a Solana id.
  const signerId = useMemo(() => {
    if (!selected) return null
    const row = chains.find((entry) => entry.market === selected.market)
    const address = row?.owner ?? wallet.address
    const match = wallets.find(
      (candidate) => candidate.address.toLowerCase() === address.toLowerCase(),
    )
    return match?.id ?? null
  }, [chains, selected, wallet.address, wallets])

  // Every position the wallet holds is on a chain with no manager to call.
  if (!selected && readOnly > 0) {
    return (
      <PaneEmpty
        icon={SlidersHorizontal}
        title={t('manageLiquidity.evmOnlyTitle')}
        body={t('manageLiquidity.evmOnlyBody')}
      />
    )
  }

  if (chains.length === 0) {
    return (
      <PaneEmpty
        icon={SlidersHorizontal}
        title={t('manageLiquidity.noChainsTitle')}
        body={t('manageLiquidity.noChainsBody')}
      />
    )
  }

  if (!selected) {
    return (
      <PaneEmpty
        icon={SlidersHorizontal}
        title={
          isPending
            ? t('manageLiquidity.loadingTitle')
            : t('manageLiquidity.emptyTitle')
        }
        body={
          isPending
            ? t('manageLiquidity.loadingBody')
            : t('manageLiquidity.emptyBody', {
                wallet: shortWalletLabel(wallet.address),
              })
        }
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DexPaneHeader
        title={t('manageLiquidity.title')}
        subtitle={t('manageLiquidity.subtitle', {
          wallet: shortWalletLabel(wallet.address),
          count: writable.length,
        })}
      />

      {errors.length > 0 ? (
        <div className="flex shrink-0 flex-col gap-1 px-3 pt-2">
          {errors.slice(0, 2).map((error) => (
            <PaneErrorBanner
              key={`${error.chain}:${error.message}`}
              venue={error.chain}
              message={error.message}
            />
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <PositionPicker
          entries={writable}
          selected={selected}
          // Locked from submit until the result is dismissed, not just while
          // the transaction is in flight: a receipt has to stay attached to the
          // position it happened on.
          disabled={write.state.status !== 'idle'}
          onSelect={setSelectedKey}
          note={
            readOnly > 0
              ? t('manageLiquidity.readOnlyElsewhere', { count: readOnly })
              : null
          }
        />
        {/* Remounted per position: a percentage or an amount typed for one
            range must never be inherited by the next one. */}
        <ManageActions
          key={positionKey(selected)}
          entry={selected}
          signerId={signerId}
          write={write}
        />
      </div>

      <p className="shrink-0 border-t border-border px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        {t('manageLiquidity.footnote')}
      </p>
    </div>
  )
}

/**
 * The position every control below applies to.
 *
 * A select rather than a list: this pane lives in a narrow column, and the
 * wallet's other ranges are context for choosing, not something to keep on
 * screen while typing an amount. The label carries the pool, the fee tier and
 * the chain, because a wallet routinely holds the same pair at two tiers.
 */
function PositionPicker({
  entries,
  selected,
  disabled,
  onSelect,
  note,
}: {
  entries: Array<LpPositionEntry>
  selected: LpPositionEntry
  disabled: boolean
  onSelect: (key: string) => void
  /** Positions this pane can read but not sign for, when there are any. */
  note: string | null
}) {
  const { t } = useTranslation()
  const labels = useMemo(() => {
    const map: Record<string, string> = {}
    for (const entry of entries) map[positionKey(entry)] = positionLabel(entry)
    return map
  }, [entries])

  return (
    <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
      <span className="text-[11px] text-muted-foreground">
        {t('manageLiquidity.position')}
      </span>
      <Select
        items={labels}
        value={positionKey(selected)}
        onValueChange={(value) => onSelect(String(value))}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 w-full text-[11.5px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {entries.map((entry) => (
            <SelectItem key={positionKey(entry)} value={positionKey(entry)}>
              {positionLabel(entry)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[10px] text-muted-foreground">
          #{selected.tokenId} · {selected.dexName}
        </span>
        <RangeBadge inRange={selected.inRange} compact />
      </div>
      {note ? (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {note}
        </p>
      ) : null}
    </div>
  )
}

/** `WETH/USDC · 0.30% · BASE`, the three things that identify a range. */
function positionLabel(entry: LpPositionEntry): string {
  const chain = dexChain(entry.market)
  const fee =
    entry.feeTier === null ? null : `${(entry.feeTier * 100).toFixed(2)}%`
  return [
    `${entry.token0.symbol}/${entry.token1.symbol}`,
    fee,
    chain?.abbr ?? entry.market,
  ]
    .filter(Boolean)
    .join(' · ')
}

/**
 * The three sections, the confirmation in front of them, and the outcome.
 *
 * One of the three is on screen at a time, and so is one of the three phases
 * (choose, confirm, result). A write in flight replaces the controls entirely
 * rather than disabling them in place: there is exactly one transaction to
 * think about while it is pending.
 */
function ManageActions({
  entry,
  signerId,
  write,
}: {
  entry: LpPositionEntry
  /** Wallet that signs on this position's chain, null when none is connected. */
  signerId: string | null
  write: ReturnType<typeof useLpWrite>
}) {
  const { t } = useTranslation()
  const [section, setSection] = useState<Section>('collect')
  const [pct, setPct] = useState(50)
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [slippageBps, setSlippageBps] = usePersistedState<number>(
    'lp:slippageBps',
    LP_DEFAULT_SLIPPAGE_BPS,
  )

  const shape = useMemo(() => depositShape(entry), [entry])
  const preview = useMemo(() => removalPreview(entry, pct), [entry, pct])
  const claimable = hasClaimableFees(entry)

  // Leaving the confirmation open across a section change would show one
  // action's card above another action's button.
  useEffect(() => setConfirming(false), [section])

  if (write.state.status !== 'idle') {
    return <WriteStatus entry={entry} write={write} />
  }

  const parsed0 = parseAmountInput(amount0)
  const parsed1 = parseAmountInput(amount1)
  const hasInput =
    section === 'collect'
      ? claimable
      : section === 'remove'
        ? Number(entry.liquidity) > 0
        : shape.kind === 'token1'
          ? parsed1 !== null
          : shape.kind === 'token0'
            ? parsed0 !== null
            : parsed0 !== null || parsed1 !== null
  const canSubmit = hasInput && signerId !== null

  function submit() {
    if (signerId === null) return
    if (section === 'collect') {
      void write.submit({
        market: entry.market,
        action: 'lp-collect',
        managerAddress: entry.managerAddress,
        tokenId: entry.tokenId,
        walletId: signerId,
        slippageBps,
      })
      return
    }
    if (section === 'remove') {
      void write.submit({
        market: entry.market,
        action: 'lp-decrease',
        managerAddress: entry.managerAddress,
        tokenId: entry.tokenId,
        walletId: signerId,
        slippageBps,
        liquidityPct: clampRemovePercent(pct),
      })
      return
    }
    void write.submit({
      market: entry.market,
      action: 'lp-increase',
      managerAddress: entry.managerAddress,
      tokenId: entry.tokenId,
      walletId: signerId,
      slippageBps,
      amount0Desired:
        parsed0 === null
          ? '0'
          : amountToWireString(parsed0, entry.token0.decimals),
      amount1Desired:
        parsed1 === null
          ? '0'
          : amountToWireString(parsed1, entry.token1.decimals),
    })
  }

  if (confirming) {
    return (
      <ConfirmCard
        entry={entry}
        section={section}
        pct={pct}
        preview={preview}
        amount0={parsed0}
        amount1={parsed1}
        slippageBps={slippageBps}
        onBack={() => setConfirming(false)}
        onConfirm={submit}
      />
    )
  }

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-3 py-2">
        <Tabs
          value={section}
          onValueChange={(value) => setSection(value as Section)}
        >
          <TabsList variant="line" className="w-full">
            <TabsTrigger value="collect" className="text-[11.5px]">
              {t('manageLiquidity.tabCollect')}
            </TabsTrigger>
            <TabsTrigger value="remove" className="text-[11.5px]">
              {t('manageLiquidity.tabRemove')}
            </TabsTrigger>
            <TabsTrigger value="add" className="text-[11.5px]">
              {t('manageLiquidity.tabAdd')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {section === 'collect' ? (
        <CollectSection entry={entry} />
      ) : section === 'remove' ? (
        <RemoveSection
          entry={entry}
          pct={pct}
          preview={preview}
          onPct={setPct}
        />
      ) : (
        <AddSection
          entry={entry}
          shape={shape}
          signerId={signerId}
          amount0={amount0}
          amount1={amount1}
          // Each handler writes only the OTHER field, so the derivation cannot
          // loop, and it writes it in fixed notation at that token's own
          // precision: `1e-7` is a valid number and not something a decimal
          // amount field should ever show.
          onAmount0={(value) => {
            setAmount0(value)
            const derived = counterpartAmount(
              shape,
              'token0',
              parseAmountInput(value),
            )
            if (derived !== null) {
              setAmount1(amountToWireString(derived, entry.token1.decimals))
            }
          }}
          onAmount1={(value) => {
            setAmount1(value)
            const derived = counterpartAmount(
              shape,
              'token1',
              parseAmountInput(value),
            )
            if (derived !== null) {
              setAmount0(amountToWireString(derived, entry.token0.decimals))
            }
          }}
        />
      )}

      {/* Slippage rides with every action so the control is in one place, and
          it is the same ladder the swap ticket offers. Collect has no
          minimums, so it is the one action that ignores the value. */}
      {section === 'collect' ? null : (
        <div className="flex flex-col gap-1.5 border-b border-border px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
              {t('manageLiquidity.slippage')}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground [font-variant-numeric:tabular-nums]">
              {formatBps(slippageBps)}
            </span>
          </div>
          <div className="flex gap-1">
            {LP_SLIPPAGE_PRESETS_BPS.map((bps) => (
              <button
                key={bps}
                type="button"
                className={cn(
                  'flex-1 rounded-md border px-1 py-0.5 font-mono text-[11px] transition-colors [font-variant-numeric:tabular-nums]',
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
                {formatBps(bps)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 py-2.5">
        <Button
          className="h-8 w-full text-[12px]"
          disabled={!canSubmit}
          onClick={() => setConfirming(true)}
        >
          {section === 'collect'
            ? t('manageLiquidity.reviewCollect')
            : section === 'remove'
              ? t('manageLiquidity.reviewRemove')
              : t('manageLiquidity.reviewAdd')}
        </Button>
        {signerId === null ? (
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {t('manageLiquidity.noSigner')}
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** `0.5%` for 50 bps, without a trailing zero nobody reads. */
function formatBps(bps: number): string {
  const pct = bps / 100
  return `${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`
}

function CollectSection({ entry }: { entry: LpPositionEntry }) {
  const { t } = useTranslation()
  const unread = entry.fees0 === null && entry.fees1 === null
  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
      <span className="text-[11px] text-muted-foreground">
        {t('manageLiquidity.claimable')}
      </span>
      <AmountLine
        symbol={entry.token0.symbol}
        value={entry.fees0}
        tone={(entry.fees0 ?? 0) > 0 ? 'up' : 'muted'}
      />
      <AmountLine
        symbol={entry.token1.symbol}
        value={entry.fees1}
        tone={(entry.fees1 ?? 0) > 0 ? 'up' : 'muted'}
      />
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        {unread
          ? t('manageLiquidity.collectUnread')
          : hasClaimableFees(entry)
            ? t('manageLiquidity.collectNote')
            : t('manageLiquidity.collectNothing')}
      </p>
    </div>
  )
}

function RemoveSection({
  entry,
  pct,
  preview,
  onPct,
}: {
  entry: LpPositionEntry
  pct: number
  preview: ReturnType<typeof removalPreview>
  onPct: (value: number) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-2.5 border-b border-border px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">
          {t('manageLiquidity.removeAmount')}
        </span>
        <span className="font-mono text-[13px] font-semibold [font-variant-numeric:tabular-nums]">
          {pct}%
        </span>
      </div>
      <div className="flex gap-1">
        {REMOVE_PERCENT_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={cn(
              'flex-1 rounded-md border px-1 py-0.5 font-mono text-[11px] transition-colors [font-variant-numeric:tabular-nums]',
              pct === preset
                ? 'border-primary text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
            style={
              pct === preset
                ? {
                    backgroundColor:
                      'color-mix(in oklch, var(--primary) 14%, transparent)',
                  }
                : undefined
            }
            onClick={() => onPct(preset)}
          >
            {preset}%
          </button>
        ))}
      </div>
      <Slider
        value={[pct]}
        min={1}
        max={100}
        step={1}
        onValueChange={(value) =>
          onPct(clampRemovePercent(Array.isArray(value) ? value[0] : value))
        }
      />
      <span className="text-[11px] text-muted-foreground">
        {t('manageLiquidity.youReceive')}
      </span>
      <AmountLine symbol={entry.token0.symbol} value={preview.amount0} />
      <AmountLine symbol={entry.token1.symbol} value={preview.amount1} />
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        {preview.amount0 === null && preview.amount1 === null
          ? t('manageLiquidity.removeUnread')
          : t('manageLiquidity.removeFeesNote')}
      </p>
    </div>
  )
}

function AddSection({
  entry,
  shape,
  signerId,
  amount0,
  amount1,
  onAmount0,
  onAmount1,
}: {
  entry: LpPositionEntry
  shape: DepositShape
  signerId: string | null
  amount0: string
  amount1: string
  onAmount0: (value: string) => void
  onAmount1: (value: string) => void
}) {
  const { t } = useTranslation()
  const balances = useSyncExternalStore(subscribeBalances, getBalances)
  // Whatever the wallet-provisioning scan already fetched for this wallet on
  // this chain. Read from the store rather than fetched: an extra RPC round
  // trip per keystroke would buy a number that is not needed to submit, and a
  // token the scan did not cover simply shows no balance line instead of a
  // wrong one.
  const scope =
    signerId === null ? null : dexBalanceCredentialKey(signerId, entry.market)
  const balanceOf = (symbol: string) =>
    scope === null
      ? null
      : (balances.find((b) => b.credentialId === scope && b.currency === symbol)
          ?.available ?? null)

  return (
    <div className="flex flex-col gap-2 border-b border-border px-3 py-2.5">
      <AmountField
        symbol={entry.token0.symbol}
        value={amount0}
        balance={balanceOf(entry.token0.symbol)}
        disabled={shape.kind === 'token1'}
        onChange={onAmount0}
      />
      <AmountField
        symbol={entry.token1.symbol}
        value={amount1}
        balance={balanceOf(entry.token1.symbol)}
        disabled={shape.kind === 'token0'}
        onChange={onAmount1}
      />
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        {shape.kind === 'token0'
          ? t('manageLiquidity.addBelowBand', { symbol: entry.token0.symbol })
          : shape.kind === 'token1'
            ? t('manageLiquidity.addAboveBand', { symbol: entry.token1.symbol })
            : shape.kind === 'both'
              ? t('manageLiquidity.addRatioNote')
              : t('manageLiquidity.addUnread')}
      </p>
      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        {t('manageLiquidity.addWrappedNote')}
      </p>
    </div>
  )
}

function AmountField({
  symbol,
  value,
  balance,
  disabled,
  onChange,
}: {
  symbol: string
  value: string
  balance: string | null
  disabled: boolean
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">{symbol}</span>
        {balance === null ? null : (
          <span className="font-mono text-[10px] text-muted-foreground [font-variant-numeric:tabular-nums]">
            {t('manageLiquidity.balance', {
              amount: formatAmount(Number(balance)),
            })}
          </span>
        )}
      </div>
      <Input
        aria-label={symbol}
        className="h-8 rounded-lg font-mono text-[13px] tabular-nums"
        disabled={disabled}
        inputMode="decimal"
        onChange={(event) => onChange(event.target.value)}
        placeholder="0"
        type="number"
        value={value}
      />
    </div>
  )
}

/** A token amount, or the honest blank when the pool did not answer. */
function AmountLine({
  symbol,
  value,
  tone = 'default',
}: {
  symbol: string
  value: number | null
  tone?: 'default' | 'muted' | 'up'
}) {
  const { t } = useTranslation()
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[11px] text-muted-foreground">
        {symbol}
      </span>
      <span
        className={cn(
          'min-w-0 truncate font-mono text-[11.5px] [font-variant-numeric:tabular-nums]',
          tone === 'muted' && 'text-muted-foreground',
          tone === 'up' && 'text-up',
        )}
      >
        {value === null ? t('manageLiquidity.unread') : formatAmount(value)}
      </span>
    </div>
  )
}

/**
 * Exactly what is about to be signed.
 *
 * Every line here is a field of the transaction: the contract it goes to, the
 * position id it names, the amounts, and the floor those amounts may not fall
 * below. The manager address is on the card because it is the address that
 * receives an approval, and reading it once is the only way anybody could ever
 * notice it was the wrong one.
 */
function ConfirmCard({
  entry,
  section,
  pct,
  preview,
  amount0,
  amount1,
  slippageBps,
  onBack,
  onConfirm,
}: {
  entry: LpPositionEntry
  section: Section
  pct: number
  preview: ReturnType<typeof removalPreview>
  amount0: number | null
  amount1: number | null
  slippageBps: number
  onBack: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  const chain = dexChain(entry.market)
  const unread = t('manageLiquidity.unread')
  const actionLabel =
    section === 'collect'
      ? t('manageLiquidity.tabCollect')
      : section === 'remove'
        ? t('manageLiquidity.tabRemove')
        : t('manageLiquidity.tabAdd')

  return (
    <div className="flex flex-col gap-2 px-3 py-2.5">
      <span className="text-[11px] font-medium">
        {t('manageLiquidity.confirmTitle')}
      </span>
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-2">
        <ConfirmRow
          label={t('manageLiquidity.rowAction')}
          value={actionLabel}
        />
        <ConfirmRow
          label={t('manageLiquidity.rowPosition')}
          value={`#${entry.tokenId}`}
        />
        <ConfirmRow
          label={t('manageLiquidity.rowChain')}
          value={`${chain?.displayName ?? entry.market} · ${entry.dexName}`}
        />
        <ConfirmRow
          label={t('manageLiquidity.rowManager')}
          value={shortWalletLabel(entry.managerAddress)}
        />

        {section === 'collect' ? (
          <ConfirmRow
            label={t('manageLiquidity.rowCollecting')}
            value={pairAmounts(entry, entry.fees0, entry.fees1, unread)}
          />
        ) : null}

        {section === 'remove' ? (
          <>
            <ConfirmRow
              label={t('manageLiquidity.rowRemoving')}
              value={`${pct}%`}
            />
            <ConfirmRow
              label={t('manageLiquidity.rowReceive')}
              value={pairAmounts(
                entry,
                preview.amount0,
                preview.amount1,
                unread,
              )}
            />
            <ConfirmRow
              label={t('manageLiquidity.rowFeesSwept')}
              value={pairAmounts(entry, preview.fees0, preview.fees1, unread)}
            />
            <ConfirmRow
              label={t('manageLiquidity.rowMinimum')}
              value={pairAmounts(
                entry,
                minAfterSlippage(preview.amount0, slippageBps),
                minAfterSlippage(preview.amount1, slippageBps),
                unread,
              )}
            />
          </>
        ) : null}

        {section === 'add' ? (
          <>
            <ConfirmRow
              label={t('manageLiquidity.rowDepositing')}
              value={pairAmounts(entry, amount0, amount1, unread)}
            />
            <ConfirmRow
              label={t('manageLiquidity.rowMinimum')}
              value={pairAmounts(
                entry,
                minAfterSlippage(amount0, slippageBps),
                minAfterSlippage(amount1, slippageBps),
                unread,
              )}
            />
          </>
        ) : null}
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted-foreground">
        {section === 'collect'
          ? t('manageLiquidity.confirmCollectNote')
          : section === 'remove'
            ? t('manageLiquidity.confirmRemoveNote', {
                slippage: formatBps(slippageBps),
              })
            : t('manageLiquidity.confirmAddNote')}
      </p>

      <div className="flex gap-2">
        <Button
          className="h-8 flex-1 text-[12px]"
          onClick={onBack}
          variant="outline"
        >
          {t('manageLiquidity.back')}
        </Button>
        <Button className="h-8 flex-1 text-[12px]" onClick={onConfirm}>
          {t('manageLiquidity.sign')}
        </Button>
      </div>
    </div>
  )
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="shrink-0 text-[10.5px] text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono text-[11px] [font-variant-numeric:tabular-nums]">
        {value}
      </span>
    </div>
  )
}

/** `1.24 WETH + 3,010 USDC`, dropping a leg that is zero or unread. */
function pairAmounts(
  entry: LpPositionEntry,
  amount0: number | null,
  amount1: number | null,
  fallback: string,
): string {
  const parts: Array<string> = []
  if (amount0 !== null && amount0 > 0) {
    parts.push(`${formatAmount(amount0)} ${entry.token0.symbol}`)
  }
  if (amount1 !== null && amount1 > 0) {
    parts.push(`${formatAmount(amount1)} ${entry.token1.symbol}`)
  }
  return parts.length > 0 ? parts.join(' + ') : fallback
}

/**
 * What happened, from submit to receipt.
 *
 * A failure keeps its transaction link when there is one: the reason a position
 * manager reverted lives in the trace, and "failed" with nothing to click is
 * what makes somebody send the same transaction again.
 */
function WriteStatus({
  entry,
  write,
}: {
  entry: LpPositionEntry
  write: ReturnType<typeof useLpWrite>
}) {
  const { t } = useTranslation()
  const state = write.state

  if (state.status === 'submitting') {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <p className="text-[12px] font-medium">
          {t('manageLiquidity.pendingTitle')}
        </p>
        <p className="max-w-[220px] text-[10.5px] leading-relaxed text-muted-foreground">
          {t('manageLiquidity.pendingBody')}
        </p>
      </div>
    )
  }

  if (state.status === 'blocked') {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
        <Lock className="size-5 text-muted-foreground" />
        <p className="text-[12px] font-medium">
          {state.reason === 'locked'
            ? t('manageLiquidity.lockedTitle')
            : t('manageLiquidity.noConnectorTitle')}
        </p>
        <p className="max-w-[220px] text-[10.5px] leading-relaxed text-muted-foreground">
          {state.reason === 'locked'
            ? t('manageLiquidity.lockedBody')
            : t('manageLiquidity.noConnectorBody')}
        </p>
        <Button
          className="h-7 text-[11.5px]"
          onClick={write.reset}
          variant="outline"
        >
          {t('manageLiquidity.done')}
        </Button>
      </div>
    )
  }

  if (state.status !== 'settled') return null

  const { result } = state
  const url = explorerTxUrl(entry.market, result.txHash)
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
      {result.success ? (
        <CheckCircle2 className="size-5 text-up" />
      ) : (
        <XCircle className="size-5 text-destructive" />
      )}
      <p className="text-[12px] font-medium">
        {result.success
          ? t(SUCCESS_TITLES[result.action])
          : t('manageLiquidity.failedTitle')}
      </p>
      <p className="max-w-[220px] text-[10.5px] leading-relaxed text-muted-foreground">
        {result.success
          ? t('manageLiquidity.successBody')
          : (result.error ?? t('manageLiquidity.failedTitle'))}
      </p>
      <div className="flex items-center gap-2">
        {url ? (
          <a
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            href={url}
            rel="noreferrer noopener"
            target="_blank"
          >
            {t('manageLiquidity.viewTransaction')}
            <ExternalLink className="size-2.5" aria-hidden="true" />
          </a>
        ) : null}
        <Button
          className="h-7 text-[11.5px]"
          onClick={write.reset}
          variant="outline"
        >
          {t('manageLiquidity.done')}
        </Button>
      </div>
    </div>
  )
}

const SUCCESS_TITLES: Record<LpWriteAction, string> = {
  'lp-collect': 'manageLiquidity.collectedTitle',
  'lp-decrease': 'manageLiquidity.removedTitle',
  'lp-increase': 'manageLiquidity.addedTitle',
}
