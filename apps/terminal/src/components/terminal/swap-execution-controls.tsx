// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings2 } from 'lucide-react'
import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import { Input } from '@pairlens/ui/components/ui/input'
import type { InstrumentClass } from '@pairlens/shared/market-ref'
import type {
  SwapMevProtection,
  SwapPriorityLevel,
} from '@pairlens/market-engine/types'
import type { SwapPreset } from '@/lib/trading/swap-presets'
import { useSwapPresets } from '@/hooks/use-swap-presets'
import {
  MAX_SLIPPAGE_BPS,
  SWAP_PRESET_NAME_KEYS,
  SWAP_SLIPPAGE_CHIPS_BPS,
  clampSlippageBps,
  formatSlippage,
} from '@/lib/trading/swap-presets'

const CHIP =
  'flex-1 rounded-md border px-1 py-0.5 font-mono text-[11.5px] tabular-nums transition-colors'
const CHIP_IDLE =
  'border-transparent bg-muted/40 text-muted-foreground hover:text-foreground'
const CHIP_ON = 'border-primary text-foreground'
const CHIP_ON_STYLE = {
  backgroundColor: 'color-mix(in oklch, var(--primary) 14%, transparent)',
}

const LABEL =
  'font-mono text-[11px] uppercase tracking-[.16em] text-muted-foreground'

const PRIORITY_KEYS: Record<SwapPriorityLevel, string> = {
  medium: 'terminal.trade.priorityMedium',
  high: 'terminal.trade.priorityHigh',
  veryHigh: 'terminal.trade.priorityVeryHigh',
}

const MEV_KEYS: Record<SwapMevProtection, string> = {
  off: 'terminal.trade.mevOff',
  reduced: 'terminal.trade.mevReduced',
  secure: 'terminal.trade.mevSecure',
}

const MEV_HINT_KEYS: Record<SwapMevProtection, string> = {
  off: 'terminal.trade.mevOffHint',
  reduced: 'terminal.trade.mevReducedHint',
  secure: 'terminal.trade.mevSecureHint',
}

/** Slot label: the user's name, or the default for that slot. */
export function usePresetName(): (preset: SwapPreset, index: number) => string {
  const { t } = useTranslation()
  return (preset, index) =>
    preset.name ?? t(SWAP_PRESET_NAME_KEYS[index] ?? SWAP_PRESET_NAME_KEYS[0])
}

/**
 * The execution block of a DEX market ticket: three preset slots, a slippage
 * row that edits the slot in force, and on Solana one line stating what the
 * slot pays and through which lane. Everything is one tap; the gear opens the
 * full editor for the active slot.
 *
 * `solana` gates the fee and lane controls: an EVM swap through KyberSwap
 * carries slippage and nothing else, and showing a validator tip there would
 * be a promise the connector cannot keep.
 */
export function SwapExecutionControls({
  cls,
  solana,
}: {
  cls?: InstrumentClass
  solana: boolean
}) {
  const { t } = useTranslation()
  const { presets, active, activeIndex, setActiveIndex, updatePreset } =
    useSwapPresets(cls)
  const presetName = usePresetName()
  const [editorOpen, setEditorOpen] = useState(false)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className={LABEL}>{t('terminal.trade.execution')}</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          aria-label={t('terminal.trade.editPreset')}
          onClick={() => setEditorOpen(true)}
        >
          <Settings2 className="size-3" />
        </button>
      </div>

      <div className="flex gap-1" role="tablist">
        {presets.map((preset, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === activeIndex}
            className={cn(
              CHIP,
              'flex flex-col items-center leading-tight',
              i === activeIndex ? CHIP_ON : CHIP_IDLE,
            )}
            style={i === activeIndex ? CHIP_ON_STYLE : undefined}
            onClick={() => setActiveIndex(i)}
          >
            <span className="truncate font-sans text-[11px] font-medium">
              {presetName(preset, i)}
            </span>
            <span className="text-[10px] opacity-80">
              {formatSlippage(preset.slippageBps)}
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <span className={LABEL}>{t('terminal.trade.slippage')}</span>
        <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
          {formatSlippage(active.slippageBps)}
        </span>
      </div>
      <div className="flex gap-1">
        {SWAP_SLIPPAGE_CHIPS_BPS.map((bps) => (
          <button
            key={bps}
            type="button"
            className={cn(
              CHIP,
              active.slippageBps === bps ? CHIP_ON : CHIP_IDLE,
            )}
            style={active.slippageBps === bps ? CHIP_ON_STYLE : undefined}
            onClick={() => updatePreset(activeIndex, { slippageBps: bps })}
          >
            {formatSlippage(bps)}
          </button>
        ))}
      </div>

      {solana && (
        <p className="font-mono text-[10px] leading-snug text-muted-foreground/80">
          {active.priorityLevel
            ? `${t(PRIORITY_KEYS[active.priorityLevel])} ≤ ${active.maxPriorityFeeSol} SOL`
            : t('terminal.trade.priorityAuto')}
          {' · '}
          {t('terminal.trade.mevProtection')} {t(MEV_KEYS[active.mev])}
          {active.mev !== 'off' && (
            <>
              {' · '}
              {t('terminal.trade.tipShort', { sol: active.tipSol })}
            </>
          )}
        </p>
      )}

      <SwapPresetDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        index={activeIndex}
        preset={active}
        solana={solana}
        onSave={(patch) => updatePreset(activeIndex, patch)}
      />
    </div>
  )
}

type Draft = {
  name: string
  slippagePct: string
  priorityLevel: SwapPriorityLevel | null
  maxPriorityFeeSol: string
  tipSol: string
  mev: SwapMevProtection
}

function draftOf(preset: SwapPreset): Draft {
  return {
    name: preset.name ?? '',
    slippagePct: String(preset.slippageBps / 100),
    priorityLevel: preset.priorityLevel,
    maxPriorityFeeSol: String(preset.maxPriorityFeeSol),
    tipSol: String(preset.tipSol),
    mev: preset.mev,
  }
}

/**
 * The full editor for one slot. Numbers are typed as text and parsed on save
 * so a half-typed "0.0" never snaps to zero under the cursor; anything that
 * does not parse keeps the slot's current value rather than clearing it.
 */
function SwapPresetDialog({
  open,
  onOpenChange,
  index,
  preset,
  solana,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  index: number
  preset: SwapPreset
  solana: boolean
  onSave: (patch: Partial<SwapPreset>) => void
}) {
  const { t } = useTranslation()
  const presetName = usePresetName()
  const [draft, setDraft] = useState<Draft>(() => draftOf(preset))

  useEffect(() => {
    if (open) setDraft(draftOf(preset))
  }, [open, preset])

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))

  const save = () => {
    const slippage = Number(draft.slippagePct)
    const cap = Number(draft.maxPriorityFeeSol)
    const tip = Number(draft.tipSol)
    onSave({
      name: draft.name.trim() ? draft.name.trim() : null,
      slippageBps: Number.isFinite(slippage)
        ? clampSlippageBps(slippage * 100)
        : preset.slippageBps,
      priorityLevel: draft.priorityLevel,
      maxPriorityFeeSol:
        Number.isFinite(cap) && cap >= 0 ? cap : preset.maxPriorityFeeSol,
      tipSol: Number.isFinite(tip) && tip >= 0 ? tip : preset.tipSol,
      mev: draft.mev,
    })
    onOpenChange(false)
  }

  const tipMissing =
    solana && draft.mev !== 'off' && !(Number(draft.tipSol) > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {t('terminal.trade.swapPresetTitle', {
              name: presetName(preset, index),
            })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Field label={t('terminal.trade.presetName')}>
            <Input
              className="h-7 text-xs"
              value={draft.name}
              maxLength={24}
              placeholder={t(
                SWAP_PRESET_NAME_KEYS[index] ?? SWAP_PRESET_NAME_KEYS[0],
              )}
              onChange={(e) => patch({ name: e.target.value })}
            />
          </Field>

          <Field
            label={t('terminal.trade.slippage')}
            hint={t('terminal.trade.slippageHint', {
              max: MAX_SLIPPAGE_BPS / 100,
            })}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0.01}
              max={MAX_SLIPPAGE_BPS / 100}
              step={0.5}
              className="h-7 font-mono text-xs"
              value={draft.slippagePct}
              onChange={(e) => patch({ slippagePct: e.target.value })}
            />
          </Field>

          {solana && (
            <>
              <Field label={t('terminal.trade.priorityFee')}>
                <div className="flex gap-1">
                  <Chip
                    on={draft.priorityLevel === null}
                    onClick={() => patch({ priorityLevel: null })}
                  >
                    {t('terminal.trade.priorityAuto')}
                  </Chip>
                  {(['medium', 'high', 'veryHigh'] as const).map((level) => (
                    <Chip
                      key={level}
                      on={draft.priorityLevel === level}
                      onClick={() => patch({ priorityLevel: level })}
                    >
                      {t(PRIORITY_KEYS[level])}
                    </Chip>
                  ))}
                </div>
              </Field>

              {draft.priorityLevel !== null && (
                <Field label={t('terminal.trade.priorityCap')}>
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.001}
                    className="h-7 font-mono text-xs"
                    value={draft.maxPriorityFeeSol}
                    onChange={(e) =>
                      patch({ maxPriorityFeeSol: e.target.value })
                    }
                  />
                </Field>
              )}

              <Field
                label={t('terminal.trade.mevProtection')}
                hint={t(MEV_HINT_KEYS[draft.mev])}
              >
                <div className="flex gap-1">
                  {(['off', 'reduced', 'secure'] as const).map((lane) => (
                    <Chip
                      key={lane}
                      on={draft.mev === lane}
                      onClick={() => patch({ mev: lane })}
                    >
                      {t(MEV_KEYS[lane])}
                    </Chip>
                  ))}
                </div>
              </Field>

              {draft.mev !== 'off' && (
                <Field
                  label={t('terminal.trade.tip')}
                  hint={t('terminal.trade.tipHint')}
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.0005}
                    className="h-7 font-mono text-xs"
                    value={draft.tipSol}
                    aria-invalid={tipMissing || undefined}
                    onChange={(e) => patch({ tipSol: e.target.value })}
                  />
                </Field>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={tipMissing} onClick={save}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <div className={LABEL}>{label}</div>
      {children}
      {hint && (
        <p className="text-[10.5px] leading-snug text-muted-foreground/70">
          {hint}
        </p>
      )}
    </div>
  )
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={cn(CHIP, on ? CHIP_ON : CHIP_IDLE)}
      style={on ? CHIP_ON_STYLE : undefined}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
