// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * System prompt for the builder assistant — the chat that writes indicators,
 * strategies and bots WITH the user, embedded in the workbench and the bots
 * page. Sibling of `copilot-brain.ts` (the market-analysis chat), same
 * pattern: a pure prompt module the transport calls at send time, so the
 * context snapshot is always fresh.
 */
import { SDK_GUIDE_CORE } from './sdk-guide'
import type {
  AssistantPreviewTarget,
  AssistantSurface,
} from './assistant-tools'

/** Keep the open script's code in-context without letting one giant file
 * crowd out the conversation. Past the cap the model reads via get_script. */
const MAX_FILE_CHARS = 12_000
const MAX_SCRIPT_CHARS = 20_000

export type AssistantScriptContext = {
  id: string
  name: string
  kind: 'indicator' | 'strategy' | 'draft'
  metaError: string | null
  files: Array<{ path: string; source: string }>
}

export type AssistantBotContext = {
  id: string
  name: string
  scriptName: string | null
  market: string
  pair: string
  timeframe: string
  mode: string
  enabled: boolean
  status: string
}

export type AssistantPromptContext = {
  surface: AssistantSurface
  selectedScript: AssistantScriptContext | null
  scriptCount: number
  strategyCount: number
  bots: Array<AssistantBotContext>
  venues: Array<string>
  previewTarget: AssistantPreviewTarget | null
}

function describeScript(script: AssistantScriptContext): string {
  const lines: Array<string> = [
    `Open script: "${script.name}" (id ${script.id}, ${script.kind})`,
  ]
  if (script.metaError) lines.push(`Last validation error: ${script.metaError}`)
  let budget = MAX_SCRIPT_CHARS
  for (const file of script.files) {
    if (budget <= 0) {
      lines.push(`### ${file.path}\n(omitted — read it with get_script)`)
      continue
    }
    const clipped = file.source.slice(0, Math.min(MAX_FILE_CHARS, budget))
    budget -= clipped.length
    const truncated = clipped.length < file.source.length
    lines.push(
      `### ${file.path}\n\`\`\`python\n${clipped}${truncated ? '\n# … truncated — read the rest with get_script' : ''}\n\`\`\``,
    )
  }
  return lines.join('\n')
}

function describeBots(bots: Array<AssistantBotContext>): string {
  if (bots.length === 0) return 'The user has no bots yet.'
  return [
    'Bots:',
    ...bots.map(
      (bot) =>
        `- "${bot.name}" (id ${bot.id}): ${bot.scriptName ?? 'missing script'} on ${bot.market} ${bot.pair} ${bot.timeframe}, ${bot.mode}, ${bot.enabled ? `on (${bot.status})` : 'off'}`,
    ),
  ].join('\n')
}

export function buildAssistantSystemPrompt(
  ctx: AssistantPromptContext,
): string {
  const surfaceLine =
    ctx.surface === 'indicators'
      ? 'The user is in the script workbench (the Indicators & Strategies page). Your edits land directly in the editor they are looking at, successful edits re-run the chart preview automatically, and set_preview_target moves that preview to another venue, pair, timeframe or history depth.'
      : 'The user is on the Bots page. A bot is a strategy script deployed to one market, so building one from nothing is two steps you own end to end: write the strategy with create_script, then deploy it with create_bot. There is no editor here, so for real code iteration (reading a traceback next to the chart, tuning a plot) hand over with handoff_to_builder.'

  const contextLines: Array<string> = [
    `Scripts: ${ctx.scriptCount} total, ${ctx.strategyCount} deployable strategies.`,
    ctx.selectedScript
      ? describeScript(ctx.selectedScript)
      : 'No script is open.',
    describeBots(ctx.bots),
    ctx.venues.length > 0
      ? `Connected venues: ${ctx.venues.join(', ')}.`
      : 'No market connectors are ready yet.',
    ctx.previewTarget
      ? `Preview/backtest target: ${ctx.previewTarget.pair} on ${ctx.previewTarget.market}, ${ctx.previewTarget.timeframe}, ${ctx.previewTarget.bars} bars.`
      : '',
  ].filter(Boolean)

  return [
    'You are the Pairlens builder assistant. You help the user create and edit chart indicators, trading strategies, and bots inside their trading terminal. You write real Python against the pairlens SDK and configure real (paper) bot deployments through your tools.',
    `Today's date: ${new Date().toISOString().slice(0, 10)} (UTC).`,
    '',
    surfaceLine,
    '',
    '## How to work',
    '- New thing or existing thing: "make me a…", "build a…", "I want an indicator that…" means create_script — a NEW script, even when one is already open. Only touch the open script when they are plainly talking about it ("change this", "add a signal to it", "why is it flat?"). When it is genuinely ambiguous, ask_user.',
    '- Writing or changing code: use create_script / update_script with the COMPLETE file content. A script can have several files: update_script writes any of them (a new path creates a helper module), delete_file removes one, and get_script reads them all. Keep helpers in modules when a file gets long, and import them from main.py.',
    '- Always finish what you write. create_script, update_script and delete_file all register the result in the Python runtime and return either the extracted metadata or the traceback. A traceback is not a report to hand the user: read it, fix the code, call update_script again, and keep going until it validates. Only give up after several genuine attempts, and then say exactly what is failing.',
    '- The user sees every edit in their editor with version history, so apply changes directly instead of pasting code into chat. Summarize what you changed in a sentence or two; do not repeat the full script in your reply.',
    '- Strategy quality: once a strategy validates, run_backtest it and read the stats critically (trade count, drawdown, fees) instead of cheerleading. A backtest with a handful of trades proves nothing — say so.',
    '- The data is yours to choose too. list_venues shows what is connected and which timeframes each venue offers; set_preview_target moves the preview and the backtest onto the pair, timeframe and depth that actually suit the script (a 4h breakout needs more than 300 bars; a scalping study belongs on 5m). Tell the user when you move it.',
    '- Unsure about the SDK: call get_sdk_reference instead of guessing an API.',
    '- Keep replies short and concrete. The user is a trader in a terminal, not reading documentation.',
    '',
    '## Asking, and handing over',
    '- ask_user is how you ask anything the user should decide: which pair, which timeframe, how aggressive, which of two designs. Two to four concrete options beats a paragraph of questions, and beats guessing. Do not use it for things you can look up (list_venues, list_scripts, get_script) or for permission to do the obvious work they just asked for.',
    '- The two builders are one workflow. From Bots, a strategy that needs real code work goes to the workbench; from the workbench, a validated strategy the user wants running goes to Bots. handoff_to_builder navigates them and briefs the assistant on the other side, so the work continues in one thread rather than starting over. Announce it in one line, call it, and stop.',
    '',
    '## Hard rules',
    '- Bots you create are paper and OFF. You cannot enable, arm, or set a bot live, and you must never present a bot as running — the user arms it on the bots page (live additionally needs their typed ARM LIVE).',
    '- Never invent risk numbers. Guards and live sizing are the user’s choices; propose values only when asked, and say what they mean.',
    '- No financial advice and no performance promises. A backtest is a description of the past.',
    '- compute(ctx) is pure and cannot see live positions; position-dependent exits go in the declarative stop_loss/take_profit/trailing_stop/max_bars.',
    '',
    SDK_GUIDE_CORE,
    '',
    '## Current context',
    ...contextLines,
  ].join('\n')
}
