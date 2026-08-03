// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Report a bug" — free-text, ours end to end.
 *
 * Deliberately not a PostHog survey: a bug report has to work even when the
 * survey definition can't be reached, so it rides a plain `bug_report` event
 * we declare in our own taxonomy. It is also the fallback path whenever the
 * survey tab can't run.
 *
 * Consent is the interesting part. Analytics is off by default and reports go
 * through it, so a report typed with analytics off must not be dropped and
 * must not be sent behind the user's back. Two honest outcomes:
 *   - analytics available but off → the notice explains the trade and the
 *     submit button says exactly what it does ("Enable analytics & send").
 *   - build has no analytics key at all → nothing can be sent from the app,
 *     so the report is copied to the clipboard with a link to file it.
 */

import { useState } from 'react'
import { useMatches } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@pairlens/ui/components/ui/button'
import { Label } from '@pairlens/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { Textarea } from '@pairlens/ui/components/ui/textarea'

import { track } from '@/lib/analytics-events'
import { isAnalyticsConfigured, useAnalyticsEnabled } from '@/lib/analytics'
import { useAppVersion } from '@/lib/app-version'
import { REPO_URL } from '@/lib/desktop-download'
import { isStandalone, openExternalUrl } from '@/lib/platform'

const ISSUES_URL = `${REPO_URL}/issues`

const CATEGORIES = [
  { value: 'bug', labelKey: 'feedback.categoryBug' },
  { value: 'idea', labelKey: 'feedback.categoryIdea' },
  { value: 'other', labelKey: 'feedback.categoryOther' },
] as const

type Category = (typeof CATEGORIES)[number]['value']

export function BugReportForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [analyticsEnabled, setAnalyticsEnabled] = useAnalyticsEnabled()
  const configured = isAnalyticsConfigured()
  const version = useAppVersion()
  const matches = useMatches()

  const [category, setCategory] = useState<Category>('bug')
  const [message, setMessage] = useState('')

  // The matched route template, not the resolved path: it says which screen
  // the user was on without carrying workspace/bot ids or symbols.
  const route = matches.at(-1)?.routeId ?? 'unknown'
  const platform = isStandalone ? 'desktop' : 'web'
  const platformLabel = isStandalone
    ? t('settings.about.desktop')
    : t('settings.about.browser')
  const trimmed = message.trim()
  const categoryLabel = (value: string) =>
    t(
      CATEGORIES.find((option) => option.value === value)?.labelKey ??
        'feedback.categoryOther',
    )

  const send = () => {
    if (!trimmed) return
    // Explicit, labelled consent: this only runs from the button that says
    // it enables analytics. The setting writes through localStorage
    // synchronously, so the capture below already sees consent granted.
    if (!analyticsEnabled) setAnalyticsEnabled(true)
    track('bug_report', {
      category,
      message: trimmed,
      app_version: version,
      route,
      platform,
    })
    toast.success(t('feedback.sent'))
    onDone()
  }

  const copyReport = async () => {
    const body = `[${categoryLabel(category)}] ${trimmed}\n\nPairlens v${version} · ${platformLabel} · ${route}`
    try {
      await navigator.clipboard.writeText(body)
      toast.success(t('feedback.copied'))
    } catch {
      toast.error(t('common.error'))
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="bug-report-category">
          {t('feedback.categoryLabel')}
        </Label>
        <Select
          value={category}
          onValueChange={(value) => setCategory(value as Category)}
        >
          <SelectTrigger className="w-40" id="bug-report-category">
            <SelectValue>{(value: string) => categoryLabel(value)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {t(option.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bug-report-message">{t('feedback.messageLabel')}</Label>
        <Textarea
          autoFocus
          className="min-h-28"
          id="bug-report-message"
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t('feedback.messagePlaceholder')}
          value={message}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        {t('feedback.attached', { version, platform: platformLabel, route })}
      </p>

      {!configured ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {t('feedback.unavailableNotice')}
        </p>
      ) : !analyticsEnabled ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {t('feedback.consentNotice')}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {!configured ? (
          <>
            <Button
              onClick={() => void openExternalUrl(ISSUES_URL)}
              type="button"
              variant="ghost"
            >
              {t('feedback.openIssue')}
            </Button>
            <Button
              disabled={!trimmed}
              onClick={() => void copyReport()}
              type="button"
            >
              {t('feedback.copy')}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onDone} type="button" variant="ghost">
              {t('common.cancel')}
            </Button>
            <Button disabled={!trimmed} onClick={send} type="button">
              {analyticsEnabled
                ? t('feedback.submit')
                : t('feedback.enableAndSend')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
