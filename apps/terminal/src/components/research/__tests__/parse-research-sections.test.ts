// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { describe, expect, test } from 'bun:test'
import { parseResearchSections } from '../parse-research-sections'

describe('parseResearchSections', () => {
  test('splits on H3 headings (the prompt contract)', () => {
    const sections = parseResearchSections(
      '### Executive Summary\nBullish.\n### Trade Setup\nLong above X.',
    )
    expect(sections.map((s) => s.slug)).toEqual([
      'executive-summary',
      'trade-setup',
    ])
    expect(sections[0].body).toBe('Bullish.')
  })

  test('accepts H2/H4 and standalone bold lines as headings (model drift)', () => {
    const sections = parseResearchSections(
      '**Executive Summary**\n\nBullish.\n\n## Trade Setup\nLong.\n#### Risk Factors\nVolatility.',
    )
    expect(sections.map((s) => s.slug)).toEqual([
      'executive-summary',
      'trade-setup',
      'risk-factors',
    ])
    expect(sections[0].body).toBe('Bullish.')
  })

  test('does not treat inline bold or emphasis as headings', () => {
    const sections = parseResearchSections(
      '### Summary\nThe **key level** holds.\n*This report is for informational purposes only.*',
    )
    expect(sections.length).toBe(1)
    expect(sections[0].body).toContain('**key level**')
  })

  test('falls back to a single section when no headings are found', () => {
    const sections = parseResearchSections('Just a plain paragraph report.')
    expect(sections).toEqual([
      {
        heading: 'Report',
        slug: 'report',
        body: 'Just a plain paragraph report.',
      },
    ])
  })

  test('returns nothing for an empty report', () => {
    expect(parseResearchSections('')).toEqual([])
  })
})
