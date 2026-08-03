// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The one place a user can talk back from inside the app, with two paths
 * behind one entry point:
 *
 *   - "Share feedback" → the PostHog survey (rating, what matters, what to
 *     improve), rendered by us from the live definition.
 *   - "Report a bug" → free-text, ours end to end, and the path that still
 *     works when the survey can't be reached.
 *
 * Tabs rather than a two-card first step: both paths are one click deep, and
 * someone who opened the wrong one switches without losing what they typed
 * (the survey panel stays mounted).
 */

import { useState } from 'react'

import { useTranslation } from 'react-i18next'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@pairlens/ui/components/ui/tabs'

import { BugReportForm } from './bug-report-form'
import { SurveyForm } from './survey-form'
import { isAnalyticsConfigured } from '@/lib/analytics'

type FeedbackTab = 'survey' | 'bug'

type FeedbackDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const { t } = useTranslation()
  // No analytics key in this build means the survey can never be reported;
  // the bug form still has its copy-to-clipboard path, so it takes over.
  const surveyAvailable = isAnalyticsConfigured()
  const [tab, setTab] = useState<FeedbackTab>(
    surveyAvailable ? 'survey' : 'bug',
  )

  const close = () => onOpenChange(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('feedback.dialogTitle')}</DialogTitle>
          <DialogDescription>{t('feedback.description')}</DialogDescription>
        </DialogHeader>

        <Tabs
          onValueChange={(value) => setTab(value as FeedbackTab)}
          value={tab}
        >
          <TabsList className="w-full">
            <TabsTrigger disabled={!surveyAvailable} value="survey">
              {t('feedback.tabSurvey')}
            </TabsTrigger>
            <TabsTrigger value="bug">{t('feedback.title')}</TabsTrigger>
          </TabsList>

          <TabsContent
            className="max-h-[55vh] overflow-y-auto pt-2"
            keepMounted
            value="survey"
          >
            {surveyAvailable ? <SurveyForm onDone={close} /> : null}
          </TabsContent>
          <TabsContent className="pt-2" value="bug">
            <BugReportForm onDone={close} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
