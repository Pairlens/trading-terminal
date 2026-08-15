// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Bot, Check, PenLine, SquareFunction } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import { Input } from '@pairlens/ui/components/ui/input'
import { Label } from '@pairlens/ui/components/ui/label'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@pairlens/ui/components/ui/select'

import { GuardsEditor, SizingEditor } from './bot-sizing-guards'
import { botTemplates, ensureBotTemplateScript } from './bot-templates'
import { mergeBotParams } from './bot-display'

import type { BotTemplate } from './bot-templates'
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
  /**
   * Script to arrive with already selected — the workbench's "Deploy as bot"
   * lands here, and re-picking the strategy it was just looking at would be
   * make-work.
   */
  initialScriptId?: string | null
}

/**
 * New bot: a strategy script deployed to one market.
 *
 * Stepped rather than one long form because the four decisions are answered
 * from different places in the user's head — which strategy, which market,
 * how big, and what stops it. Mode is not among them: every bot starts on
 * paper, and going live is its own deliberate dialog.
 *
 * The strategy step can never dead-end: alongside the user's own strategy
 * scripts it offers the shipped ready-made strategies inline, so a first bot
 * never requires a round trip through the workbench.
 */
export function CreateBotDialog({
  open,
  onOpenChange,
  onCreated,
  initialScriptId = null,
}: CreateBotDialogProps) {
  const { t } = useTranslation()
  const scripts = useIndicatorScriptsStore((s) => s.scripts)
  const loadScripts = useIndicatorScriptsStore((s) => s.load)
  const createBot = useBotsStore((s) => s.createBot)
  const marketData = useMarketData()
  const { markets, defaultMarket: allVenuesDefault } = useAvailableMarkets()

  // Perpetual-futures venues are deliberately absent from this list, for two
  // reasons that both have to be fixed before a bot can run on one: the bot
  // engine sizes in base units and refuses leverage outright, and the arm
  // dialog resolves credentials by raw market id, so it finds no account for a
  // venue that borrows its spot sibling's key.
  const botMarkets = useMemo(
    () => markets.filter((m) => !m.assetClasses.includes('crypto-perp')),
    [markets],
  )
  const defaultMarket = useMemo(
    () =>
      botMarkets.some((m) => m.value === allVenuesDefault)
        ? allVenuesDefault
        : (botMarkets[0]?.value ?? allVenuesDefault),
    [botMarkets, allVenuesDefault],
  )

  const [step, setStep] = useState<Step>('strategy')
  const [scriptId, setScriptId] = useState<string | null>(null)
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(
    null,
  )
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
    setPendingTemplateId(null)
    setName('')
    setNameTouched(false)
    setMarket(defaultMarket)
    setPair(DEFAULT_PAIR)
    setTimeframe(DEFAULT_TIMEFRAME)
    setParams({})
    setSizing(DEFAULT_SIZING)
    setGuards(DEFAULT_GUARDS)
  }, [open, defaultMarket])

  // A deep-linked script (the workbench's "Deploy as bot") arrives selected.
  // Separate from the reset effect because the scripts store may still be
  // hydrating when the dialog opens; the selection lands once its meta does.
  useEffect(() => {
    if (!open || !initialScriptId) return
    const meta = scripts.find(
      (script) => script.id === initialScriptId && script.meta?.strategy,
    )?.meta
    if (!meta) return
    setScriptId((current) => current ?? initialScriptId)
    setParams((existing) =>
      Object.keys(existing).length > 0
        ? existing
        : mergeBotParams(meta, undefined),
    )
  }, [open, initialScriptId, scripts])

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

  /**
   * The shipped ready-made strategies, minus any the user already holds a
   * working copy of — those are in the lists above, and offering the same
   * code twice would read as two different things. A card only retires once
   * its script has strategy metadata: while registration is in flight (or
   * after it failed) the card stays, spinning or offering a retry.
   */
  const templates = useMemo(() => botTemplates(t), [t])
  const freshTemplates = useMemo(
    () =>
      templates.filter(
        (template) =>
          !scripts.some(
            (script) =>
              script.name === template.example.name &&
              script.meta?.strategy !== undefined,
          ),
      ),
    [templates, scripts],
  )

  /**
   * A pending template's half-made script must not flash up as "can't run as
   * a bot yet" while Pyodide boots — the spinner on its card is the truth.
   */
  const pendingTemplateName = pendingTemplateId
    ? templates.find((template) => template.id === pendingTemplateId)?.example
        .name
    : undefined
  const visibleUndeployable = useMemo(
    () => undeployable.filter((script) => script.name !== pendingTemplateName),
    [undeployable, pendingTemplateName],
  )

  /**
   * Picking a ready-made strategy creates and registers the script in place —
   * the card spins while Pyodide boots — then selects it like any other row.
   * The user continues the wizard without ever leaving it.
   */
  const handlePickTemplate = (template: BotTemplate) => {
    if (pendingTemplateId) return
    setPendingTemplateId(template.id)
    ensureBotTemplateScript(template)
      .then(({ scriptId: id, meta }) => {
        setScriptId(id)
        setParams(mergeBotParams(meta, undefined))
      })
      .catch((err: unknown) => {
        toast.error(t('botsPage.templateFailed'), {
          description: err instanceof Error ? err.message : String(err),
        })
      })
      .finally(() => setPendingTemplateId(null))
  }

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
      ? selected !== null && pendingTemplateId === null
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('botsPage.createTitle')}</DialogTitle>
          <DialogDescription>
            {t('botsPage.stepProgress', {
              current: stepIndex + 1,
              total: STEPS.length,
              title: t(STEP_TITLE_KEY[step]),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[55vh] gap-3 overflow-y-auto">
          {step === 'strategy' && (
            <div className="grid gap-2">
              {/* First bot, no scripts yet: one breath of orientation. The
                    ready-made cards below mean the answer is always right
                    here, never on another page. */}
              {strategies.length === 0 && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t('botsPage.strategyIntro')}
                </p>
              )}

              {strategies.length > 0 && (
                <>
                  <GroupLabel>{t('botsPage.groupStrategies')}</GroupLabel>
                  {strategies.map((script) => (
                    <ScriptOption
                      key={script.id}
                      script={script}
                      active={script.id === scriptId}
                      onSelect={() => handleSelectScript(script.id)}
                    />
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

              {/* Ready-made strategies, created and registered in place.
                    This is what keeps "New bot" self-sufficient: the shipped
                    strategy code is offered here, not on another page. */}
              {freshTemplates.length > 0 && (
                <>
                  <GroupLabel
                    className={strategies.length > 0 ? 'mt-1' : undefined}
                  >
                    {t('botsPage.groupTemplates')}
                  </GroupLabel>
                  {freshTemplates.map((template) => (
                    <TemplateOption
                      key={template.id}
                      template={template}
                      pending={pendingTemplateId === template.id}
                      disabled={
                        pendingTemplateId !== null &&
                        pendingTemplateId !== template.id
                      }
                      onPick={() => handlePickTemplate(template)}
                    />
                  ))}
                </>
              )}

              {/* The scripts that can't be deployed, named and explained —
                    so "where is my indicator?" is answered here rather than
                    left to guesswork. */}
              {visibleUndeployable.length > 0 && (
                <>
                  <GroupLabel className="mt-1">
                    {t('botsPage.groupUndeployable')}
                  </GroupLabel>
                  {visibleUndeployable.map((script) => (
                    <ScriptOption key={script.id} script={script} />
                  ))}
                </>
              )}

              {/* The advanced way in, ranked last on purpose: the workbench
                    is where strategies are written, and this is the one line
                    that says so. */}
              <Button
                variant="ghost"
                size="sm"
                className="justify-start gap-1.5 text-xs text-muted-foreground"
                nativeButton={false}
                render={<Link to="/indicators" />}
                onClick={() => onOpenChange(false)}
              >
                <PenLine className="size-3.5" />
                {t('botsPage.writeYourOwn')}
              </Button>
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
                    marketOptions={botMarkets}
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
      {/* Same iconography as the workbench header: a strategy is a Bot in
          waiting, an indicator stays a function. */}
      {strategy ? (
        <Bot className="size-4 shrink-0 text-muted-foreground" />
      ) : (
        <SquareFunction className="size-4 shrink-0 text-muted-foreground" />
      )}
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

/**
 * One ready-made strategy in the picker.
 *
 * Picking it creates the script through the same registration the workbench's
 * Run performs; the spinner covers the Pyodide boot the first one pays for.
 * Once created, the card disappears and the script shows up above as one of
 * the user's own strategies, already selected.
 */
function TemplateOption({
  template,
  pending,
  disabled,
  onPick,
}: {
  template: BotTemplate
  pending: boolean
  disabled: boolean
  onPick: () => void
}) {
  const Icon = template.icon
  const inert = pending || disabled
  return (
    <button
      type="button"
      disabled={inert}
      onClick={onPick}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors',
        pending
          ? 'border-primary/45'
          : disabled
            ? 'cursor-default border-border opacity-60'
            : 'border-border hover:border-primary/45 hover:bg-accent/25',
      )}
    >
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {pending ? (
          <Spinner className="size-3.5" />
        ) : (
          <Icon className="size-3.5" />
        )}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium">{template.title}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          {template.description}
        </span>
        <span className="flex flex-wrap gap-1 pt-0.5">
          {template.chips.map((chip) => (
            <span
              key={chip}
              className="rounded border border-border/70 bg-muted/50 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </span>
      </span>
    </button>
  )
}
