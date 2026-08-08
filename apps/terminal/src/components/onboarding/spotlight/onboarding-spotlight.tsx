// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useReducedMotion } from 'motion/react'
import { useTheme } from 'next-themes'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { Progress } from '@pairlens/ui/components/ui/progress'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'

import './spotlight.css'

import {
  AssetCards,
  AutoAdvanceHint,
  CountryPicker,
  LegalCard,
  OptionGrid,
  OptionRows,
  RiskSpectrum,
  RotatingGreeting,
  StoryPointsHorizontal,
  StoryPointsVertical,
  SummaryGrid,
  ThemePalettes,
  ThemeTiles,
  VenueChips,
  summaryValue,
} from './spotlight-bodies'
import { AccountStep } from './spotlight-account'
import { WelcomeStatue } from './welcome-statue'
import { useOnboardingThemes } from './onboarding-themes'
import {
  EXPERIENCE_VALUES,
  LAYOUT_PRESETS,
  LAYOUT_PRESETS_PORTRAIT,
  LEGAL_ITEM_COUNT,
  RISK_VALUES,
  STEPS,
  layoutTypeOf,
  orbHuesFor,
  venuesFor,
} from './spotlight-steps'
import type { AccountView } from './spotlight-account'
import type { RenderOption } from './spotlight-bodies'
import type { OnboardingThemeOption } from './onboarding-themes'
import type { LayoutPresetTable, SpotlightStep } from './spotlight-steps'
import type { ReactNode } from 'react'
import type { ColorMode } from '@/lib/settings/color-mode'
import type {
  OnboardingAssetClass,
  OnboardingSelections,
} from '@/lib/onboarding-state'
import type { StorySceneId } from './story-scenes'
// The one mobile-owned module the desktop onboarding touches: the viewport
// gate that picks the portrait layout presets (see the barrel's contract).
import { useViewportMode } from '@/mobile'
import { useNeedsTitlebar } from '@/components/tauri-drag-region'
import { LegalNotice } from '@/components/legal-links'
import { countryFlag, countryName, regionForCountry } from '@/lib/countries'
import {
  markLegalAcknowledged,
  markOnboardingComplete,
  saveOnboardingSelections,
} from '@/lib/onboarding-state'
import { SUPPORTED_LANGUAGES, applyLanguage } from '@/hooks/use-language'
import {
  DISPLAY_CURRENCIES,
  DISPLAY_CURRENCY_KEY,
} from '@/hooks/use-display-currency'
import { STORAGE_PREFIX } from '@/hooks/use-persisted-state'
import { analyticsSetting, setPersonProperties } from '@/lib/analytics'
import { track } from '@/lib/analytics-events'
import { setCountrySetting } from '@/lib/region-settings'
import { emitWrite } from '@/lib/sync/sync-channel'
import { lazyChunk } from '@/lib/lazy-chunk'

// Story-step vignettes pull in remotion — loaded only once the user moves
// past the welcome frame, never on the onboarding page's first paint.
const StoryMedia = lazyChunk(() => import('./story-media'))

const STORY_SCENE_IDS: ReadonlyArray<string> = [
  'oneTerminal',
  'privacy',
  'routing',
  'copilot',
  'workspaces',
]

function isStorySceneId(id: string): id is StorySceneId {
  return STORY_SCENE_IDS.includes(id)
}

const EASE = 'cubic-bezier(.22,1,.36,1)'
const AUTO_ADVANCE_MS = 460
const PULSE_MS = 900
const FLIP_DELAY_MS = 430
const SPLASH_MS = 1900

// Story-step choreography: the orb opens big while the title reveals word by
// word, then retreats small/top and hands the stage to the vignette.
const WORD_BASE_DELAY_MS = 260
const WORD_STAGGER_MS = 90
const WORD_DURATION_MS = 380
const STORY_HERO_BEAT_MS = 420
const STORY_MEDIA_LAYOUT = { scale: 0.42, orbTop: '14%', stageTop: '25%' }

/**
 * Width of the seat the welcome headline holds open for the shrunken orb
 * (132px × 0.24 ≈ 32px of orb, 43px counting its ring) — the slack is the
 * air between the last word and the orb.
 */
const ORB_LOCKUP_WIDTH = 64

type Timers = {
  advance?: ReturnType<typeof setTimeout>
  pulse?: ReturnType<typeof setTimeout>
  flip?: ReturnType<typeof setTimeout>
  splash?: ReturnType<typeof setTimeout>
  story?: ReturnType<typeof setTimeout>
}

export function OnboardingSpotlight() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const needsTitlebar = useNeedsTitlebar()
  const { setTheme, resolvedTheme } = useTheme()
  const reduceMotion = useReducedMotion() ?? false
  // Portrait is the only thing the phone changes about onboarding: the same 17
  // steps, the same copy, the same orb — moved and scaled for a 402px frame.
  const presets: LayoutPresetTable =
    useViewportMode() === 'mobile' ? LAYOUT_PRESETS_PORTRAIT : LAYOUT_PRESETS

  const [stepIndex, setStepIndex] = useState(0)
  const [selections, setSelections] = useState<OnboardingSelections>({
    language: i18n.language,
    assetClasses: [],
    venues: [],
    theme: 'dark',
  })
  const [legalAccepted, setLegalAccepted] = useState<Array<number>>([])
  const [legalPage, setLegalPage] = useState<0 | 1>(0)
  const [accountView, setAccountView] = useState<AccountView>('benefits')
  const [launched, setLaunched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [storyPhase, setStoryPhase] = useState<'hero' | 'media'>('hero')

  const rootRef = useRef<HTMLDivElement>(null)
  const orbRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const lockupRef = useRef<HTMLSpanElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const auroraRef = useRef<HTMLDivElement>(null)
  const legalCardRef = useRef<HTMLDivElement>(null)
  const prevIndexRef = useRef(0)
  const timersRef = useRef<Timers>({})

  const step = STEPS[stepIndex]
  const isNarrative = step.kind === 'welcome' || step.kind === 'story'

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      clearTimeout(timers.advance)
      clearTimeout(timers.pulse)
      clearTimeout(timers.flip)
      clearTimeout(timers.splash)
    }
  }, [])

  // ── Orb + stage morph ─────────────────────────────────────────────

  const applyLayout = useCallback(
    (index: number, storyMedia = false) => {
      const target = STEPS[index]
      const mediaPhase = storyMedia && target.kind === 'story'
      const preset = mediaPhase
        ? STORY_MEDIA_LAYOUT
        : presets[layoutTypeOf(target)]
      const orb = orbRef.current
      const stage = stageRef.current
      const stageTop = target.stageTop ?? preset.stageTop
      if (orb) {
        orb.style.top = target.orbTop ?? preset.orbTop
        // The horizontal drift is a hero-phase flourish; the retreated orb
        // re-centers so it doesn't hang over the vignette.
        orb.style.left = mediaPhase ? '50%' : (target.orbLeft ?? '50%')
        orb.style.transform = `translate(-50%, -50%) scale(${target.orbScale ?? preset.scale})`
        // The welcome lockup is measured, not guessed: the step's percentages
        // only hold for one headline width, so short windows and the longer
        // locales walked the orb onto the title. Take the seat the headline
        // reserved (see ORB_LOCKUP_WIDTH) and land on its center instead.
        if (target.kind === 'welcome') {
          const seat = seatCenter(lockupRef.current, stage, stageTop)
          if (seat) {
            orb.style.left = `${seat.x}px`
            orb.style.top = `${seat.y}px`
          }
        }
      }
      if (stage) stage.style.top = stageTop
    },
    [presets],
  )

  const applySplashLayout = useCallback(() => {
    const orb = orbRef.current
    const stage = stageRef.current
    if (orb) {
      orb.style.top = presets.splash.orbTop
      orb.style.left = '50%'
      orb.style.transform = `translate(-50%, -50%) scale(${presets.splash.scale})`
    }
    if (stage) stage.style.top = presets.splash.stageTop
  }, [presets])

  const pulse = useCallback(() => {
    clearTimeout(timersRef.current.pulse)
    setBusy(true)
    timersRef.current.pulse = setTimeout(() => setBusy(false), PULSE_MS)
  }, [])

  const animateContent = useCallback(
    (direction: 1 | -1) => {
      const el = contentRef.current
      if (!el) return
      if (reduceMotion) {
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 240,
          easing: 'ease',
        })
        return
      }
      el.animate(
        [
          {
            opacity: 0,
            transform: `translateY(${direction * 26}px) scale(.985)`,
            filter: 'blur(8px)',
          },
          { opacity: 1, transform: 'none', filter: 'blur(0)' },
        ],
        { duration: 560, easing: EASE },
      )
    },
    [reduceMotion],
  )

  // First mount: orb pops in, content rises.
  useLayoutEffect(() => {
    applyLayout(0)
    const orb = orbRef.current
    const content = contentRef.current
    if (reduceMotion) return
    orb?.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scale(.6)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
      ],
      { duration: 850, easing: EASE },
    )
    content?.animate(
      [
        { opacity: 0, transform: 'translateY(24px)', filter: 'blur(8px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0)' },
      ],
      { duration: 750, delay: 120, easing: EASE, fill: 'backwards' },
    )
  }, [])

  // Step change: morph, parallax, one-shot content enter.
  useLayoutEffect(() => {
    if (stepIndex === prevIndexRef.current) return
    const direction: 1 | -1 = stepIndex > prevIndexRef.current ? 1 : -1
    prevIndexRef.current = stepIndex
    applyLayout(stepIndex)
    pulse()
    animateContent(direction)
    const aurora = auroraRef.current
    if (aurora && !reduceMotion) {
      aurora.style.transform = `translate(${stepIndex * -14}px, ${stepIndex * 10}px)`
    }
    // Re-entering the legal step lands on the page the user was working on.
    if (STEPS[stepIndex].kind === 'legal') {
      const firstSetDone = [0, 1, 2, 3].every((k) => legalAccepted.includes(k))
      setLegalPage(firstSetDone ? 1 : 0)
      setAccountView('benefits')
    }
    // Story choreography: hero orb + word-by-word title first, then the orb
    // retreats and the vignette takes the stage.
    clearTimeout(timersRef.current.story)
    setStoryPhase('hero')
    const entered = STEPS[stepIndex]
    if (
      entered.kind === 'story' &&
      !reduceMotion &&
      isStorySceneId(entered.id)
    ) {
      void import('./story-media') // warm the chunk during the hero beat
      const words = t(`onboarding.${entered.id}.title`).split(' ').length
      const heroMs =
        WORD_BASE_DELAY_MS +
        words * WORD_STAGGER_MS +
        WORD_DURATION_MS +
        STORY_HERO_BEAT_MS
      timersRef.current.story = setTimeout(() => setStoryPhase('media'), heroMs)
    }
  }, [stepIndex])

  // The retreat itself: morph orb + stage to the media preset.
  useLayoutEffect(() => {
    if (storyPhase !== 'media') return
    applyLayout(stepIndex, true)
    pulse()
  }, [storyPhase])

  // Re-layout on any geometry change. Every other step is pure percentages
  // and lands back on the same numbers, but the welcome lockup is measured in
  // px — it would drift off the headline the moment the window resized or the
  // title reflowed. Observing boxes rather than listening for `resize` also
  // covers reflow with no viewport change (font swap, wrapping).
  useEffect(() => {
    const frame = rootRef.current
    const stage = stageRef.current
    if (launched || !frame || !stage) return
    const observer = new ResizeObserver(() =>
      applyLayout(stepIndex, storyPhase === 'media'),
    )
    observer.observe(frame)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [applyLayout, launched, stepIndex, storyPhase])

  // ── Navigation + selection ────────────────────────────────────────

  const go = useCallback((delta: number) => {
    setStepIndex((current) =>
      Math.max(0, Math.min(STEPS.length - 1, current + delta)),
    )
  }, [])

  const scheduleAdvance = useCallback(() => {
    clearTimeout(timersRef.current.advance)
    pulse()
    timersRef.current.advance = setTimeout(() => go(1), AUTO_ADVANCE_MS)
  }, [go, pulse])

  const pruneVenues = useCallback(
    (
      country: string | undefined,
      assetClasses: Array<OnboardingAssetClass>,
      venues: Array<string>,
    ) => {
      const available = new Set(
        venuesFor(regionForCountry(country), assetClasses).map((v) => v.value),
      )
      return venues.filter((v) => available.has(v))
    },
    [],
  )

  const pickSingle = useCallback(
    (
      field:
        | 'language'
        | 'country'
        | 'currency'
        | 'experience'
        | 'risk'
        | 'analytics',
    ) =>
      (value: string) => {
        setSelections((prev) => {
          const next = { ...prev, [field]: value }
          if (field === 'country') {
            next.venues = pruneVenues(value, prev.assetClasses, prev.venues)
          }
          return next
        })
        if (field === 'language') applyLanguage(value)
        scheduleAdvance()
      },
    [pruneVenues, scheduleAdvance],
  )

  const toggleAsset = useCallback(
    (value: string) => {
      pulse()
      setSelections((prev) => {
        const asset = value as OnboardingAssetClass
        const assetClasses = prev.assetClasses.includes(asset)
          ? prev.assetClasses.filter((a) => a !== asset)
          : [...prev.assetClasses, asset]
        return {
          ...prev,
          assetClasses,
          venues: pruneVenues(prev.country, assetClasses, prev.venues),
        }
      })
    },
    [pruneVenues, pulse],
  )

  const toggleVenue = useCallback(
    (value: string) => {
      pulse()
      setSelections((prev) => ({
        ...prev,
        venues: prev.venues.includes(value)
          ? prev.venues.filter((v) => v !== value)
          : [...prev.venues, value],
      }))
    },
    [pulse],
  )

  const pickTheme = useCallback(
    (theme: ColorMode) => {
      pulse()
      setSelections((prev) => ({ ...prev, theme }))
      // next-themes owns the color mode everywhere in the app — it persists
      // the choice and toggles the `.dark` class, including the OS listener
      // behind 'system'.
      setTheme(theme)
    },
    [pulse, setTheme],
  )

  // Bundled `theme:override` plugins — loaded (and applied live) once the
  // theme step is on stage.
  const { themes, activeThemeId, selectTheme } = useOnboardingThemes(
    step.kind === 'theme',
  )

  const pickPalette = useCallback(
    (id: string | null) => {
      pulse()
      selectTheme(id)
      setSelections((prev) => ({ ...prev, palette: id }))
    },
    [pulse, selectTheme],
  )

  // ── Legal flip card ───────────────────────────────────────────────

  const flipTo = useCallback(
    (page: 0 | 1) => {
      const card = legalCardRef.current
      if (!card || reduceMotion) {
        setLegalPage(page)
        return
      }
      const half = card.animate(
        [
          { opacity: 1, transform: 'rotateY(0deg)' },
          { opacity: 0, transform: 'rotateY(62deg)' },
        ],
        { duration: 210, easing: 'cubic-bezier(.5,0,.9,.4)' },
      )
      half.onfinish = () => {
        card.style.opacity = '0'
        setLegalPage(page)
        requestAnimationFrame(() => {
          const next = legalCardRef.current
          if (!next) return
          next.style.opacity = ''
          next.animate(
            [
              { opacity: 0, transform: 'rotateY(-62deg)' },
              { opacity: 1, transform: 'rotateY(0deg)' },
            ],
            { duration: 290, easing: 'cubic-bezier(.2,.7,.3,1)' },
          )
        })
      }
    },
    [reduceMotion],
  )

  const toggleLegal = useCallback(
    (index: number) => {
      setLegalAccepted((prev) => {
        const next = prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index]
        if (
          legalPage === 0 &&
          [0, 1, 2, 3].every((k) => next.includes(k)) &&
          !prev.includes(index)
        ) {
          clearTimeout(timersRef.current.flip)
          timersRef.current.flip = setTimeout(() => flipTo(1), FLIP_DELAY_MS)
        }
        return next
      })
    },
    [flipTo, legalPage],
  )

  // ── Finish ────────────────────────────────────────────────────────

  const finish = useCallback(() => {
    const sel = selections
    // Exact ISO code — same source of truth the settings dialog edits.
    if (sel.country !== undefined) setCountrySetting(sel.country)
    if (sel.currency) {
      try {
        localStorage.setItem(
          `${STORAGE_PREFIX}${DISPLAY_CURRENCY_KEY}`,
          JSON.stringify(sel.currency),
        )
      } catch {
        // Ignore storage errors.
      }
      emitWrite(DISPLAY_CURRENCY_KEY, sel.currency)
    }
    // Explicit opt-in only — an unanswered step keeps analytics off.
    analyticsSetting.set(sel.analytics === 'enabled')
    saveOnboardingSelections(sel)
    markLegalAcknowledged()
    markOnboardingComplete()
    // Queued by the analytics layer until the just-granted consent finishes
    // loading PostHog; dropped entirely if consent was declined.
    track('onboarding_completed')
    // Declared persona for segmentation — coarse self-reported enums only.
    setPersonProperties({
      onboarding_experience: sel.experience ?? 'unset',
      onboarding_risk: sel.risk ?? 'unset',
      onboarding_asset_classes: sel.assetClasses,
    })
    pulse()
    setLaunched(true)
    applySplashLayout()
    animateContent(1)
    timersRef.current.splash = setTimeout(
      () => void navigate({ to: '/', replace: true }),
      reduceMotion ? 400 : SPLASH_MS,
    )
  }, [
    animateContent,
    applySplashLayout,
    navigate,
    pulse,
    reduceMotion,
    selections,
  ])

  // ── Per-step derived data ─────────────────────────────────────────

  const options = useMemo<Array<RenderOption>>(() => {
    if (step.kind !== 'choice') return []
    switch (step.field) {
      case 'language':
        return SUPPORTED_LANGUAGES.map((lang) => ({
          value: lang.code,
          label: lang.nativeName,
          sub: lang.name,
          flag: lang.flag,
          selected: selections.language === lang.code,
          onSelect: () => pickSingle('language')(lang.code),
        }))
      case 'currency':
        return DISPLAY_CURRENCIES.map((currency) => ({
          value: currency.code,
          label: currency.code,
          sub: currency.label,
          symbol: currency.symbol,
          selected: selections.currency === currency.code,
          onSelect: () => pickSingle('currency')(currency.code),
        }))
      case 'asset':
        return (['cex', 'dex', 'equities'] as const).map((value) => ({
          value,
          label: t(`onboarding.asset.options.${value}.label`),
          sub: t(`onboarding.asset.options.${value}.sub`),
          selected: selections.assetClasses.includes(value),
          onSelect: () => toggleAsset(value),
        }))
      case 'venues':
        return venuesFor(
          regionForCountry(selections.country),
          selections.assetClasses,
        ).map((venue) => ({
          value: venue.value,
          label: venue.label,
          tag: venue.kind,
          selected: selections.venues.includes(venue.value),
          onSelect: () => toggleVenue(venue.value),
        }))
      case 'experience':
        return EXPERIENCE_VALUES.map((value) => ({
          value,
          label: t(`onboarding.experience.options.${value}.label`),
          sub: t(`onboarding.experience.options.${value}.sub`),
          selected: selections.experience === value,
          onSelect: () => pickSingle('experience')(value),
        }))
      case 'analytics':
        return (['enabled', 'disabled'] as const).map((value) => ({
          value,
          label: t(`onboarding.analytics.options.${value}.label`),
          sub: t(`onboarding.analytics.options.${value}.sub`),
          selected: selections.analytics === value,
          onSelect: () => pickSingle('analytics')(value),
        }))
      case 'risk':
        return RISK_VALUES.map(({ value, tone }) => ({
          value,
          label: t(`onboarding.risk.options.${value}.label`),
          sub: t(`onboarding.risk.options.${value}.sub`),
          dotColor:
            tone === 'calm'
              ? 'var(--up)'
              : tone === 'hot'
                ? 'var(--down)'
                : 'var(--primary)',
          selected: selections.risk === value,
          onSelect: () => pickSingle('risk')(value),
        }))
      default:
        return []
    }
  }, [step, selections, t, pickSingle, toggleAsset, toggleVenue])

  const orbColors = useMemo(
    () => orbHuesFor(selections.assetClasses, selections.risk),
    [selections.assetClasses, selections.risk],
  )

  const summaryRows = useMemo(() => {
    if (step.kind !== 'summary') return []
    const language = SUPPORTED_LANGUAGES.find(
      (l) => l.code === selections.language,
    )?.nativeName
    const assetClasses = selections.assetClasses
      .map((a) => t(`onboarding.asset.options.${a}.label`))
      .join(' · ')
    return [
      {
        label: t('onboarding.summary.labels.language'),
        value: summaryValue(language),
      },
      {
        label: t('onboarding.summary.labels.country'),
        value: summaryValue(
          selections.country
            ? `${countryFlag(selections.country)} ${countryName(selections.country, i18n.language)}`
            : selections.country === ''
              ? t('onboarding.country.global')
              : null,
        ),
      },
      {
        label: t('onboarding.summary.labels.currency'),
        value: summaryValue(selections.currency),
      },
      {
        label: t('onboarding.summary.labels.assetClasses'),
        value: summaryValue(assetClasses),
      },
      {
        label: t('onboarding.summary.labels.venues'),
        value: summaryValue(selections.venues.join(' · ')),
      },
      {
        label: t('onboarding.summary.labels.experience'),
        value: summaryValue(
          selections.experience
            ? t(`onboarding.experience.options.${selections.experience}.label`)
            : null,
        ),
      },
      {
        label: t('onboarding.summary.labels.risk'),
        value: summaryValue(
          selections.risk
            ? t(`onboarding.risk.options.${selections.risk}.label`)
            : null,
        ),
      },
      {
        label: t('onboarding.summary.labels.theme'),
        value: t(`onboarding.themeStep.${selections.theme}`),
      },
      {
        label: t('onboarding.summary.labels.palette'),
        value:
          themes.find((theme) => theme.id === activeThemeId)?.name ??
          t('onboarding.themeStep.defaultTheme'),
      },
      {
        label: t('onboarding.summary.labels.analytics'),
        value: t(
          `onboarding.analytics.${selections.analytics === 'enabled' ? 'on' : 'off'}`,
        ),
      },
    ]
  }, [step.kind, selections, themes, activeThemeId, t, i18n.language])

  const legalItems = useMemo(
    () =>
      Array.from({ length: LEGAL_ITEM_COUNT }, (_, i) =>
        t(`onboarding.legal.items.${i}`),
      ),
    [t],
  )

  const legalComplete = legalAccepted.length === LEGAL_ITEM_COUNT
  const multiCount =
    step.field === 'asset'
      ? selections.assetClasses.length
      : step.field === 'venues'
        ? selections.venues.length
        : 0

  const showContinue =
    step.kind === 'story' ||
    step.kind === 'theme' ||
    step.kind === 'legal' ||
    (step.kind === 'choice' && step.multi === true)
  const continueDisabled =
    step.kind === 'legal'
      ? !legalComplete
      : step.kind === 'choice' && step.multi === true
        ? multiCount === 0
        : false

  const handleBack = useCallback(() => {
    if (step.kind === 'connect' && accountView !== 'benefits') {
      setAccountView(accountView === 'otp' ? 'email' : 'benefits')
      return
    }
    go(-1)
  }, [accountView, go, step.kind])

  // Top-right chrome shows a compact label for the current step (1–2 words).
  const stepLabel = launched
    ? t('onboarding.phase.ready')
    : t(`onboarding.${step.id}.label`)

  const progress = Math.round((stepIndex / (STEPS.length - 1)) * 100)

  // ── Render ────────────────────────────────────────────────────────

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 overflow-hidden bg-background font-sans text-foreground transition-colors duration-600"
    >
      {/* Aurora background. On coarse pointers the blur radius drops to ~28px:
          an 80–90px filter over a viewport-sized layer is real tile memory on a
          phone GPU (the lesson the marketing site already learned), and the
          cost scales with the radius. It is not removed outright — verified at
          402px, `blur-none` exposes the hard edge where each gradient meets its
          own box, because a `circle` gradient in a tall ellipse is still ~60%
          opaque at the left and right edges. 28px hides that seam. */}
      <div
        ref={auroraRef}
        aria-hidden
        className="pointer-events-none absolute -inset-[12%] z-0 transition-transform duration-1000 ease-[cubic-bezier(.22,1,.36,1)]"
      >
        <div
          className="pl-onb-aurora absolute left-[16%] top-[2%] h-[60%] w-[52%] rounded-full opacity-50 blur-[80px] pointer-coarse:blur-[28px]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 60%, transparent), transparent 68%)',
            animation: 'pl-onb-drift 19s ease-in-out infinite',
          }}
        />
        <div
          className="pl-onb-aurora absolute -bottom-[4%] right-[10%] h-[58%] w-[48%] rounded-full opacity-40 blur-[90px] pointer-coarse:blur-[28px]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, oklch(60% .2 320 / .48), transparent 68%)',
            animation: 'pl-onb-drift2 24s ease-in-out infinite',
          }}
        />
      </div>

      {/* Welcome-frame hero — sits above the aurora, under orb and stage. */}
      <WelcomeStatue
        active={!launched && step.kind === 'welcome'}
        reduceMotion={reduceMotion}
      />

      {/* Titlebar drag strip — the onboarding route mounts outside the
          terminal shell, so it provides its own drag region on desktop. */}
      {needsTitlebar && (
        <div
          data-tauri-drag-region
          className="fixed inset-x-0 top-0 z-[9999] h-8"
        />
      )}

      {/* Top bar — pushed below the overlay titlebar (traffic lights) on desktop */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-[8] px-[26px]',
          needsTitlebar ? 'pt-11' : 'pt-4',
        )}
      >
        <Progress value={progress} className="h-1 w-full" />
        <div className="mt-[13px] flex items-center justify-between">
          <span className="font-serif text-lg font-semibold tracking-[-0.01em] text-foreground">
            Pairlens
          </span>
          {/* Keyed remount + CSS fade: survives arbitrarily fast stepping,
              unlike exit-orchestrated crossfades. */}
          <span
            key={stepLabel}
            className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
            style={{ animation: 'pl-onb-label .35s ease-out both' }}
          >
            {stepLabel}
          </span>
        </div>
      </div>

      {/* Persistent orb — moved/scaled, never remounted */}
      <div
        ref={orbRef}
        aria-hidden
        className="pointer-events-none absolute z-[4] flex size-[132px] items-center justify-center"
        style={{
          transition: `top .72s ${EASE}, left .72s ${EASE}, transform .72s ${EASE}`,
        }}
      >
        <span
          className="absolute size-[180px] rounded-full border opacity-50"
          style={{
            borderColor: 'color-mix(in oklch, var(--primary) 26%, transparent)',
            animation: 'pl-onb-spin 26s linear infinite',
          }}
        />
        <AiOrb
          size="132px"
          state={busy ? 'thinking' : 'idle'}
          colors={orbColors}
        />
      </div>

      {/* Stage. In portrait it is also the scroll region: a 17-language choice
          grid is taller than a phone, and the frame itself is overflow-hidden,
          so without this the last options would be unreachable. Above `sm` the
          box is exactly as it was — height auto, no scrolling. */}
      <div
        ref={stageRef}
        className="absolute left-1/2 z-[3] w-[min(760px,92vw)] -translate-x-1/2 text-center max-sm:bottom-0 max-sm:overflow-y-auto max-sm:overscroll-contain"
        style={{ transition: `top .66s ${EASE}` }}
      >
        <div
          ref={contentRef}
          className="flex flex-col items-center gap-4 max-sm:min-h-full"
        >
          {launched ? (
            <>
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                {t('onboarding.splash.eyebrow')}
              </span>
              <h2 className="text-balance font-serif text-[46px] font-semibold leading-[1.03] tracking-[-0.02em]">
                {t('onboarding.splash.title')}
              </h2>
              <p className="max-w-[42ch] text-[15.5px] text-muted-foreground">
                {t('onboarding.splash.sub')}
              </p>
            </>
          ) : (
            <>
              {/* Status / eyebrow. The welcome frame drops it — the statue
                  hero + headline carry the moment on their own. */}
              {step.kind === 'welcome' ? null : isNarrative ||
                step.kind === 'summary' ? (
                <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-primary">
                  {t(`onboarding.${step.id}.eyebrow`)}
                </span>
              ) : (
                <div className="min-h-5">
                  <ShimmeringText
                    text={t(`onboarding.${step.id}.status`)}
                    startOnView={false}
                    className="text-sm"
                  />
                </div>
              )}

              {/* Heading + sub */}
              <div className="flex w-full flex-col items-center gap-2.5">
                {step.id === 'language' ? (
                  <RotatingGreeting
                    reduceMotion={reduceMotion}
                    srLabel={t('onboarding.language.title')}
                  />
                ) : (
                  <WordRevealTitle
                    key={step.id}
                    text={t(`onboarding.${step.id}.title`)}
                    animate={isNarrative && !reduceMotion}
                    className={cn(
                      'text-balance font-serif font-semibold tracking-[-0.02em] text-foreground',
                      isNarrative || step.kind === 'summary'
                        ? 'text-[44px] leading-[1.04] max-md:text-4xl'
                        : 'text-[34px] leading-[1.07] max-md:text-[28px]',
                    )}
                    trailing={
                      step.kind === 'welcome' ? (
                        <span
                          ref={lockupRef}
                          aria-hidden
                          className="inline-block align-middle"
                          style={{
                            // Glued to the last word: an inline seat the orb
                            // is measured into, so the headline reflows around
                            // it in every locale instead of running under it.
                            width: `${ORB_LOCKUP_WIDTH}px`,
                            height: '0.6em',
                          }}
                        />
                      ) : undefined
                    }
                  />
                )}
                <p className="max-w-[52ch] text-pretty text-[15.5px] leading-[1.55] text-muted-foreground">
                  {t(`onboarding.${step.id}.sub`)}
                </p>
              </div>

              <StepBody
                step={step}
                reduceMotion={reduceMotion}
                storyPhase={storyPhase}
                options={options}
                country={selections.country}
                onPickCountry={pickSingle('country')}
                theme={selections.theme}
                onPickTheme={pickTheme}
                themes={themes}
                activeThemeId={activeThemeId}
                isDark={resolvedTheme !== 'light'}
                onPickPalette={pickPalette}
                legalCardRef={legalCardRef}
                legalItems={legalItems}
                legalAccepted={legalAccepted}
                legalPage={legalPage}
                onToggleLegal={toggleLegal}
                onLegalFirstSet={() => {
                  clearTimeout(timersRef.current.flip)
                  flipTo(0)
                }}
                accountView={accountView}
                onAccountViewChange={setAccountView}
                onAdvance={() => go(1)}
                summaryRows={summaryRows}
              />

              {/* Nav. On a phone it drops into thumb reach: `mt-auto` pushes
                  it to the bottom of the stage when the step is short, and
                  `sticky` keeps it there when the step scrolls. It is in flow
                  either way, so the last option is never trapped underneath. */}
              <div className="mt-2 flex items-center justify-center gap-[11px] max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:mt-auto max-sm:-mx-[4vw] max-sm:w-screen max-sm:bg-background/90 max-sm:pb-[max(env(safe-area-inset-bottom),20px)] max-sm:pt-4">
                {stepIndex > 0 && (
                  <Button variant="ghost" onClick={handleBack}>
                    {t('onboarding.nav.back')}
                  </Button>
                )}
                {step.kind === 'welcome' && (
                  <Button size="lg" onClick={() => go(1)}>
                    {t('onboarding.nav.begin')}
                  </Button>
                )}
                {showContinue && (
                  <Button
                    size="lg"
                    disabled={continueDisabled}
                    onClick={() => go(1)}
                  >
                    {step.kind === 'legal'
                      ? t('onboarding.nav.accept')
                      : t('onboarding.nav.continue')}
                  </Button>
                )}
                {step.kind === 'summary' && (
                  <Button size="lg" onClick={finish}>
                    {t('onboarding.nav.enter')}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Center of the seat the welcome headline holds open for the orb, in frame
 * coordinates — or null while the seat isn't mounted (every other step).
 *
 * Offsets, not client rects: this runs while the stage is still transitioning
 * to `stageTop` and the content carries its enter transform, so a rect would
 * report where the headline is rather than where it lands. offsetTop/offsetLeft
 * are pure layout, which is exactly the settled geometry we're aiming at.
 */
function seatCenter(
  seat: HTMLElement | null,
  stage: HTMLElement | null,
  stageTop: string,
): { x: number; y: number } | null {
  const frame = stage?.offsetParent
  if (!seat || !stage || !(frame instanceof HTMLElement)) return null
  const top = stageTop.trim().endsWith('%')
    ? (parseFloat(stageTop) / 100) * frame.clientHeight
    : parseFloat(stageTop)
  if (!Number.isFinite(top)) return null

  let x = seat.offsetWidth / 2
  let y = seat.offsetHeight / 2
  let node: HTMLElement | null = seat
  while (node && node !== stage) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent instanceof HTMLElement ? node.offsetParent : null
  }
  if (node !== stage) return null

  // The stage sits at left:50% with a -50% translate, so its offsetLeft is the
  // frame's midline — back out half its width to reach its visual left edge.
  return { x: stage.offsetLeft - stage.offsetWidth / 2 + x, y: top + y }
}

// ── Step body dispatch ────────────────────────────────────────────────

function StepBody({
  step,
  reduceMotion,
  storyPhase,
  options,
  country,
  onPickCountry,
  theme,
  onPickTheme,
  themes,
  activeThemeId,
  isDark,
  onPickPalette,
  legalCardRef,
  legalItems,
  legalAccepted,
  legalPage,
  onToggleLegal,
  onLegalFirstSet,
  accountView,
  onAccountViewChange,
  onAdvance,
  summaryRows,
}: {
  step: SpotlightStep
  reduceMotion: boolean
  storyPhase: 'hero' | 'media'
  options: Array<RenderOption>
  country: string | undefined
  onPickCountry: (code: string) => void
  theme: ColorMode
  onPickTheme: (theme: ColorMode) => void
  themes: Array<OnboardingThemeOption>
  activeThemeId: string | null
  isDark: boolean
  onPickPalette: (id: string | null) => void
  legalCardRef: React.RefObject<HTMLDivElement | null>
  legalItems: Array<string>
  legalAccepted: Array<number>
  legalPage: 0 | 1
  onToggleLegal: (index: number) => void
  onLegalFirstSet: () => void
  accountView: AccountView
  onAccountViewChange: (view: AccountView) => void
  onAdvance: () => void
  summaryRows: Array<{ label: string; value: string }>
}) {
  const { t } = useTranslation()

  if (step.kind === 'welcome') return null

  if (step.kind === 'story') {
    const icons = step.points ?? []
    const labels = icons.map((_, i) => t(`onboarding.${step.id}.points.${i}`))
    const staticBody = (
      <>
        {icons.length > 0 &&
          (step.pointsH ? (
            <StoryPointsHorizontal icons={icons} labels={labels} />
          ) : (
            <StoryPointsVertical icons={icons} labels={labels} />
          ))}
        {step.chips && step.chips.length > 0 && (
          <VenueChips chips={step.chips} />
        )}
      </>
    )
    // Animated vignette replaces the static list; the list remains the
    // reduced-motion experience and the fallback while remotion loads.
    if (reduceMotion || !isStorySceneId(step.id)) return staticBody
    // Hero phase: reserve the vignette's box (no layout jump on handoff) but
    // keep the stage clear — the orb and title own this beat.
    if (storyPhase === 'hero') {
      return (
        <div
          aria-hidden
          className="mx-auto w-full max-w-[560px]"
          style={{ aspectRatio: '560 / 200' }}
        />
      )
    }
    return (
      <div
        className="mx-auto w-full max-w-[560px]"
        style={{
          aspectRatio: '560 / 200',
          animation: `pl-onb-fadeup .55s ${EASE} .18s both`,
        }}
      >
        <Suspense fallback={staticBody}>
          <StoryMedia scene={step.id} />
        </Suspense>
      </div>
    )
  }

  if (step.kind === 'choice') {
    const single = step.multi !== true
    return (
      <div className="mt-0.5 flex w-full flex-col items-center gap-3">
        {step.layout === 'country' ? (
          <CountryPicker value={country} onSelect={onPickCountry} />
        ) : step.layout === 'rows' ? (
          <OptionRows options={options} />
        ) : step.layout === 'spectrum' ? (
          <RiskSpectrum options={options} />
        ) : step.layout === 'asset' ? (
          <AssetCards options={options} />
        ) : (
          <OptionGrid options={options} />
        )}
        {step.field === 'analytics' && (
          <LegalNotice kind="analytics" className="text-center" />
        )}
        {single && <AutoAdvanceHint />}
      </div>
    )
  }

  if (step.kind === 'theme') {
    return (
      <div className="flex w-full flex-col items-center gap-[18px]">
        <ThemeTiles theme={theme} onPick={onPickTheme} />
        <ThemePalettes
          themes={themes}
          activeId={activeThemeId}
          isDark={isDark}
          onPick={onPickPalette}
        />
      </div>
    )
  }

  if (step.kind === 'legal') {
    return (
      <LegalCard
        cardRef={legalCardRef}
        items={legalItems}
        accepted={legalAccepted}
        page={legalPage}
        onToggle={onToggleLegal}
        onFirstSet={onLegalFirstSet}
      />
    )
  }

  if (step.kind === 'connect') {
    return (
      <AccountStep
        view={accountView}
        onViewChange={onAccountViewChange}
        onAdvance={onAdvance}
      />
    )
  }

  if (step.kind === 'summary') {
    return <SummaryGrid rows={summaryRows} />
  }

  return null
}

// ── Word-by-word title reveal ─────────────────────────────────────────

/**
 * Narrative headings reveal one word at a time (staggered rise + deblur).
 * Real spaces between the inline-block spans keep line wrapping intact.
 * Key this by step so the CSS animation re-runs on every step change.
 *
 * `trailing` rides along at the end of the last line — the welcome frame
 * uses it to reserve the orb's seat inside the headline.
 */
function WordRevealTitle({
  text,
  animate,
  className,
  trailing,
}: {
  text: string
  animate: boolean
  className?: string
  trailing?: ReactNode
}) {
  if (!animate)
    return (
      <h2 className={className}>
        {text}
        {trailing}
      </h2>
    )
  const words = text.split(' ')
  return (
    <h2 className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden>
          {i > 0 && ' '}
          <span
            className="inline-block will-change-transform"
            style={{
              animation: `pl-onb-word ${WORD_DURATION_MS}ms ${EASE} both`,
              animationDelay: `${WORD_BASE_DELAY_MS + i * WORD_STAGGER_MS}ms`,
            }}
          >
            {word}
          </span>
        </span>
      ))}
      {trailing}
    </h2>
  )
}
