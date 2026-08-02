---
title: AI providers and Intelligence
description: Bring your own key for free, or subscribe to hosted Pairlens Intelligence. How credits work, and what each option costs.
group: traders
parent: ai-copilot
order: 2
eyebrow: For traders
updated: AUG 2026
readTime: 4 min read
---

Every AI feature in Pairlens runs on a provider you choose. There are two ways
to supply one, and they are not exclusive.

## Bring your own key

Free, always, and never gated. Install a provider plugin from the Plugin Store,
paste your API key, and the co-pilot and research panel use it.

**Inference.** Anthropic, OpenAI, Groq, OpenRouter.

**Web search.** Tavily, Exa. Without one of these, research reports still work
but are built from market data alone.

Your key is stored the same way an exchange key is: in the OS keychain on
desktop, encrypted at rest in browser dev builds. Requests go from your machine
straight to the provider. Nothing routes through a Pairlens server.

This is the option for anyone who already has an API key, wants a specific
model, or wants zero third parties in the path.

## Pairlens Intelligence

A hosted subscription for people who would rather not manage API keys. The App
Server proxies inference, and you get a monthly credit budget.

| Plan                 | Price  | Monthly credits |
| -------------------- | ------ | --------------- |
| **Intelligence Pro** | $19/mo | 13,000          |
| **Intelligence Max** | $99/mo | 70,000          |

One credit equals $0.001 of underlying AI usage cost. Chat, research, and web
search all draw from the same budget. A hosted web search costs a flat 10
credits plus the tokens of the request that triggered it.

Credits reset every billing cycle and do not roll over.

### Extra credits

Max subscribers can buy one-time top-up packs that stack on the monthly budget:
$10 for 5,000 credits, $20 for 10,000, $50 for 25,000, $100 for 50,000. Pack
credits are spent before your monthly budget and expire 30 days after purchase,
so an actively used pack forfeits little or nothing.

Prices exclude tax, which is calculated at checkout based on your location.

Manage everything in **Settings → Intelligence**: current plan, credits used
against granted, reset date, checkout, and the billing portal.

## Which to choose

| You                                           | Want               |
| --------------------------------------------- | ------------------ |
| Already have an OpenAI or Anthropic key       | Bring your own key |
| Want a specific model or provider             | Bring your own key |
| Run standalone with no App Server             | Bring your own key |
| Would rather not think about API keys at all  | Intelligence Pro   |
| Generate research reports several times a day | Intelligence Max   |

## Running out

If you exhaust your credits mid-cycle, hosted AI stops until the reset or until
you top up. It fails with a clear message rather than degrading silently. A
bring-your-own-key provider keeps working regardless, because it is billed by
your provider, not by us.

## Self-hosted and standalone

With no App Server configured, the terminal runs standalone: auth off, cloud
panels hidden, local persistence only. AI still works through bring-your-own-key
plugins, with calls going directly from the terminal to your chosen provider.
See [self-hosting](/docs/self-hosting).

## What is never sent

No AI request, hosted or otherwise, includes your exchange API keys or wallet
private keys. Those live in the OS keychain and are read only by the connector
signing an order.
