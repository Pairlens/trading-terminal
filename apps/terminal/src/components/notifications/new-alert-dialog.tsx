// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * New alert — the default way to be told about a price.
 *
 * Two questions and a Create button. No canvas, no steps, no commit: the
 * alert is armed on the pair it names the moment it is created, which is
 * what someone who just wants to know when BTC hits a number expects to
 * happen. The graph builder is still there for everything else, one link
 * away, and anything built here can be opened in it later.
 *
 * Opened from the Notifications page, the chart's alert bell, and the
 * omni-search — the same dialog every time, prefilled with whatever pair
 * the caller was looking at.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import {
  SimpleAlertChannelPicker,
  SimpleAlertKindPicker,
  SimpleAlertTriggerFields,
  defaultSimpleAlertSpec,
  formatAlertPrice,
  hasChannel,
  simpleAlertSummary,
} from './simple-alert-form'

import type {
  SimpleAlertKind,
  SimpleAlertSpec,
} from '@pairlens/notification-engine/simple-alerts'
import { MarketPicker } from '@/components/terminal/market-picker'
import { PreviewPairPicker } from '@/components/indicators/preview-pair-picker'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useLivePairPrice } from '@/hooks/use-live-pair-price'
import { useNotificationStore } from '@/stores/notification-store'

const FALLBACK_PAIR = 'BTC-USDT'

type NewAlertDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pair the caller was looking at. Falls back to the last one charted. */
  defaultPair?: string
  defaultMarket?: string
  /** Which of the two the caller asked for; the user can still switch. */
  defaultKind?: SimpleAlertKind
  onCreated?: (ruleId: string) => void
}

export function NewAlertDialog({
  open,
  onOpenChange,
  defaultPair,
  defaultMarket,
  defaultKind = 'price-level',
  onCreated,
}: NewAlertDialogProps) {
  const { t } = useTranslation()
  const { markets, defaultMarket: fallbackMarket } = useAvailableMarkets()
  const createSimpleAlert = useNotificationStore((s) => s.createSimpleAlert)

  const [pair, setPair] = useState(defaultPair ?? FALLBACK_PAIR)
  const [market, setMarket] = useState(defaultMarket ?? fallbackMarket)
  const [spec, setSpec] = useState<SimpleAlertSpec>(() =>
    defaultSimpleAlertSpec(defaultKind),
  )
  /** Whether the level is still the suggestion, so live price may move it. */
  const [priceTouched, setPriceTouched] = useState(false)

  // Only stream while the dialog is open — this is a real venue subscription.
  const { price } = useLivePairPrice(open ? pair : '', market)

  // Every open starts from the caller's context, not from last time's answers.
  useEffect(() => {
    if (!open) return
    setPair(defaultPair ?? FALLBACK_PAIR)
    setMarket(defaultMarket ?? fallbackMarket)
    setSpec(defaultSimpleAlertSpec(defaultKind))
    setPriceTouched(false)
  }, [open, defaultPair, defaultMarket, defaultKind, fallbackMarket])

  // A level alert opens with a level near the market. It arrives a beat after
  // the dialog does (the ticker has to connect), so it is filled in when it
  // lands rather than left at zero — but never over a number the user typed.
  useEffect(() => {
    if (!open || priceTouched || !price || price <= 0) return
    setSpec((prev) => {
      if (prev.kind !== 'price-level' || prev.price !== 0) return prev
      const suggested = defaultSimpleAlertSpec('price-level', price)
      // Only the level — the channels are the user's, not the suggestion's.
      return suggested.kind === 'price-level'
        ? { ...prev, price: suggested.price }
        : prev
    })
  }, [open, price, priceTouched])

  const valid =
    hasChannel(spec.channels) &&
    pair.includes('-') &&
    (spec.kind === 'price-level' ? spec.price > 0 : spec.percent > 0)

  const handleCreate = () => {
    if (!valid) return
    const ruleId = createSimpleAlert({ pair, market, spec })
    toast.success(t('notifications.simple.created', { pair }), {
      description: simpleAlertSummary(t, spec, pair, market),
    })
    onOpenChange(false)
    onCreated?.(ruleId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('notifications.simple.newTitle')}</DialogTitle>
          <DialogDescription>
            {t('notifications.simple.newDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* What to watch */}
          <div className="flex flex-wrap items-center gap-2">
            <PreviewPairPicker
              market={market}
              pair={pair}
              onPairChange={setPair}
            />
            <MarketPicker
              market={market}
              marketOptions={markets}
              onMarketChange={setMarket}
              className="h-7"
            />
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {price && price > 0 ? formatAlertPrice(price) : '—'}
            </span>
          </div>

          <SimpleAlertKindPicker
            kind={spec.kind}
            onChange={(kind) => {
              // Switching what to watch keeps how to be told about it.
              setSpec({
                ...defaultSimpleAlertSpec(kind, price),
                channels: spec.channels,
              })
              setPriceTouched(false)
            }}
          />

          <SimpleAlertTriggerFields
            spec={spec}
            currentPrice={price}
            onChange={(next) => {
              if (next.kind === 'price-level' && spec.kind === 'price-level') {
                if (next.price !== spec.price) setPriceTouched(true)
              }
              setSpec(next)
            }}
          />

          <SimpleAlertChannelPicker
            channels={spec.channels}
            onChange={(channels) => setSpec({ ...spec, channels })}
          />

          <p className="rounded-md bg-muted/60 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
            {simpleAlertSummary(t, spec, pair, market)}
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={!valid} onClick={handleCreate}>
            {t('notifications.simple.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
