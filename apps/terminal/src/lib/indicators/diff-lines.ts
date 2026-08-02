// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Line-level diff for the indicator version-history panel.
 *
 * Deliberately dependency-free and pure: an LCS over the lines that actually
 * differ, after the common prefix and suffix have been peeled off (the common
 * case for an edited Python file is a handful of changed lines in the middle,
 * which collapses the table to almost nothing). Pathological pairs — two
 * unrelated multi-thousand-line files — skip the table entirely and fall back
 * to "remove everything, add everything", which is both honest and instant.
 */

export type DiffLineType = 'same' | 'add' | 'remove'

export type DiffLine = {
  type: DiffLineType
  text: string
}

/** Above this many table cells the LCS is not worth the main-thread time. */
const MAX_LCS_CELLS = 250_000

/** `''` is no lines at all — not one empty line. */
function toLines(source: string): Array<string> {
  return source === '' ? [] : source.split('\n')
}

/**
 * Diff `a` (the older side) against `b` (the newer side): `remove` lines are
 * only in `a`, `add` lines are only in `b`, `same` lines are in both.
 */
export function diffLines(a: string, b: string): Array<DiffLine> {
  const left = toLines(a)
  const right = toLines(b)

  // Peel the shared head…
  let start = 0
  while (
    start < left.length &&
    start < right.length &&
    left[start] === right[start]
  ) {
    start += 1
  }
  // …and the shared tail.
  let endLeft = left.length
  let endRight = right.length
  while (
    endLeft > start &&
    endRight > start &&
    left[endLeft - 1] === right[endRight - 1]
  ) {
    endLeft -= 1
    endRight -= 1
  }

  const out: Array<DiffLine> = []
  for (let i = 0; i < start; i++) out.push({ type: 'same', text: left[i] })

  const midLeft = left.slice(start, endLeft)
  const midRight = right.slice(start, endRight)
  for (const line of diffMiddle(midLeft, midRight)) out.push(line)

  for (let i = endLeft; i < left.length; i++) {
    out.push({ type: 'same', text: left[i] })
  }
  return out
}

/** Diff the section that genuinely differs on both sides. */
function diffMiddle(
  left: Array<string>,
  right: Array<string>,
): Array<DiffLine> {
  if (left.length === 0 && right.length === 0) return []
  if (left.length === 0) return right.map((text) => ({ type: 'add', text }))
  if (right.length === 0) return left.map((text) => ({ type: 'remove', text }))

  if (left.length * right.length > MAX_LCS_CELLS) {
    return [
      ...left.map((text): DiffLine => ({ type: 'remove', text })),
      ...right.map((text): DiffLine => ({ type: 'add', text })),
    ]
  }

  // lcs[i * width + j] = length of the longest common subsequence of
  // left[i..] and right[j..]. Filled backwards so the walk below is forward.
  const width = right.length + 1
  const lcs = new Int32Array((left.length + 1) * width)
  for (let i = left.length - 1; i >= 0; i--) {
    for (let j = right.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        left[i] === right[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }

  const out: Array<DiffLine> = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      out.push({ type: 'same', text: left[i] })
      i += 1
      j += 1
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      out.push({ type: 'remove', text: left[i] })
      i += 1
    } else {
      out.push({ type: 'add', text: right[j] })
      j += 1
    }
  }
  while (i < left.length) out.push({ type: 'remove', text: left[i++] })
  while (j < right.length) out.push({ type: 'add', text: right[j++] })
  return out
}

/** How many lines the diff adds and removes — the `+3 −1` badge. */
export function diffSummary(lines: Array<DiffLine>): {
  added: number
  removed: number
} {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === 'add') added += 1
    else if (line.type === 'remove') removed += 1
  }
  return { added, removed }
}
