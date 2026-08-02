// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// /llms-full.txt — the entire docs corpus inlined as one markdown document,
// for AI agents that want the full context in a single fetch (companion to
// /llms.txt, which is the short map). Ordered to match the sidebar nav.
import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'
import { flattenDocs } from '@/lib/docs'
import { SITE } from '@/lib/site'

export const GET: APIRoute = async () => {
  const docs = await getCollection('docs')
  const ordered = flattenDocs(docs)

  const sections = ordered.map((doc) => {
    const header = [
      `# ${doc.data.title}`,
      '',
      `> ${doc.data.description}`,
      '',
      `Canonical URL: ${SITE.url}/docs/${doc.id}`,
      '',
    ].join('\n')
    // Raw markdown body; MDX component/import lines are stripped since they
    // are meaningless outside the site.
    const bodyText = (doc.body ?? '')
      .split('\n')
      .filter((line) => !/^\s*import\s.+\sfrom\s/.test(line))
      .join('\n')
      .replace(/<[A-Z][\s\S]*?\/>/g, '')
      .replace(/<([A-Z]\w*)[\s\S]*?<\/\1>/g, '')
      .trim()
    return `${header}\n${bodyText}\n`
  })

  const body = [
    `# ${SITE.name}: full documentation`,
    '',
    `> ${SITE.description}`,
    '',
    `Site: ${SITE.url} · Source: ${SITE.repo} · Short map: ${SITE.url}/llms.txt`,
    '',
    '---',
    '',
    sections.join('\n---\n\n'),
  ].join('\n')

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
