// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, it } from 'bun:test'

import { quarterLabel } from '../quarter-label'

describe('quarterLabel', () => {
  it('names the month the fiscal period ended in', () => {
    expect(quarterLabel('2026-07-31', 'en-US')).toBe('Jul 2026')
  })

  // The whole reason this is a month and not 'Q2 FY26': an off-cycle filer's
  // fiscal quarter number is not derivable from its period end, and NVIDIA's
  // Q2 closes in July. The month is the fact we hold and it stays true.
  it('is the period end, not a fiscal quarter number', () => {
    expect(quarterLabel('2026-01-31', 'en-US')).toBe('Jan 2026')
    expect(quarterLabel('2025-10-31', 'en-US')).toBe('Oct 2025')
  })

  // A fiscal year that runs across the new year ends inside the calendar year
  // it ends in, and the label must not roll back to the year it started.
  it('carries a year-crossing fiscal year to the year it ends in', () => {
    expect(quarterLabel('2026-01-01', 'en-US')).toBe('Jan 2026')
    expect(quarterLabel('2025-12-31', 'en-US')).toBe('Dec 2025')
  })

  // Parsed and formatted in UTC, so a period ending on the first of a month
  // keeps that month for a reader west of UTC instead of printing the one
  // before. This is the bug the day headings already had once.
  it('does not slip a month on a first-of-the-month period end', () => {
    expect(quarterLabel('2026-03-01', 'en-US')).toBe('Mar 2026')
    expect(quarterLabel('2026-01-01', 'en-US')).toBe('Jan 2026')
  })

  it('withholds a label when the entry states no period end', () => {
    expect(quarterLabel(null, 'en-US')).toBeNull()
    expect(quarterLabel(undefined, 'en-US')).toBeNull()
    expect(quarterLabel('', 'en-US')).toBeNull()
    expect(quarterLabel('not-a-date', 'en-US')).toBeNull()
  })
})
