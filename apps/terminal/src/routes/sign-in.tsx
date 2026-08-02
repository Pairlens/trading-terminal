// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

import { BlocksIcon } from '@pairlens/ui/components/ui/blocks'
import { LayersIcon } from '@pairlens/ui/components/ui/layers'
import { WorkflowIcon } from '@pairlens/ui/components/ui/workflow'

import type { SignInPhase } from '@/components/sign-in-experience'
import { SignInExperience } from '@/components/sign-in-experience'
import { useOptimisticSession } from '@/lib/session'
import { useSignInFlow } from '@/hooks/use-sign-in-flow'

const Dither = lazy(() => import('@/components/dither'))
const Lanyard = lazy(() => import('@/components/lanyard/lanyard'))

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

// Success splash beat — long enough to land, short enough to not annoy.
const SPLASH_MS = 1900

/** Resolve any CSS color string (oklch, hsl, rgb, hex) to [r, g, b] in 0..1. */
function cssColorToRgb(cssColor: string): [number, number, number] | null {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = cssColor
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

/** Read the CSS --primary color and convert to [r,g,b] in 0..1 range. */
function usePrimaryColor(): [number, number, number] {
  const [color, setColor] = useState<[number, number, number]>([
    0.15, 0.1, 0.35,
  ])

  useEffect(() => {
    const read = () => {
      const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--primary')
        .trim()
      if (!raw) return
      const rgb = cssColorToRgb(raw)
      if (rgb) setColor(rgb)
    }
    read()
    // Re-read when theme changes (class or style attribute on <html>)
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    })
    return () => observer.disconnect()
  }, [])

  return color
}

function SignInPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { session, isCheckingSession } = useOptimisticSession()
  const ditherColor = usePrimaryColor()
  const reduceMotion = useReducedMotion() ?? false

  // A fresh sign-in holds the page for a "You're in." beat before entering.
  const [celebrating, setCelebrating] = useState(false)
  const splashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flow = useSignInFlow({
    onSignedIn: () => {
      setCelebrating(true)
      splashTimerRef.current = setTimeout(
        () => void navigate({ to: '/', replace: true }),
        reduceMotion ? 400 : SPLASH_MS,
      )
    },
  })

  useEffect(() => () => clearTimeout(splashTimerRef.current), [])

  useEffect(() => {
    if (session && !celebrating) {
      void navigate({ to: '/', replace: true })
    }
  }, [navigate, session, celebrating])

  if (isCheckingSession) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {t('signIn.checkingSession')}
      </div>
    )
  }

  if (session && !celebrating) {
    return null
  }

  const phase: SignInPhase = celebrating
    ? 'success'
    : flow.otpSentTo
      ? 'otp'
      : 'email'

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left panel — lanyard + benefits */}
      <div className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        {/* Dither background */}
        <div className="absolute inset-0 opacity-50">
          <Suspense fallback={null}>
            <Dither
              waveColor={ditherColor}
              disableAnimation={false}
              enableMouseInteraction={true}
              mouseRadius={0.3}
              colorNum={3}
              pixelSize={1}
              waveAmplitude={0.3}
              waveFrequency={5}
              waveSpeed={0.04}
            />
          </Suspense>
        </div>

        {/* Lanyard badge */}
        <div className="relative z-20 min-h-0 flex-1">
          <Suspense fallback={null}>
            <Lanyard position={[0, 0, 24]} gravity={[0, -40, 0]} />
          </Suspense>
        </div>

        {/* Benefits story card */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center pb-[14%]">
          <div className="pointer-events-auto px-8">
            <SignInBenefits />
          </div>
        </div>
      </div>

      {/* Right panel — choreographed sign-in experience */}
      <SignInExperience
        phase={phase}
        email={flow.email}
        otp={flow.otp}
        otpSentTo={flow.otpSentTo}
        errorMessage={flow.errorMessage}
        isSendingOtp={flow.isSendingOtp}
        isVerifyingOtp={flow.isVerifyingOtp}
        resendSecondsLeft={flow.resendSecondsLeft}
        onEmailChange={flow.onEmailChange}
        onOtpChange={flow.onOtpChange}
        onSendOtp={flow.onSendOtp}
        onVerify={flow.onVerify}
        onBack={flow.onBack}
        onResend={flow.onResend}
      />
    </div>
  )
}

// ── Benefits story card ─────────────────────────────────────────────────
// Story-style glass card over the lanyard panel: segmented progress bars
// drive an auto-advancing carousel (advance on fill completion, pause on
// hover, click a segment to jump) in the onboarding design language.

const BENEFITS = [
  { id: 'cloud', Icon: LayersIcon },
  { id: 'sync', Icon: WorkflowIcon },
  { id: 'plugins', Icon: BlocksIcon },
] as const

const BENEFIT_MS = 5200

function SignInBenefits() {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const advance = useCallback(() => {
    setIndex((i) => (i + 1) % BENEFITS.length)
  }, [])

  // Reduced motion: no fill animation to ride on — advance with a timer.
  useEffect(() => {
    if (!reduceMotion || paused) return
    const id = setInterval(advance, BENEFIT_MS)
    return () => clearInterval(id)
  }, [reduceMotion, paused, advance])

  const benefit = BENEFITS[index]
  const Icon = benefit.Icon

  return (
    <div
      className="w-[400px] max-w-full rounded-2xl border border-sidebar-foreground/15 bg-sidebar/55 p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,.65)] backdrop-blur-xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-sidebar-foreground/60">
          {t('signIn.benefitsEyebrow')}
        </span>
        <span className="font-mono text-[10.5px] tabular-nums text-sidebar-foreground/50">
          {String(index + 1).padStart(2, '0')} /{' '}
          {String(BENEFITS.length).padStart(2, '0')}
        </span>
      </div>

      <div className="mt-4 min-h-[74px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={benefit.id}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 10, filter: 'blur(4px)' }
            }
            animate={
              reduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, filter: 'blur(0px)' }
            }
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex items-start gap-3.5 text-left"
          >
            <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-sidebar-foreground/12 text-sidebar-foreground">
              <Icon size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-serif text-[17px] font-semibold leading-snug">
                {t(`signIn.benefits.${benefit.id}.title`)}
              </p>
              <p className="mt-1 text-[12.5px] leading-[1.5] text-sidebar-foreground/70">
                {t(`signIn.benefits.${benefit.id}.description`)}
              </p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-4 flex gap-1.5">
        {BENEFITS.map((b, i) => (
          <button
            key={b.id}
            type="button"
            aria-label={t(`signIn.benefits.${b.id}.title`)}
            onClick={() => setIndex(i)}
            className="h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-sidebar-foreground/15"
          >
            {i < index || (i === index && reduceMotion) ? (
              <span className="block h-full w-full rounded-full bg-sidebar-foreground/70" />
            ) : i === index ? (
              <span
                key={index}
                className="block h-full w-full origin-left rounded-full bg-sidebar-foreground/70"
                style={{
                  animation: `pl-si-fill ${BENEFIT_MS}ms linear both`,
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                onAnimationEnd={advance}
              />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
