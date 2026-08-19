// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What a simple alert looks like when you click it.
 *
 * The canvas is a fine way to read a five-node flow and a terrible way to
 * read "tell me when BTC passes 100k", so a rule the engine recognises as a
 * simple alert opens as the form that made it instead. Edits save as they
 * are made — there is no graph to review and nothing to commit, and a
 * Commit button over two fields would just be a step to forget.
 *
 * "Open in the flow builder" is the one-way door to the canvas: from there
 * the rule is an ordinary flow, and adding anything the form cannot express
 * keeps it that way for good.
 */
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { toast } from 'sonner'
import { FlaskConical, Plus, Trash2, Workflow, X } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pairlens/ui/components/ui/popover'
import { Switch } from '@pairlens/ui/components/ui/switch'

import { readSimpleAlert } from '@pairlens/notification-engine/simple-alerts'

import {
  SimpleAlertChannelPicker,
  SimpleAlertTriggerFields,
  simpleAlertSummary,
} from './simple-alert-form'

import type { SimpleAlertSpec } from '@pairlens/notification-engine/simple-alerts'
import { MarketPicker } from '@/components/terminal/market-picker'
import { PreviewPairPicker } from '@/components/indicators/preview-pair-picker'
import { sendTestNotification } from '@/lib/notifications/test-fire'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useLivePairPrice } from '@/hooks/use-live-pair-price'
import { useNotificationStore } from '@/stores/notification-store'

export function SimpleAlertEditor({ ruleId }: { ruleId: string }) {
  const { t } = useTranslation()
  const rule = useNotificationStore((s) => s.rules.find((r) => r.id === ruleId))
  const bindings = useNotificationStore((s) => s.bindings)
  const updateSimpleAlert = useNotificationStore((s) => s.updateSimpleAlert)
  const toggleRule = useNotificationStore((s) => s.toggleRule)
  const deleteRule = useNotificationStore((s) => s.deleteRule)
  const addBinding = useNotificationStore((s) => s.addBinding)
  const removeBinding = useNotificationStore((s) => s.removeBinding)
  const openInBuilder = useNotificationStore((s) => s.openInBuilder)

  const [testing, setTesting] = useState(false)

  const spec = rule ? readSimpleAlert(rule) : null
  const ruleBindings = bindings.filter((b) => b.ruleId === ruleId)
  const primary = ruleBindings[0]

  // The alert's own pair — the only stream this editor opens.
  const { price } = useLivePairPrice(primary?.pair ?? '', primary?.market ?? '')

  if (!rule || !spec) return null

  const enabled = rule.enabled !== false

  const update = (next: SimpleAlertSpec) => updateSimpleAlert(ruleId, next)

  const handleTest = async () => {
    setTesting(true)
    try {
      const outcome = await sendTestNotification(
        rule,
        primary?.pair ?? 'BTC-USDT',
        primary?.market ?? 'okx',
      )
      if (outcome.ok) {
        toast.success(t('notifications.builder.sidebar.testSent'), {
          description: outcome.detail,
        })
      } else {
        toast.error(t('notifications.builder.sidebar.testFailed'), {
          description: outcome.detail,
        })
      }
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[620px] px-6 py-6">
        {/* Title row — the alert in one line, plus its kill switch. */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-mono text-[15px] font-semibold">
              {rule.name}
            </h2>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              {simpleAlertSummary(
                t,
                spec,
                primary?.pair ?? '',
                primary?.market ?? '',
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 pt-0.5">
            <span className="text-[11px] text-muted-foreground">
              {enabled
                ? t('notifications.builder.toggleOn')
                : t('notifications.builder.toggleOff')}
            </span>
            <Switch
              checked={enabled}
              onCheckedChange={() => toggleRule(ruleId)}
            />
          </div>
        </div>

        <div className="mt-6 space-y-5">
          <PairsRow
            ruleId={ruleId}
            price={price}
            bindings={ruleBindings}
            onRemove={removeBinding}
            onAdd={addBinding}
          />

          <SimpleAlertTriggerFields
            spec={spec}
            currentPrice={price}
            onChange={update}
          />

          <SimpleAlertChannelPicker
            channels={spec.channels}
            onChange={(channels) => update({ ...spec, channels })}
          />
        </div>

        {/* Footer actions. The builder link sits with delete, not with the
            fields — it is the exit, not part of the form. */}
        <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-(--pane-rule) pt-4">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={testing}
            onClick={handleTest}
          >
            <FlaskConical className="size-3.5" />
            {testing
              ? t('notifications.builder.sidebar.testing')
              : t('notifications.builder.sidebar.sendTest')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => openInBuilder(ruleId)}
          >
            <Workflow className="size-3.5" />
            {t('notifications.simple.openInBuilder')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive"
            onClick={() => deleteRule(ruleId)}
          >
            <Trash2 className="size-3.5" />
            {t('common.delete')}
          </Button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {t('notifications.simple.runsWhileOpen')}
        </p>
      </div>
    </div>
  )
}

// ── Pairs ────────────────────────────────────────────────────────────

/**
 * Which pairs this alert watches.
 *
 * A simple alert arrives with exactly one, set when it was created, so the
 * common case is a single chip and a live price. The add popover exists
 * because the same threshold on a second venue is a real thing to want and
 * the alternative was retyping the whole alert.
 */
function PairsRow({
  ruleId,
  price,
  bindings,
  onRemove,
  onAdd,
}: {
  ruleId: string
  price: number | null
  bindings: Array<{ id: string; pair: string; market: string }>
  onRemove: (id: string) => void
  onAdd: (ruleId: string, pair: string, market: string) => string
}) {
  const { t } = useTranslation()
  const { defaultMarket, markets } = useAvailableMarkets()
  const [open, setOpen] = useState(false)
  const [pair, setPair] = useState('BTC-USDT')
  const [market, setMarket] = useState(defaultMarket)

  const handleAdd = () => {
    const normalized = pair.trim().toUpperCase()
    if (!normalized.includes('-')) return
    if (bindings.some((b) => b.pair === normalized && b.market === market)) {
      toast.info(t('notifications.builder.sidebar.pairAlreadyBound'))
      return
    }
    onAdd(ruleId, normalized, market)
    setOpen(false)
  }

  return (
    <div>
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {t('notifications.simple.watching')}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {bindings.map((binding, index) => (
          <span
            key={binding.id}
            // A well, not a card: this sits ON the column's card already.
            className="group flex items-center gap-1.5 rounded-[10px] bg-muted/40 px-2 py-1 font-mono text-xs"
          >
            {binding.pair}
            <span className="text-muted-foreground">{binding.market}</span>
            {index === 0 && price != null && price > 0 && (
              <span className="text-muted-foreground/80">
                {price.toLocaleString(undefined, { maximumFractionDigits: 8 })}
              </span>
            )}
            {bindings.length > 1 && (
              <button
                type="button"
                className="opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onRemove(binding.id)}
                aria-label={t('common.delete')}
              >
                <X className="size-3 text-muted-foreground hover:text-destructive" />
              </button>
            )}
          </span>
        ))}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" />
            }
          >
            <Plus className="size-3.5" />
            <span className="text-[11px]">
              {t('notifications.simple.addPair')}
            </span>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-2">
            <div className="flex items-center gap-2">
              <PreviewPairPicker
                market={market}
                pair={pair}
                onPairChange={setPair}
                onSubmit={handleAdd}
              />
              <MarketPicker
                market={market}
                marketOptions={markets}
                onMarketChange={setMarket}
                className="h-7"
              />
              <Button size="sm" className="h-7" onClick={handleAdd}>
                {t('common.add')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {bindings.length === 0 && (
        <p
          className={cn('mt-1 text-[11px] text-amber-600 dark:text-amber-400')}
        >
          {t('notifications.builder.sidebar.noBindings')}
        </p>
      )}
    </div>
  )
}
