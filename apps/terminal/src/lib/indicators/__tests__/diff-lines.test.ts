// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { diffLines, diffSummary } from '../diff-lines'

import type { DiffLine } from '../diff-lines'

/** Compact rendering: '=a' unchanged, '+a' added, '-a' removed. */
const render = (lines: Array<DiffLine>): Array<string> =>
  lines.map(
    (line) =>
      `${line.type === 'same' ? '=' : line.type === 'add' ? '+' : '-'}${line.text}`,
  )

describe('diffLines', () => {
  it('is empty for two empty sources', () => {
    expect(diffLines('', '')).toEqual([])
  })

  it('treats an empty side as pure additions or pure removals', () => {
    expect(render(diffLines('', 'a\nb'))).toEqual(['+a', '+b'])
    expect(render(diffLines('a\nb', ''))).toEqual(['-a', '-b'])
  })

  it('marks every line unchanged for identical sources', () => {
    const lines = diffLines('a\nb\nc', 'a\nb\nc')
    expect(render(lines)).toEqual(['=a', '=b', '=c'])
    expect(diffSummary(lines)).toEqual({ added: 0, removed: 0 })
  })

  it('reports an inserted line without disturbing its neighbours', () => {
    const lines = diffLines('a\nc', 'a\nb\nc')
    expect(render(lines)).toEqual(['=a', '+b', '=c'])
    expect(diffSummary(lines)).toEqual({ added: 1, removed: 0 })
  })

  it('reports a deleted line', () => {
    const lines = diffLines('a\nb\nc', 'a\nc')
    expect(render(lines)).toEqual(['=a', '-b', '=c'])
    expect(diffSummary(lines)).toEqual({ added: 0, removed: 1 })
  })

  it('reports a replaced line as a removal plus an addition', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc')
    expect(render(lines)).toEqual(['=a', '-b', '+B', '=c'])
    expect(diffSummary(lines)).toEqual({ added: 1, removed: 1 })
  })

  it('keeps a trailing blank line as a real line', () => {
    expect(render(diffLines('a', 'a\n'))).toEqual(['=a', '+'])
  })

  it('finds the common subsequence across scattered edits', () => {
    const lines = diffLines(
      'import numpy\n\ndef ema(x):\n    return x\n',
      'import numpy as np\n\ndef ema(x, n):\n    return x\n',
    )
    expect(render(lines)).toEqual([
      '-import numpy',
      '+import numpy as np',
      '=',
      '-def ema(x):',
      '+def ema(x, n):',
      '=    return x',
      '=',
    ])
  })

  it('falls back to a wholesale swap for oversized unrelated files', () => {
    const left = Array.from({ length: 600 }, (_, i) => `left ${i}`).join('\n')
    const right = Array.from({ length: 600 }, (_, i) => `right ${i}`).join('\n')
    const lines = diffLines(left, right)
    expect(diffSummary(lines)).toEqual({ added: 600, removed: 600 })
    expect(lines[0]).toEqual({ type: 'remove', text: 'left 0' })
    expect(lines[600]).toEqual({ type: 'add', text: 'right 0' })
  })

  it('stays cheap when a huge file changes in one place', () => {
    const base = Array.from({ length: 5000 }, (_, i) => `line ${i}`)
    const edited = [...base]
    edited[2500] = 'line 2500 # touched'
    const lines = diffLines(base.join('\n'), edited.join('\n'))
    expect(diffSummary(lines)).toEqual({ added: 1, removed: 1 })
  })
})
