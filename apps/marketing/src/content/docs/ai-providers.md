---
title: AI providers and Intelligence
description: Use your own AI provider key for free, or subscribe to hosted Intelligence and skip the key management. What each costs, and how credits work.
group: traders
parent: ai-copilot
order: 2
eyebrow: For traders
updated: 22 AUG 2026
readTime: 4 min read
---

The AI in Pairlens is not tied to one company's model. You choose who provides
it, and there are two ways to do that. They are not exclusive: you can have both
and switch.

## Bring your own key

Free, always, and never gated. If you already have an account with an AI
provider, you have an API key: a string from their dashboard that lets a program
use your account, billed to you directly.

Install that provider's plugin from the Plugin Store, paste the key, and the
assistant uses it, research included.

**Inference.** Anthropic, OpenAI, Groq, OpenRouter.

**Web search.** Tavily, Exa. Without one of these, research reports still work
but are built from market data alone.

Your key is stored the same way an exchange key is: in the OS keychain on
desktop, in the encrypted credential vault in a browser. Requests go from your machine
straight to the provider. Nothing routes through a Pairlens server.

This is the option for anyone who already has an API key, wants a specific
model, or wants zero third parties in the path.

## Pairlens Intelligence

A subscription for people who would rather not manage API keys at all. Pairlens
relays the requests, and you get a monthly budget of credits.

| Plan                 | Price  | Monthly credits |
| -------------------- | ------ | --------------- |
| **Intelligence Pro** | $19/mo | 13,000          |
| **Intelligence Max** | $99/mo | 70,000          |

One credit is $0.001 of underlying AI cost, so 13,000 credits is $13 of usage.
Chat, research and web search all draw from the same budget, and a web search
costs a flat 10 credits plus whatever the request itself uses.

For a sense of scale: ordinary questions cost a few credits each. A full
[research report](/docs/research-reports) is the expensive one, at tens to low
hundreds.

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
private keys. Those live in the OS keychain or your encrypted vault and are
read only by the connector signing an order.
