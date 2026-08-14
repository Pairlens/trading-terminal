// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Alerts on a phone: the list, and the two-field form that fills it.
 *
 * The desktop has two front doors — the New alert dialog and the flow builder
 * behind it. This surface deliberately carries only the first. A canvas of
 * steps and edges is not a thing anyone drags into place with a thumb, and
 * `/notifications` stays in `DESKTOP_ONLY_PREFIXES` precisely so a shared link
 * to it redirects rather than pretending otherwise.
 *
 * What it does NOT do is hide the other kind. Flows built on the laptop are
 * listed under their own heading with their switches live and nothing else:
 * silencing an alert from a phone is the whole reason this screen exists, and
 * an alert the phone refused to show would be the one still firing at 3am.
 *
 * The form pieces are the desktop's own (`components/notifications/
 * simple-alert-form`), imported rather than reimplemented — mobile may import
 * from the app, and a second copy of "what is a valid alert" is how the two
 * surfaces start disagreeing. Only the frame around them is local: a
 * full-height `MobileSheet` with the pair fixed to what the chart is showing,
 * where the desktop dialog carries pair and venue pickers of its own.
 */
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { BellOff, ChevronLeft, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Switch } from '@pairlens/ui/components/ui/switch'
import { readSimpleAlert } from '@pairlens/notification-engine/simple-alerts'

import { useMobileActions, useMobileFocus } from '../mobile-focus-context'
import { MobileSheet, useSheetExit } from '../primitives/mobile-sheet'
import { PRESS } from '../primitives/press'
import type { MobileOverlay } from '../mobile-focus-context'
import type { NotificationRuleDSL } from '@pairlens/notification-engine'
import type { SimpleAlertSpec } from '@pairlens/notification-engine/simple-alerts'
import {
  SimpleAlertChannelPicker,
  SimpleAlertKindPicker,
  SimpleAlertTriggerFields,
  defaultSimpleAlertSpec,
  formatAlertPrice,
  hasChannel,
  simpleAlertSummary,
} from '@/components/notifications/simple-alert-form'
import { useNotificationStore } from '@/stores/notification-store'
import { useLivePairPrice } from '@/hooks/use-live-pair-price'
import { haptic } from '@/lib/haptics'

type AlertsSheetProps = {
  overlay: Extract<MobileOverlay, { kind: 'alerts' }>
  onClose: () => void
}

/** Which of the two things this sheet is: the list, or one alert. */
type AlertsView =
  | { mode: 'list' }
  | { mode: 'new' }
  | { mode: 'edit'; ruleId: string }

/** A rule the two-field form can express, with the pair it is armed on. */
type SimpleAlertEntry = {
  rule: NotificationRuleDSL
  spec: SimpleAlertSpec
  pair: string
  market: string
}

export default memo(function AlertsSheet({
  overlay,
  onClose,
}: AlertsSheetProps) {
  const { t } = useTranslation()
  const { focusedPair, focusedVenue } = useMobileFocus()
  const { open, isClosing, requestClose } = useSheetExit(onClose, overlay)
  const [view, setView] = useState<AlertsView>({ mode: 'list' })

  const rules = useNotificationStore((s) => s.rules)
  const bindings = useNotificationStore((s) => s.bindings)

  // One pass, two lists: what the form can express, and what it cannot. The
  // split is `readSimpleAlert`'s answer and nothing else — the same recogniser
  // the desktop uses to decide which editor to open, so a rule never reads as
  // simple on one surface and advanced on the other.
  const { alerts, flows } = useMemo(() => {
    const simple: Array<SimpleAlertEntry> = []
    const advanced: Array<NotificationRuleDSL> = []
    for (const rule of rules) {
      const spec = readSimpleAlert(rule)
      if (!spec) {
        advanced.push(rule)
        continue
      }
      const binding = bindings.find((b) => b.ruleId === rule.id)
      simple.push({
        rule,
        spec,
        pair: binding?.pair ?? '',
        market: binding?.market ?? '',
      })
    }
    // The pair on screen first — this sheet opened from the chart showing it,
    // and "is my BTC alert still armed?" is the question that brought the user
    // here. Newest first within each group.
    simple.sort((a, b) => {
      const aFocused = a.pair === focusedPair
      const bFocused = b.pair === focusedPair
      if (aFocused !== bFocused) return aFocused ? -1 : 1
      return (b.rule.createdAt ?? 0) - (a.rule.createdAt ?? 0)
    })
    return { alerts: simple, flows: advanced }
  }, [rules, bindings, focusedPair])

  const editing =
    view.mode === 'edit'
      ? alerts.find((entry) => entry.rule.id === view.ruleId)
      : undefined

  // An edit view whose rule is gone (deleted here, or unbound on the laptop
  // while this sheet was open) falls back to the list rather than rendering a
  // form over nothing.
  const formMode = view.mode === 'new' || editing ? view.mode : 'list'

  const backToList = useCallback(() => setView({ mode: 'list' }), [])

  const title =
    formMode === 'new'
      ? t('notifications.simple.newTitle')
      : formMode === 'edit'
        ? t('mobile.alerts.editTitle')
        : t('mobile.shell.overlays.alerts')

  return (
    <MobileSheet
      band="full"
      header={
        <div className="flex items-center gap-3 px-4 pb-2.5">
          {formMode === 'list' ? null : (
            <button
              aria-label={t('common.cancel')}
              className="pl-hit-44 pl-press-soft -ml-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
              onClick={backToList}
              type="button"
              {...PRESS}
            >
              <ChevronLeft className="size-5" />
            </button>
          )}
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-[-0.02em] text-foreground">
            {title}
          </h2>
          {formMode === 'list' ? (
            <>
              <button
                aria-label={t('notifications.simple.newTitle')}
                className="pl-hit-44 pl-press-soft flex size-9 shrink-0 items-center justify-center rounded-full text-foreground"
                onClick={() => setView({ mode: 'new' })}
                type="button"
                {...PRESS}
              >
                <Plus className="size-5" />
              </button>
              <button
                className="pl-hit-44 pl-press-text shrink-0 text-[13.5px] font-medium text-foreground"
                onClick={requestClose}
                type="button"
                {...PRESS}
              >
                {t('common.cancel')}
              </button>
            </>
          ) : null}
        </div>
      }
      label={t('mobile.shell.overlays.alerts')}
      onOpenChange={(next) => {
        if (!next) requestClose()
      }}
      open={open}
    >
      {/* The tab bar floats above the sheet, so the content ends where it
          starts — the same clearance every full-height screen takes. */}
      <div className="pb-[var(--pl-tabbar-total)]">
        {formMode === 'list' ? (
          <AlertList
            alerts={alerts}
            flows={flows}
            onEdit={(ruleId) => setView({ mode: 'edit', ruleId })}
            onNew={() => setView({ mode: 'new' })}
          />
        ) : (
          <AlertForm
            entry={editing}
            isClosing={isClosing}
            key={editing?.rule.id ?? 'new'}
            market={editing?.market || focusedVenue}
            onDone={backToList}
            pair={editing?.pair || focusedPair}
          />
        )}
      </div>
    </MobileSheet>
  )
})

// ── List ─────────────────────────────────────────────────────────────

function AlertList({
  alerts,
  flows,
  onEdit,
  onNew,
}: {
  alerts: Array<SimpleAlertEntry>
  flows: Array<NotificationRuleDSL>
  onEdit: (ruleId: string) => void
  onNew: () => void
}) {
  const { t } = useTranslation()

  if (alerts.length === 0 && flows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-8 pt-16 text-center">
        <BellOff className="size-9 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">
          {t('mobile.alerts.empty')}
        </p>
        <p className="max-w-xs text-xs leading-snug text-muted-foreground">
          {t('mobile.alerts.emptyHint')}
        </p>
        <button
          className="pl-press mt-2 rounded-full bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground"
          onClick={onNew}
          type="button"
          {...PRESS}
        >
          {t('notifications.simple.newTitle')}
        </button>
      </div>
    )
  }

  return (
    <>
      {alerts.map((entry) => (
        <AlertRow entry={entry} key={entry.rule.id} onEdit={onEdit} />
      ))}

      {/* Flows: switches only. There is no builder on this surface and there
          is not going to be one, so the row says where it came from rather
          than offering a tap that leads nowhere. */}
      {flows.length > 0 ? (
        <section>
          <h3 className="px-4 pb-1 pt-5 text-[9.5px] font-semibold uppercase leading-none tracking-[0.09em] text-muted-foreground">
            {t('notifications.flows')}
          </h3>
          <p className="px-4 pb-1.5 text-[11px] leading-snug text-muted-foreground">
            {t('mobile.alerts.flowsHint')}
          </p>
          {flows.map((rule) => (
            <FlowRow key={rule.id} rule={rule} />
          ))}
        </section>
      ) : null}
    </>
  )
}

/**
 * The row's own markup rather than `MobileRow`, for one structural reason:
 * `MobileRow` renders a `<button>` when pressable, and the switch this row
 * exists for is a button too. Nesting them is invalid and, on touch, a tap on
 * the switch also opens the editor. So the body is the button and the switch
 * is its sibling — the row's padding, height and hairline still match the
 * primitive exactly.
 */
const AlertRow = memo(function AlertRow({
  entry,
  onEdit,
}: {
  entry: SimpleAlertEntry
  onEdit: (ruleId: string) => void
}) {
  const { t } = useTranslation()
  const toggleRule = useNotificationStore((s) => s.toggleRule)
  const enabled = entry.rule.enabled !== false

  return (
    <div className="flex min-h-[44px] w-full items-center gap-[11px] border-t border-t-[color:var(--pl-hairline)] px-4 py-2.5">
      <button
        className="pl-press-soft flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
        onClick={() => onEdit(entry.rule.id)}
        type="button"
        {...PRESS}
      >
        <span className="min-w-0 max-w-full truncate text-[14.5px] font-semibold leading-tight text-foreground">
          {entry.pair || entry.rule.name}
        </span>
        <span className="min-w-0 max-w-full truncate text-[11px] font-normal leading-tight text-muted-foreground">
          {simpleAlertSummary(t, entry.spec, entry.pair, entry.market)}
        </span>
      </button>
      <Switch
        aria-label={t('mobile.alerts.toggleA11y', { name: entry.rule.name })}
        checked={enabled}
        className="shrink-0"
        onCheckedChange={() => {
          // From the gesture, not from the state change: the tick answers the
          // finger even when the store write is a frame behind it.
          haptic('selection')
          toggleRule(entry.rule.id)
        }}
      />
    </div>
  )
})

const FlowRow = memo(function FlowRow({ rule }: { rule: NotificationRuleDSL }) {
  const { t } = useTranslation()
  const toggleRule = useNotificationStore((s) => s.toggleRule)

  return (
    <div className="flex min-h-[44px] w-full items-center gap-[11px] border-t border-t-[color:var(--pl-hairline)] px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold leading-tight text-foreground">
        {rule.name}
      </span>
      <Switch
        aria-label={t('mobile.alerts.toggleA11y', { name: rule.name })}
        checked={rule.enabled !== false}
        className="shrink-0"
        onCheckedChange={() => {
          haptic('selection')
          toggleRule(rule.id)
        }}
      />
    </div>
  )
})

// ── Form ─────────────────────────────────────────────────────────────

/**
 * Create and edit, one component: the two differ by which store action the
 * commit button calls and whether Delete is offered. The pair is fixed — a new
 * alert is armed on the chart's pair, an edited one stays on its own — so the
 * desktop dialog's pair and venue pickers have no counterpart here.
 *
 * This is the only part of the sheet that subscribes to a ticker, and it does
 * so for the two things the level field needs: a suggestion near the market
 * when the form opens at zero, and the tap-to-fill "Now" readout. The list
 * view holds no subscription at all.
 */
function AlertForm({
  entry,
  pair,
  market,
  onDone,
  isClosing,
}: {
  entry: SimpleAlertEntry | undefined
  pair: string
  market: string
  onDone: () => void
  isClosing: () => boolean
}) {
  const { t } = useTranslation()
  const { pushOverlay } = useMobileActions()
  const createSimpleAlert = useNotificationStore((s) => s.createSimpleAlert)
  const updateSimpleAlert = useNotificationStore((s) => s.updateSimpleAlert)
  const deleteRule = useNotificationStore((s) => s.deleteRule)

  const { price } = useLivePairPrice(pair, market)

  // Seeded from the shared price cache when it already holds this pair, which
  // is the common case — the shell has been streaming it for the chart.
  const [spec, setSpec] = useState<SimpleAlertSpec>(
    () => entry?.spec ?? defaultSimpleAlertSpec('price-level', price),
  )
  /** Whether the level is the user's number, so a late tick may not move it. */
  const [priceTouched, setPriceTouched] = useState(false)

  // The cache misses on a cold open (first visit, or a pair charted for the
  // first time this session), and the level then sits at zero — which reads as
  // an empty field and, because zero is not a valid level, a Create button
  // that never enables. Measured on a fresh profile, not theorised. So the
  // suggestion is filled in when the first tick lands, and never over a number
  // the user has typed.
  useEffect(() => {
    if (priceTouched || !price || price <= 0) return
    setSpec((prev) => {
      if (prev.kind !== 'price-level' || prev.price !== 0) return prev
      const suggested = defaultSimpleAlertSpec('price-level', price)
      // Only the level. The channels are the user's, not the suggestion's.
      return suggested.kind === 'price-level'
        ? { ...prev, price: suggested.price }
        : prev
    })
  }, [price, priceTouched])

  const valid =
    hasChannel(spec.channels) &&
    (spec.kind === 'price-level' ? spec.price > 0 : spec.percent > 0)

  const commit = () => {
    if (!valid || isClosing()) return
    if (entry) {
      updateSimpleAlert(entry.rule.id, spec)
    } else {
      createSimpleAlert({ pair, market, spec })
      toast.success(t('notifications.simple.created', { pair }), {
        description: simpleAlertSummary(t, spec, pair, market),
      })
    }
    haptic('selection')
    onDone()
  }

  return (
    // `.pl-alert-form` pins its fields to 16px — see mobile.css. The shared
    // form pieces are sized for a desktop dialog, and iOS Safari zooms the
    // whole viewport when a focused field is under 16px.
    <div className="pl-alert-form space-y-4 px-4 pt-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate font-mono text-[15px] font-semibold text-foreground">
          {pair}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">
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
        currentPrice={price}
        onChange={(next) => {
          if (
            next.kind === 'price-level' &&
            spec.kind === 'price-level' &&
            next.price !== spec.price
          ) {
            setPriceTouched(true)
          }
          setSpec(next)
        }}
        spec={spec}
      />

      <SimpleAlertChannelPicker
        channels={spec.channels}
        onChange={(channels) => setSpec({ ...spec, channels })}
        // The desktop's settings DIALOG is mounted under `_terminal`, which
        // never renders at this width — so its default "Connect" link would be
        // a button that does nothing. The phone's own settings screen goes on
        // the overlay stack above this sheet, and back returns here.
        onConnectTelegram={() =>
          pushOverlay({ kind: 'settings', section: 'notifications' })
        }
      />

      <p className="rounded-md bg-muted/60 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
        {simpleAlertSummary(t, spec, pair, market)}
      </p>

      <button
        className="pl-press w-full rounded-full bg-primary py-3 text-[14px] font-semibold text-primary-foreground disabled:opacity-40"
        disabled={!valid}
        onClick={commit}
        type="button"
        {...PRESS}
      >
        {entry ? t('common.save') : t('notifications.simple.create')}
      </button>

      {entry ? (
        <button
          className="pl-press-text w-full py-2 text-[13px] font-medium text-down"
          onClick={() => {
            if (isClosing()) return
            deleteRule(entry.rule.id)
            haptic('selection')
            onDone()
          }}
          type="button"
          {...PRESS}
        >
          {t('common.delete')}
        </button>
      ) : null}
    </div>
  )
}
