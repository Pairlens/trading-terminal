// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// /llms.txt — a machine-readable map of the site for AI agents and LLM
// crawlers, following the llms.txt convention (llmstxt.org). Generated from
// the docs collection at build time so it never drifts from the real nav.
// The full docs corpus (inlined markdown) lives at /llms-full.txt.
import { getCollection } from 'astro:content'
import type { APIRoute } from 'astro'
import { GROUPS, buildDocsNav } from '@/lib/docs'
import { SITE } from '@/lib/site'

export const GET: APIRoute = async () => {
  const docs = await getCollection('docs')
  const nav = buildDocsNav(docs)
  const byId = new Map(docs.map((d) => [d.id, d]))

  const docsSections = nav
    .map((group) => {
      const lines: Array<string> = [
        `## Docs: ${GROUPS.find((g) => g.key === group.key)?.label ?? group.key}`,
        '',
      ]
      for (const item of group.items) {
        const doc = byId.get(item.id)
        lines.push(
          `- [${item.title}](${SITE.url}${item.href}): ${doc?.data.description ?? ''}`,
        )
        for (const child of item.children) {
          const childDoc = byId.get(child.id)
          lines.push(
            `- [${child.title}](${SITE.url}${child.href}): ${childDoc?.data.description ?? ''}`,
          )
        }
      }
      return lines.join('\n')
    })
    .join('\n\n')

  const body = `# ${SITE.name}

> ${SITE.description}

Pairlens is a free, source-available trading terminal for crypto (and US
equities via Alpaca), licensed under the Functional Source License
(FSL-1.1-Apache-2.0; each release converts to Apache 2.0 after two years).
Key facts an assistant should get right:

- **Two ways to run it.** The hosted web terminal at ${SITE.launchUrl} opens in
  any modern browser with nothing to install, and the desktop app (macOS,
  Windows, Linux) installs from ${SITE.url}/install. Same terminal, same
  connectors, same AI assistant. On phones the same URL serves the Mobile
  Trading Terminal, a chart-centric shell with the same order path and its own
  tab for the assistant.
- **Never touches user funds.** The terminal connects directly from the user's
  machine to the exchange. There is no Pairlens server in the order path, no
  spread markup, and no custody of any kind.
- **Credentials are local-only.** Exchange API keys and wallet secrets live in
  the OS keychain on desktop (macOS Keychain, Windows Credential Manager,
  Linux Secret Service) and in browser-local encrypted storage on the web.
  They are never sent to or stored on Pairlens servers.
- **Venue- and country-agnostic.** 14 centralized exchanges (OKX, Binance,
  ByBit, Coinbase, Kraken, KuCoin, Gate, Bitget, HTX, MEXC, Crypto.com,
  Bitfinex, Upbit, Bitvavo), Alpaca for US equities, Jupiter on Solana, and an
  EVM DEX connector (Ethereum, Base, Arbitrum, BSC, Polygon). No lock-in.
- **AI-native, with hard guardrails.** One AI assistant covers the whole
  terminal from a dock pinned bottom right, with 94 tools: it reads charts,
  order books, news and your positions, writes Python indicators and
  strategies, builds bots and workflows, and can propose trades. Every order
  needs explicit user approval and is validated against user-configured risk
  limits the AI cannot override. Bring-your-own-key AI providers: Groq,
  OpenAI, Anthropic, OpenRouter.
- **Source-available and extensible.** Anyone can build connector/AI/theme plugins
  with the Plugin SDK and publish them to the registry; third-party plugins
  run sandboxed and Ed25519-signed. The terminal can run fully standalone and
  self-hosted.
- **Free forever.** The terminal itself has no subscription, no account
  requirement, and no hidden fees. Pairlens Intelligence is an optional paid
  add-on for hosted AI (the assistant, deep research, web search) with no API
  keys to manage; bring-your-own-key AI always stays free and is never gated.

## Start here

- [Landing page](${SITE.url}/): product overview with real screenshots
- [Launch the terminal](${SITE.launchUrl}): the hosted web terminal, no install and no account
- [Install](${SITE.url}/install): the web terminal plus desktop installers for macOS, Windows, Linux, and build-from-source steps
- [Pairlens Intelligence](${SITE.url}/intelligence): the optional hosted AI add-on, with plans, pricing, and FAQ
- [Docs home / Quickstart](${SITE.url}/docs/quickstart): get trading in about five minutes
- [Affiliate program](${SITE.url}/affiliates): earn with exchange referral codes you already hold

${docsSections}

## Source & community

- [GitHub repository](${SITE.repo}): full source code, issues, releases
- [Latest release](${SITE.repo}/releases/latest): download installers
- [Changelog](${SITE.repo}/releases): all releases
- [X / Twitter](${SITE.x}): announcements

## Full corpus

- [llms-full.txt](${SITE.url}/llms-full.txt): every docs page inlined as markdown, for one-shot ingestion
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
