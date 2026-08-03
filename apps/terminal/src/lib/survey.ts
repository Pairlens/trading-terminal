// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The in-app feedback survey, rendered by us and reported to PostHog.
 *
 * The survey is an `api`-type PostHog survey: PostHog owns the questions and
 * the aggregated results, we own the pixels. That is the whole point of the
 * api type — `renderSurvey()` would drop PostHog's own popover chrome into a
 * Warm Precision dialog, so instead we fetch the definition and draw it with
 * our components.
 *
 * What makes the responses show up in PostHog's Surveys results UI is the
 * event contract, not the UI. These helpers replicate exactly what posthog-js
 * captures for its own surveys (see `sendSurveyEvent` / `dismissedSurveyEvent`
 * in posthog-js `src/extensions/surveys/surveys-extension-utils.tsx` and
 * `buildSurveyResponseProperties` in `@posthog/core/surveys`):
 *
 *   'survey shown'      → $survey_id, $survey_name, $survey_iteration(_start_date)
 *   'survey sent'       → the above + $survey_submission_id, $survey_completed,
 *                         $survey_questions, $survey_response_<questionId>,
 *                         $set { $survey_responded/<id>: true }
 *   'survey dismissed'  → the above minus completion, + $survey_partially_completed,
 *                         $set { $survey_dismissed/<id>: true }
 *
 * Response value types are part of the contract too: rating → number,
 * multiple choice → string[], open → string.
 *
 * Everything rides `captureEvent`, so the consent gate and the pre-init queue
 * apply exactly as they do to product events.
 */

import { captureEvent, getPostHogClient } from '@/lib/analytics'

/**
 * The live survey in the Pairlens Terminal PostHog project (id 221692),
 * "Terminal in-app feedback" — type `api`, schedule `always`. Hardcoded
 * because an api survey is addressed by id: there is no popover for PostHog
 * to match on our behalf. Editing the questions in PostHog changes what this
 * dialog renders; changing the survey ID needs a release.
 */
export const FEEDBACK_SURVEY_ID = '019fc7e7-ffca-0000-6dc2-63377ce59f25'
export const FEEDBACK_SURVEY_NAME = 'Terminal in-app feedback'

export type SurveyQuestionType =
  | 'rating'
  | 'multiple_choice'
  | 'single_choice'
  | 'open'
  | 'link'

/** The subset of PostHog's question shape this dialog knows how to draw. */
export type FeedbackSurveyQuestion = {
  id: string
  type: SurveyQuestionType
  question: string
  description?: string | null
  optional?: boolean
  /** rating */
  scale?: number
  display?: 'number' | 'emoji'
  lowerBoundLabel?: string
  upperBoundLabel?: string
  /** choice questions */
  choices?: Array<string>
  hasOpenChoice?: boolean
  /** Set by PostHog when questions are reordered; drives the legacy keys. */
  originalQuestionIndex?: number
}

export type FeedbackSurvey = {
  id: string
  name: string
  questions: Array<FeedbackSurveyQuestion>
  current_iteration?: number | null
  current_iteration_start_date?: string | null
}

/** One answer per question id. Arrays are multi-choice, numbers are ratings. */
export type SurveyResponses = Record<string, string | number | Array<string>>

/**
 * The questions as configured today. Used when the definition can't be
 * fetched (consent still off at submit time, keyless build, network error) so
 * a user who typed an answer never loses it — the ids are what PostHog keys
 * responses on, and they are stable.
 */
export const FEEDBACK_SURVEY_FALLBACK: FeedbackSurvey = {
  id: FEEDBACK_SURVEY_ID,
  name: FEEDBACK_SURVEY_NAME,
  questions: [
    {
      id: 'c2de42ef-98cc-49f9-b14f-dea8b71fde58',
      type: 'rating',
      question: 'How is Pairlens working for you so far?',
      display: 'number',
      scale: 7,
      lowerBoundLabel: 'Frustrating',
      upperBoundLabel: 'Excellent',
    },
    {
      id: 'd15e4313-e487-45e2-b369-24cc334d16a9',
      type: 'multiple_choice',
      question: 'Which parts of Pairlens matter most to you?',
      optional: true,
      choices: [
        'Charts & indicators',
        'AI copilot',
        'Workflows & alerts',
        'Bots & backtesting',
        'Multi-venue trading',
        'Portfolio & accounts',
        'Other',
      ],
      hasOpenChoice: true,
    },
    {
      id: '524fc38e-d70d-41ed-b6d3-68437f7229e2',
      type: 'open',
      question: 'What should we improve next?',
      optional: true,
    },
  ],
}

const SURVEY_FETCH_TIMEOUT_MS = 5_000

/**
 * Fetch the live definition, or null when analytics is off/unavailable.
 *
 * Deliberately `getSurveys` and not `getActiveMatchingSurveys`: the latter
 * filters on the internal targeting flag, which excludes people who already
 * responded — and this survey is `schedule: 'always'`, so returning users are
 * exactly who we still want to hear from.
 */
export async function fetchFeedbackSurvey(): Promise<FeedbackSurvey | null> {
  const client = await getPostHogClient()
  if (!client) return null

  return new Promise<FeedbackSurvey | null>((resolve) => {
    let settled = false
    const done = (survey: FeedbackSurvey | null) => {
      if (settled) return
      settled = true
      resolve(survey)
    }
    // A hung definitions request must not hang the dialog.
    window.setTimeout(() => done(null), SURVEY_FETCH_TIMEOUT_MS)
    try {
      client.getSurveys((surveys) => {
        const match = surveys.find((s) => s.id === FEEDBACK_SURVEY_ID)
        done(match ? (match as unknown as FeedbackSurvey) : null)
      })
    } catch {
      done(null)
    }
  })
}

/** Base identity properties every survey event carries. */
function baseProperties(survey: FeedbackSurvey): Record<string, unknown> {
  return {
    $survey_name: survey.name,
    $survey_id: survey.id,
    $survey_iteration: survey.current_iteration ?? null,
    $survey_iteration_start_date: survey.current_iteration_start_date ?? null,
  }
}

/**
 * `$survey_questions` plus the per-question response keys, mirroring
 * `buildSurveyResponseProperties`. The legacy index-keyed mirror
 * (`$survey_response`, `$survey_response_1`, ...) is emitted only for
 * questions that carry `originalQuestionIndex`, exactly as posthog-js does —
 * it is what older PostHog result views read.
 */
export function surveyResponseProperties(
  survey: FeedbackSurvey,
  responses: SurveyResponses,
): Record<string, unknown> {
  const byQuestionId: Record<string, unknown> = {}
  const legacy: Record<string, unknown> = {}

  for (const question of survey.questions) {
    const value = responses[question.id]
    if (value === undefined) continue
    byQuestionId[`$survey_response_${question.id}`] = value
    if (question.originalQuestionIndex === undefined) continue
    legacy[
      question.originalQuestionIndex === 0
        ? '$survey_response'
        : `$survey_response_${question.originalQuestionIndex}`
    ] = value
  }

  return {
    $survey_questions: survey.questions.map((question) => ({
      id: question.id,
      question: question.question,
      // Copy arrays, exactly as posthog-js's `getSurveyResponseValue` does.
      // Not cosmetic: the same array reference appearing twice in one event
      // is treated as a cycle when the payload is serialized, and the second
      // occurrence — the `$survey_response_<id>` key PostHog's results view
      // actually reads — is dropped. Verified against ingested events.
      response: copyResponse(responses[question.id]),
    })),
    ...byQuestionId,
    ...legacy,
  }
}

function copyResponse(
  value: string | number | Array<string> | undefined,
): string | number | Array<string> | null {
  if (value === undefined) return null
  return Array.isArray(value) ? [...value] : value
}

/** A new id per attempt; ties 'shown' → 'sent'/'dismissed' together. */
export function newSurveySubmissionId(): string {
  return crypto.randomUUID()
}

export function captureSurveyShown(survey: FeedbackSurvey): void {
  captureEvent('survey shown', baseProperties(survey))
}

export function captureSurveySent(
  survey: FeedbackSurvey,
  responses: SurveyResponses,
  submissionId: string,
): void {
  captureEvent('survey sent', {
    ...baseProperties(survey),
    $survey_submission_id: submissionId,
    $survey_completed: true,
    ...surveyResponseProperties(survey, responses),
    $set: { [`$survey_responded/${survey.id}`]: true },
  })
}

export function captureSurveyDismissed(
  survey: FeedbackSurvey,
  responses: SurveyResponses,
  submissionId: string,
): void {
  captureEvent('survey dismissed', {
    ...baseProperties(survey),
    $survey_partially_completed: Object.keys(responses).length > 0,
    $survey_submission_id: submissionId,
    ...surveyResponseProperties(survey, responses),
    $set: { [`$survey_dismissed/${survey.id}`]: true },
  })
}
