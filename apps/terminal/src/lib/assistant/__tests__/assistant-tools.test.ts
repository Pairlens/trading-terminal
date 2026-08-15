// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { beforeEach, describe, expect, test } from 'bun:test'
import {
  buildAssistantTools,
  collectAssistantPromptContext,
} from '../assistant-tools'
import { consumeAssistantIntent } from '../assistant-chat-cache'
import { ASSISTANT_TOOL_LABELS } from '../assistant-tool-labels'
import type {
  AssistantPythonRuntime,
  AssistantToolDeps,
  AssistantWorkbenchBridge,
} from '../assistant-tools'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type { ToolCallOptions } from 'ai'
import { formatToolLabel } from '@/lib/copilot/tool-labels'
import { useBotRunsStore } from '@/stores/bot-runs-store'
import { useBotsStore } from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

const callOpts = {
  toolCallId: 't1',
  messages: [],
} as unknown as ToolCallOptions

function indicatorMeta(id: string): CustomIndicatorMeta {
  return {
    id,
    title: 'Test Indicator',
    pane: 'overlay',
    inputs: [{ type: 'int', key: 'length', default: 14 }],
    series: [{ key: 'value', type: 'line' }],
  } as CustomIndicatorMeta
}

function strategyMeta(id: string): CustomIndicatorMeta {
  return {
    ...indicatorMeta(id),
    title: 'Test Strategy',
    strategy: {
      initialCapital: 10_000,
      positionSize: 1,
      fee: 0.001,
      slippage: 0,
      allowShort: true,
    },
  }
}

function fakePython(
  overrides: Partial<AssistantPythonRuntime> = {},
): AssistantPythonRuntime {
  return {
    registerScript: async (id) => indicatorMeta(id),
    compute: async () => ({ outputs: {} }),
    ...overrides,
  }
}

function makeDeps(
  overrides: Partial<AssistantToolDeps> = {},
): AssistantToolDeps {
  return {
    surface: 'indicators',
    getWorkbench: () => null,
    getMarketData: () => null,
    getPython: () => fakePython(),
    navigate: () => {},
    ...overrides,
  }
}

/** A workbench bridge whose defaults are inert, so each test states its own. */
function makeBridge(
  overrides: Partial<AssistantWorkbenchBridge> = {},
): AssistantWorkbenchBridge {
  return {
    getSelectedScriptId: () => null,
    selectScript: () => {},
    getFiles: () => null,
    applyEdit: () => {},
    deleteFile: () => {},
    runPreview: () => {},
    getPreviewTarget: () => ({
      market: 'okx',
      pair: 'BTC-USDT',
      timeframe: '1h',
      bars: 500,
    }),
    setPreviewTarget: () => {},
    ...overrides,
  }
}

beforeEach(() => {
  useIndicatorScriptsStore.setState({ scripts: [], loaded: true })
  useBotsStore.setState({ bots: [], loaded: true })
  useBotRunsStore.setState({ runs: {}, loaded: true })
})

function seedScript(meta: CustomIndicatorMeta | null, name = 'My Script') {
  const store = useIndicatorScriptsStore.getState()
  const id = store.createScript(name, 'meta = ...\ndef compute(ctx): ...')
  if (meta) store.cacheMeta(id, { meta, metaError: null })
  return id
}

describe('create_bot', () => {
  test('creates a paper, disabled bot — never anything else', async () => {
    const scriptId = seedScript(strategyMeta('s1'))
    const tools = buildAssistantTools(makeDeps())
    const result = (await tools.create_bot.execute!(
      {
        scriptId,
        market: 'okx',
        pair: 'btc-usdt',
        timeframe: '1h',
        params: { length: 21 },
      },
      callOpts,
    )) as { botId: string }

    const bot = useBotsStore.getState().bots.find((b) => b.id === result.botId)!
    expect(bot.mode).toBe('paper')
    expect(bot.enabled).toBe(false)
    expect(bot.pair).toBe('BTC-USDT')
    expect(bot.params).toEqual({ length: 21 })
  })

  test('refuses indicator scripts and unvalidated drafts', async () => {
    const indicatorId = seedScript(indicatorMeta('s2'))
    const draftId = seedScript(null, 'Draft')
    const tools = buildAssistantTools(makeDeps())

    const forIndicator = (await tools.create_bot.execute!(
      {
        scriptId: indicatorId,
        market: 'okx',
        pair: 'BTC-USDT',
        timeframe: '1h',
      },
      callOpts,
    )) as { error?: string }
    expect(forIndicator.error).toContain('strategy')

    const forDraft = (await tools.create_bot.execute!(
      { scriptId: draftId, market: 'okx', pair: 'BTC-USDT', timeframe: '1h' },
      callOpts,
    )) as { error?: string }
    expect(forDraft.error).toContain('draft')
    expect(useBotsStore.getState().bots).toHaveLength(0)
  })

  test('rejects venues the terminal does not have', async () => {
    const scriptId = seedScript(strategyMeta('s3'))
    const tools = buildAssistantTools(
      makeDeps({
        getMarketData: () => ({
          availableMarkets: [{ marketId: 'okx' }],
          getTimeframes: () => ['1h'],
          fetchHistory: async () => [],
        }),
      }),
    )
    const result = (await tools.create_bot.execute!(
      { scriptId, market: 'nope', pair: 'BTC-USDT', timeframe: '1h' },
      callOpts,
    )) as { error?: string }
    expect(result.error).toContain('okx')
  })
})

describe('update_bot', () => {
  test('schema has no way to arm, enable, or retarget a bot', () => {
    const tools = buildAssistantTools(makeDeps())
    const parsed = (
      tools.update_bot.inputSchema as unknown as {
        parse: (v: unknown) => Record<string, unknown>
      }
    ).parse({
      botId: 'b1',
      name: 'Renamed',
      mode: 'live',
      enabled: true,
      market: 'binance',
      pair: 'ETH-USDT',
    })
    expect(parsed).toEqual({ botId: 'b1', name: 'Renamed' })
  })

  test('patches only the allowed fields and leaves arming state alone', async () => {
    const scriptId = seedScript(strategyMeta('s4'))
    const botId = useBotsStore.getState().createBot({
      name: 'Bot',
      scriptId,
      market: 'okx',
      pair: 'BTC-USDT',
      timeframe: '1h',
      params: { length: 14 },
    })
    const tools = buildAssistantTools(makeDeps())
    const result = (await tools.update_bot.execute!(
      {
        botId,
        name: 'Tighter',
        guards: { maxDailyLossPercent: 0.05, cooldownBars: 3 },
        params: { length: 30 },
      },
      callOpts,
    )) as { error?: string }
    expect(result.error).toBeUndefined()

    const bot = useBotsStore.getState().bots.find((b) => b.id === botId)!
    expect(bot.name).toBe('Tighter')
    expect(bot.guards).toEqual({ maxDailyLossPercent: 0.05, cooldownBars: 3 })
    expect(bot.params).toEqual({ length: 30 })
    expect(bot.mode).toBe('paper')
    expect(bot.enabled).toBe(false)
  })
})

describe('script tools', () => {
  test('create_script registers, caches meta, and selects in the workbench', async () => {
    const selected: Array<string> = []
    const bridge = makeBridge({
      selectScript: (id) => selected.push(id),
      runPreview: (id) => selected.push(`preview:${id}`),
    })
    const tools = buildAssistantTools(makeDeps({ getWorkbench: () => bridge }))
    const result = (await tools.create_script.execute!(
      { name: 'AI Indicator', source: 'meta = ...' },
      callOpts,
    )) as { scriptId: string; kind: string }

    expect(result.kind).toBe('indicator')
    const script = useIndicatorScriptsStore
      .getState()
      .scripts.find((s) => s.id === result.scriptId)!
    expect(script.meta).not.toBeNull()
    expect(selected).toEqual([result.scriptId, `preview:${result.scriptId}`])
  })

  test('a Python failure keeps the draft and returns the traceback', async () => {
    const failure = Object.assign(
      new Error("NameError: name 'x' is not defined"),
      {
        traceback: 'Traceback (most recent call last):\n  ...',
      },
    )
    const tools = buildAssistantTools(
      makeDeps({
        getPython: () =>
          fakePython({
            registerScript: async () => {
              throw failure
            },
          }),
      }),
    )
    const result = (await tools.create_script.execute!(
      { name: 'Broken', source: 'x' },
      callOpts,
    )) as { scriptId: string; error?: string; traceback?: string }

    expect(result.error).toContain('NameError')
    expect(result.traceback).toContain('Traceback')
    const script = useIndicatorScriptsStore
      .getState()
      .scripts.find((s) => s.id === result.scriptId)!
    expect(script.meta).toBeNull()
    expect(script.metaError).toContain('NameError')
  })

  test('update_script writes through the workbench bridge for live edits', async () => {
    const scriptId = seedScript(indicatorMeta('s5'))
    const edits: Array<[string, string, string]> = []
    const bridge = makeBridge({
      getSelectedScriptId: () => scriptId,
      getFiles: (id) => {
        const script = useIndicatorScriptsStore
          .getState()
          .scripts.find((s) => s.id === id)
        return script ? [{ path: 'main.py', source: script.source }] : null
      },
      applyEdit: (id, path, source) => {
        edits.push([id, path, source])
        useIndicatorScriptsStore.getState().setFileSource(id, path, source)
      },
    })
    const tools = buildAssistantTools(makeDeps({ getWorkbench: () => bridge }))
    const result = (await tools.update_script.execute!(
      { source: 'meta = better' },
      callOpts,
    )) as { scriptId?: string; error?: string }

    expect(result.error).toBeUndefined()
    expect(edits).toEqual([[scriptId, 'main.py', 'meta = better']])
    expect(
      useIndicatorScriptsStore
        .getState()
        .scripts.find((s) => s.id === scriptId)!.source,
    ).toBe('meta = better')
  })

  test('update_script without a target explains itself', async () => {
    const tools = buildAssistantTools(makeDeps())
    const result = (await tools.update_script.execute!(
      { source: 'meta = ...' },
      callOpts,
    )) as { error?: string }
    expect(result.error).toContain('create_script')
  })
})

describe('collectAssistantPromptContext', () => {
  test('summarizes scripts, bots, and the open script', () => {
    const strategyId = seedScript(strategyMeta('s6'), 'Strat')
    seedScript(indicatorMeta('s7'), 'Ind')
    useBotsStore.getState().createBot({
      name: 'Bot',
      scriptId: strategyId,
      market: 'okx',
      pair: 'BTC-USDT',
      timeframe: '1h',
    })
    const bridge = makeBridge({
      getSelectedScriptId: () => strategyId,
      getPreviewTarget: () => ({
        market: 'okx',
        pair: 'ETH-USDT',
        timeframe: '4h',
        bars: 1000,
      }),
    })
    const ctx = collectAssistantPromptContext(
      makeDeps({ getWorkbench: () => bridge }),
    )
    expect(ctx.scriptCount).toBe(2)
    expect(ctx.strategyCount).toBe(1)
    expect(ctx.selectedScript?.name).toBe('Strat')
    expect(ctx.selectedScript?.kind).toBe('strategy')
    expect(ctx.bots).toHaveLength(1)
    expect(ctx.bots[0].scriptName).toBe('Strat')
    expect(ctx.bots[0].enabled).toBe(false)
    expect(ctx.previewTarget).toEqual({
      market: 'okx',
      pair: 'ETH-USDT',
      timeframe: '4h',
      bars: 1000,
    })
  })
})

describe('delete_file', () => {
  test('removes a module and re-validates what is left', async () => {
    const store = useIndicatorScriptsStore.getState()
    const scriptId = store.createScript('Multi', 'import helpers')
    store.addModule(scriptId, 'helpers.py', 'X = 1')
    const deleted: Array<[string, string]> = []
    const tools = buildAssistantTools(
      makeDeps({
        getWorkbench: () =>
          makeBridge({
            getSelectedScriptId: () => scriptId,
            deleteFile: (id, path) => {
              deleted.push([id, path])
              useIndicatorScriptsStore.getState().deleteModule(id, path)
            },
          }),
      }),
    )

    const result = (await tools.delete_file.execute!(
      { path: 'helpers.py' },
      callOpts,
    )) as { deleted?: string; error?: string }

    expect(result.error).toBeUndefined()
    expect(result.deleted).toBe('helpers.py')
    expect(deleted).toEqual([[scriptId, 'helpers.py']])
    const script = useIndicatorScriptsStore
      .getState()
      .scripts.find((s) => s.id === scriptId)!
    expect(script.modules ?? []).toHaveLength(0)
  })

  test('refuses the entry file and files that are not there', async () => {
    const scriptId = seedScript(indicatorMeta('d1'))
    const tools = buildAssistantTools(
      makeDeps({
        getWorkbench: () => makeBridge({ getSelectedScriptId: () => scriptId }),
      }),
    )

    const entry = (await tools.delete_file.execute!(
      { path: 'main.py' },
      callOpts,
    )) as { error?: string }
    expect(entry.error).toContain('main.py')

    const missing = (await tools.delete_file.execute!(
      { path: 'nope.py' },
      callOpts,
    )) as { error?: string }
    expect(missing.error).toContain('not a file')
  })
})

describe('set_preview_target', () => {
  const marketData = {
    availableMarkets: [{ marketId: 'okx' }, { marketId: 'binance' }],
    getTimeframes: () => ['1h', '4h', '1d'],
    fetchHistory: async () => [],
  }

  test('applies the patch and normalizes the pair', async () => {
    const patches: Array<Record<string, unknown>> = []
    const tools = buildAssistantTools(
      makeDeps({
        getMarketData: () => marketData,
        getWorkbench: () =>
          makeBridge({ setPreviewTarget: (patch) => patches.push(patch) }),
      }),
    )
    const result = (await tools.set_preview_target.execute!(
      { market: 'binance', pair: 'sol-usdt', timeframe: '4h', bars: 1000 },
      callOpts,
    )) as { target?: Record<string, unknown>; error?: string }

    expect(result.error).toBeUndefined()
    expect(patches).toEqual([
      { market: 'binance', timeframe: '4h', bars: 1000, pair: 'SOL-USDT' },
    ])
    expect(result.target).toEqual({
      market: 'binance',
      pair: 'SOL-USDT',
      timeframe: '4h',
      bars: 1000,
    })
  })

  test('rejects venues and timeframes the terminal does not have', async () => {
    const tools = buildAssistantTools(
      makeDeps({
        getMarketData: () => marketData,
        getWorkbench: () => makeBridge(),
      }),
    )

    const venue = (await tools.set_preview_target.execute!(
      { market: 'nope' },
      callOpts,
    )) as { error?: string }
    expect(venue.error).toContain('binance')

    const timeframe = (await tools.set_preview_target.execute!(
      { timeframe: '5m' },
      callOpts,
    )) as { error?: string }
    expect(timeframe.error).toContain('1h')
  })

  test('says so when there is no workbench to point', async () => {
    const tools = buildAssistantTools(makeDeps({ surface: 'bots' }))
    const result = (await tools.set_preview_target.execute!(
      { timeframe: '4h' },
      callOpts,
    )) as { error?: string }
    expect(result.error).toContain('run_backtest')
  })
})

describe('handoff_to_builder', () => {
  test('queues the message for the other surface and navigates there', async () => {
    const scriptId = seedScript(strategyMeta('h1'))
    const routes: Array<{ to: string; scriptId?: string }> = []
    const tools = buildAssistantTools(
      makeDeps({ surface: 'bots', navigate: (route) => routes.push(route) }),
    )

    const result = (await tools.handoff_to_builder.execute!(
      {
        target: 'indicators',
        message: 'Add a volume filter to this strategy.',
        scriptId,
      },
      callOpts,
    )) as { handedOff?: string; error?: string }

    expect(result.error).toBeUndefined()
    expect(result.handedOff).toBe('indicators')
    expect(routes).toEqual([{ to: 'indicators', scriptId }])
    expect(consumeAssistantIntent('indicators')).toEqual({
      prompt: 'Add a volume filter to this strategy.',
    })
    // Consumed once: a remount must not replay it.
    expect(consumeAssistantIntent('indicators')).toBeNull()
  })

  test('refuses to hand over to the surface it is already on', async () => {
    const routes: Array<unknown> = []
    const tools = buildAssistantTools(
      makeDeps({ navigate: (route) => routes.push(route) }),
    )
    const result = (await tools.handoff_to_builder.execute!(
      { target: 'indicators', message: 'go' },
      callOpts,
    )) as { error?: string }

    expect(result.error).toContain('already')
    expect(routes).toHaveLength(0)
    expect(consumeAssistantIntent('indicators')).toBeNull()
  })
})

describe('ask_user', () => {
  test('has no execute — only the user can answer it', () => {
    const tools = buildAssistantTools(makeDeps())
    expect(tools.ask_user.execute).toBeUndefined()
  })
})

describe('tool labels', () => {
  test('every assistant tool has one, and none is left behind', () => {
    const tools = Object.keys(buildAssistantTools(makeDeps()))
    expect(tools.filter((name) => !(name in ASSISTANT_TOOL_LABELS))).toEqual([])
    expect(
      Object.keys(ASSISTANT_TOOL_LABELS).filter(
        (name) => !tools.includes(name),
      ),
    ).toEqual([])
  })

  test('phrases a builder call for its phase', () => {
    expect(
      formatToolLabel('create_script', 'running', ASSISTANT_TOOL_LABELS),
    ).toBe('Creating a new script…')
    expect(formatToolLabel('run_backtest', 'done', ASSISTANT_TOOL_LABELS)).toBe(
      'Ran a backtest',
    )
  })
})
