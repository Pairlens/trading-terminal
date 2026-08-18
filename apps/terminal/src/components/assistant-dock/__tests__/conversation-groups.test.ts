// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { groupConversations } from '../assistant-conversation-list'

import type { AssistantConversationMeta } from '@/stores/assistant-conversations-store'

/** Midday, so a test never lands either side of a local midnight by luck. */
const NOW = new Date('2026-08-19T12:00:00')

function at(id: string, updatedAt: number): AssistantConversationMeta {
  return { id, title: id, createdAt: updatedAt, updatedAt, messageCount: 1 }
}

/** `days` calendar days back from NOW, at the same time of day. */
function daysBack(days: number): number {
  const when = new Date(NOW)
  when.setDate(when.getDate() - days)
  return when.getTime()
}

const labelsOf = (metas: Array<AssistantConversationMeta>) =>
  groupConversations(metas, NOW).map((group) => [
    group.id,
    group.items.map((item) => item.id),
  ])

describe('groupConversations', () => {
  it('buckets by calendar day, not by elapsed hours', () => {
    expect(
      labelsOf([
        at('now', NOW.getTime()),
        at('yesterday', daysBack(1)),
        at('week', daysBack(6)),
        at('older', daysBack(7)),
      ]),
    ).toEqual([
      ['today', ['now']],
      ['yesterday', ['yesterday']],
      ['week', ['week']],
      ['older', ['older']],
    ])
  })

  it('calls a message from twenty minutes ago yesterday, just after midnight', () => {
    const justAfterMidnight = new Date('2026-08-19T00:10:00')
    const twentyMinutesAgo = justAfterMidnight.getTime() - 20 * 60_000
    expect(
      groupConversations([at('late', twentyMinutesAgo)], justAfterMidnight).map(
        (group) => group.id,
      ),
    ).toEqual(['yesterday'])
  })

  it('drops empty buckets rather than rendering a bare heading', () => {
    expect(labelsOf([at('only', daysBack(30))])).toEqual([['older', ['only']]])
    expect(labelsOf([])).toEqual([])
  })

  it('keeps the order it is given inside a bucket', () => {
    const first = at('first', daysBack(0))
    const second = at('second', daysBack(0))
    expect(labelsOf([first, second])).toEqual([['today', ['first', 'second']]])
  })

  it('files a timestamp from the future under today', () => {
    // Clock skew between two machines is not a reason to lose a row.
    expect(labelsOf([at('ahead', NOW.getTime() + 3_600_000)])).toEqual([
      ['today', ['ahead']],
    ])
  })
})
