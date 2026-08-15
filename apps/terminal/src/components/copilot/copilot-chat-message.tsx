// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── One turn in the assistant's thread ───────────────────────────────
//
// Role is carried by alignment and a tint, not by avatars: at 440px a
// 24px gutter down the left of every message is 5% of the column spent
// on a glyph that says what the alignment already says.
//
// The assistant's own text gets no bubble at all. It is the thing being
// read — often several paragraphs with tables and levels in them — and a
// box around every one of them turns a conversation into a stack of
// cards. The user's turns are short and are the tinted ones, which is
// what makes the thread scannable.

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Copy, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui/lib/utils'
import {
  CopilotCancelOrderCard,
  CopilotPlaceOrderCard,
} from './copilot-order-card'
import { asToolPart } from './tool-part'
import type { NormalizedToolPart } from './tool-part'
import type {
  CopilotCancelRequest,
  CopilotOrderRequest,
} from './copilot-order-card'
import type { ReactNode } from 'react'
import type { UIMessage } from 'ai'
import type { ToolLabelMap } from '@/lib/copilot/tool-labels'
import { formatToolLabel } from '@/lib/copilot/tool-labels'

type CopilotChatMessageProps = {
  message: UIMessage
  /**
   * Tool-id → label table. Defaults to the copilot's; other chats that reuse
   * this component (the builder assistant) pass their own.
   */
  toolLabels?: ToolLabelMap
  /**
   * Render a tool part yourself. Return null to fall through to the standard
   * status chip. The builder assistant uses it for `ask_user`, whose whole
   * point is a card the user answers rather than a chip they watch.
   */
  renderToolPart?: (tool: NormalizedToolPart) => ReactNode | null
}

export function CopilotChatMessage({
  message,
  toolLabels,
  renderToolPart,
}: CopilotChatMessageProps) {
  const { t } = useTranslation()
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'group/message flex min-w-0 flex-col gap-1.5',
        isUser ? 'items-end' : 'items-start',
      )}
      data-role={message.role}
    >
      {message.parts.map((part, i) => {
        if (part.type === 'text') {
          // Skip empty / whitespace-only text: models emit stray "\n\n"
          // around tool calls, which would otherwise render empty bubbles.
          if (!part.text.trim()) return null
          return isUser ? (
            // min-w-0 so a long unbroken token (a pasted URL, an address)
            // can't push the row's min-content width past the panel.
            <div
              key={i}
              className="ai-bubble-user text-foreground min-w-0 max-w-[86%] rounded-2xl rounded-br-md px-3 py-2 text-[13px] break-words"
            >
              <p className="leading-relaxed whitespace-pre-wrap">{part.text}</p>
            </div>
          ) : (
            <div key={i} className="w-full min-w-0">
              <div className="text-foreground text-[13px] leading-relaxed break-words">
                <MarkdownContent text={part.text} />
              </div>
              <CopyMessageButton text={part.text} />
            </div>
          )
        }

        const tool = asToolPart(part)
        if (tool) {
          const { toolName, state, output } = tool
          const custom = renderToolPart?.(tool)
          if (custom) {
            return (
              <div key={i} className="w-full min-w-0">
                {custom}
              </div>
            )
          }
          // Trading tools render an interactive confirmation card instead of
          // a status chip — the order only executes when the user confirms.
          if (toolName === 'place_order' && output?.order) {
            return (
              <div key={i} className="w-full min-w-0">
                <CopilotPlaceOrderCard
                  order={output.order as CopilotOrderRequest}
                  proposalId={
                    typeof output.proposalId === 'string'
                      ? output.proposalId
                      : undefined
                  }
                  proposedAt={
                    typeof output.proposedAt === 'number'
                      ? output.proposedAt
                      : undefined
                  }
                />
              </div>
            )
          }
          if (toolName === 'cancel_order' && output?.cancel) {
            return (
              <div key={i} className="w-full min-w-0">
                <CopilotCancelOrderCard
                  cancel={output.cancel as CopilotCancelRequest}
                />
              </div>
            )
          }

          const isError = state === 'output-error'
          const isComplete = state === 'output-available' || isError
          const errorText = isError
            ? (tool.errorText ?? t('copilot.toolFailed'))
            : undefined
          return (
            <div
              key={i}
              className={cn(
                'flex max-w-full min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]',
                isError
                  ? 'border-down/40 text-down bg-down/10 border'
                  : 'ai-tile text-muted-foreground',
              )}
            >
              {isError ? (
                <AlertCircle className="size-3 shrink-0" />
              ) : isComplete ? (
                <span className="bg-up/80 size-1.5 shrink-0 rounded-full" />
              ) : (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              )}
              <span className="truncate">
                {formatToolLabel(
                  toolName,
                  isError ? 'error' : isComplete ? 'done' : 'running',
                  toolLabels,
                )}
                {errorText ? `: ${errorText}` : ''}
              </span>
            </div>
          )
        }

        return null
      })}
    </div>
  )
}

/**
 * Lifts an answer out of the chat. The assistant writes levels, sizes and
 * whole reports; retyping any of that into a ticket or a note is the one
 * friction a chat can remove outright.
 *
 * Hidden until the message is hovered or the button is focused, so a quiet
 * thread stays quiet — but focusable by keyboard at all times, which is why
 * it is opacity and not `hidden`.
 */
function CopyMessageButton({ text }: { text: string }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(() => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {
        // No clipboard permission. Nothing useful to say about it here.
      })
  }, [text])

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={
        copied ? t('copilot.messageCopied') : t('copilot.copyMessage')
      }
      className="text-muted-foreground hover:text-foreground hover:bg-[var(--ai-inset-strong)] focus-visible:ring-ring mt-1 -ml-1 flex size-6 items-center justify-center rounded-md opacity-0 transition-opacity focus-visible:ring-[3px] focus-visible:opacity-100 group-hover/message:opacity-100"
    >
      {copied ? (
        <Check className="text-up size-3" />
      ) : (
        <Copy className="size-3" />
      )}
    </button>
  )
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="leading-relaxed [&:not(:last-child)]:mb-2.5">
            {children}
          </p>
        ),
        h1: ({ children }) => (
          <h1 className="mt-3 mb-1.5 font-serif text-[13px] leading-snug font-semibold first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mt-3 mb-1.5 font-serif text-[13px] leading-snug font-semibold first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-muted-foreground mt-2.5 mb-1 font-serif text-[11px] font-medium tracking-wide uppercase first:mt-0">
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul className="mb-2.5 list-disc marker:text-muted-foreground/70 space-y-1 pl-4">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2.5 list-decimal marker:text-muted-foreground/70 space-y-1 pl-4">
            {children}
          </ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-')
          if (isBlock) {
            return (
              <code className="block font-mono text-[11px]">{children}</code>
            )
          }
          return (
            <code className="rounded bg-[var(--ai-inset-strong)] px-1 py-0.5 font-mono text-[11px]">
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-2.5 overflow-x-auto rounded-lg bg-[var(--ai-inset-strong)] p-2.5">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-2.5 overflow-x-auto rounded-lg bg-[var(--ai-inset)] p-px">
            <table className="w-full border-collapse text-[11px]">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="text-muted-foreground px-2 py-1.5 text-left text-[10px] font-medium tracking-wide uppercase">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border-t border-[var(--ai-edge-soft)] px-2 py-1.5">
            {children}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="text-muted-foreground my-2.5 border-l-2 border-[var(--ai-ring)] pl-2.5 italic">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-[var(--ai-edge-soft)]" />,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline decoration-from-font underline-offset-2"
          >
            {children}
          </a>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  )
}
