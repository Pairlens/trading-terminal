// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * "Share feedback" — the PostHog survey, drawn with our own components.
 *
 * The questions come from PostHog at open time, so wording can change without
 * a release; only our chrome (buttons, notices, labels) is translated —
 * question text is authored in PostHog in English and rendered as-is rather
 * than machine-translated into something the results view can't match.
 *
 * The event contract that makes responses aggregate in PostHog's Surveys UI
 * lives in `@/lib/survey`.
 */

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@pairlens/ui/components/ui/button'
import { Checkbox } from '@pairlens/ui/components/ui/checkbox'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import { Textarea } from '@pairlens/ui/components/ui/textarea'

import type {
  FeedbackSurvey,
  FeedbackSurveyQuestion,
  SurveyResponses,
} from '@/lib/survey'
import { isAnalyticsConfigured, useAnalyticsEnabled } from '@/lib/analytics'
import {
  FEEDBACK_SURVEY_FALLBACK,
  captureSurveyDismissed,
  captureSurveySent,
  captureSurveyShown,
  fetchFeedbackSurvey,
  newSurveySubmissionId,
} from '@/lib/survey'

function isAnswered(
  question: FeedbackSurveyQuestion,
  responses: SurveyResponses,
): boolean {
  const value = responses[question.id]
  if (value === undefined) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

export function SurveyForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const [analyticsEnabled, setAnalyticsEnabled] = useAnalyticsEnabled()
  const configured = isAnalyticsConfigured()

  const [survey, setSurvey] = useState<FeedbackSurvey | null>(null)
  const [responses, setResponses] = useState<SurveyResponses>({})
  const [openChoiceText, setOpenChoiceText] = useState<Record<string, string>>(
    {},
  )
  const [sending, setSending] = useState(false)

  // Mirrors for the unmount handler — a dialog closed without a submit is a
  // dismissal, and the handler must not close over stale state.
  const submissionId = useRef(newSurveySubmissionId())
  const shownRef = useRef(false)
  const sentRef = useRef(false)
  const surveyRef = useRef<FeedbackSurvey | null>(null)
  const responsesRef = useRef<SurveyResponses>({})
  surveyRef.current = survey
  responsesRef.current = responses

  // Load the definition. With consent granted this is the live survey; with
  // consent still off there is no client to ask, so the known-good shapes
  // stand in until the user opts in at submit time.
  useEffect(() => {
    let active = true
    if (!configured) {
      setSurvey(FEEDBACK_SURVEY_FALLBACK)
      return
    }
    if (!analyticsEnabled) {
      setSurvey(FEEDBACK_SURVEY_FALLBACK)
      return
    }
    void fetchFeedbackSurvey().then((fetched) => {
      if (!active) return
      const resolved = fetched ?? FEEDBACK_SURVEY_FALLBACK
      setSurvey(resolved)
      if (shownRef.current) return
      shownRef.current = true
      captureSurveyShown(resolved)
    })
    return () => {
      active = false
    }
  }, [analyticsEnabled, configured])

  // Closed (or tabbed away and closed) without sending — report the drop-off
  // with whatever was filled in, exactly as posthog-js would.
  useEffect(() => {
    return () => {
      if (!shownRef.current || sentRef.current) return
      const current = surveyRef.current
      if (!current) return
      captureSurveyDismissed(
        current,
        responsesRef.current,
        submissionId.current,
      )
    }
  }, [])

  const setResponse = (
    questionId: string,
    value: string | number | Array<string> | undefined,
  ) => {
    setResponses((prev) => {
      const next = { ...prev }
      if (value === undefined) delete next[questionId]
      else next[questionId] = value
      return next
    })
  }

  const missingRequired = (survey?.questions ?? []).some(
    (question) =>
      question.optional !== true && !isAnswered(question, responses),
  )

  const send = async () => {
    if (!survey || missingRequired || sending) return
    setSending(true)
    let definition = survey
    if (!analyticsEnabled) {
      // Explicit, labelled consent — this only runs from the button that says
      // it enables analytics. With a client available, take the chance to
      // swap in the live definition before reporting.
      setAnalyticsEnabled(true)
      definition = (await fetchFeedbackSurvey()) ?? survey
      setSurvey(definition)
    }
    if (!shownRef.current) {
      shownRef.current = true
      captureSurveyShown(definition)
    }
    sentRef.current = true
    captureSurveySent(definition, responses, submissionId.current)
    setSending(false)
    toast.success(t('feedback.surveySent'))
    onDone()
  }

  if (!survey) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {survey.questions.map((question) => (
        <div className="space-y-2" key={question.id}>
          <Label className="items-start leading-snug">
            {question.question}
            {question.optional === true ? (
              <span className="font-normal text-muted-foreground">
                {t('feedback.optional')}
              </span>
            ) : null}
          </Label>
          {question.description ? (
            <p className="text-xs text-muted-foreground">
              {question.description}
            </p>
          ) : null}

          {question.type === 'rating' ? (
            <RatingQuestion
              onSelect={(value) => setResponse(question.id, value)}
              question={question}
              value={responses[question.id]}
            />
          ) : question.type === 'multiple_choice' ||
            question.type === 'single_choice' ? (
            <ChoiceQuestion
              onChange={(value) => setResponse(question.id, value)}
              openChoiceText={openChoiceText[question.id] ?? ''}
              onOpenChoiceText={(text) =>
                setOpenChoiceText((prev) => ({ ...prev, [question.id]: text }))
              }
              question={question}
              value={responses[question.id]}
            />
          ) : (
            <Textarea
              className="min-h-24"
              onChange={(event) =>
                setResponse(question.id, event.target.value || undefined)
              }
              placeholder={t('feedback.surveyOpenPlaceholder')}
              value={
                typeof responses[question.id] === 'string'
                  ? (responses[question.id] as string)
                  : ''
              }
            />
          )}
        </div>
      ))}

      {!analyticsEnabled ? (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          {t('feedback.consentNotice')}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button onClick={onDone} type="button" variant="ghost">
          {t('common.cancel')}
        </Button>
        <Button
          disabled={missingRequired || sending}
          onClick={() => void send()}
          type="button"
        >
          {analyticsEnabled
            ? t('feedback.surveySubmit')
            : t('feedback.enableAndSend')}
        </Button>
      </div>
    </div>
  )
}

function RatingQuestion({
  question,
  value,
  onSelect,
}: {
  question: FeedbackSurveyQuestion
  value: string | number | Array<string> | undefined
  onSelect: (value: number) => void
}) {
  const scale = question.scale ?? 5
  const options = Array.from({ length: scale }, (_, index) => index + 1)

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <Button
            aria-pressed={value === option}
            className="w-9"
            key={option}
            onClick={() => onSelect(option)}
            size="sm"
            type="button"
            variant={value === option ? 'default' : 'outline'}
          >
            {option}
          </Button>
        ))}
      </div>
      {question.lowerBoundLabel || question.upperBoundLabel ? (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{question.lowerBoundLabel}</span>
          <span>{question.upperBoundLabel}</span>
        </div>
      ) : null}
    </div>
  )
}

function ChoiceQuestion({
  question,
  value,
  onChange,
  openChoiceText,
  onOpenChoiceText,
}: {
  question: FeedbackSurveyQuestion
  value: string | number | Array<string> | undefined
  onChange: (value: Array<string> | undefined) => void
  openChoiceText: string
  onOpenChoiceText: (text: string) => void
}) {
  const { t } = useTranslation()
  const choices = question.choices ?? []
  const selected = Array.isArray(value) ? value : []
  const single = question.type === 'single_choice'
  // `hasOpenChoice` means the LAST choice is the open one (PostHog's own
  // convention — its editor stores it as a real choice named "Other"), and
  // its response value is whatever the user typed.
  const openIndex = question.hasOpenChoice ? choices.length - 1 : -1
  const openLabel = openIndex === -1 ? '' : choices[openIndex]
  const [openChecked, setOpenChecked] = useState(false)

  const commit = (next: Array<string>, openText: string, checked: boolean) => {
    // Empty box falls back to the choice's own label. A survey configured
    // with `hasOpenChoice` but no "Other" entry (possible over the API) would
    // otherwise silently swallow a real choice the user ticked.
    const withOpen = checked ? [...next, openText.trim() || openLabel] : next
    onChange(withOpen.length > 0 ? withOpen : undefined)
  }

  const fixedSelected = selected.filter((entry) =>
    choices.slice(0, openIndex === -1 ? undefined : openIndex).includes(entry),
  )

  const toggle = (choice: string, checked: boolean) => {
    const next = single
      ? checked
        ? [choice]
        : []
      : checked
        ? [...fixedSelected, choice]
        : fixedSelected.filter((entry) => entry !== choice)
    commit(next, openChoiceText, openChecked)
  }

  return (
    <div className="space-y-2">
      {choices.map((choice, index) =>
        index === openIndex ? (
          <div className="space-y-2" key={choice}>
            <div className="flex items-center gap-2">
              <Checkbox
                checked={openChecked}
                id={`${question.id}-open`}
                onCheckedChange={(checked) => {
                  const next = checked === true
                  setOpenChecked(next)
                  commit(fixedSelected, openChoiceText, next)
                }}
              />
              <Label className="font-normal" htmlFor={`${question.id}-open`}>
                {choice}
              </Label>
            </div>
            {openChecked ? (
              <Input
                onChange={(event) => {
                  onOpenChoiceText(event.target.value)
                  commit(fixedSelected, event.target.value, true)
                }}
                placeholder={t('feedback.surveyOtherPlaceholder')}
                value={openChoiceText}
              />
            ) : null}
          </div>
        ) : (
          <div className="flex items-center gap-2" key={choice}>
            <Checkbox
              checked={fixedSelected.includes(choice)}
              id={`${question.id}-${index}`}
              onCheckedChange={(checked) => toggle(choice, checked === true)}
            />
            <Label className="font-normal" htmlFor={`${question.id}-${index}`}>
              {choice}
            </Label>
          </div>
        ),
      )}
    </div>
  )
}
