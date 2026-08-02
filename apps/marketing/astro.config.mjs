// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { defineConfig } from 'astro/config'
import mdx from '@astrojs/mdx'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { LEGAL_ENTITY } from './src/lib/legal.ts'

const marketingPort = Number.parseInt(process.env.MARKETING_PORT ?? '', 10)

// While the legal documents still carry unfilled placeholders they render a
// DRAFT banner and set `noindex`; keep them out of the sitemap too, so a
// half-written policy is never advertised to crawlers as canonical.
const LEGAL_PATHS = ['/privacy', '/terms']
const sitemapFilter = (page) =>
  LEGAL_ENTITY.configured ||
  !LEGAL_PATHS.some(
    (path) => new URL(page).pathname.replace(/\/$/, '') === path,
  )

export default defineConfig({
  site: 'https://pairlens.finance',
  server: {
    port: Number.isFinite(marketingPort) ? marketingPort : 3001,
  },
  integrations: [react(), mdx(), sitemap({ filter: sitemapFilter })],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // @pairlens/fast-financial-charts must stay unbundled: its indicator worker is created
      // via `new URL('./indicator.worker.ts', import.meta.url)`, which breaks
      // when the package is prebundled into .vite/deps (same rule as the
      // terminal's vite config).
      exclude: ['@pairlens/fast-financial-charts'],
    },
  },
})
