// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import {
  BookOpen,
  Bot,
  CircleDot,
  Library,
  Package,
  Play,
  Save,
  Sparkles,
  SquareFunction,
  Wand2,
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@pairlens/ui/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@pairlens/ui/components/ui/tooltip'

import { BacktestPanel } from './backtest-panel'
import { CodeEditor } from './code-editor'
import { ConsolePanel } from './console-panel'
import { DataWindow } from './data-window'
import { ExportPluginDialog } from './export-plugin-dialog'
import { FileTabs } from './file-tabs'
import { IndicatorPreview } from './indicator-preview'
import { MetaInspector } from './meta-inspector'
import { PreviewPairPicker } from './preview-pair-picker'
import { PreviewParamsBar, defaultPreviewParams } from './preview-params'
import { ImportScriptDialog } from './import-script-dialog'
import { IndicatorsEmptyState } from './indicators-empty-state'
import { LibrariesDialog } from './libraries-dialog'
import { ScriptList } from './script-list'
import { SdkReferenceDialog } from './sdk-reference'
import { VersionHistoryDialog } from './version-history'

import type { PreviewRun } from './indicator-preview'
import type { PreviewParams } from './preview-params'
import type {
  ChartBar,
  IndicatorValuePoint,
  Timeframe,
} from '@pairlens/fast-financial-charts/types'
import type { PythonRuntimeStatus } from '@/lib/python/python-runtime'
import type { CustomIndicatorMeta } from '@pairlens/shared/plugin-types'
import type {
  IndicatorFile,
  IndicatorScript,
} from '@/stores/indicator-scripts-store'
import type { BacktestResult, BacktestSignals } from '@/lib/indicators/backtest'
import type {
  AssistantPreviewTarget,
  AssistantWorkbenchBridge,
} from '@/lib/assistant/assistant-tools'
import { runBacktest } from '@/lib/indicators/backtest'
import { fetchHistoryDepth } from '@/lib/indicators/fetch-depth'
import {
  resolveRequestSeries,
  toCandleArrays,
} from '@/lib/indicators/request-data'
import { track } from '@/lib/analytics-events'
import {
  ENTRY_FILE,
  scriptFiles,
  useIndicatorScriptsStore,
} from '@/stores/indicator-scripts-store'
import {
  PythonScriptError,
  getPythonRuntime,
} from '@/lib/python/python-runtime'
import { useMarketData } from '@/lib/market-data-provider'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { usePersistedState } from '@/hooks/use-persisted-state'
import { usePythonConsole } from '@/hooks/use-python-console'
import { MarketPicker } from '@/components/terminal/market-picker'
import { AssistantPanel } from '@/components/assistant/assistant-panel'
import {
  hasAssistantIntent,
  requestAssistant,
  subscribeAssistantIntents,
} from '@/lib/assistant/assistant-chat-cache'

/**
 * How much history the preview pulls. A long moving average needs real depth
 * before its output means anything, and a backtest over 300 bars tells you
 * almost nothing — but every extra bar is Python work on every recompute, so
 * this stays the user's call.
 */
const BAR_COUNTS = [300, 500, 1000, 2000] as const
const DEFAULT_BAR_COUNT = 500
const DEFAULT_PAIR = 'BTC-USDT'
const DEFAULT_MARKET = 'okx'
/** Timeframes the chart engine understands — venue lists are filtered to these. */
const CHART_TIMEFRAMES: Array<Timeframe> = [
  '1m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
  '3d',
  '1w',
  '1M',
]

function usePythonRuntimeStatus(): PythonRuntimeStatus {
  return useSyncExternalStore(
    (onChange) => getPythonRuntime().subscribe(onChange),
    () => getPythonRuntime().status,
    () => 'idle' as const,
  )
}

/**
 * Replay a `strategy(...)` script's signals into an equity curve. Returns null
 * for plain indicators, and for strategies whose compute() emitted none of the
 * recognised signal keys.
 */
function runPreviewBacktest(
  meta: CustomIndicatorMeta,
  bars: Array<ChartBar>,
  outputs: Record<string, Float64Array>,
): BacktestResult | null {
  if (!meta.strategy) return null
  const signals: BacktestSignals = {
    long: outputs.long,
    short: outputs.short,
    position: outputs.position,
    entries: outputs.entries,
    exits: outputs.exits,
  }
  if (Object.values(signals).every((series) => series === undefined)) {
    return null
  }
  return runBacktest(bars, signals, meta.strategy)
}

/**
 * Carry the user's dialled-in params across a re-run: keys the script still
 * declares keep their value, anything it dropped falls away, and anything new
 * arrives at its declared default.
 */
function mergePreviewParams(
  meta: CustomIndicatorMeta,
  previous: PreviewParams | undefined,
): PreviewParams {
  const params = defaultPreviewParams(meta)
  if (!previous) return params
  for (const input of meta.inputs) {
    const value = previous[input.key]
    if (value !== undefined && typeof value === typeof input.default) {
      params[input.key] = value
    }
  }
  return params
}

/** Map Python outputs onto chart value points; NaN becomes a gap. */
function buildValuePoints(
  bars: Array<ChartBar>,
  outputs: Record<string, Float64Array>,
): Array<IndicatorValuePoint> {
  const keys = Object.keys(outputs)
  return bars.map((bar, index) => {
    const point: IndicatorValuePoint = { ts: bar.ts }
    for (const key of keys) {
      const value = outputs[key][index]
      if (value !== undefined && Number.isFinite(value)) point[key] = value
    }
    return point
  })
}

type RunError = { scriptId: string; message: string; traceback?: string }

/** Drafts are per file, not per script — one editor buffer per open file. */
function draftKey(scriptId: string, path: string): string {
  return `${scriptId}::${path}`
}

export function IndicatorWorkbench({
  focusScriptId = null,
}: {
  /**
   * Script to open on arrival — the deep link a bot's Strategy stat follows.
   * Applied once per value, so it never fights a selection the user makes
   * afterwards.
   */
  focusScriptId?: string | null
} = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const scripts = useIndicatorScriptsStore((s) => s.scripts)
  const loaded = useIndicatorScriptsStore((s) => s.loaded)
  const load = useIndicatorScriptsStore((s) => s.load)
  const cacheMeta = useIndicatorScriptsStore((s) => s.cacheMeta)
  const setFileSource = useIndicatorScriptsStore((s) => s.setFileSource)
  const addModule = useIndicatorScriptsStore((s) => s.addModule)
  const renameModule = useIndicatorScriptsStore((s) => s.renameModule)
  const deleteModule = useIndicatorScriptsStore((s) => s.deleteModule)

  const marketData = useMarketData()
  const { markets: marketOptions } = useAvailableMarkets()
  const runtimeStatus = usePythonRuntimeStatus()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activePaths, setActivePaths] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [runState, setRunState] = useState<PreviewRun | null>(null)
  const [runError, setRunError] = useState<RunError | null>(null)
  const [exportScript, setExportScript] = useState<IndicatorScript | null>(null)
  const [consoleOpen, setConsoleOpen] = useState(false)
  /** Dialled-in input values per script, seeded from each meta's defaults. */
  const [previewParams, setPreviewParams] = useState<
    Record<string, PreviewParams>
  >({})
  /** Timestamp of the bar the preview crosshair is over. */
  const [hoverTs, setHoverTs] = useState<number | null>(null)

  const { lines: consoleLines, clear: clearConsole } =
    usePythonConsole(selectedId)

  // Preview target
  const [market, setMarket] = useState(DEFAULT_MARKET)
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState<Timeframe>('1h')
  const [barCount, setBarCount] = useState<number>(DEFAULT_BAR_COUNT)
  // `run` reads this without taking it as a dependency — changing the depth
  // re-runs explicitly rather than through a stale closure.
  const barCountRef = useRef(barCount)
  barCountRef.current = barCount

  useEffect(() => {
    load()
  }, [load])

  const selected = scripts.find((s) => s.id === selectedId) ?? null

  // Auto-select the first script once loaded (and keep selection valid).
  useEffect(() => {
    if (!loaded) return
    if (selectedId && scripts.some((s) => s.id === selectedId)) return
    setSelectedId(scripts[0]?.id ?? null)
  }, [loaded, scripts, selectedId])

  // Deep link: open the script the URL names, once it exists in the store.
  const appliedFocusRef = useRef<string | null>(null)
  useEffect(() => {
    if (!focusScriptId || !loaded) return
    if (appliedFocusRef.current === focusScriptId) return
    if (!scripts.some((s) => s.id === focusScriptId)) return
    appliedFocusRef.current = focusScriptId
    setSelectedId(focusScriptId)
  }, [focusScriptId, loaded, scripts])

  // Default the market to the first available venue when okx isn't around.
  useEffect(() => {
    if (marketData.availableMarkets.length === 0) return
    const ids = marketData.availableMarkets.map((m) => m.marketId)
    if (!ids.includes(market)) setMarket(ids[0])
  }, [marketData.availableMarkets, market])

  const timeframes = useMemo(() => {
    const supported = marketData.getTimeframes(market)
    const filtered = CHART_TIMEFRAMES.filter((tf) => supported.includes(tf))
    return filtered.length > 0 ? filtered : CHART_TIMEFRAMES
  }, [marketData, market])

  // The script's files with unsaved editor buffers overlaid — what Run uses.
  const files: Array<IndicatorFile> = useMemo(() => {
    if (!selected) return []
    return scriptFiles(selected).map((file) => ({
      path: file.path,
      source: drafts[draftKey(selected.id, file.path)] ?? file.source,
    }))
  }, [selected, drafts])

  const dirtyPaths = useMemo(() => {
    const set = new Set<string>()
    if (!selected) return set
    for (const saved of scriptFiles(selected)) {
      const draft = drafts[draftKey(selected.id, saved.path)]
      if (draft !== undefined && draft !== saved.source) set.add(saved.path)
    }
    return set
  }, [selected, drafts])

  const dirty = dirtyPaths.size > 0

  // Fall back to the entry when the open file was deleted or renamed away.
  const requestedPath = selected ? activePaths[selected.id] : undefined
  const activePath =
    requestedPath && files.some((f) => f.path === requestedPath)
      ? requestedPath
      : ENTRY_FILE
  const draft = files.find((f) => f.path === activePath)?.source ?? ''

  const selectFile = useCallback(
    (path: string) => {
      if (!selectedId) return
      setActivePaths((paths) => ({ ...paths, [selectedId]: path }))
    },
    [selectedId],
  )

  const handleDraftChange = useCallback(
    (value: string) => {
      if (!selectedId) return
      setDrafts((d) => ({ ...d, [draftKey(selectedId, activePath)]: value }))
    },
    [selectedId, activePath],
  )

  /** Persist every file whose buffer diverged from the store. */
  const saveFiles = useCallback(
    (script: IndicatorScript, next: Array<IndicatorFile>) => {
      let changed = false
      const saved = scriptFiles(script)
      for (const file of next) {
        const current = saved.find((f) => f.path === file.path)
        if (!current || current.source === file.source) continue
        setFileSource(script.id, file.path, file.source)
        changed = true
      }
      return changed
    },
    [setFileSource],
  )

  const handleSave = useCallback(() => {
    if (!selected) return
    if (saveFiles(selected, files)) track('python_indicator_saved')
  }, [selected, files, saveFiles])

  /** Drop the editor buffer of a file that no longer exists under that path. */
  const forgetDraft = useCallback((scriptId: string, path: string) => {
    setDrafts((d) => {
      const key = draftKey(scriptId, path)
      if (!(key in d)) return d
      const next = { ...d }
      delete next[key]
      return next
    })
  }, [])

  const runningRef = useRef(false)
  // Read without re-creating `run` on every keystroke in a param field.
  const previewParamsRef = useRef(previewParams)
  previewParamsRef.current = previewParams

  const run = useCallback(
    async (
      script: IndicatorScript,
      next: Array<IndicatorFile>,
      /**
       * Run against a target the state has not caught up with yet. React
       * setters are async, so an assistant that re-points the preview and
       * re-runs in one act would otherwise fetch the OLD pair.
       */
      override?: Partial<{
        market: string
        pair: string
        timeframe: string
        bars: number
      }>,
    ) => {
      if (runningRef.current) return
      runningRef.current = true
      setRunning(true)
      setRunError(null)
      const runMarket = override?.market ?? market
      const runPair = override?.pair ?? pair
      const runTimeframe = (override?.timeframe ?? timeframe) as Timeframe
      const runBars = override?.bars ?? barCountRef.current
      // Console output belongs to the run that produced it.
      clearConsole()
      try {
        // 1. Save the drafts — a run always operates on what you see.
        saveFiles(script, next)

        // 2. Validate + extract metadata in the Python runtime. The entry
        //    executes with its helper modules importable next to it.
        const entry = next.find((f) => f.path === ENTRY_FILE)?.source ?? ''
        const modules = next.filter((f) => f.path !== ENTRY_FILE)
        const runtime = getPythonRuntime()
        const meta = await runtime.registerScript(script.id, entry, modules)
        cacheMeta(script.id, { meta, metaError: null })

        // 3. Preview candles (oldest-first for the chart + compute), plus any
        //    higher-timeframe series the script declared.
        const [bars, requestData] = await Promise.all([
          // Paged: venues cap a single candles call (OKX at 300), so asking
          // for real depth means walking backwards a page at a time.
          fetchHistoryDepth(
            (limit, endTs) =>
              marketData.fetchHistory(
                runMarket,
                runPair,
                runTimeframe,
                limit,
                endTs,
              ),
            runBars,
          ),
          resolveRequestSeries(meta.requests, {
            market: runMarket,
            pair: runPair,
            timeframe: runTimeframe,
          }),
        ])
        if (bars.length === 0) {
          throw new Error(
            t('indicatorsPage.noCandles', {
              pair: runPair,
              market: runMarket,
            }),
          )
        }

        // 4. Compute over fresh (transferable) buffers, keeping whatever the
        //    user had dialled in for inputs the script still declares.
        const params = mergePreviewParams(
          meta,
          previewParamsRef.current[script.id],
        )
        setPreviewParams((prev) => ({ ...prev, [script.id]: params }))
        const result = await runtime.compute(
          script.id,
          toCandleArrays(bars),
          params,
          runPair,
          runTimeframe,
          requestData,
        )

        setRunState((prev) => ({
          scriptId: script.id,
          bars,
          points: buildValuePoints(bars, result.outputs),
          meta,
          timeframe: runTimeframe,
          palettes: result.palettes,
          durationMs: result.durationMs,
          backtest: runPreviewBacktest(meta, bars, result.outputs),
          nonce: (prev?.nonce ?? 0) + 1,
        }))
        track('python_indicator_run', { outcome: 'success' })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const traceback =
          err instanceof PythonScriptError ? err.traceback : undefined
        // Only script failures poison the cached meta — infra errors
        // (no candles, runtime timeout) don't invalidate the script.
        if (err instanceof PythonScriptError) {
          cacheMeta(script.id, { metaError: message })
        }
        setRunError({ scriptId: script.id, message, traceback })
        track('python_indicator_run', { outcome: 'error' })
      } finally {
        runningRef.current = false
        setRunning(false)
      }
    },
    [
      marketData,
      market,
      pair,
      timeframe,
      t,
      cacheMeta,
      saveFiles,
      clearConsole,
    ],
  )

  const handleRun = useCallback(() => {
    if (!selected) return
    void run(selected, files)
  }, [selected, files, run])

  const [historyScript, setHistoryScript] = useState<IndicatorScript | null>(
    null,
  )
  const [importOpen, setImportOpen] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [librariesOpen, setLibrariesOpen] = useState(false)
  // Open by default: the assistant is the fastest way into a script, and a
  // rail nobody opens teaches nobody that. Still persisted, so closing it is
  // permanent for that user.
  const [assistantOpen, setAssistantOpen] = usePersistedState<boolean>(
    'assistant.workbench.open',
    true,
  )

  // Something outside the panel wants this surface's assistant (the empty
  // state's composer, the create menu, a handoff from the Bots page). The
  // panel consumes the request; this only has to make sure it is mounted.
  useEffect(() => {
    const open = () => {
      if (hasAssistantIntent('indicators')) setAssistantOpen(true)
    }
    open()
    return subscribeAssistantIntents(open)
  }, [setAssistantOpen])

  // ── Builder assistant bridge ──
  // Send-time getters read refs, so assistant tool calls always see the
  // editor buffers and preview target as they are NOW, not as they were
  // when the chat transport was constructed.
  const selectedIdRef = useRef(selectedId)
  selectedIdRef.current = selectedId
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const previewTargetRef = useRef<AssistantPreviewTarget>({
    market,
    pair,
    timeframe,
    bars: barCount,
  })
  previewTargetRef.current = { market, pair, timeframe, bars: barCount }

  /** A script's files with unsaved editor buffers overlaid — what Run uses. */
  const overlaidFiles = useCallback((scriptId: string) => {
    const script = useIndicatorScriptsStore
      .getState()
      .scripts.find((s) => s.id === scriptId)
    if (!script) return null
    return scriptFiles(script).map((file) => ({
      path: file.path,
      source: draftsRef.current[draftKey(scriptId, file.path)] ?? file.source,
    }))
  }, [])

  const assistantBridge = useMemo<AssistantWorkbenchBridge>(
    () => ({
      getSelectedScriptId: () => selectedIdRef.current,
      selectScript: (id) => setSelectedId(id),
      getFiles: overlaidFiles,
      applyEdit: (scriptId, path, source) => {
        // Persist like a user save (version history included) and drop any
        // stale buffer so the editor shows the assistant's edit, not a draft
        // that predates it.
        useIndicatorScriptsStore
          .getState()
          .setFileSource(scriptId, path, source)
        forgetDraft(scriptId, path)
      },
      deleteFile: (scriptId, path) => {
        useIndicatorScriptsStore.getState().deleteModule(scriptId, path)
        forgetDraft(scriptId, path)
      },
      runPreview: (scriptId) => {
        const script = useIndicatorScriptsStore
          .getState()
          .scripts.find((s) => s.id === scriptId)
        const next = overlaidFiles(scriptId)
        if (!script || !next) return
        void run(script, next)
      },
      getPreviewTarget: () => previewTargetRef.current,
      setPreviewTarget: (patch) => {
        const next = { ...previewTargetRef.current, ...patch }
        previewTargetRef.current = next
        if (patch.market !== undefined) setMarket(patch.market)
        if (patch.pair !== undefined) setPair(patch.pair)
        if (patch.timeframe !== undefined) {
          setTimeframe(patch.timeframe as Timeframe)
        }
        if (patch.bars !== undefined) {
          setBarCount(patch.bars)
          barCountRef.current = patch.bars
        }
        // Re-run against the new target explicitly: `run` reads the state
        // this render closed over, which is still the old target.
        const scriptId = selectedIdRef.current
        if (!scriptId) return
        const script = useIndicatorScriptsStore
          .getState()
          .scripts.find((s) => s.id === scriptId)
        const nextFiles = overlaidFiles(scriptId)
        if (!script || !nextFiles) return
        void run(script, nextFiles, next)
      },
    }),
    [overlaidFiles, forgetDraft, run],
  )
  /** Set by the editor once CodeMirror is live; null while it is not. */
  const insertRef = useRef<((text: string) => void) | null>(null)

  const [formatting, setFormatting] = useState(false)
  /** Reformat the open file in place; the buffer is left alone on failure. */
  const handleFormat = useCallback(async () => {
    if (!selectedId || formatting) return
    const current = files.find((f) => f.path === activePath)?.source
    if (current === undefined) return
    setFormatting(true)
    try {
      const formatted = await getPythonRuntime().formatCode(current)
      if (formatted !== current) {
        setDrafts((d) => ({
          ...d,
          [draftKey(selectedId, activePath)]: formatted,
        }))
      }
    } catch (err) {
      setRunError({
        scriptId: selectedId,
        message: err instanceof Error ? err.message : String(err),
        traceback: err instanceof PythonScriptError ? err.traceback : undefined,
      })
    } finally {
      setFormatting(false)
    }
  }, [selectedId, activePath, files, formatting])

  // ── Live params ──
  // Changing an input recomputes against the bars already on screen: no
  // re-registration, no history fetch, so dragging a length feels immediate.
  const runStateRef = useRef(runState)
  runStateRef.current = runState
  const paramTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recompute = useCallback(
    async (scriptId: string, params: PreviewParams) => {
      const current = runStateRef.current
      if (!current || current.scriptId !== scriptId) return
      try {
        const requestData = await resolveRequestSeries(current.meta.requests, {
          market,
          pair,
          timeframe,
        })
        const result = await getPythonRuntime().compute(
          scriptId,
          toCandleArrays(current.bars),
          params,
          pair,
          timeframe,
          requestData,
        )
        setRunState((prev) =>
          prev && prev.scriptId === scriptId
            ? {
                ...prev,
                points: buildValuePoints(prev.bars, result.outputs),
                palettes: result.palettes,
                durationMs: result.durationMs,
                backtest: runPreviewBacktest(
                  prev.meta,
                  prev.bars,
                  result.outputs,
                ),
                nonce: prev.nonce + 1,
              }
            : prev,
        )
        setRunError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setRunError({
          scriptId,
          message,
          traceback:
            err instanceof PythonScriptError ? err.traceback : undefined,
        })
      }
    },
    [market, pair, timeframe],
  )

  const handleParamsChange = useCallback(
    (params: PreviewParams) => {
      if (!selected) return
      const scriptId = selected.id
      setPreviewParams((prev) => ({ ...prev, [scriptId]: params }))
      if (paramTimerRef.current) clearTimeout(paramTimerRef.current)
      paramTimerRef.current = setTimeout(() => {
        void recompute(scriptId, params)
      }, 200)
    },
    [selected, recompute],
  )

  useEffect(
    () => () => {
      if (paramTimerRef.current) clearTimeout(paramTimerRef.current)
    },
    [],
  )

  // Auto-run once per script per session when opening a script that already
  // has metadata — the preview appears without pressing Run.
  const autoRanRef = useRef(new Set<string>())
  useEffect(() => {
    if (!selected?.meta || running) return
    if (autoRanRef.current.has(selected.id)) return
    if (runState?.scriptId === selected.id) return
    autoRanRef.current.add(selected.id)
    void run(selected, files)
  }, [selected, running, runState, files, run])

  const selectedRun = runState?.scriptId === selected?.id ? runState : null
  const selectedError = runError?.scriptId === selected?.id ? runError : null

  const runtimeBusy =
    runtimeStatus === 'booting' || runtimeStatus === 'installing'
  const runtimeBadge = running
    ? t('indicatorsPage.running')
    : runtimeStatus === 'booting'
      ? t('indicatorsPage.runtimeBooting')
      : runtimeStatus === 'installing'
        ? t('indicatorsPage.runtimeInstalling')
        : null

  return (
    <div className="flex h-full min-h-0">
      <ScriptList
        selectedId={selectedId}
        onSelect={setSelectedId}
        onExport={setExportScript}
        onShowHistory={setHistoryScript}
        onImport={() => setImportOpen(true)}
        onBuildWithAi={() => {
          setAssistantOpen(true)
          // Focus rather than send: the menu says "build with AI", it does not
          // know what they want built. The rail may already be open, so this
          // has to do something visible either way.
          requestAssistant('indicators', { focus: true })
        }}
      />

      {/* The assistant is a full-height rail beside everything (header,
          editor and preview included) so it survives having no script
          selected — creating the first script IS one of its jobs. */}
      <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
        <ResizablePanel id="workbench-main" defaultSize={72} minSize={40}>
          <div className="flex h-full min-w-0 flex-col">
            {selected ? (
              <>
                {/* Editor header */}
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
                  {selected.meta?.strategy ? (
                    <Bot className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <SquareFunction className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm font-medium">
                    {selected.name}
                  </span>
                  {/* Which kind this is decides whether it can be deployed as a
                  bot, and nothing on screen used to say so — a user with a
                  perfectly good indicator had no way to see why /bots wouldn't
                  take it. The tooltip carries the fix, not just the label. */}
                  {selected.meta && (
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Badge
                            variant={
                              selected.meta.strategy ? 'default' : 'secondary'
                            }
                            className="cursor-default text-[10px]"
                          />
                        }
                      >
                        {selected.meta.strategy
                          ? t('indicatorsPage.kindStrategy')
                          : t('indicatorsPage.kindIndicator')}
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        {selected.meta.strategy
                          ? t('indicatorsPage.strategyBadgeHint')
                          : t('indicatorsPage.indicatorBadgeHint')}
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {dirty && (
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <CircleDot className="size-2.5" />
                      {t('indicatorsPage.unsaved')}
                    </Badge>
                  )}
                  {runtimeBadge && (
                    <Badge variant="secondary" className="gap-1.5 text-[10px]">
                      <Spinner className="size-2.5" />
                      {runtimeBadge}
                    </Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant={assistantOpen ? 'secondary' : 'ghost'}
                            size="icon"
                            className="size-7"
                            onClick={() => setAssistantOpen(!assistantOpen)}
                            aria-label={t('assistant.title')}
                          />
                        }
                      >
                        <Sparkles
                          className="size-3.5"
                          style={{ color: 'var(--magic-1)' }}
                        />
                      </TooltipTrigger>
                      <TooltipContent>{t('assistant.title')}</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={() => setExportScript(selected)}
                      disabled={!selected.meta}
                    >
                      <Package className="size-3.5" />
                      {t('indicatorsPage.export')}
                    </Button>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setReferenceOpen(true)}
                            aria-label={t('indicatorsPage.sdkRefTitle')}
                          />
                        }
                      >
                        <BookOpen className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('indicatorsPage.sdkRefTitle')}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => setLibrariesOpen(true)}
                            aria-label={t('indicatorsPage.librariesTitle')}
                          />
                        }
                      >
                        <Library className="size-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('indicatorsPage.librariesTitle')}
                      </TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={() => void handleFormat()}
                            disabled={formatting || runtimeBusy}
                            aria-label={t('indicatorsPage.format')}
                          />
                        }
                      >
                        {formatting ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <Wand2 className="size-3.5" />
                        )}
                      </TooltipTrigger>
                      <TooltipContent>
                        {t('indicatorsPage.formatHint')}
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleSave}
                      disabled={!dirty}
                    >
                      <Save className="size-3.5" />
                      {t('indicatorsPage.save')}
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 gap-1.5 text-xs"
                      onClick={handleRun}
                      disabled={running || runtimeBusy}
                    >
                      {running ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                      {t('indicatorsPage.run')}
                    </Button>
                    {/* The payoff move for a strategy script, right where the
                    badge says "can be deployed": one click lands in the
                    bots page's create flow with this script preselected. */}
                    {selected.meta?.strategy && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() =>
                          void navigate({
                            to: '/bots',
                            search: { create: selected.id },
                          })
                        }
                      >
                        <Bot className="size-3.5" />
                        {t('indicatorsPage.deployAsBot')}
                      </Button>
                    )}
                  </div>
                </div>

                <ResizablePanelGroup
                  orientation="horizontal"
                  className="min-h-0 flex-1"
                >
                  <ResizablePanel defaultSize={55} minSize={30}>
                    <div className="flex h-full min-h-0 flex-col">
                      <FileTabs
                        files={files}
                        activePath={activePath}
                        dirtyPaths={dirtyPaths}
                        onSelect={selectFile}
                        onAdd={(path) => addModule(selected.id, path)}
                        onRename={(from, to) => {
                          // Carry an unsaved buffer over to the new path.
                          const buffer = drafts[draftKey(selected.id, from)]
                          renameModule(selected.id, from, to)
                          forgetDraft(selected.id, from)
                          if (buffer !== undefined) {
                            setDrafts((d) => ({
                              ...d,
                              [draftKey(selected.id, to)]: buffer,
                            }))
                          }
                        }}
                        onDelete={(path) => {
                          deleteModule(selected.id, path)
                          forgetDraft(selected.id, path)
                        }}
                      />
                      <CodeEditor
                        key={`${selected.id}:${activePath}`}
                        value={draft}
                        filePath={activePath}
                        onChange={handleDraftChange}
                        onSave={handleSave}
                        onRun={handleRun}
                        onInsertReady={(insert) => {
                          insertRef.current = insert
                        }}
                        className="min-h-0 flex-1"
                      />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={45} minSize={25}>
                    <div className="flex h-full min-h-0 flex-col">
                      {/* Preview target controls — wraps rather than clipping
                      Re-run when the pane is narrow. Same py-1.5 + h-7 recipe
                      as the editor's file tabs, so both rows line up. */}
                      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
                        <MarketPicker
                          market={market}
                          marketOptions={marketOptions}
                          onMarketChange={(value) => value && setMarket(value)}
                          className="h-7"
                          aria-label={t('indicatorsPage.market')}
                        />
                        <PreviewPairPicker
                          market={market}
                          pair={pair}
                          onPairChange={setPair}
                          onSubmit={handleRun}
                        />
                        <Select
                          value={timeframe}
                          onValueChange={(tf) =>
                            tf && setTimeframe(tf as Timeframe)
                          }
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-7 w-auto min-w-16 text-xs"
                            aria-label={t('indicatorsPage.timeframe')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {timeframes.map((tf) => (
                              <SelectItem key={tf} value={tf}>
                                {tf}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select
                          value={String(barCount)}
                          onValueChange={(value) => {
                            if (!value) return
                            setBarCount(Number(value))
                            // Depth changes what gets fetched, so this is a full
                            // run rather than a params-only recompute.
                            if (selected) {
                              barCountRef.current = Number(value)
                              void run(selected, files)
                            }
                          }}
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-7 w-auto min-w-16 text-xs"
                            aria-label={t('indicatorsPage.barDepth')}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BAR_COUNTS.map((count) => (
                              <SelectItem key={count} value={String(count)}>
                                {t('indicatorsPage.barCount', { count })}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {/* Icon-only: the toolbar is narrow and the editor
                        header already carries a labelled Run. */}
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-7 shrink-0"
                                onClick={handleRun}
                                disabled={running || runtimeBusy}
                                aria-label={t('indicatorsPage.rerun')}
                              />
                            }
                          >
                            <Play className="size-3" />
                          </TooltipTrigger>
                          <TooltipContent>
                            {t('indicatorsPage.rerun')}
                          </TooltipContent>
                        </Tooltip>
                      </div>

                      {selectedRun && !selectedError && (
                        <PreviewParamsBar
                          meta={selectedRun.meta}
                          params={
                            previewParams[selected.id] ??
                            defaultPreviewParams(selectedRun.meta)
                          }
                          onChange={handleParamsChange}
                          disabled={running || runtimeBusy}
                        />
                      )}

                      <div className="min-h-0 flex-1">
                        <IndicatorPreview
                          run={selectedRun}
                          error={selectedError}
                          onHoverTsChange={setHoverTs}
                        />
                      </div>

                      {selectedRun?.backtest && !selectedError && (
                        <BacktestPanel result={selectedRun.backtest} />
                      )}

                      {selectedRun && !selectedError && (
                        <DataWindow run={selectedRun} hoverTs={hoverTs} />
                      )}

                      {selected.meta && !selectedError && (
                        <MetaInspector meta={selected.meta} />
                      )}

                      <ConsolePanel
                        lines={consoleLines}
                        open={consoleOpen}
                        onOpenChange={setConsoleOpen}
                        onClear={clearConsole}
                      />
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </>
            ) : (
              <IndicatorsEmptyState
                onOpenAssistant={() => setAssistantOpen(true)}
              />
            )}
          </div>
        </ResizablePanel>
        {assistantOpen && (
          <>
            <ResizableHandle />
            <ResizablePanel
              id="workbench-assistant"
              defaultSize={28}
              minSize={18}
            >
              <AssistantPanel
                surface="indicators"
                workbench={assistantBridge}
                onClose={() => setAssistantOpen(false)}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <ExportPluginDialog
        script={exportScript}
        onClose={() => setExportScript(null)}
      />

      <SdkReferenceDialog
        open={referenceOpen}
        onOpenChange={setReferenceOpen}
        onInsert={(snippet) => {
          insertRef.current?.(snippet)
          setReferenceOpen(false)
        }}
      />

      <LibrariesDialog
        open={librariesOpen}
        onOpenChange={setLibrariesOpen}
        onInsert={(snippet) => {
          insertRef.current?.(snippet)
          setLibrariesOpen(false)
        }}
      />

      <VersionHistoryDialog
        script={historyScript}
        open={historyScript !== null}
        onOpenChange={(open) => !open && setHistoryScript(null)}
      />

      <ImportScriptDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={(id) => {
          setSelectedId(id)
          setImportOpen(false)
        }}
      />
    </div>
  )
}
