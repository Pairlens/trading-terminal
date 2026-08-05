// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The consent gate as a control, not just a sentence.
 *
 * Feedback and bug reports ride the analytics pipe, so with analytics off
 * there is nothing to deliver them through. Saying so was honest but a dead
 * end: someone who wants to report a bug had to leave the dialog for
 * Settings → Privacy, losing what they typed. The switch lives here instead,
 * granting consent in place.
 *
 * Declining still works exactly as before — the submit button keeps its
 * "Enable analytics & send" wording for anyone who ignores the switch, and a
 * build with no analytics key falls back to copy-to-clipboard.
 *
 * The row only shows up for someone who opened the dialog with analytics off,
 * and stays put once flipped rather than vanishing under the pointer — the
 * switch is also the way back out.
 */

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Label } from '@pairlens/ui/components/ui/label'
import { Switch } from '@pairlens/ui/components/ui/switch'

import { isAnalyticsConfigured, useAnalyticsEnabled } from '@/lib/analytics'

export function AnalyticsConsentRow() {
  const { t } = useTranslation()
  const [analyticsEnabled, setAnalyticsEnabled] = useAnalyticsEnabled()
  const [touched, setTouched] = useState(false)
  const switchId = useId()

  // Nothing to consent to in a keyless build; the forms show their own
  // "can't send from the app" notice for that case.
  if (!isAnalyticsConfigured()) return null
  // Already on before the dialog opened — no ask to make.
  if (analyticsEnabled && !touched) return null

  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-dashed p-3">
      <div className="space-y-1">
        <Label className="text-xs" htmlFor={switchId}>
          {t('settings.privacy.title')}
        </Label>
        <p className="text-xs text-muted-foreground">
          {analyticsEnabled
            ? t('feedback.consentEnabledNotice')
            : t('feedback.consentNotice')}
        </p>
      </div>
      <Switch
        checked={analyticsEnabled}
        id={switchId}
        onCheckedChange={(next) => {
          setTouched(true)
          setAnalyticsEnabled(next)
        }}
      />
    </div>
  )
}
