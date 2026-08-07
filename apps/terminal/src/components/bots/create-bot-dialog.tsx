// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check, SquareFunction } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { Badge } from '@pairlens/ui/components/ui/badge'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import { GuardsEditor, SizingEditor } from './bot-sizing-guards'
import { mergeBotParams } from './bot-display'

import type { BotGuardConfig, BotSizing } from '@pairlens/bot-engine/types'
import type { IndicatorScript } from '@/stores/indicator-scripts-store'
import type { PreviewParams } from '@/components/indicators/preview-params'
import { PreviewParamsBar } from '@/components/indicators/preview-params'
import { PreviewPairPicker } from '@/components/indicators/preview-pair-picker'
import { MarketPicker } from '@/components/terminal/market-picker'
import { useAvailableMarkets } from '@/hooks/use-available-markets'
import { useMarketData } from '@/lib/market-data-provider'
import {
  DEFAULT_GUARDS,
  DEFAULT_SIZING,
  useBotsStore,
} from '@/stores/bots-store'
import { useIndicatorScriptsStore } from '@/stores/indicator-scripts-store'

/** Timeframes a bot can run on — venue lists are filtered down to these. */
const BOT_TIMEFRAMES = [
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
] as const

const DEFAULT_PAIR = 'BTC-USDT'
const DEFAULT_TIMEFRAME = '1h'

const STEPS = ['strategy', 'market', 'sizing', 'guards'] as const
type Step = (typeof STEPS)[number]

const STEP_TITLE_KEY: Record<Step, string> = {
  strategy: 'botsPage.stepStrategy',
  market: 'botsPage.stepMarket',
  sizing: 'botsPage.stepSizing',
  guards: 'botsPage.stepGuards',
}

type CreateBotDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (botId: string) => void
}

/**
 * New bot: a strategy script deployed to one market.
 *
 * Stepped rather than one long form because the four decisions are answered
 * from different places in the user's head — which strategy, which market,
 * how big, and what stops it. Mode is not among them: every bot starts on
 * paper, and going live is its own deliberate dialog.
 */
export function CreateBotDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateBotDialogProps) {
  const { t } = useTranslation()
  const scripts = useIndicatorScriptsStore((s) => s.scripts)
  const loadScripts = useIndicatorScriptsStore((s) => s.load)
  const createBot = useBotsStore((s) => s.createBot)
  const marketData = useMarketData()
  const { markets, defaultMarket } = useAvailableMarkets()

  const [step, setStep] = useState<Step>('strategy')
  const [scriptId, setScriptId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [market, setMarket] = useState(defaultMarket)
  const [pair, setPair] = useState(DEFAULT_PAIR)
  const [timeframe, setTimeframe] = useState<string>(DEFAULT_TIMEFRAME)
  const [params, setParams] = useState<PreviewParams>({})
  const [sizing, setSizing] = useState<BotSizing>(DEFAULT_SIZING)
  const [guards, setGuards] = useState<BotGuardConfig>(DEFAULT_GUARDS)

  useEffect(() => {
    loadScripts()
  }, [loadScripts])

  // Every open starts clean — a half-filled previous attempt is never what
  // the user meant by "New bot".
  useEffect(() => {
    if (!open) return
    setStep('strategy')
    setScriptId(null)
    setName('')
    setNameTouched(false)
    setMarket(defaultMarket)
    setPair(DEFAULT_PAIR)
    setTimeframe(DEFAULT_TIMEFRAME)
    setParams({})
    setSizing(DEFAULT_SIZING)
    setGuards(DEFAULT_GUARDS)
  }, [open, defaultMarket])

  /** Only scripts that declared `strategy(...)` can be deployed. */
  const strategies = useMemo(
    () => scripts.filter((script) => script.meta?.strategy),
    [scripts],
  )

  /**
   * Everything else the user wrote — listed, disabled, with the reason.
   *
   * Filtering these out is what made the step confusing: a user who knows they
   * wrote a script and cannot find it here learns nothing from its absence.
   */
  const undeployable = useMemo(
    () => scripts.filter((script) => !script.meta?.strategy),
    [scripts],
  )

  const selected = strategies.find((script) => script.id === scriptId) ?? null

  const timeframes = useMemo(() => {
    const supported = marketData.getTimeframes(market)
    const filtered = BOT_TIMEFRAMES.filter((tf) => supported.includes(tf))
    return filtered.length > 0 ? filtered : [...BOT_TIMEFRAMES]
  }, [marketData, market])

  // Keep the timeframe legal for the chosen venue.
  useEffect(() => {
    if (!timeframes.includes(timeframe as (typeof BOT_TIMEFRAMES)[number])) {
      setTimeframe(timeframes[0])
    }
  }, [timeframes, timeframe])

  // Suggested name follows the choices until the user types their own.
  const suggestedName = selected ? `${selected.name} · ${pair}` : ''
  const effectiveName = (nameTouched ? name : suggestedName).trim()

  const handleSelectScript = (id: string) => {
    setScriptId(id)
    const meta = strategies.find((script) => script.id === id)?.meta
    setParams(meta ? mergeBotParams(meta, undefined) : {})
  }

  const stepIndex = STEPS.indexOf(step)
  const canAdvance =
    step === 'strategy'
      ? selected !== null
      : step === 'market'
        ? pair.includes('-') &&
          pair.split('-').every((part) => part.length > 0) &&
          effectiveName.length > 0
        : step === 'sizing'
          ? sizing.value > 0
          : true

  const handleCreate = () => {
    if (!selected) return
    const id = createBot({
      name: effectiveName || selected.name,
      scriptId: selected.id,
      market,
      pair,
      timeframe,
      params,
      sizing,
      guards,
    })
    onCreated?.(id)
    onOpenChange(false)
  }

  const noStrategies = strategies.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('botsPage.createTitle')}</DialogTitle>
          <DialogDescription>
            {noStrategies
              ? t('botsPage.createDescription')
              : t('botsPage.stepProgress', {
                  current: stepIndex + 1,
                  total: STEPS.length,
                  title: t(STEP_TITLE_KEY[step]),
                })}
          </DialogDescription>
        </DialogHeader>

        {noStrategies ? (
          <div className="grid max-h-[55vh] gap-3 overflow-y-auto">
            <Empty className="border-none py-2">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SquareFunction />
                </EmptyMedia>
                <EmptyTitle>{t('botsPage.noStrategiesTitle')}</EmptyTitle>
                {/* Two beats: why an indicator can't be deployed, then the one
                    edit that fixes it. Pointing at /indicators without either
                    is what left users guessing. */}
                <EmptyDescription>
                  {t('botsPage.noStrategiesDescription')}
                </EmptyDescription>
                <EmptyDescription>
                  {t('botsPage.noStrategiesHint')}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/indicators" />}
                  onClick={() => onOpenChange(false)}
                >
                  {t('botsPage.openIndicators')}
                </Button>
              </EmptyContent>
            </Empty>

            {/* The scripts they do have, named and explained — so "where is my
                indicator?" is answered here rather than left to guesswork. */}
            {undeployable.length > 0 && (
              <div className="grid gap-2">
                <GroupLabel>{t('botsPage.groupUndeployable')}</GroupLabel>
                {undeployable.map((script) => (
                  <ScriptOption key={script.id} script={script} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="grid max-h-[55vh] gap-3 overflow-y-auto">
            {step === 'strategy' && (
              <div className="grid gap-2">
                {/* Deployable first, so the selectable path stays obvious. The
                    heading only earns its space once there is a second group
                    to tell it apart from. */}
                {undeployable.length > 0 && (
                  <GroupLabel>{t('botsPage.groupStrategies')}</GroupLabel>
                )}
                {strategies.map((script) => (
                  <ScriptOption
                    key={script.id}
                    script={script}
                    active={script.id === scriptId}
                    onSelect={() => handleSelectScript(script.id)}
                  />
                ))}

                {undeployable.length > 0 && (
                  <>
                    <GroupLabel className="mt-1">
                      {t('botsPage.groupUndeployable')}
                    </GroupLabel>
                    {undeployable.map((script) => (
                      <ScriptOption key={script.id} script={script} />
                    ))}
                  </>
                )}

                {/* The script's own declared inputs — same editors the
                    workbench uses, so a dialled-in length transfers. */}
                {selected?.meta && (
                  <div className="rounded-lg border border-border">
                    <PreviewParamsBar
                      meta={selected.meta}
                      params={params}
                      onChange={setParams}
                    />
                  </div>
                )}
              </div>
            )}

            {step === 'market' && (
              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="bot-name" className="text-xs">
                    {t('common.name')}
                  </Label>
                  <Input
                    id="bot-name"
                    value={nameTouched ? name : suggestedName}
                    onChange={(event) => {
                      setNameTouched(true)
                      setName(event.target.value)
                    }}
                    placeholder={suggestedName}
                    className="text-sm"
                  />
                </div>

                <div className="grid gap-1.5">
                  <Label className="text-xs">{t('botsPage.venue')}</Label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <MarketPicker
                      market={market}
                      marketOptions={markets}
                      onMarketChange={(value) => value && setMarket(value)}
                      className="h-7"
                      aria-label={t('botsPage.venue')}
                    />
                    <PreviewPairPicker
                      market={market}
                      pair={pair}
                      onPairChange={setPair}
                    />
                    <Select
                      value={timeframe}
                      onValueChange={(next) => next && setTimeframe(next)}
                    >
                      <SelectTrigger
                        size="sm"
                        className="h-7 w-auto min-w-16 text-xs"
                        aria-label={t('botsPage.timeframe')}
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
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {t('botsPage.marketHint')}
                  </p>
                </div>
              </div>
            )}

            {step === 'sizing' && (
              <SizingEditor sizing={sizing} onChange={setSizing} />
            )}

            {step === 'guards' && (
              <div className="grid gap-3">
                <p className="text-xs text-muted-foreground">
                  {t('botsPage.guardsDescription')}
                </p>
                <GuardsEditor guards={guards} onChange={setGuards} />
              </div>
            )}
          </div>
        )}

        {!noStrategies && (
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                stepIndex === 0
                  ? onOpenChange(false)
                  : setStep(STEPS[stepIndex - 1])
              }
            >
              {stepIndex === 0 ? t('common.cancel') : t('botsPage.back')}
            </Button>
            {step === 'guards' ? (
              <Button size="sm" onClick={handleCreate} disabled={!selected}>
                {t('botsPage.createBot')}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setStep(STEPS[stepIndex + 1])}
                disabled={!canAdvance}
              >
                {t('botsPage.next')}
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

function GroupLabel({
  className,
  children,
}: {
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * One script in the picker.
 *
 * Without `onSelect` it renders as an inert, muted row carrying the reason it
 * cannot be deployed. That row is the whole point: a script the user wrote is
 * always visible, and the gap between "an indicator" and "a bot" gets named
 * where they hit it instead of being hidden behind a filter.
 */
function ScriptOption({
  script,
  active = false,
  onSelect,
}: {
  script: IndicatorScript
  active?: boolean
  onSelect?: () => void
}) {
  const { t } = useTranslation()
  const strategy = script.meta?.strategy
  const disabled = onSelect === undefined
  const reason = script.meta
    ? t('botsPage.reasonIndicator')
    : t('botsPage.reasonNotRun')

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
        disabled
          ? 'cursor-not-allowed border-dashed border-border/60 opacity-60'
          : active
            ? 'border-primary/60 bg-accent/50'
            : 'border-border hover:bg-accent/25',
      )}
    >
      <SquareFunction className="size-4 shrink-0 text-muted-foreground" />
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium">{script.name}</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {disabled ? reason : (script.meta?.title ?? script.name)}
        </span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {strategy?.allowShort && (
          <Badge variant="outline" className="text-[10px] uppercase">
            {t('botsPage.allowsShort')}
          </Badge>
        )}
        {active && <Check className="size-4 text-primary" />}
      </span>
    </button>
  )
}
