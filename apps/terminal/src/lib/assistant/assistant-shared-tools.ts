// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The two tools every assistant surface gets, whatever it builds.
 *
 * `ask_user` is how a decision that belongs to the user stays with the user.
 * `handoff_to_builder` moves them to another builder and carries the request
 * across; the unified assistant strips it out of its own set, since one chat
 * has nothing to hand over to, and it survives for tool sets built on their
 * own. Both are surface-agnostic, so they live here rather than being copied
 * into each tool set and drifting apart.
 */
import { tool } from 'ai'
import { z } from 'zod'

import { askAssistant } from '@/stores/assistant-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

/** Every builder page the assistant can work on. */
export type AssistantSurface =
  | 'indicators'
  | 'bots'
  | 'workflows'
  | 'notifications'

/** What the shared tools need from whichever tool set is hosting them. */
export type AssistantSharedDeps = {
  surface: AssistantSurface
  /**
   * Take the user to another builder. Injected rather than imported so the
   * tool modules stay free of the router (and loadable in bun tests).
   */
  navigate: (route: { to: AssistantSurface; scriptId?: string }) => void
}

/** One line per surface, so the model picks a destination on what it does. */
const SURFACE_BLURB: Record<AssistantSurface, string> = {
  indicators:
    'the script workbench: writing and fixing Python indicators and strategies, with the editor and the chart preview side by side',
  bots: 'deploying a finished strategy to a market and tuning its sizing and guards',
  workflows:
    'order plans that hang off a trade you place: brackets, ladders, scale-outs',
  notifications: 'alerts that watch the market and tell you something happened',
}

export function buildSharedAssistantTools(deps: AssistantSharedDeps) {
  return {
    /**
     * The one tool with no `execute`: the panel renders the choices and
     * answers it, which is what makes the answer the user's rather than the
     * model's guess at what the user would have said.
     */
    ask_user: tool({
      description:
        'Ask the user one question and let them answer by tapping an option. Use it whenever the decision is theirs and not yours: which venue and pair, which price or percentage, how much risk, which of two designs to build. Give 2 to 4 concrete options (they can always type something else instead). Ask ONE question at a time — this tool ends your turn, so do not stack it with other work.',
      inputSchema: z.object({
        question: z.string().min(1).max(300),
        options: z
          .array(
            z.object({
              label: z.string().min(1).max(60),
              description: z
                .string()
                .max(120)
                .optional()
                .describe('One short line on what this choice means'),
            }),
          )
          .min(2)
          .max(4)
          .optional()
          .describe('Omit for an open question the user types the answer to'),
      }),
    }),

    handoff_to_builder: tool({
      description: [
        'Move the user to another builder and brief its assistant. Targets:',
        ...Object.entries(SURFACE_BLURB).map(
          ([surface, blurb]) => `- ${surface}: ${blurb}`,
        ),
        "Write `message` as the request the other assistant should start from — it arrives as the user's next message there, so carry the context: what exists already, any id, and what is still missing. Say what you are doing before you call it, and stop afterwards.",
      ].join('\n'),
      inputSchema: z.object({
        target: z.enum([
          'indicators',
          'bots',
          'workflows',
          'notifications',
        ] as const),
        message: z.string().min(1).max(600),
        scriptId: z
          .string()
          .optional()
          .describe('Opens this script in the workbench on arrival'),
      }),
      execute: async ({ target, message, scriptId }) => {
        if (target === deps.surface) {
          return {
            error: `You are already on the ${target} surface. Do the work here.`,
          }
        }
        if (
          scriptId !== undefined &&
          !useIndicatorScriptsStore
            .getState()
            .scripts.some((script) => script.id === scriptId)
        ) {
          return { error: `No script with id '${scriptId}'.` }
        }
        askAssistant(message, { send: true })
        deps.navigate({ to: target, scriptId })
        return {
          handedOff: target,
          note: 'The user is on that page now and its assistant has your message. Stop here — it takes over.',
        }
      },
    }),
  }
}
