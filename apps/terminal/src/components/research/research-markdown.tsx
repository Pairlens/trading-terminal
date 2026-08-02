// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Children, cloneElement, isValidElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from '@tanstack/react-router'
import { TrendingDown, TrendingUp } from 'lucide-react'

import { ResearchInlineCitation } from './research-inline-citation'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Recursively extract plain text from ReactNode children */
function getTextContent(children: ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(getTextContent).join('')
  if (isValidElement(children)) {
    const props = children.props as Record<string, unknown>
    if (props.children != null)
      return getTextContent(props.children as ReactNode)
  }
  return ''
}

/** Turn heading text into a URL-safe slug */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Colorize prices, signed percentages, and trading-pair tickers in prose
const COLORIZE_RE =
  /(\$[\d,]+(?:\.\d+)?)|(\+\d+(?:\.\d+)?%)|(-\d+(?:\.\d+)?%)|\b([A-Z0-9]{2,10}-[A-Z]{2,6})\b/g

/** Inline clickable pair chip — opens the pair in the active chart. */
function TickerChip({ pair }: { pair: string }) {
  return (
    <Link
      to="/pair/$pair"
      params={{ pair }}
      className="mx-0.5 inline-flex items-baseline rounded bg-primary/10 px-1 font-mono text-[11px] font-medium text-primary no-underline transition-colors hover:bg-primary/20"
    >
      {pair}
    </Link>
  )
}

function colorizeText(text: string): ReactNode {
  const parts: Array<ReactNode> = []
  let last = 0
  let key = 0
  let hasMatch = false

  for (const m of text.matchAll(COLORIZE_RE)) {
    hasMatch = true
    const idx = m.index
    if (idx > last) parts.push(text.slice(last, idx))

    if (m[1]) {
      // Dollar prices
      parts.push(
        <span key={key++} className="text-amber-400/90">
          {m[0]}
        </span>,
      )
    } else if (m[2]) {
      // Positive %
      parts.push(
        <span
          key={key++}
          className="inline-flex items-baseline gap-0.5 text-emerald-400"
        >
          <TrendingUp className="size-3 translate-y-0.5" />
          {m[0]}
        </span>,
      )
    } else if (m[3]) {
      // Negative %
      parts.push(
        <span
          key={key++}
          className="inline-flex items-baseline gap-0.5 text-red-400"
        >
          <TrendingDown className="size-3 translate-y-0.5" />
          {m[0]}
        </span>,
      )
    } else {
      // Trading pair → clickable chip
      parts.push(<TickerChip key={key++} pair={m[4]} />)
    }
    last = idx + m[0].length
  }

  if (!hasMatch) return text
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function colorize(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === 'string') return colorizeText(child)
    if (isValidElement(child)) {
      // Never recurse into anchors — a ticker chip is itself a link, and
      // nested interactive elements are invalid HTML.
      if (child.type === 'a') return child
      const props = child.props as Record<string, unknown>
      if (props.children != null) {
        return cloneElement(child, {}, colorize(props.children as ReactNode))
      }
    }
    return child
  })
}

type SourceInfo = { url: string; title: string }

type ResearchMarkdownProps = {
  text: string
  sources: Array<SourceInfo>
}

/** Normalize AI citation brackets to standard markdown links.
 *  Models sometimes emit 【Title](url)】 instead of [Title](url). */
function normalizeCitations(md: string): string {
  return md.replace(/【([^】\]]+)\]\(([^)]+)\)】/g, '[$1]($2)')
}

export function ResearchMarkdown({ text, sources }: ResearchMarkdownProps) {
  // Build a URL → source metadata lookup + index for inline citations
  const sourceMap = new Map<string, SourceInfo & { index: number }>()
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    if (!sourceMap.has(s.url)) {
      sourceMap.set(s.url, { ...s, index: i + 1 })
    }
  }

  const normalizedText = normalizeCitations(text)

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => (
          <div className="text-[13px] leading-relaxed text-foreground/80 [&:not(:last-child)]:mb-3">
            {colorize(children)}
          </div>
        ),
        h1: ({ children }) => (
          <h1 className="mb-2 mt-4 text-base font-bold first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => {
          const id = slugify(getTextContent(children))
          return (
            <h2
              id={id}
              className="mt-6 mb-2 scroll-mt-4 border-l-2 border-primary pl-2.5 text-base font-bold text-primary first:mt-0"
            >
              {children}
            </h2>
          )
        },
        h3: ({ children }) => {
          const id = slugify(getTextContent(children))
          return (
            <h3
              id={id}
              className="mt-6 mb-2 scroll-mt-4 border-l-2 border-primary pl-2.5 text-sm font-semibold uppercase tracking-wider text-primary first:mt-0"
            >
              {children}
            </h3>
          )
        },
        h4: ({ children }) => (
          <h4 className="mb-1 mt-3 text-xs font-semibold text-primary/80 first:mt-0">
            {children}
          </h4>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1.5 pl-5 marker:text-muted-foreground/50">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{colorize(children)}</li>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="text-muted-foreground italic">{children}</em>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes('language-')
          if (isBlock) {
            return <code className="block text-xs">{children}</code>
          }
          return (
            <code className="rounded bg-background/50 px-1 py-0.5 text-xs">
              {children}
            </code>
          )
        },
        pre: ({ children }) => (
          <pre className="my-3 overflow-x-auto rounded-md bg-background/50 p-3">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border/50 bg-muted/60 px-2.5 py-1.5 text-left font-semibold text-foreground">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border/50 px-2.5 py-1.5">
            {colorize(children)}
          </td>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 rounded-r-md border-l-2 border-primary/40 bg-primary/5 py-2 pl-3 pr-3 italic text-muted-foreground">
            {colorize(children)}
          </blockquote>
        ),
        hr: () => <hr className="my-6 border-border/30 border-dashed" />,
        a: ({ children, href }) => {
          // Known source → inline numbered citation with hover preview
          const source = href ? sourceMap.get(href) : undefined
          if (source) {
            return (
              <ResearchInlineCitation
                url={source.url}
                title={source.title}
                index={source.index}
              />
            )
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2"
            >
              {children}
            </a>
          )
        },
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt ?? ''}
            className="my-2 max-h-48 rounded-md"
            loading="lazy"
          />
        ),
      }}
    >
      {normalizedText}
    </ReactMarkdown>
  )
}
