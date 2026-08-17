// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Risk Controls — the guardrails the terminal already enforces, made editable
 * where the trade happens.
 *
 * Not a second risk system. Every control writes `risk-config-store`, the same
 * store the 24px risk strip summarises and the guarded order path reads before
 * every placement, so the two can never disagree and a limit set here is live
 * on the next order without a save button.
 *
 * The reference design also sketched an auto-deleverage guard, a funding stop
 * and a "flatten all" button. None of those exist: the first two would be
 * standing automation that has to keep running with the app closed, and the
 * third is an order path, not a setting. Shipping toggles for machinery that is
 * not behind them would be worse than not shipping them, so this pane is the
 * limits that are real.
 *
 * Selectors rather than the whole store: this pane sits beside a chart, and
 * subscribing to the store object would re-render it on every tracked P&L
 * write.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, ShieldAlert, Unlock } from 'lucide-react'

import { cn } from '@pairlens/ui/lib/utils'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import type { BreachAction, ResetInterval } from '@/stores/risk-config-store'
import { useRiskConfigStore } from '@/stores/risk-config-store'

const BREACH_ACTIONS: Array<{ value: BreachAction; labelKey: string }> = [
  { value: 'off', labelKey: 'settings.risk.actionOff' },
  { value: 'warn', labelKey: 'settings.risk.actionWarn' },
  { value: 'block_buys', labelKey: 'settings.risk.actionBlockBuys' },
  { value: 'block_all', labelKey: 'settings.risk.actionBlockAll' },
]

const RESET_INTERVALS: Array<{ value: ResetInterval; labelKey: string }> = [
  { value: '4h', labelKey: 'settings.risk.interval4h' },
  { value: '12h', labelKey: 'settings.risk.interval12h' },
  { value: 'daily', labelKey: 'settings.risk.intervalDaily' },
  { value: 'weekly', labelKey: 'settings.risk.intervalWeekly' },
]

const INTERVAL_MS: Record<ResetInterval, number> = {
  '4h': 4 * 3_600_000,
  '12h': 12 * 3_600_000,
  daily: 24 * 3_600_000,
  weekly: 7 * 24 * 3_600_000,
}

export function RiskControlsPane() {
  const { t } = useTranslation()

  const maxDailyLoss = useRiskConfigStore((s) => s.maxDailyLoss)
  const maxDailyTrades = useRiskConfigStore((s) => s.maxDailyTrades)
  const maxPositionSize = useRiskConfigStore((s) => s.maxPositionSize)
  const dailyLossAction = useRiskConfigStore((s) => s.dailyLossAction)
  const dailyTradesAction = useRiskConfigStore((s) => s.dailyTradesAction)
  const positionSizeAction = useRiskConfigStore((s) => s.positionSizeAction)
  const resetInterval = useRiskConfigStore((s) => s.resetInterval)
  const windowStart = useRiskConfigStore((s) => s.windowStart)
  const dailyPnl = useRiskConfigStore((s) => s.dailyPnl)
  const dailyTradeCount = useRiskConfigStore((s) => s.dailyTradeCount)
  const ordersLocked = useRiskConfigStore((s) => s.ordersLocked)
  const buyOrdersLocked = useRiskConfigStore((s) => s.buyOrdersLocked)
  const updateConfig = useRiskConfigStore((s) => s.updateConfig)
  const unlock = useRiskConfigStore((s) => s.unlock)
  const checkWindowReset = useRiskConfigStore((s) => s.checkWindowReset)

  // Mount-only: the window-reset check must not re-run on store updates, or a
  // P&L write during a live session would re-evaluate the window on every tick.
  useEffect(() => {
    checkWindowReset()
  }, [checkWindowReset])

  const locked = ordersLocked || buyOrdersLocked

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-y-auto p-3">
      {locked && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-2">
          <span className="flex min-w-0 items-center gap-2">
            <Lock className="size-3.5 shrink-0 text-destructive" />
            <span className="truncate text-[11.5px] font-medium text-destructive">
              {ordersLocked
                ? t('settings.risk.lockBanner')
                : t('settings.risk.lockBannerBuys')}
            </span>
          </span>
          <Button
            className="h-6 shrink-0 gap-1 px-2 text-[11px]"
            onClick={() => unlock()}
            size="sm"
            variant="outline"
          >
            <Unlock className="size-3" />
            {t('settings.risk.unlockOrders')}
          </Button>
        </div>
      )}

      <LimitRow
        action={dailyLossAction}
        label={t('riskControls.maxDailyLoss')}
        onAction={(value) => updateConfig({ dailyLossAction: value })}
        onValue={(value) => updateConfig({ maxDailyLoss: value })}
        suffix="%"
        used={t('riskControls.usedPercent', {
          value: Math.abs(Math.min(dailyPnl, 0)).toFixed(1),
        })}
        value={maxDailyLoss}
      />
      <LimitRow
        action={dailyTradesAction}
        integer
        label={t('riskControls.maxDailyTrades')}
        onAction={(value) => updateConfig({ dailyTradesAction: value })}
        onValue={(value) => updateConfig({ maxDailyTrades: Math.floor(value) })}
        used={t('riskControls.usedCount', { value: dailyTradeCount })}
        value={maxDailyTrades}
      />
      <LimitRow
        action={positionSizeAction}
        label={t('riskControls.maxPositionSize')}
        onAction={(value) => updateConfig({ positionSizeAction: value })}
        onValue={(value) => updateConfig({ maxPositionSize: value })}
        suffix="%"
        value={maxPositionSize}
      />

      <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-2">
        <div className="min-w-0">
          <Label className="text-[11.5px] font-medium">
            {t('riskControls.resetWindow')}
          </Label>
          <p className="truncate text-[10.5px] text-muted-foreground">
            {t('riskControls.resetIn', {
              time: formatRemaining(windowStart, resetInterval),
            })}
          </p>
        </div>
        <Select
          items={Object.fromEntries(
            RESET_INTERVALS.map((o) => [o.value, t(o.labelKey)]),
          )}
          onValueChange={(value) =>
            updateConfig({ resetInterval: value as ResetInterval })
          }
          value={resetInterval}
        >
          <SelectTrigger className="h-7 w-[104px] shrink-0 text-[11px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESET_INTERVALS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* The kill switch writes the SAME flag a breach sets, which is what
          makes "unlock" one concept rather than two: a manual halt and a
          tripped limit are cleared by the same button. */}
      <div
        className={cn(
          'flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2',
          ordersLocked ? 'border-destructive/40' : 'border-border',
        )}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11.5px] font-medium">
            <ShieldAlert className="size-3.5 text-muted-foreground" />
            {t('riskControls.killSwitch')}
          </p>
          <p className="truncate text-[10.5px] text-muted-foreground">
            {t('riskControls.killSwitchHint')}
          </p>
        </div>
        <Button
          className="h-7 shrink-0 px-2.5 text-[11px]"
          onClick={() =>
            ordersLocked ? unlock() : updateConfig({ ordersLocked: true })
          }
          size="sm"
          variant={ordersLocked ? 'outline' : 'destructive'}
        >
          {ordersLocked
            ? t('riskControls.resumeOrders')
            : t('riskControls.haltOrders')}
        </Button>
      </div>
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────

function LimitRow({
  label,
  value,
  onValue,
  action,
  onAction,
  suffix,
  integer,
  used,
}: {
  label: string
  value: number
  onValue: (value: number) => void
  action: BreachAction
  onAction: (action: BreachAction) => void
  suffix?: string
  integer?: boolean
  used?: string
}) {
  const { t } = useTranslation()
  // Locally controlled while typing so a half-entered "1." is not rewritten to
  // 1 under the cursor; committed to the store on every parsable keystroke.
  const [draft, setDraft] = useState(value === 0 ? '' : String(value))
  useEffect(() => {
    setDraft(value === 0 ? '' : String(value))
  }, [value])

  return (
    <div className="rounded-lg border border-border px-2.5 py-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="min-w-0 truncate text-[11.5px] font-medium">
          {label}
        </Label>
        <div className="relative w-[74px] shrink-0">
          <Input
            className={cn('h-7 text-[11px]', suffix && 'pr-5')}
            min={0}
            onChange={(event) => {
              const next = event.target.value
              setDraft(next)
              const parsed = Number(next)
              if (next === '') onValue(0)
              else if (Number.isFinite(parsed) && parsed >= 0) onValue(parsed)
            }}
            placeholder="0"
            step={integer ? 1 : 0.1}
            type="number"
            value={draft}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[10.5px] text-muted-foreground">
          {value > 0
            ? (used ?? t('riskControls.perOrder'))
            : t('riskControls.off')}
        </span>
        <Select
          items={Object.fromEntries(
            BREACH_ACTIONS.map((o) => [o.value, t(o.labelKey)]),
          )}
          onValueChange={(next) => onAction(next as BreachAction)}
          value={action}
        >
          <SelectTrigger className="h-6 w-[112px] shrink-0 text-[10.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BREACH_ACTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

/** `3h 12m` until the tracking window resets, floored, never negative. */
function formatRemaining(windowStart: number, interval: ResetInterval): string {
  const total = INTERVAL_MS[interval] ?? INTERVAL_MS.daily
  const remaining = Math.max(0, total - (Date.now() - windowStart))
  const hours = Math.floor(remaining / 3_600_000)
  const minutes = Math.floor((remaining % 3_600_000) / 60_000)
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}
