// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The switch that decides whether Pairlens holds this machine open while bots
 * are armed.
 *
 * It lives with the bot list rather than off in settings, because it is the
 * answer to the problem that surface describes. A user reading "your bots stop
 * if this computer sleeps" should find the remedy in the same breath, not have
 * to go looking for it.
 *
 * Desktop only. A browser tab cannot make that promise — the Wake Lock API
 * keeps the *screen* on, which is a different thing — so there the switch is
 * disabled and says so instead of pretending.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Label } from '@pairlens/ui/components/ui/label'
import { Switch } from '@pairlens/ui/components/ui/switch'

import {
  canBlockSleep,
  isKeepAwakeEnabled,
  refreshSleepBlocked,
  setKeepAwakeEnabled,
  subscribeKeepAwake,
} from '@/lib/keep-awake'

type KeepAwakeToggleProps = {
  armed: boolean
  /** Sidebar variant: the hint stacks under the switch instead of beside it. */
  compact?: boolean
}

export function KeepAwakeToggle({
  armed,
  compact = false,
}: KeepAwakeToggleProps) {
  const { t } = useTranslation()
  const [enabled, setEnabled] = useState(isKeepAwakeEnabled)

  useEffect(() => {
    // Another window may hold the same preference; mirror it either way.
    const stop = subscribeKeepAwake(setEnabled)
    // The webview can reload without the process restarting, which would leave
    // the Rust-side assertion and this switch disagreeing.
    void refreshSleepBlocked()
    return stop
  }, [])

  const label = t('botsPage.keepAwakeLabel')
  const hint = canBlockSleep
    ? enabled
      ? armed
        ? t('botsPage.keepAwakeActive')
        : t('botsPage.keepAwakeIdle')
      : t('botsPage.keepAwakeOff')
    : t('botsPage.keepAwakeUnsupported')

  return (
    <div
      className={cn(
        compact
          ? 'grid gap-1'
          : 'mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1',
      )}
    >
      <div className="flex items-center gap-2">
        <Switch
          id="bots-keep-awake"
          checked={canBlockSleep && enabled}
          disabled={!canBlockSleep}
          onCheckedChange={(next) => setKeepAwakeEnabled(next === true)}
          aria-label={label}
        />
        <Label
          htmlFor="bots-keep-awake"
          className={cn(
            'cursor-pointer font-medium',
            compact ? 'text-[11px] leading-tight' : 'text-xs',
          )}
        >
          {label}
        </Label>
      </div>
      {/* The hint carries the "why" for the disabled case too, so a disabled
          switch needs no tooltip — which is just as well, since tooltips on
          disabled controls often never fire. */}
      <span
        className={cn(
          'text-muted-foreground',
          compact ? 'text-[10px] leading-snug' : 'text-xs',
        )}
      >
        {hint}
      </span>
    </div>
  )
}
