// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two-question alert form: what should happen, and how should we tell you.
 *
 * Shared verbatim by the New alert dialog and the editor that opens when a
 * simple alert is selected on the Notifications page, so an alert is edited
 * through the same controls that created it. Everything it produces is a
 * `SimpleAlertSpec` — the graph is assembled by the engine, and this file
 * never sees a step or an edge.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell, MessageSquare, Send } from 'lucide-react'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import {
  DEFAULT_SIMPLE_ALERT_CHANNELS,
  PERCENT_WINDOWS,
} from '@pairlens/notification-engine/simple-alerts'

import type {
  PercentWindow,
  SimpleAlertChannels,
  SimpleAlertKind,
  SimpleAlertSpec,
} from '@pairlens/notification-engine/simple-alerts'
import type { TFunction } from 'i18next'
import { useSettingsDialogStore } from '@/stores/settings-dialog-store'
import { useSystemNotificationPermission } from '@/hooks/use-system-notification-permission'
import { useTelegramConnection } from '@/hooks/use-telegram-connection'

// ── Formatting ───────────────────────────────────────────────────────

/**
 * Prices span eight orders of magnitude across the venues we list, so a
 * fixed number of decimals is wrong somewhere: 2 mangles SHIB, 8 makes BTC
 * unreadable. Significant digits are right everywhere.
 */
export function formatAlertPrice(price: number): string {
  if (!Number.isFinite(price) || price === 0) return '0'
  const abs = Math.abs(price)
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 4 : 8
  return price.toLocaleString(undefined, { maximumFractionDigits: digits })
}

/** A round-ish starting level near the live price. */
function suggestLevel(price: number, direction: 'above' | 'below'): number {
  const shifted = direction === 'above' ? price * 1.05 : price * 0.95
  return Number(shifted.toPrecision(price >= 1 ? 5 : 3))
}

export function defaultSimpleAlertSpec(
  kind: SimpleAlertKind,
  currentPrice?: number | null,
): SimpleAlertSpec {
  if (kind === 'price-level') {
    return {
      kind: 'price-level',
      direction: 'above',
      price:
        currentPrice && currentPrice > 0
          ? suggestLevel(currentPrice, 'above')
          : 0,
      channels: { ...DEFAULT_SIMPLE_ALERT_CHANNELS },
    }
  }
  return {
    kind: 'percent-move',
    direction: 'either',
    percent: 5,
    window: '1h',
    channels: { ...DEFAULT_SIMPLE_ALERT_CHANNELS },
  }
}

/** One sentence saying exactly what the alert will do. */
export function simpleAlertSummary(
  t: TFunction,
  spec: SimpleAlertSpec,
  pair: string,
  market: string,
): string {
  if (spec.kind === 'price-level') {
    const key =
      spec.direction === 'above'
        ? 'notifications.simple.summaryAbove'
        : 'notifications.simple.summaryBelow'
    return t(key, { pair, venue: market, price: formatAlertPrice(spec.price) })
  }
  const key =
    spec.direction === 'up'
      ? 'notifications.simple.summaryUp'
      : spec.direction === 'down'
        ? 'notifications.simple.summaryDown'
        : 'notifications.simple.summaryEither'
  return t(key, {
    pair,
    venue: market,
    percent: spec.percent,
    window: spec.window,
  })
}

export function hasChannel(channels: SimpleAlertChannels): boolean {
  return channels.toast || channels.os || channels.telegram
}

// ── Segmented control ────────────────────────────────────────────────

function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex overflow-hidden rounded-md border border-border text-xs',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          className={cn(
            'flex-1 px-2 py-1.5 transition-colors',
            value === option.value
              ? 'bg-primary/12 font-medium text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A number field that lets you type a number.
 *
 * Driving `value` straight off the parsed number eats the half-typed states
 * every decimal has to pass through: "0." parses to 0, `0 || ''` blanks the
 * box, and the level for a token priced at 0.000012 becomes untypeable. So
 * the text is local while focused and re-synced from the model whenever the
 * model means something different from what is on screen.
 */
function NumberField({
  value,
  onValueChange,
  ...props
}: {
  value: number
  onValueChange: (value: number) => void
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [text, setText] = useState(() => (value ? String(value) : ''))

  // Deliberately keyed on `value` alone: re-running when `text` changes would
  // fight the keystroke that produced it.
  useEffect(() => {
    setText((current) => {
      if (parseFloat(current) === value) return current
      if (!value && current.trim() === '') return current
      return value ? String(value) : ''
    })
  }, [value])

  return (
    <Input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const next = e.target.value
        if (next !== '' && !/^\d*\.?\d*$/.test(next)) return
        setText(next)
        onValueChange(parseFloat(next) || 0)
      }}
    />
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  )
}

// ── Kind picker ──────────────────────────────────────────────────────

export function SimpleAlertKindPicker({
  kind,
  onChange,
}: {
  kind: SimpleAlertKind
  onChange: (kind: SimpleAlertKind) => void
}) {
  const { t } = useTranslation()
  const options = [
    {
      value: 'price-level' as const,
      title: t('notifications.simple.kindLevel'),
      hint: t('notifications.simple.kindLevelHint'),
    },
    {
      value: 'percent-move' as const,
      title: t('notifications.simple.kindMove'),
      hint: t('notifications.simple.kindMoveHint'),
    },
  ]
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={kind === option.value}
          className={cn(
            'rounded-lg border px-3 py-2 text-left transition-colors',
            kind === option.value
              ? 'border-primary/50 bg-primary/[0.06]'
              : 'border-border hover:border-primary/30 hover:bg-muted/50',
          )}
          onClick={() => onChange(option.value)}
        >
          <div className="text-[13px] font-medium">{option.title}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {option.hint}
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Trigger fields ───────────────────────────────────────────────────

export function SimpleAlertTriggerFields({
  spec,
  onChange,
  currentPrice,
}: {
  spec: SimpleAlertSpec
  onChange: (spec: SimpleAlertSpec) => void
  currentPrice?: number | null
}) {
  const { t } = useTranslation()

  if (spec.kind === 'price-level') {
    return (
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <FieldLabel>{t('notifications.builder.direction')}</FieldLabel>
          <Segmented
            value={spec.direction}
            options={[
              { value: 'above', label: t('notifications.simple.rises') },
              { value: 'below', label: t('notifications.simple.drops') },
            ]}
            onChange={(direction) => {
              // Flipping direction on an untouched suggestion re-suggests on
              // the other side; a level the user typed is left alone.
              const suggested =
                currentPrice && currentPrice > 0
                  ? suggestLevel(currentPrice, spec.direction)
                  : 0
              const price =
                spec.price === suggested && currentPrice && currentPrice > 0
                  ? suggestLevel(currentPrice, direction)
                  : spec.price
              onChange({ ...spec, direction, price })
            }}
          />
        </div>
        <div>
          <FieldLabel>{t('positions.price')}</FieldLabel>
          <NumberField
            className="h-8 font-mono text-sm"
            value={spec.price}
            onValueChange={(price) => onChange({ ...spec, price })}
          />
          {currentPrice != null && currentPrice > 0 && (
            <button
              type="button"
              className="mt-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground"
              onClick={() =>
                onChange({
                  ...spec,
                  price: Number(currentPrice.toPrecision(6)),
                })
              }
            >
              {t('notifications.simple.currentPrice', {
                price: formatAlertPrice(currentPrice),
              })}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <FieldLabel>{t('notifications.builder.direction')}</FieldLabel>
        <Segmented
          value={spec.direction}
          options={[
            { value: 'up', label: t('notifications.builder.up') },
            { value: 'down', label: t('notifications.builder.down') },
            { value: 'either', label: t('notifications.builder.either') },
          ]}
          onChange={(direction) => onChange({ ...spec, direction })}
        />
      </div>
      <div>
        <FieldLabel>{t('notifications.simple.percent')}</FieldLabel>
        <div className="flex items-center gap-1">
          <NumberField
            className="h-8 font-mono text-sm"
            value={spec.percent}
            onValueChange={(percent) => onChange({ ...spec, percent })}
          />
          <span className="text-xs text-muted-foreground">%</span>
        </div>
      </div>
      <div>
        <FieldLabel>{t('notifications.simple.within')}</FieldLabel>
        <Select
          value={spec.window}
          onValueChange={(window) =>
            onChange({ ...spec, window: window as PercentWindow })
          }
        >
          <SelectTrigger className="h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERCENT_WINDOWS.map((window) => (
              <SelectItem key={window} value={window}>
                {window}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

// ── Channels ─────────────────────────────────────────────────────────

/**
 * Delivery as three chips rather than three nodes on a canvas.
 *
 * Both channels that can be selected and still deliver nothing say so
 * inline: the OS one when the platform permission is missing, Telegram when
 * no bot is connected. Silence is the failure mode alerts cannot afford.
 */
export function SimpleAlertChannelPicker({
  channels,
  onChange,
}: {
  channels: SimpleAlertChannels
  onChange: (channels: SimpleAlertChannels) => void
}) {
  const { t } = useTranslation()
  const telegram = useTelegramConnection()
  const openSettings = useSettingsDialogStore((s) => s.open)
  const { permission, request } = useSystemNotificationPermission()

  const toggle = (key: keyof SimpleAlertChannels) => {
    const next = { ...channels, [key]: !channels[key] }
    onChange(next)
    // Asking here is the honest moment: the user just said they want desktop
    // notifications, so the OS prompt is expected rather than ambushing.
    if (key === 'os' && next.os && permission === 'prompt') void request()
  }

  const options = [
    {
      key: 'toast' as const,
      icon: MessageSquare,
      label: t('notifications.simple.channelToast'),
    },
    {
      key: 'os' as const,
      icon: Bell,
      label: t('notifications.simple.channelOs'),
    },
    {
      key: 'telegram' as const,
      icon: Send,
      label: t('notifications.simple.channelTelegram'),
    },
  ]

  return (
    <div>
      <FieldLabel>{t('notifications.simple.deliverLabel')}</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = channels[option.key]
          const Icon = option.icon
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={active}
              className={cn(
                'flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors',
                active
                  ? 'border-primary/50 bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
              onClick={() => toggle(option.key)}
            >
              <Icon className="size-3.5" />
              {option.label}
            </button>
          )
        })}
      </div>

      {channels.os && permission === 'denied' && (
        <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          {t('notifications.simple.osBlocked')}
        </p>
      )}
      {channels.telegram && !telegram && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {t('notifications.builder.steps.telegram.notConnected')}
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-[11px]"
            onClick={() => openSettings('notifications')}
          >
            {t('notifications.builder.steps.telegram.connect')}
          </Button>
        </p>
      )}
    </div>
  )
}
