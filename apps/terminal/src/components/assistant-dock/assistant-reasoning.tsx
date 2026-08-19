// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── The model thinking out loud ──────────────────────────────────────
//
// `sendReasoning` defaults to true in the AI SDK, so a reasoning model
// streams its thinking into the message like any other part. Until this
// component existed the renderer dropped those parts on the floor, which
// meant that on an o-series, an extended-thinking Claude or a reasoning
// model through OpenRouter the user watched three dots for however long
// the model reasoned, with nothing to say it was working.
//
// Open while it streams, closed once the answer starts. Thinking is
// worth watching live and worth almost nothing afterwards, but it is
// still the receipts for an answer someone may not believe, so it stays
// one click away rather than being thrown out.

import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Brain, ChevronDown, ChevronRight } from 'lucide-react'

export type AssistantReasoningProps = {
  text: string
  /** The part is still arriving. */
  streaming: boolean
}

export function AssistantReasoning({
  text,
  streaming,
}: AssistantReasoningProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(streaming)
  // Once the user has an opinion, the automatic open/close stops. Somebody
  // reading the reasoning while the answer lands should not have it shut in
  // their face.
  const touchedRef = useRef(false)

  // Wall-clock, not a token count: "reasoned for 12s" is the thing a user
  // actually felt. Only meaningful for a part we watched arrive — replayed
  // history mounts already finished and gets no duration.
  const startedRef = useRef(streaming ? Date.now() : 0)
  const [elapsedMs, setElapsedMs] = useState<number | null>(null)
  const wasStreamingRef = useRef(streaming)

  useEffect(() => {
    if (streaming && !wasStreamingRef.current) startedRef.current = Date.now()
    if (!streaming && wasStreamingRef.current && startedRef.current) {
      setElapsedMs(Date.now() - startedRef.current)
    }
    wasStreamingRef.current = streaming
    if (touchedRef.current) return
    setOpen(streaming)
  }, [streaming])

  if (!text.trim()) return null

  const label =
    elapsedMs != null
      ? t('copilot.reasonedFor', {
          seconds: Math.max(1, Math.round(elapsedMs / 1000)),
        })
      : t('copilot.reasoning')

  return (
    <div className="w-full min-w-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          touchedRef.current = true
          setOpen((value) => !value)
        }}
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded-[6px] py-0.5 text-[11px]"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" />
        ) : (
          <ChevronRight className="size-3 shrink-0" />
        )}
        <Brain
          className="size-3 shrink-0"
          style={{ color: 'var(--magic-1)' }}
        />
        <span className={streaming ? 'magic-text' : undefined}>{label}</span>
      </button>

      {open ? (
        // A quiet rail rather than a card: this is an aside to the answer
        // below it, and boxing it would give it the same weight.
        <div className="text-muted-foreground mt-1.5 ml-1.5 max-h-64 overflow-y-auto border-l-2 border-[var(--ai-edge)] pl-2.5 text-[11px] leading-relaxed whitespace-pre-wrap">
          {text}
        </div>
      ) : null}
    </div>
  )
}
