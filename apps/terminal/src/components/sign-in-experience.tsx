// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ArrowRightIcon, MailIcon, RefreshCwIcon } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'

import { cn } from '@pairlens/ui/lib/utils'
import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'
import { ShimmeringText } from '@pairlens/ui/components/ui/shimmering-text'
import { Spinner } from '@pairlens/ui/components/ui/spinner'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@pairlens/ui/components/ui/input-otp'

import { LegalNotice } from '@/components/legal-links'

import './sign-in.css'

const EASE = [0.22, 1, 0.36, 1] as const
const OTP_LENGTH = 6

export type SignInPhase = 'email' | 'otp' | 'success'

type SignInExperienceProps = {
  phase: SignInPhase
  email: string
  otp: string
  otpSentTo: string | null
  errorMessage: string | null
  isSendingOtp: boolean
  isVerifyingOtp: boolean
  resendSecondsLeft: number
  onEmailChange: (value: string) => void
  onOtpChange: (value: string) => void
  onSendOtp: () => void
  onVerify: () => void
  onBack: () => void
  onResend: () => void
  /** 'page' fills the /sign-in panel; 'dialog' is the compact in-app card. */
  variant?: 'page' | 'dialog'
  /** Dialog only — dismisses instead of the page's "continue without" Link. */
  onSkip?: () => void
}

/**
 * The choreographed email → code → welcome flow in the spotlight-onboarding
 * design language: persistent orb, mono phase label, serif word-reveal
 * headings, blur-rise step transitions. Rendered full-bleed as the right
 * panel of /sign-in and compact inside the sign-in dialog.
 */
export function SignInExperience({
  phase,
  email,
  otp,
  otpSentTo,
  errorMessage,
  isSendingOtp,
  isVerifyingOtp,
  resendSecondsLeft,
  onEmailChange,
  onOtpChange,
  onSendOtp,
  onVerify,
  onBack,
  onResend,
  variant = 'page',
  onSkip,
}: SignInExperienceProps) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion() ?? false
  const busy = isSendingOtp || isVerifyingOtp
  const compact = variant === 'dialog'

  const title =
    phase === 'email'
      ? t('signIn.heroTitle')
      : phase === 'otp'
        ? t('signIn.otpTitle')
        : t('signIn.successTitle')

  const bodyVariants = reduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1, transition: { duration: 0.24 } },
        exit: { opacity: 0, transition: { duration: 0.16 } },
      }
    : {
        initial: { opacity: 0, y: 22, filter: 'blur(8px)' },
        animate: {
          opacity: 1,
          y: 0,
          filter: 'blur(0px)',
          transition: { duration: 0.5, ease: EASE },
        },
        exit: {
          opacity: 0,
          y: -14,
          filter: 'blur(6px)',
          transition: { duration: 0.22, ease: 'easeIn' as const },
        },
      }

  return (
    // overflow-clip (not -hidden): the aurora bleeds past the panel and the
    // email autofocus would otherwise scroll the clipped overflow into view.
    <div className="relative flex flex-col overflow-clip bg-background">
      {/* Aurora wash — quieter sibling of the onboarding background */}
      <div aria-hidden className="pointer-events-none absolute -inset-[12%]">
        <div
          className="pl-si-aurora absolute -top-[6%] right-[4%] h-[52%] w-[56%] rounded-full opacity-35 blur-[90px]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 55%, transparent), transparent 68%)',
            animation: 'pl-si-drift 21s ease-in-out infinite',
          }}
        />
        <div
          className="pl-si-aurora absolute -bottom-[8%] left-[2%] h-[48%] w-[46%] rounded-full opacity-25 blur-[100px]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, oklch(60% .2 320 / .45), transparent 68%)',
            animation: 'pl-si-drift2 26s ease-in-out infinite',
          }}
        />
      </div>

      {/* Top chrome — brand left, mono phase label right */}
      <div
        className={cn(
          'relative z-10 flex items-center justify-between',
          compact ? 'px-6 pt-5' : 'px-7 pt-6 lg:px-10 lg:pt-7',
        )}
      >
        <span className="font-serif text-lg font-semibold tracking-[-0.01em] text-foreground">
          Pairlens
        </span>
        <span
          key={phase}
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
          style={{ animation: 'pl-si-fade .35s ease-out both' }}
        >
          {t(`signIn.phase.${phase}`)}
        </span>
      </div>

      {/* Stage */}
      <div
        className={cn(
          'relative z-10 flex flex-1 items-center justify-center px-6',
          compact ? 'py-8' : 'py-10',
        )}
      >
        <div className="flex w-full max-w-[400px] flex-col items-center gap-4 text-center">
          {/* Orb — thinking while the wire is hot, ringed like onboarding */}
          <div
            className={cn(
              'relative flex items-center justify-center',
              compact ? 'size-[72px]' : 'size-[88px]',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'pl-si-ring absolute rounded-full border opacity-50',
                compact ? 'size-[100px]' : 'size-[120px]',
              )}
              style={{
                borderColor:
                  'color-mix(in oklch, var(--primary) 26%, transparent)',
                animation: 'pl-si-spin 26s linear infinite',
              }}
            />
            {phase === 'success' && !reduceMotion && (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'absolute rounded-full border-2 border-primary',
                    compact ? 'size-[72px]' : 'size-[88px]',
                  )}
                  style={{ animation: 'pl-si-ripple 1.1s ease-out both' }}
                />
                <span
                  aria-hidden
                  className={cn(
                    'absolute rounded-full border border-primary',
                    compact ? 'size-[72px]' : 'size-[88px]',
                  )}
                  style={{ animation: 'pl-si-ripple 1.1s ease-out .25s both' }}
                />
              </>
            )}
            <AiOrb
              size={compact ? '72px' : '88px'}
              state={busy || phase === 'success' ? 'thinking' : 'idle'}
            />
            {phase === 'success' && (
              <span
                aria-hidden
                className="absolute -right-0.5 bottom-0.5 flex size-[26px] items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
                style={{
                  animation: reduceMotion
                    ? undefined
                    : 'pl-si-pop .5s cubic-bezier(.22,1,.36,1) .15s both',
                }}
              >
                ✓
              </span>
            )}
          </div>

          {/* Heading */}
          <WordRevealTitle
            key={phase}
            text={title}
            animate={!reduceMotion}
            className={cn(
              'text-balance font-serif font-semibold leading-[1.07] tracking-[-0.02em] text-foreground',
              compact ? 'text-[27px]' : 'text-[34px] max-md:text-[28px]',
            )}
          />

          {/* Sub */}
          <div
            key={`sub-${phase}`}
            className="min-h-5 max-w-[42ch] text-pretty text-[14.5px] leading-[1.55] text-muted-foreground"
            style={{ animation: 'pl-si-fade .5s ease-out .15s both' }}
          >
            {phase === 'email' && t('signIn.description')}
            {phase === 'otp' && (
              <>
                {t('signIn.verifyDescription')}{' '}
                <span className="font-medium text-foreground">{otpSentTo}</span>
              </>
            )}
            {phase === 'success' && (
              <ShimmeringText
                text={t('signIn.successSub')}
                startOnView={false}
                className="text-[14.5px]"
              />
            )}
          </div>

          {/* Body */}
          <div className="mt-1 w-full">
            <AnimatePresence mode="wait" initial={false}>
              {phase === 'email' && (
                <motion.form
                  key="email"
                  {...bodyVariants}
                  onSubmit={(event) => {
                    event.preventDefault()
                    onSendOtp()
                  }}
                  className="flex w-full flex-col gap-3"
                >
                  <label
                    className={cn(
                      'group flex w-full items-center gap-3 rounded-[13px] border border-border bg-card px-4 py-3.5 text-left',
                      'transition-[border-color,box-shadow] duration-200 ease-[cubic-bezier(.22,1,.36,1)]',
                      'focus-within:border-[color-mix(in_oklch,var(--primary)_55%,var(--border))] focus-within:shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_12%,transparent)]',
                    )}
                  >
                    <MailIcon className="size-4 flex-none text-muted-foreground transition-colors group-focus-within:text-primary" />
                    <input
                      autoComplete="email"
                      autoFocus
                      className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
                      onChange={(event) => onEmailChange(event.target.value)}
                      placeholder={t('signIn.emailPlaceholder')}
                      required
                      type="email"
                      value={email}
                    />
                  </label>

                  {errorMessage && (
                    <p
                      className="text-center text-[12.5px] text-destructive"
                      style={{ animation: 'pl-si-rise .3s ease-out both' }}
                    >
                      {errorMessage}
                    </p>
                  )}

                  <Button
                    className="group w-full"
                    disabled={isSendingOtp}
                    size="lg"
                    type="submit"
                  >
                    {isSendingOtp ? (
                      <>
                        <Spinner className="size-4" />
                        {t('signIn.sendingCode')}
                      </>
                    ) : (
                      <>
                        {t('signIn.continue')}
                        <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Button>

                  {/* Floating reassurance chips — same float as the venue chips */}
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {(['passwordless', 'local', 'optional'] as const).map(
                      (chip, i) => (
                        <span
                          key={chip}
                          className="pl-si-chip rounded-full border border-border bg-card px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
                          style={{
                            animation: 'pl-si-float 4.5s ease-in-out infinite',
                            animationDelay: `${i * 0.55}s`,
                          }}
                        >
                          {t(`signIn.chips.${chip}`)}
                        </span>
                      ),
                    )}
                  </div>
                </motion.form>
              )}

              {phase === 'otp' && (
                <motion.form
                  key="otp"
                  {...bodyVariants}
                  onSubmit={(event) => {
                    event.preventDefault()
                    if (otp.trim().length < OTP_LENGTH || isVerifyingOtp) return
                    onVerify()
                  }}
                  className="flex w-full flex-col items-center gap-4"
                >
                  {/* Keyed by error so a wrong code shakes the slots */}
                  <div
                    key={errorMessage ?? 'clean'}
                    className="flex justify-center"
                    style={
                      errorMessage && !reduceMotion
                        ? { animation: 'pl-si-shake .5s ease-in-out both' }
                        : undefined
                    }
                  >
                    <InputOTP
                      autoFocus
                      maxLength={OTP_LENGTH}
                      onChange={onOtpChange}
                      value={otp}
                    >
                      <InputOTPGroup>
                        {[0, 1, 2].map((index) => (
                          <StaggeredSlot
                            key={index}
                            index={index}
                            reduceMotion={reduceMotion}
                          />
                        ))}
                      </InputOTPGroup>
                      <InputOTPSeparator className="mx-2 text-muted-foreground" />
                      <InputOTPGroup>
                        {[3, 4, 5].map((index) => (
                          <StaggeredSlot
                            key={index}
                            index={index}
                            reduceMotion={reduceMotion}
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  <div className="min-h-5 text-center">
                    {isVerifyingOtp ? (
                      <ShimmeringText
                        text={t('signIn.signingIn')}
                        startOnView={false}
                        className="text-sm"
                      />
                    ) : errorMessage ? (
                      <p
                        className="text-[12.5px] text-destructive"
                        style={{ animation: 'pl-si-rise .3s ease-out both' }}
                      >
                        {errorMessage}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex w-full items-center justify-between gap-2 text-[12.5px] text-muted-foreground">
                    <span>
                      {t('signIn.wrongEmail')}{' '}
                      <button
                        className="cursor-pointer text-primary underline-offset-4 transition-colors hover:underline"
                        onClick={onBack}
                        type="button"
                      >
                        {t('signIn.changeIt')}
                      </button>
                    </span>
                    <button
                      className="cursor-pointer font-mono text-[11.5px] transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-50"
                      disabled={isSendingOtp || resendSecondsLeft > 0}
                      onClick={onResend}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <RefreshCwIcon
                          className={cn(
                            'size-3',
                            isSendingOtp && 'animate-spin',
                          )}
                        />
                        {resendSecondsLeft > 0
                          ? t('signIn.resendCodeTimer', {
                              seconds: resendSecondsLeft,
                            })
                          : t('signIn.resendCode')}
                      </span>
                    </button>
                  </div>
                </motion.form>
              )}

              {phase === 'success' && (
                <motion.div key="success" {...bodyVariants} className="h-10" />
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className={cn(
          'relative z-10 flex flex-col items-center gap-2.5 px-6',
          compact ? 'pb-6' : 'pb-7',
        )}
      >
        {phase !== 'success' &&
          (compact ? (
            <button
              className="cursor-pointer text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              onClick={onSkip}
              type="button"
            >
              {t('signIn.skip')}
            </button>
          ) : (
            <Link
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              to="/"
            >
              {t('signIn.skip')}
            </Link>
          ))}
        <LegalNotice
          kind="signIn"
          className="max-w-[46ch] text-center text-muted-foreground/70"
        />
      </div>
    </div>
  )
}

/** OTP slot that rises in with a per-index stagger on mount. */
function StaggeredSlot({
  index,
  reduceMotion,
}: {
  index: number
  reduceMotion: boolean
}) {
  return (
    <InputOTPSlot
      className="h-12 w-11 text-xl"
      index={index}
      style={
        reduceMotion
          ? undefined
          : {
              animation: 'pl-si-rise .38s cubic-bezier(.22,1,.36,1) both',
              animationDelay: `${index * 55}ms`,
            }
      }
    />
  )
}

/**
 * Serif headings reveal one word at a time (staggered rise + deblur) — the
 * same treatment as the onboarding narrative titles. Key by phase so the
 * CSS animation re-runs on every phase change.
 */
function WordRevealTitle({
  text,
  animate,
  className,
}: {
  text: string
  animate: boolean
  className?: string
}) {
  if (!animate) return <h1 className={className}>{text}</h1>
  const words = text.split(' ')
  return (
    <h1 className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} aria-hidden>
          {i > 0 && ' '}
          <span
            className="inline-block will-change-transform"
            style={{
              animation: 'pl-si-word 380ms cubic-bezier(.22,1,.36,1) both',
              animationDelay: `${120 + i * 80}ms`,
            }}
          >
            {word}
          </span>
        </span>
      ))}
    </h1>
  )
}
