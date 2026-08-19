// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'
// Empty-state glyphs follow the pane vocabulary in `pairlens-core`: Layers is
// what the registry hands the Positions pane, Receipt is what it hands Trades.
import { Layers, ListOrdered, Loader2, Receipt, Wallet, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@pairlens/ui/components/ui/alert-dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'

import { useMarketData } from '@/lib/market-data-provider'
import { usePaneWallet } from '@/lib/layout/pane-context'
import { usePortfolioValue } from '@/hooks/use-portfolio-value'
import {
  getOrderEvents,
  subscribeOrderEvents,
} from '@/stores/order-events-store'

type OrderUpdateEvent = {
  market: string
  instId: string
  ordId: string
  clOrdId: string
  side: string
  ordType: string
  sz: string
  px: string
  fillSz: string
  avgPx: string
  state: 'live' | 'filled' | 'canceled' | 'partially_filled'
  fee: string
  feeCcy: string
  uTime: string
  cTime: string
  triggerOrder?: boolean
  triggerPx?: string
}

// Order events are capped at 100 in the store

function EmptyState({
  icon: Icon,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>
  message: string
}) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <Icon className="mx-auto mb-2 size-7 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-border/50 text-muted-foreground">
        {children}
      </tr>
    </thead>
  )
}

function Th({
  children,
  align = 'left',
  className,
}: {
  children?: React.ReactNode
  align?: 'left' | 'right'
  className?: string
}) {
  return (
    <th
      className={`pb-1.5 pr-3 font-mono text-[10px] font-medium uppercase tracking-[.14em] last:pr-0 ${align === 'right' ? 'text-right' : 'text-left'} ${className ?? ''}`}
    >
      {children}
    </th>
  )
}

function SideBadge({ side }: { side: string }) {
  const { t } = useTranslation()
  const isBuy = side.toLowerCase() === 'buy'
  return (
    <span className={`font-medium ${isBuy ? 'text-up' : 'text-down'}`}>
      {isBuy ? t('positions.buy') : t('positions.sell')}
    </span>
  )
}

function StatusBadge({
  state,
  t,
}: {
  state: string
  t: (k: string) => string
}) {
  const label =
    state === 'live'
      ? t('positions.live')
      : state === 'partially_filled'
        ? t('positions.partiallyFilled')
        : state === 'filled'
          ? t('positions.filled')
          : state === 'canceled'
            ? t('positions.canceled')
            : state
  const color =
    state === 'live'
      ? 'text-primary'
      : state === 'partially_filled'
        ? 'text-primary/80'
        : state === 'filled'
          ? 'text-up'
          : 'text-muted-foreground'
  return <span className={color}>{label}</span>
}

function formatPair(instId: string): string {
  const i = instId.indexOf('-')
  return i === -1 ? instId : instId.slice(0, i) + '/' + instId.slice(i + 1)
}

function relativeTime(ts: string): string {
  const ms = Number(ts)
  if (!ms) return ''
  const diff = Date.now() - ms
  if (diff < 60_000) return '<1m'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return `${Math.floor(diff / 86_400_000)}d`
}

function CancelButton({
  market,
  orderId,
  pair,
  side,
  trigger,
  onCancel,
}: {
  market: string
  orderId: string
  pair: string
  side: string
  trigger?: boolean
  onCancel: (
    market: string,
    orderId: string,
    pair: string,
    trigger?: boolean,
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleConfirm = async () => {
    setConfirmOpen(false)
    setLoading(true)
    try {
      await onCancel(market, orderId, pair, trigger)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        className="inline-flex items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        {loading ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <X className="size-3" />
        )}
      </button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('positions.cancelOrderTitle')}
            </AlertDialogTitle>
            {/* The side rides in as a translated word, not `.toLowerCase()` on
                an English literal: "buy"/"sell" have no lowercase form to
                borrow in ja/ko/zh, and German capitalises the noun. */}
            <AlertDialogDescription>
              {t('positions.cancelOrderBody', {
                side:
                  side.toLowerCase() === 'buy'
                    ? t('positions.sideBuy')
                    : t('positions.sideSell'),
                pair: pair.replace('-', '/'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('positions.keepOrder')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t('positions.cancelOrder')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function PositionsPane() {
  const { t } = useTranslation()
  const { cancelOrder: cancelMarketOrder } = useMarketData()
  const wallet = usePaneWallet()
  const hasWallet = !!wallet

  // Order events from exchange (REST backfill + private WS updates).
  // Managed by MarketDataProvider — just read from the store here.
  const orderEvents = useSyncExternalStore(
    subscribeOrderEvents,
    getOrderEvents,
    getOrderEvents,
  )
  const { holdings, totalValue, currencySymbol } = usePortfolioValue(
    wallet?.walletId,
  )

  // Partition into open orders vs fills — keyed on the store snapshot so it
  // only recomputes when order events actually change, not on every render.
  const { sortedOrders, fills } = useMemo(() => {
    const openOrders = new Map<string, OrderUpdateEvent>()
    const fillEntries: Array<OrderUpdateEvent> = []
    for (const e of orderEvents) {
      const entry: OrderUpdateEvent = {
        market: e.market,
        instId: e.pair,
        ordId: e.orderId,
        clOrdId: '',
        side: e.side,
        ordType: e.type,
        sz: e.size,
        px: e.price,
        fillSz: e.fillSize,
        avgPx: e.avgPrice,
        state:
          e.status === 'filled'
            ? 'filled'
            : e.status === 'cancelled'
              ? 'canceled'
              : e.status === 'partially_filled'
                ? 'partially_filled'
                : 'live',
        fee: e.fee,
        feeCcy: e.feeCcy,
        uTime: String(e.ts),
        cTime: String(e.ts),
        triggerOrder: e.triggerOrder,
        triggerPx: e.triggerPrice,
      }
      if (e.status === 'filled') {
        fillEntries.push(entry)
      } else if (e.status === 'live' || e.status === 'partially_filled') {
        openOrders.set(e.orderId, entry)
      }
    }
    return {
      sortedOrders: Array.from(openOrders.values()).sort(
        (a, b) => Number(b.cTime) - Number(a.cTime),
      ),
      fills: fillEntries,
    }
  }, [orderEvents])

  const handleCancel = useCallback(
    async (
      market: string,
      orderId: string,
      pair: string,
      trigger?: boolean,
    ) => {
      await cancelMarketOrder(
        market,
        orderId,
        pair,
        undefined,
        trigger ? { trigger: true } : undefined,
      )
    },
    [cancelMarketOrder],
  )

  return (
    <Tabs defaultValue="positions" className="flex h-full flex-col gap-0">
      <div className="border-b px-2">
        <TabsList variant="line" className="h-7">
          <TabsTrigger value="positions" className="text-[11px]">
            {t('positions.positions')}
          </TabsTrigger>
          <TabsTrigger value="orders" className="text-[11px]">
            {t('positions.orders')}
            {sortedOrders.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({sortedOrders.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="fills" className="text-[11px]">
            {t('positions.fills')}
            {fills.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({fills.length})
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="balances" className="text-[11px]">
            {t('positions.balances', 'Balances')}
            {holdings.length > 0 && (
              <span className="ml-1 text-[10px] text-muted-foreground">
                ({holdings.length})
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </div>

      <div className="flex-1 overflow-hidden">
        {/* Positions tab */}
        <TabsContent value="positions" className="h-full p-2">
          <EmptyState icon={Layers} message={t('positions.spotNoPositions')} />
        </TabsContent>

        {/* Orders tab */}
        <TabsContent value="orders" className="h-full p-2">
          <div className="h-full overflow-auto">
            {!hasWallet ? (
              <EmptyState
                icon={ListOrdered}
                message={t('positions.selectWalletOrders')}
              />
            ) : sortedOrders.length === 0 ? (
              <EmptyState
                icon={ListOrdered}
                message={t('positions.noOrders')}
              />
            ) : (
              <table className="w-full text-[11px]">
                <TableHeader>
                  <Th>{t('positions.side')}</Th>
                  <Th>{t('positions.pair')}</Th>
                  <Th>{t('positions.type')}</Th>
                  <Th align="right">{t('positions.price')}</Th>
                  <Th align="right">{t('positions.size')}</Th>
                  <Th className="hidden @sm/pane:table-cell">
                    {t('positions.status')}
                  </Th>
                  <Th align="right">{t('positions.time')}</Th>
                  <Th align="right" />
                </TableHeader>
                <tbody>
                  {sortedOrders.map((order) => {
                    const fillProgress =
                      order.state === 'partially_filled' && Number(order.sz) > 0
                        ? Number(order.fillSz) / Number(order.sz)
                        : 0
                    return (
                      <tr
                        key={order.ordId}
                        className="border-b border-border/40 last:border-0"
                      >
                        <td className="py-1.5 pr-3">
                          <SideBadge side={order.side} />
                        </td>
                        <td className="py-1.5 pr-3 font-mono tabular-nums">
                          {formatPair(order.instId)}
                        </td>
                        <td className="py-1.5 pr-3 capitalize text-muted-foreground">
                          {order.triggerOrder
                            ? `${order.ordType} (trigger)`
                            : order.ordType}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                          {order.px ||
                            (order.triggerPx ? `@${order.triggerPx}` : '-')}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                          <span>{order.sz}</span>
                          {fillProgress > 0 && (
                            <div className="mt-0.5 h-0.5 w-full rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{
                                  width: `${Math.min(fillProgress * 100, 100)}%`,
                                }}
                              />
                            </div>
                          )}
                        </td>
                        <td className="hidden py-1.5 pr-3 @sm/pane:table-cell">
                          <StatusBadge state={order.state} t={t} />
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                          {relativeTime(order.cTime)}
                        </td>
                        <td className="py-1.5 text-right">
                          <CancelButton
                            market={order.market}
                            orderId={order.ordId}
                            pair={order.instId}
                            side={order.side}
                            trigger={order.triggerOrder}
                            onCancel={handleCancel}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* Fills tab */}
        <TabsContent value="fills" className="h-full p-2">
          <div className="h-full overflow-auto">
            {!hasWallet ? (
              <EmptyState
                icon={Receipt}
                message={t('positions.selectWalletFills')}
              />
            ) : fills.length === 0 ? (
              <EmptyState icon={Receipt} message={t('positions.noFills')} />
            ) : (
              <table className="w-full text-[11px]">
                <TableHeader>
                  <Th>{t('positions.side')}</Th>
                  <Th>{t('positions.pair')}</Th>
                  <Th align="right">{t('positions.price')}</Th>
                  <Th align="right">{t('positions.size')}</Th>
                  <Th align="right">{t('positions.fee')}</Th>
                  <Th align="right" className="hidden @sm/pane:table-cell">
                    {t('positions.time')}
                  </Th>
                </TableHeader>
                <tbody>
                  {fills.map((fill) => (
                    <tr
                      key={fill.ordId}
                      className="border-b border-border/40 last:border-0"
                    >
                      <td className="py-1.5 pr-3">
                        <SideBadge side={fill.side} />
                      </td>
                      <td className="py-1.5 pr-3 font-mono tabular-nums">
                        {formatPair(fill.instId)}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                        {fill.avgPx || fill.px || '-'}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums">
                        {fill.fillSz || fill.sz}
                      </td>
                      <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                        {fill.fee ? `${fill.fee} ${fill.feeCcy}` : '-'}
                      </td>
                      <td className="hidden py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground @sm/pane:table-cell">
                        {relativeTime(fill.uTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>

        {/* Balances tab */}
        <TabsContent value="balances" className="h-full p-2">
          <div className="h-full overflow-auto">
            {!hasWallet ? (
              <EmptyState
                icon={Wallet}
                message={t('positions.selectWalletBalances')}
              />
            ) : holdings.length === 0 ? (
              <EmptyState
                icon={Wallet}
                message={t('positions.noBalances', 'No balance data')}
              />
            ) : (
              <>
                {totalValue > 0 && (
                  <div className="mb-2 flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] uppercase tracking-[.16em] text-muted-foreground">
                      {t('positions.total', 'Total')}
                    </span>
                    <span className="font-mono text-lg font-semibold tracking-tight tabular-nums text-foreground">
                      {currencySymbol}
                      {totalValue >= 1_000
                        ? totalValue.toLocaleString(undefined, {
                            maximumFractionDigits: 2,
                          })
                        : totalValue.toFixed(2)}
                    </span>
                  </div>
                )}
                <table className="w-full text-[11px]">
                  <TableHeader>
                    <Th>{t('positions.asset', 'Asset')}</Th>
                    <Th align="right">{t('positions.total', 'Total')}</Th>
                    <Th align="right">{currencySymbol}</Th>
                  </TableHeader>
                  <tbody>
                    {holdings.map((h) => (
                      <tr
                        key={h.currency}
                        className="border-b border-border/40 last:border-0"
                      >
                        <td className="py-1.5 pr-3 font-medium text-foreground">
                          {h.currency}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-muted-foreground">
                          {h.amount >= 1
                            ? h.amount.toFixed(4)
                            : h.amount.toPrecision(4)}
                        </td>
                        <td className="py-1.5 pr-3 text-right font-mono tabular-nums text-foreground">
                          {h.value != null
                            ? `${currencySymbol}${h.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </TabsContent>
      </div>
    </Tabs>
  )
}
