// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * A long assistant thread must not re-parse every historical answer on
 * each streaming token. The chat lives in a leaf so prices keep their
 * render budget, but the leaf itself used to walk the whole list and
 * hand every assistant turn to ReactMarkdown. Thirty typical answers
 * cost ~16ms to parse; at token rate that saturates the main thread
 * and the chart under the dock stutters with it.
 *
 * The terminal has no React test renderer, so these pin the ordering
 * that makes the fix work. Undo any one of them and the cost comes
 * back without a type error.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'bun:test'

const MESSAGE_SOURCE = readFileSync(
  join(import.meta.dir, '..', 'copilot-chat-message.tsx'),
  'utf8',
)

const CONVERSATION_SOURCE = readFileSync(
  join(
    import.meta.dir,
    '..',
    '..',
    'assistant-dock',
    'assistant-conversation.tsx',
  ),
  'utf8',
)

describe('historical turns do not re-parse on a streaming token', () => {
  test('CopilotChatMessage is memoized, so stable message identities skip work', () => {
    // useChat's replaceMessage keeps every prior UIMessage object. Without
    // memo the parent re-render still walks them all, and each one rebuilds
    // its markdown tree.
    expect(MESSAGE_SOURCE).toMatch(
      /export const CopilotChatMessage = memo\(function CopilotChatMessage/,
    )
  })

  test('markdown plugins and components are module-level, not recreated per token', () => {
    // A fresh `components` object is a documented ReactMarkdown gotcha: it
    // remounts the whole tree even when the text did not change. The last
    // answer streams one token at a time, so this has to be stable there
    // too, not only on history.
    expect(MESSAGE_SOURCE).toMatch(/const MARKDOWN_PLUGINS = \[remarkGfm\]/)
    expect(MESSAGE_SOURCE).toMatch(/const MARKDOWN_COMPONENTS/)
    const markdownFn = MESSAGE_SOURCE.slice(
      MESSAGE_SOURCE.indexOf('function MarkdownContent'),
    )
    const body = markdownFn.slice(0, markdownFn.indexOf('\n})'))
    expect(body).not.toContain('remarkPlugins={[remarkGfm]}')
    expect(body).not.toContain('components={{')
  })

  test('useChat is throttled so tokens do not commit at token rate', () => {
    // Markdown of the live answer still costs per commit. Throttling to
    // a frame or two keeps the stream readable without a parse per token.
    expect(CONVERSATION_SOURCE).toMatch(
      /experimental_throttle:\s*STREAM_THROTTLE_MS/,
    )
    expect(CONVERSATION_SOURCE).toMatch(/const STREAM_THROTTLE_MS = \d+/)
  })

  test('the tool renderer passed into the list has a stable identity', () => {
    // A new renderToolPart every token would defeat CopilotChatMessage's
    // memo even when the message object itself did not change.
    expect(CONVERSATION_SOURCE).toContain('const renderToolPartRef = useRef')
    expect(CONVERSATION_SOURCE).toMatch(
      /const renderToolPart = useCallback\(\s*\n\s*\(tool: ReturnType<typeof asToolPart>\) => renderToolPartRef\.current\(tool\),\s*\n\s*\[\],/,
    )
  })
})
