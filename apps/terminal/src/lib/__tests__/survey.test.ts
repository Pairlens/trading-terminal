// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'

import type { FeedbackSurvey } from '@/lib/survey'
import {
  FEEDBACK_SURVEY_FALLBACK,
  surveyResponseProperties,
} from '@/lib/survey'

/**
 * The PostHog survey capture contract. These property names and value types
 * are what makes a response aggregate in PostHog's Surveys results UI — they
 * mirror `buildSurveyResponseProperties` in `@posthog/core/surveys`, so a
 * well-meaning refactor must not quietly reshape them.
 */
describe('survey response properties', () => {
  const [rating, choice, open] = FEEDBACK_SURVEY_FALLBACK.questions

  test('emits one $survey_response_<questionId> per answered question', () => {
    const props = surveyResponseProperties(FEEDBACK_SURVEY_FALLBACK, {
      [rating.id]: 6,
      [choice.id]: ['Charts & indicators', 'Custom Python indicators'],
      [open.id]: 'Faster market switching',
    })

    expect(props[`$survey_response_${rating.id}`]).toBe(6)
    expect(props[`$survey_response_${choice.id}`]).toEqual([
      'Charts & indicators',
      'Custom Python indicators',
    ])
    expect(props[`$survey_response_${open.id}`]).toBe('Faster market switching')
  })

  test('array answers are copied, never shared between the two places', () => {
    // The same array reference in two properties of one event serializes as a
    // cycle, and the `$survey_response_<id>` key is the one that gets dropped.
    const answer = ['Charts & indicators']
    const props = surveyResponseProperties(FEEDBACK_SURVEY_FALLBACK, {
      [choice.id]: answer,
    })
    const questions = props.$survey_questions as Array<{ response: unknown }>

    expect(questions[1].response).toEqual(answer)
    expect(questions[1].response).not.toBe(answer)
    expect(props[`$survey_response_${choice.id}`]).not.toBe(
      questions[1].response,
    )
  })

  test('$survey_questions carries id, text and response for every question', () => {
    const props = surveyResponseProperties(FEEDBACK_SURVEY_FALLBACK, {
      [rating.id]: 3,
    })

    expect(props.$survey_questions).toEqual([
      { id: rating.id, question: rating.question, response: 3 },
      { id: choice.id, question: choice.question, response: null },
      { id: open.id, question: open.question, response: null },
    ])
  })

  test('unanswered questions get no response key at all', () => {
    const props = surveyResponseProperties(FEEDBACK_SURVEY_FALLBACK, {
      [rating.id]: 1,
    })

    expect(`$survey_response_${choice.id}` in props).toBe(false)
    expect(`$survey_response_${open.id}` in props).toBe(false)
  })

  test('mirrors legacy index keys when the definition carries them', () => {
    // PostHog adds `originalQuestionIndex` to fetched definitions; the first
    // question's legacy key is the bare `$survey_response`.
    const survey: FeedbackSurvey = {
      ...FEEDBACK_SURVEY_FALLBACK,
      questions: FEEDBACK_SURVEY_FALLBACK.questions.map((question, index) => ({
        ...question,
        originalQuestionIndex: index,
      })),
    }

    const props = surveyResponseProperties(survey, {
      [rating.id]: 7,
      [open.id]: 'More presets',
    })

    expect(props.$survey_response).toBe(7)
    expect(props.$survey_response_2).toBe('More presets')
    // The unanswered question mirrors nothing.
    expect('$survey_response_1' in props).toBe(false)
  })
})
