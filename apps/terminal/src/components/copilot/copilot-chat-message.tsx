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
//
// The parts do not render one-to-one. A message is first folded into
// blocks, because a 28-step run arrives as thirty sibling tool parts that
// belong together, and because reasoning, sources and code each need
// their own treatment rather than being dropped (reasoning and files
// were, silently, until this pass).
//
// Memoized because useChat's replaceMessage keeps every prior UIMessage
// object. A streaming token must not walk the whole thread and re-parse
// markdown that has not changed.

import {
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Check, Copy, RefreshCw } from 'lucide-react'
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
import type { Components } from 'react-markdown'
import type { ReactNode } from 'react'
import type { UIMessage } from 'ai'
import type { ToolLabelMap } from '@/lib/copilot/tool-labels'
import { AssistantCodeBlock } from '@/components/assistant-dock/assistant-code-block'
import { AssistantReasoning } from '@/components/assistant-dock/assistant-reasoning'
import {
  AssistantSources,
  readSearchSources,
} from '@/components/assistant-dock/assistant-sources'
import { AssistantToolActivity } from '@/components/assistant-dock/assistant-tool-activity'
import { track } from '@/lib/analytics-events'

type CopilotChatMessageProps = {
  message: UIMessage
  /**
   * Tool-id → label table. Defaults to the copilot's; other chats that reuse
   * this component (the builder assistant) pass their own.
   */
  toolLabels?: ToolLabelMap
  /**
   * Render a tool part yourself. Return null to fall through to the standard
   * activity group. The assistant uses it for `ask_user`, whose whole point is
   * a card the user answers rather than a chip they watch.
   */
  renderToolPart?: (tool: NormalizedToolPart) => ReactNode | null
  /** Offered on the last assistant message only. */
  onRegenerate?: () => void
}

/** What a message folds down to before anything is rendered. */
type Block =
  | { kind: 'text'; key: string; text: string }
  | { kind: 'reasoning'; key: string; text: string; streaming: boolean }
  | { kind: 'image'; key: string; url: string; alt: string }
  | { kind: 'node'; key: string; node: ReactNode }
  | { kind: 'tools'; key: string; tools: Array<NormalizedToolPart> }

export const CopilotChatMessage = memo(function CopilotChatMessage({
  message,
  toolLabels,
  renderToolPart,
  onRegenerate,
}: CopilotChatMessageProps) {
  const isUser = message.role === 'user'
  const blocks = toMessageBlocks(message, renderToolPart)
  const sources = useMemo(
    () =>
      readSearchSources(
        message.parts
          .map((part) => asToolPart(part))
          .filter((tool): tool is NormalizedToolPart => tool !== null),
      ),
    [message.parts],
  )

  // The whole answer, for the copy control. Tool chatter is not part of it.
  const answerText = blocks
    .filter(
      (block): block is Extract<Block, { kind: 'text' }> =>
        block.kind === 'text',
    )
    .map((block) => block.text)
    .join('\n\n')

  return (
    <div
      className={cn(
        'group/message flex min-w-0 flex-col gap-1.5',
        isUser ? 'items-end' : 'items-start',
      )}
      data-role={message.role}
    >
      {blocks.map((block) => {
        switch (block.kind) {
          case 'text':
            return isUser ? (
              // min-w-0 so a long unbroken token (a pasted URL, an address)
              // can't push the row's min-content width past the panel.
              <div
                key={block.key}
                className="ai-bubble-user text-foreground min-w-0 max-w-[86%] rounded-[10px] rounded-br-[4px] px-3 py-2 text-[13px] break-words"
              >
                <p className="leading-relaxed whitespace-pre-wrap">
                  {block.text}
                </p>
              </div>
            ) : (
              <div
                key={block.key}
                className="text-foreground w-full min-w-0 text-[13px] leading-relaxed break-words"
              >
                <MarkdownContent text={block.text} />
              </div>
            )
          case 'reasoning':
            return (
              <AssistantReasoning
                key={block.key}
                text={block.text}
                streaming={block.streaming}
              />
            )
          case 'image':
            return (
              <img
                key={block.key}
                src={block.url}
                alt={block.alt}
                className="max-h-72 w-auto max-w-full min-w-0 rounded-[10px]"
              />
            )
          case 'node':
            return (
              <div key={block.key} className="w-full min-w-0">
                {block.node}
              </div>
            )
          case 'tools':
            return (
              <AssistantToolActivity
                key={block.key}
                tools={block.tools}
                toolLabels={toolLabels}
              />
            )
        }
      })}

      {!isUser && sources.length > 0 ? (
        <AssistantSources sources={sources} />
      ) : null}

      {!isUser && answerText ? (
        <MessageActions text={answerText} onRegenerate={onRegenerate} />
      ) : null}
    </div>
  )
})

/**
 * Fold a message's parts into renderable blocks.
 *
 * The only interesting rule is the tool run: consecutive tool parts that
 * fall through to the standard chip are gathered into one activity group,
 * and a tool that claims its own card (an order, a question, a report)
 * breaks the run, because it is content rather than progress.
 */
function toMessageBlocks(
  message: UIMessage,
  renderToolPart?: (tool: NormalizedToolPart) => ReactNode | null,
): Array<Block> {
  const blocks: Array<Block> = []
  let run: Array<NormalizedToolPart> | null = null

  const flush = (index: number) => {
    if (!run?.length) return
    blocks.push({ kind: 'tools', key: `tools-${index}`, tools: run })
    run = null
  }

  message.parts.forEach((part, index) => {
    if (part.type === 'text') {
      // Models emit stray "\n\n" around tool calls, which would otherwise
      // render as empty bubbles.
      if (!part.text.trim()) return
      flush(index)
      blocks.push({ kind: 'text', key: `text-${index}`, text: part.text })
      return
    }

    if (part.type === 'reasoning') {
      flush(index)
      blocks.push({
        kind: 'reasoning',
        key: `reasoning-${index}`,
        text: part.text,
        streaming: part.state !== 'done',
      })
      return
    }

    if (part.type === 'file') {
      const file = part as {
        mediaType?: string
        url?: string
        filename?: string
      }
      if (!file.url || !file.mediaType?.startsWith('image/')) return
      flush(index)
      blocks.push({
        kind: 'image',
        key: `file-${index}`,
        url: file.url,
        alt: file.filename ?? '',
      })
      return
    }

    const tool = asToolPart(part)
    if (!tool) return

    const custom = renderToolPart?.(tool)
    if (custom) {
      flush(index)
      blocks.push({ kind: 'node', key: `custom-${index}`, node: custom })
      return
    }

    const { toolName, output } = tool
    // Trading tools render an interactive confirmation card instead of a
    // status chip — the order only executes when the user confirms.
    if (toolName === 'place_order' && output?.order) {
      flush(index)
      blocks.push({
        kind: 'node',
        key: `order-${index}`,
        node: (
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
        ),
      })
      return
    }
    if (toolName === 'cancel_order' && output?.cancel) {
      flush(index)
      blocks.push({
        kind: 'node',
        key: `cancel-${index}`,
        node: (
          <CopilotCancelOrderCard
            cancel={output.cancel as CopilotCancelRequest}
          />
        ),
      })
      return
    }

    run ??= []
    run.push(tool)
  })

  flush(message.parts.length)
  return blocks
}

// ── Message actions ──────────────────────────────────────────────────

/**
 * Lifts an answer out of the chat, or asks for another one. The assistant
 * writes levels, sizes and whole reports; retyping any of that into a ticket
 * or a note is the one friction a chat can remove outright, and an answer
 * that missed the point should cost a click rather than a re-typed prompt.
 *
 * Hidden until the message is hovered or a control is focused, so a quiet
 * thread stays quiet — but reachable by keyboard at all times, which is why
 * it is opacity and not `hidden`.
 */
function MessageActions({
  text,
  onRegenerate,
}: {
  text: string
  onRegenerate?: () => void
}) {
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
        track('assistant_answer_copied')
        setCopied(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1600)
      })
      .catch(() => {
        // No clipboard permission. Nothing useful to say about it here.
      })
  }, [text])

  const buttonClass =
    'text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-6 items-center justify-center rounded-[6px] opacity-0 transition-opacity hover:bg-[var(--ai-inset-strong)] focus-visible:opacity-100 focus-visible:ring-[3px] group-hover/message:opacity-100'

  return (
    <div className="-ml-1 flex items-center gap-0.5">
      <button
        type="button"
        onClick={copy}
        aria-label={
          copied ? t('copilot.messageCopied') : t('copilot.copyMessage')
        }
        className={buttonClass}
      >
        {copied ? (
          <Check className="text-up size-3" />
        ) : (
          <Copy className="size-3" />
        )}
      </button>
      {onRegenerate ? (
        <button
          type="button"
          onClick={onRegenerate}
          aria-label={t('copilot.regenerate')}
          className={buttonClass}
        >
          <RefreshCw className="size-3" />
        </button>
      ) : null}
    </div>
  )
}

// ── Markdown ─────────────────────────────────────────────────────────
//
// Plugins and the component map are module-level on purpose. A fresh
// `components` object is a documented ReactMarkdown gotcha: it remounts
// the whole tree even when the text did not change. The last answer
// streams one token at a time, so this has to be stable there too.

const MARKDOWN_PLUGINS = [remarkGfm]

const MARKDOWN_COMPONENTS: Components = {
  p: ({ children }) => (
    <p className="leading-relaxed [&:not(:last-child)]:mb-2.5">{children}</p>
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
    <ul className="marker:text-muted-foreground/70 mb-2.5 list-disc space-y-1 pl-4">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="marker:text-muted-foreground/70 mb-2.5 list-decimal space-y-1 pl-4">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  code: ({ children, className }) => {
    // Fenced blocks are handled by `pre` below, which owns the chrome.
    // This only ever sees inline spans and the block's inner text.
    if (className?.includes('language-')) return <>{children}</>
    return (
      <code className="rounded bg-[var(--ai-inset-strong)] px-1 py-0.5 font-mono text-[11px]">
        {children}
      </code>
    )
  },
  // The fence, not the inner <code>: a block needs a header with the
  // language and its actions, and a <div> is not valid inside <pre>.
  pre: ({ children }) => {
    const fence = readFence(children)
    if (!fence) return null
    return <AssistantCodeBlock code={fence.code} language={fence.language} />
  },
  table: ({ children }) => (
    <div className="my-2.5 overflow-x-auto rounded-[10px] bg-[var(--ai-inset)] p-px">
      <table className="w-full border-collapse text-[11px]">{children}</table>
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
      className="text-primary decoration-from-font underline underline-offset-2"
    >
      {children}
    </a>
  ),
}

const MarkdownContent = memo(function MarkdownContent({
  text,
}: {
  text: string
}) {
  return (
    <ReactMarkdown
      remarkPlugins={MARKDOWN_PLUGINS}
      components={MARKDOWN_COMPONENTS}
    >
      {text}
    </ReactMarkdown>
  )
})

/** Read the source and the language out of a markdown fence's children. */
function readFence(
  children: ReactNode,
): { code: string; language: string | null } | null {
  const node = Array.isArray(children) ? children[0] : children
  if (!isValidElement(node)) return null
  const props = node.props as { className?: string; children?: ReactNode }
  const code = flattenText(props.children)
  if (!code.trim()) return null
  const match = props.className?.match(/language-([\w+-]+)/)
  return {
    code: code.replace(/\n$/, ''),
    language: match ? match[1].toLowerCase() : null,
  }
}

function flattenText(node: ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenText).join('')
  if (isValidElement(node)) {
    return flattenText((node.props as { children?: ReactNode }).children)
  }
  return ''
}
