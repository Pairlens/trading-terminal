// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Sizing and guard editors, shared by the create flow and the detail panel.
 *
 * They live together because they share one conversion rule: percentages are
 * *stored* as fractions (0.1) and *shown* as percents (10). Splitting the two
 * editors across files invited two versions of that rule, which is exactly the
 * kind of off-by-100 nobody notices until a bot sizes 1000% of equity.
 */
import { useTranslation } from 'react-i18next'

import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import type { BotGuardConfig, BotSizing } from '@pairlens/bot-engine/types'

const SIZING_KINDS: Array<BotSizing['kind']> = [
  'percent-equity',
  'fixed-quote',
  'fixed-base',
]

function sizingLabelKey(kind: BotSizing['kind']): string {
  switch (kind) {
    case 'fixed-quote':
      return 'botsPage.sizingFixedQuote'
    case 'fixed-base':
      return 'botsPage.sizingFixedBase'
    case 'percent-equity':
    default:
      return 'botsPage.sizingPercentEquity'
  }
}

export function SizingEditor({
  sizing,
  onChange,
}: {
  sizing: BotSizing
  onChange: (sizing: BotSizing) => void
}) {
  const { t } = useTranslation()
  const isPercent = sizing.kind === 'percent-equity'
  // Percent kinds are stored as fractions; the field speaks percent.
  const shown = isPercent ? sizing.value * 100 : sizing.value

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">{t('botsPage.sizingKind')}</Label>
        <Select
          value={sizing.kind}
          onValueChange={(kind) => {
            if (!kind) return
            // Carrying a raw number across kinds would turn "10%" into
            // "10 BTC", so each kind restarts from its own sane default.
            onChange({
              kind,
              value:
                kind === 'percent-equity'
                  ? 0.1
                  : kind === 'fixed-quote'
                    ? 100
                    : 0.01,
            })
          }}
        >
          <SelectTrigger size="sm" className="w-full text-xs">
            {/* Base UI renders the raw value unless given a renderer — the
                trigger has to say "Percent of equity", not "percent-equity". */}
            <SelectValue>
              {(kind) => t(sizingLabelKey(kind as BotSizing['kind']))}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SIZING_KINDS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(sizingLabelKey(kind))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="bot-sizing-value" className="text-xs">
          {isPercent
            ? t('botsPage.sizingValuePercent')
            : t('botsPage.sizingValueAmount')}
        </Label>
        <Input
          id="bot-sizing-value"
          type="number"
          min={0}
          step={isPercent ? 1 : 0.001}
          value={String(shown)}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (!Number.isFinite(next) || next < 0) return
            onChange({
              kind: sizing.kind,
              value: isPercent ? next / 100 : next,
            })
          }}
          className="font-mono text-xs"
        />
        <p className="text-[11px] text-muted-foreground">
          {t('botsPage.sizingHint')}
        </p>
      </div>
    </div>
  )
}

/** One optional limit. Empty means "no limit", never zero. */
function GuardField({
  id,
  label,
  hint,
  value,
  step,
  onChange,
}: {
  id: string
  label: string
  hint: string
  value: number | undefined
  step: number
  onChange: (value: number | undefined) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={step}
        value={value === undefined ? '' : String(value)}
        onChange={(event) => {
          const raw = event.target.value
          if (raw.trim() === '') {
            onChange(undefined)
            return
          }
          const next = Number(raw)
          if (!Number.isFinite(next) || next < 0) return
          onChange(next)
        }}
        className="font-mono text-xs"
      />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}

export function GuardsEditor({
  guards,
  onChange,
}: {
  guards: BotGuardConfig
  onChange: (guards: BotGuardConfig) => void
}) {
  const { t } = useTranslation()
  const patch = (next: Partial<BotGuardConfig>) =>
    onChange({ ...guards, ...next })

  return (
    // A container query, not a viewport one: this editor renders both in a
    // wide dialog and in the detail page's 22rem settings rail, and only its
    // own width has any bearing on whether two columns fit.
    <div className="@container/guards">
      <div className="grid gap-3 @sm/guards:grid-cols-2">
        <GuardField
          id="guard-daily-loss"
          label={t('botsPage.guardDailyLoss')}
          hint={t('botsPage.guardDailyLossHint')}
          step={1}
          value={
            guards.maxDailyLossPercent === undefined
              ? undefined
              : guards.maxDailyLossPercent * 100
          }
          onChange={(value) =>
            patch({
              maxDailyLossPercent:
                value === undefined ? undefined : value / 100,
            })
          }
        />
        <GuardField
          id="guard-trade-cap"
          label={t('botsPage.guardTradeCap')}
          hint={t('botsPage.guardTradeCapHint')}
          step={1}
          value={guards.maxTradesPerDay}
          onChange={(value) => patch({ maxTradesPerDay: value })}
        />
        <GuardField
          id="guard-position-cap"
          label={t('botsPage.guardPositionCap')}
          hint={t('botsPage.guardPositionCapHint')}
          step={10}
          value={guards.maxPositionQuote}
          onChange={(value) => patch({ maxPositionQuote: value })}
        />
        <GuardField
          id="guard-cooldown"
          label={t('botsPage.guardCooldown')}
          hint={t('botsPage.guardCooldownHint')}
          step={1}
          value={guards.cooldownBars}
          onChange={(value) => patch({ cooldownBars: value })}
        />
        <GuardField
          id="guard-loss-streak"
          label={t('botsPage.guardLossStreak')}
          hint={t('botsPage.guardLossStreakHint')}
          step={1}
          value={guards.maxConsecutiveLosses}
          onChange={(value) => patch({ maxConsecutiveLosses: value })}
        />
      </div>
    </div>
  )
}
