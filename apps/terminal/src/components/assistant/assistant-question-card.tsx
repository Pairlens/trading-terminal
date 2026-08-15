// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The assistant asking the user something, as a card in the thread.
 *
 * `ask_user` is the one tool with no `execute`: the model's turn ends on the
 * call, this card renders its options, and the answer the user taps becomes
 * the tool result that lets the run continue. That is the difference between
 * a builder that decides your timeframe for you and one that asks.
 *
 * Typing in the composer answers it too — the panel routes a typed message to
 * the pending question rather than sending it as a new turn, so ignoring the
 * buttons is a valid way to answer rather than a way to strand the run.
 */
import { CircleHelp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'

export type AssistantQuestionOption = {
  label: string
  description?: string
}

export function AssistantQuestionCard({
  question,
  options,
  answer,
  onAnswer,
}: {
  question: string
  options: Array<AssistantQuestionOption>
  /** Set once answered — the card then reads back as a record of the choice. */
  answer: string | null
  onAnswer: (answer: string) => void
}) {
  const { t } = useTranslation()
  const answered = answer !== null

  return (
    <div
      className={cn(
        'rounded-xl px-3 py-2.5 text-xs',
        answered ? 'ai-tile' : 'border border-[var(--ai-ring)]',
      )}
      style={
        answered
          ? undefined
          : {
              background:
                'linear-gradient(180deg, color-mix(in oklch, var(--magic-1) 9%, transparent), transparent)',
            }
      }
    >
      <div className="flex items-start gap-1.5">
        <CircleHelp
          className="mt-px size-3.5 shrink-0"
          style={{ color: answered ? undefined : 'var(--magic-1)' }}
        />
        <p className="min-w-0 flex-1 leading-normal">{question}</p>
      </div>

      {answered ? (
        <p className="mt-1.5 pl-5 text-[11px] text-muted-foreground">
          {t('assistant.youAnswered', { answer })}
        </p>
      ) : (
        <>
          {options.length > 0 && (
            <div className="mt-2 grid gap-1">
              {options.map((option) => (
                <Button
                  key={option.label}
                  variant="outline"
                  size="sm"
                  className="h-auto w-full justify-start whitespace-normal px-2 py-1.5 text-left text-[11px] font-normal"
                  onClick={() => onAnswer(option.label)}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium">{option.label}</span>
                    {option.description && (
                      <span className="text-muted-foreground">
                        {option.description}
                      </span>
                    )}
                  </span>
                </Button>
              ))}
            </div>
          )}
          <p className="mt-1.5 text-[10.5px] text-muted-foreground">
            {options.length > 0
              ? t('assistant.questionHint')
              : t('assistant.questionHintOpen')}
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Read the card's props off a streaming tool part. The input arrives a token
 * at a time, so anything here can be half-written or missing entirely.
 */
export function readQuestion(input: Record<string, unknown> | undefined): {
  question: string
  options: Array<AssistantQuestionOption>
} {
  const question = typeof input?.question === 'string' ? input.question : ''
  const raw = Array.isArray(input?.options) ? input.options : []
  const options: Array<AssistantQuestionOption> = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const { label, description } = entry as Record<string, unknown>
    if (typeof label !== 'string' || label.length === 0) continue
    options.push({
      label,
      description: typeof description === 'string' ? description : undefined,
    })
  }
  return { question, options }
}
