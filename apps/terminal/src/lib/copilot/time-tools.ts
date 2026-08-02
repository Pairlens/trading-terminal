// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { tool } from 'ai'
import { z } from 'zod'
import type { CopilotToolDeps } from './tool-deps'

// ---------------------------------------------------------------------------
// Phase 6 — time awareness.
//
// wait: an abortable in-turn sleep so the agent can re-check the market a
// moment later (candle close, fill status) without ending its turn. Bounded
// per call; the loop's step cap bounds the total.
//
// schedule_check: a deferred follow-up. The tool itself only returns a
// confirmation — the panel (onToolCall) arms a timer and, when it fires,
// sends the instruction back into the chat as a new message, starting a fresh
// agent turn with live data access. Fires only while the terminal stays open;
// for price-triggered follow-ups create_price_alert is the durable option.
// ---------------------------------------------------------------------------

export const SCHEDULE_TOOL_NAMES = ['schedule_check'] as const

export const MAX_WAIT_SECONDS = 120
export const MAX_SCHEDULE_MINUTES = 240

export function buildTimeTools(_deps: CopilotToolDeps) {
  return {
    wait: tool({
      description:
        `Pause up to ${MAX_WAIT_SECONDS} seconds before continuing, then re-check data in the same turn — e.g. let a candle close or an order fill. ` +
        'For longer horizons use schedule_check (minutes–hours) or create_price_alert (price-triggered).',
      inputSchema: z.object({
        seconds: z.number().min(1).max(MAX_WAIT_SECONDS),
        reason: z
          .string()
          .optional()
          .describe('Why you are waiting (shown in the tool status)'),
      }),
      execute: async ({ seconds, reason }, { abortSignal }) => {
        const ms = Math.round(
          Math.min(Math.max(seconds, 1), MAX_WAIT_SECONDS) * 1000,
        )
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, ms)
          abortSignal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              reject(new Error('Wait aborted'))
            },
            { once: true },
          )
        })
        return {
          waitedSeconds: Math.round(ms / 1000),
          reason: reason ?? null,
          resumedAt: new Date().toISOString(),
        }
      },
    }),

    schedule_check: tool({
      description:
        `Schedule a follow-up check up to ${MAX_SCHEDULE_MINUTES} minutes from now. When the timer fires, your instruction is sent back to this chat as a new message and you run again with fresh data. ` +
        'Only fires while the terminal stays open — for durable price-triggered follow-ups use create_price_alert instead. Tell the user what you scheduled.',
      inputSchema: z.object({
        delayMinutes: z.number().min(1).max(MAX_SCHEDULE_MINUTES),
        instruction: z
          .string()
          .min(1)
          .max(500)
          .describe(
            'Self-contained instruction for your future run, e.g. "Re-check BTC-USDT 15m: did the breakout hold above $68,000? Update the user."',
          ),
      }),
      // The real timer is armed in the panel (onToolCall) — this result is
      // the model-facing confirmation.
      execute: async ({ delayMinutes }) => ({
        scheduled: true,
        delayMinutes,
        note: `Check scheduled in ${delayMinutes} minute${delayMinutes === 1 ? '' : 's'}. It fires only while the terminal remains open.`,
      }),
    }),
  }
}
