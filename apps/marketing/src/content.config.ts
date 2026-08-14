// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { defineCollection } from 'astro:content'
import { glob } from 'astro/loaders'
import { z } from 'astro/zod'

const docs = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/docs' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Sidebar group (audience-oriented). Omit to hide from the grouped nav. */
    group: z
      .enum(['get-started', 'traders', 'builders', 'institutions', 'reference'])
      .optional(),
    /** Slug of the parent doc — makes this a nested child in the sidebar. */
    parent: z.string().optional(),
    /** Sort order within its group / parent. */
    order: z.number().default(999),
    /** Short eyebrow above the H1 (defaults from the group). */
    eyebrow: z.string().optional(),
    /** Meta line bits. */
    updated: z.string().optional(),
    readTime: z.string().optional(),
  }),
})

/**
 * Legal documents (/privacy, /terms). Separate from `docs` because they get
 * their own layout, carry an effective date rather than a sidebar group, and
 * must never be pulled into the docs nav or the ⌘K palette.
 */
const legal = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/legal' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    /** Human-readable date the version took effect. */
    effective: z.string(),
    /** One-paragraph plain-language summary shown above the document. */
    summary: z.string(),
  }),
})

export const collections = { docs, legal }
