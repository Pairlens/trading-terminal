#!/usr/bin/env bun
// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Validate (and build) community plugin submissions. Used by the
 * community-plugins CI workflow on PRs and runnable locally:
 *
 *   bun apps/registry/scripts/validate-community.ts            # all submissions
 *   bun apps/registry/scripts/validate-community.ts <dir> ...  # specific ones
 *
 * With PR_AUTHOR set (CI), additionally enforces that each validated plugin's
 * githubUser namespace is owned by the PR author. Maintainers may touch any
 * namespace; the "pairlens" namespace is maintainer-only.
 */
import {
  buildCommunityModule,
  listCommunityDirs,
  validateCommunityPlugin,
} from '../src/community'

const MAINTAINERS = ['juanignaciomolina']
const RESERVED_NAMESPACES = ['pairlens']

const args = process.argv.slice(2).filter((a) => a.length > 0)
const dirs = args.length > 0 ? args : await listCommunityDirs()
const prAuthor = process.env.PR_AUTHOR?.toLowerCase()

if (dirs.length === 0) {
  console.log('No community plugin submissions to validate.')
  process.exit(0)
}

let failed = false

for (const dir of dirs) {
  const result = await validateCommunityPlugin(dir)
  const errors = [...result.errors]

  if (prAuthor && result.store) {
    const namespace = result.store.githubUser
    const isMaintainer = MAINTAINERS.includes(prAuthor)
    const owned = RESERVED_NAMESPACES.includes(namespace)
      ? isMaintainer
      : namespace === prAuthor || isMaintainer
    if (!owned) {
      errors.push(
        `namespace "${namespace}" is not owned by PR author "@${prAuthor}"`,
      )
    }
  }

  if (errors.length === 0) {
    try {
      const size = await buildCommunityModule(dir)
      console.log(`✓ ${dir} — valid, built (${size} bytes)`)
      continue
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  failed = true
  console.error(`✗ ${dir}`)
  for (const error of errors) console.error(`    - ${error}`)
}

process.exit(failed ? 1 : 0)
