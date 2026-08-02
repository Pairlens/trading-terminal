// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { AlertCircle, CheckCircle, Loader2, User, Wrench } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { cn } from '@pairlens/ui/lib/utils'
import {
  CopilotCancelOrderCard,
  CopilotPlaceOrderCard,
} from './copilot-order-card'
import { asToolPart } from './tool-part'
import type {
  CopilotCancelRequest,
  CopilotOrderRequest,
} from './copilot-order-card'
import type { UIMessage } from 'ai'

type CopilotChatMessageProps = {
  message: UIMessage
}

export function CopilotChatMessage({ message }: CopilotChatMessageProps) {
  const isUser = message.role === 'user'

  return (
    <div className={cn('flex gap-2', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      {isUser && (
        <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User className="size-3.5" />
        </div>
      )}

      {/* Message parts */}
      <div className="max-w-[85%] space-y-1">
        {message.parts.map((part, i) => {
          if (part.type === 'text') {
            // Skip empty / whitespace-only text: models emit stray "\n\n"
            // around tool calls, which would otherwise render empty bubbles.
            if (!part.text.trim()) return null
            return (
              <div
                key={i}
                className={cn(
                  'rounded-lg px-2.5 py-1.5 text-xs',
                  isUser
                    ? 'bg-primary/10 text-foreground'
                    : 'bg-muted/60 text-foreground',
                )}
              >
                {isUser ? (
                  <p className="whitespace-pre-wrap leading-normal">
                    {part.text}
                  </p>
                ) : (
                  <MarkdownContent text={part.text} />
                )}
              </div>
            )
          }

          const tool = asToolPart(part)
          if (tool) {
            const { toolName, state, output } = tool
            // Trading tools render an interactive confirmation card instead of
            // a status chip — the order only executes when the user confirms.
            if (toolName === 'place_order' && output?.order) {
              return (
                <CopilotPlaceOrderCard
                  key={i}
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
              )
            }
            if (toolName === 'cancel_order' && output?.cancel) {
              return (
                <CopilotCancelOrderCard
                  key={i}
                  cancel={output.cancel as CopilotCancelRequest}
                />
              )
            }

            const isError = state === 'output-error'
            const isComplete = state === 'output-available' || isError
            const errorText = isError
              ? (tool.errorText ?? 'Tool failed')
              : undefined
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]',
                  isError
                    ? 'border-down/40 bg-down/10 text-down'
                    : 'border-border/50 bg-muted/30 text-muted-foreground',
                )}
              >
                {isError ? (
                  <AlertCircle className="text-down size-3" />
                ) : isComplete ? (
                  <CheckCircle className="text-up size-3" />
                ) : (
                  <Loader2 className="size-3 animate-spin" />
                )}
                <Wrench className="size-3 shrink-0" />
                <span className="truncate">
                  {formatToolName(toolName)}
                  {errorText ? ` — ${errorText}` : ''}
                </span>
              </div>
            )
          }

          return null
        })}
      </div>
    </div>
  )
}

function MarkdownContent({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <p className="leading-normal [&:not(:last-child)]:mb-2">{children}</p>
        ),
        h1: ({ children }) => (
          <h1 className="mb-1 mt-2 font-serif text-sm font-semibold leading-snug first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-1 mt-2 font-serif text-xs font-semibold leading-snug first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1 mt-1.5 font-serif text-xs font-medium first:mt-0">
            {children}
          </h3>
        ),
        ul: ({ children }) => (
          <ul className="mb-2 list-disc space-y-0.5 pl-4">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 list-decimal space-y-0.5 pl-4">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-normal">{children}</li>,
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-')
          if (isBlock) {
            return <code className="block text-[11px]">{children}</code>
          }
          return (
            <code className="rounded bg-background/50 px-1 py-0.5 text-[11px]">
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded-md bg-background/50 p-2">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-2 overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border/50 bg-muted/40 px-2 py-1 text-left font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border/50 px-2 py-1">{children}</td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-2 border-l-2 border-primary/30 pl-2 italic text-muted-foreground">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="my-2 border-border/50" />,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
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

function formatToolName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (s) => s.toUpperCase())
    .trim()
}
