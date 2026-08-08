// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * What the phone's drawing sheet offers, as data.
 *
 * The five groupings are the design's, not the catalog's nine categories: a
 * phone shows twenty tools, so they are grouped the way a hand reaches for
 * them rather than the way the desktop rail's flyouts enumerate them. Every
 * entry is a `toolKey` resolved against `TOOL_CATEGORIES` at render time, so a
 * tool that changes in the catalog changes here.
 *
 * It lives apart from the sheet component so the placement tests can assert
 * that every tool a thumb can reach has a placement plan — importing the sheet
 * itself would drag vaul and a DOM into a unit test to read a table of strings.
 */
export type MobileDrawingSection = {
  labelKey: string
  keys: Array<string>
}

/**
 * Two honest substitutions where the design named a shape this build has no
 * tool for: "Fan" resolves to the Gann fan (the only fan the engine draws), and
 * Annotate's fourth tile is the highlighter rather than a price label, which
 * does not exist as a drawing type. Both are noted rather than invented.
 */
export const MOBILE_DRAWING_SECTIONS: Array<MobileDrawingSection> = [
  {
    labelKey: 'chart.drawing.categories.lines',
    keys: ['line', 'ray', 'hline', 'vline'],
  },
  {
    labelKey: 'mobile.chart.sections.channelsFib',
    keys: ['channel', 'fibonacci', 'fib-extension', 'gann-fan'],
  },
  {
    labelKey: 'chart.drawing.categories.shapes',
    keys: ['rectangle', 'ellipse', 'path:triangle', 'brush'],
  },
  {
    labelKey: 'mobile.chart.sections.annotate',
    keys: ['text', 'arrow', 'callout', 'highlighter'],
  },
  {
    labelKey: 'chart.drawing.categories.measure',
    keys: ['measure', 'long-position', 'short-position'],
  },
]

/** Every tool key the sheet can put under a thumb, flattened. */
export const MOBILE_DRAWING_TOOL_KEYS: Array<string> =
  MOBILE_DRAWING_SECTIONS.flatMap((section) => section.keys)
