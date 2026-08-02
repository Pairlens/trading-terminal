// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/** Turn heading text into a URL-safe slug */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export type ResearchSection = {
  heading: string
  slug: string
  body: string
}

/**
 * Extract a section heading from a line. The prompt asks for H3 headings,
 * but models drift — accept H2/H3/H4 and standalone bold lines
 * (`**Executive Summary**`) so a compliant-but-styled report still renders.
 */
function matchHeading(line: string): string | null {
  const hx = line.match(/^#{2,4}\s+(.+?)\s*$/)
  if (hx) return hx[1]
  const bold = line.match(/^\*\*([^*]+)\*\*:?\s*$/)
  if (bold) return bold[1]
  return null
}

/**
 * Split a markdown report into sections by headings.
 * Works with streaming — re-run on every report update.
 */
export function parseResearchSections(
  markdown: string,
): Array<ResearchSection> {
  const lines = markdown.split('\n')
  const sections: Array<ResearchSection> = []
  let current: {
    heading: string
    slug: string
    bodyLines: Array<string>
  } | null = null

  for (const line of lines) {
    const match = matchHeading(line)
    if (match) {
      // Flush previous section
      if (current) {
        sections.push({
          heading: current.heading,
          slug: current.slug,
          body: current.bodyLines.join('\n').trim(),
        })
      }
      current = { heading: match, slug: slugify(match), bodyLines: [] }
    } else if (current) {
      current.bodyLines.push(line)
    }
    // Lines before any heading are dropped (no preamble expected)
  }

  // Flush last section
  if (current) {
    sections.push({
      heading: current.heading,
      slug: current.slug,
      body: current.bodyLines.join('\n').trim(),
    })
  }

  // No recognizable headings at all — render the whole report as one
  // section rather than dropping it
  if (sections.length === 0 && markdown.trim().length > 0) {
    return [{ heading: 'Report', slug: 'report', body: markdown.trim() }]
  }

  return sections
}
