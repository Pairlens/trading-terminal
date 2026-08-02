// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { SITE } from './site'
import type { CollectionEntry } from 'astro:content'

export type Doc = CollectionEntry<'docs'>

export const GROUPS = [
  { key: 'get-started', label: 'Get started' },
  { key: 'traders', label: 'For traders' },
  { key: 'builders', label: 'For builders' },
  { key: 'institutions', label: 'For institutions' },
] as const

export type NavNode = {
  id: string
  title: string
  href: string
  children: Array<NavNode>
}

export type NavGroup = {
  key: string
  label: string
  items: Array<NavNode>
}

const byOrder = (a: Doc, b: Doc) => a.data.order - b.data.order

/** Build the grouped, one-level-nested sidebar tree from doc frontmatter. */
export function buildDocsNav(docs: Array<Doc>): Array<NavGroup> {
  const inGroups = docs.filter((d) => d.data.group)
  return GROUPS.map((g) => {
    const groupDocs = inGroups.filter((d) => d.data.group === g.key)
    const parents = groupDocs.filter((d) => !d.data.parent).sort(byOrder)
    const items: Array<NavNode> = parents.map((p) => ({
      id: p.id,
      title: p.data.title,
      href: `/docs/${p.id}`,
      children: groupDocs
        .filter((d) => d.data.parent === p.id)
        .sort(byOrder)
        .map((c) => ({
          id: c.id,
          title: c.data.title,
          href: `/docs/${c.id}`,
          children: [],
        })),
    }))
    return { key: g.key, label: g.label, items }
  }).filter((g) => g.items.length > 0)
}

/** Flat, ordered list of docs for prev/next pager + command palette. */
export function flattenDocs(docs: Array<Doc>): Array<Doc> {
  const nav = buildDocsNav(docs)
  const byId = new Map(docs.map((d) => [d.id, d]))
  const out: Array<Doc> = []
  for (const group of nav) {
    for (const item of group.items) {
      const d = byId.get(item.id)
      if (d) out.push(d)
      for (const child of item.children) {
        const cd = byId.get(child.id)
        if (cd) out.push(cd)
      }
    }
  }
  return out
}

export function groupLabel(key?: string): string {
  return GROUPS.find((g) => g.key === key)?.label ?? 'Docs'
}

/** Title of the doc that owns `id` as a nested child — the breadcrumb middle. */
export function parentTitle(
  nav: Array<NavGroup>,
  id: string,
): string | undefined {
  for (const group of nav) {
    for (const item of group.items) {
      if (item.children.some((c) => c.id === id)) return item.title
    }
  }
  return undefined
}

/**
 * "Edit on GitHub" target. `filePath` carries the real extension (.md / .mdx),
 * which the id alone does not; it is relative to this Astro project, so the
 * monorepo prefix goes back on.
 */
export function docEditUrl(doc: Doc): string {
  const path = doc.filePath ?? `src/content/docs/${doc.id}.md`
  return `${SITE.repo}/blob/main/apps/marketing/${path}`
}
