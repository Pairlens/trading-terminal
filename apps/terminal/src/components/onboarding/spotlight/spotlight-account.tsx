// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import { Input } from '@pairlens/ui/components/ui/input'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from '@pairlens/ui/components/ui/input-otp'

import { AccountBenefits } from './spotlight-bodies'
import { useResendTimer } from '@/hooks/use-resend-timer'
import { authClient, hasAppServer } from '@/lib/auth-client'
import { useOptimisticSession } from '@/lib/session'

const OTP_LENGTH = 6

export type AccountView = 'benefits' | 'email' | 'otp'

/**
 * The optional "Keep it in sync?" step. Sign-in is a full email-OTP flow
 * inline (same auth client as /sign-in); skipping keeps everything local.
 */
export function AccountStep({
  view,
  onViewChange,
  onAdvance,
}: {
  view: AccountView
  onViewChange: (view: AccountView) => void
  onAdvance: () => void
}) {
  const { t } = useTranslation()
  const { session } = useOptimisticSession()
  const { secondsLeft, startTimer } = useResendTimer()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null)
  const [lastAutoOtp, setLastAutoOtp] = useState<string | null>(null)

  // A successful sign-in mid-flow advances to the summary.
  useEffect(() => {
    if (session && view !== 'benefits') {
      onViewChange('benefits')
      onAdvance()
    }
  }, [session, view, onAdvance, onViewChange])

  const sendOtp = useMutation({
    mutationFn: async () => {
      const value = email.trim()
      if (!value)
        throw new Error(t('signIn.emailRequired', 'Email is required'))
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: value,
        type: 'sign-in',
      })
      if (result.error)
        throw new Error(result.error.message ?? 'Failed to send OTP')
      return value
    },
    onSuccess: (value) => {
      setEmail(value)
      setOtpSentTo(value)
      setOtp('')
      setLastAutoOtp(null)
      signIn.reset()
      startTimer()
      onViewChange('otp')
    },
  })

  const signIn = useMutation({
    mutationFn: async () => {
      const verifiedEmail = (otpSentTo ?? email).trim()
      if (!verifiedEmail)
        throw new Error(t('signIn.emailRequired', 'Email is required'))
      const value = otp.trim()
      if (!value) throw new Error(t('signIn.codeRequired', 'Code is required'))
      const result = await authClient.signIn.emailOtp({
        email: verifiedEmail,
        otp: value,
      })
      if (result.error)
        throw new Error(result.error.message ?? 'Failed to sign in')
    },
  })

  // Auto-submit once 6 digits are in.
  useEffect(() => {
    if (!otpSentTo) return
    const value = otp.trim()
    if (value.length < OTP_LENGTH) {
      if (lastAutoOtp !== null) setLastAutoOtp(null)
      return
    }
    if (signIn.isPending || lastAutoOtp === value) return
    setLastAutoOtp(value)
    signIn.mutate()
  }, [otp, otpSentTo, signIn.isPending, lastAutoOtp, signIn])

  const errorMessage = signIn.isError
    ? signIn.error.message
    : sendOtp.isError
      ? sendOtp.error.message
      : null

  return (
    <div className="mx-auto mt-0.5 flex w-full max-w-[430px] flex-col gap-[15px]">
      <AccountBenefits />

      <AnimatePresence mode="wait" initial={false}>
        {view === 'benefits' && (
          <motion.div
            key="benefits"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-[9px]"
          >
            {hasAppServer && !session && (
              <Button
                size="lg"
                className="w-full"
                onClick={() => onViewChange('email')}
              >
                {t('onboarding.account.create')}
              </Button>
            )}
            {session && (
              <div className="rounded-lg border border-[color-mix(in_oklch,var(--up)_35%,var(--border))] bg-[color-mix(in_oklch,var(--up)_8%,transparent)] px-4 py-3 text-center text-sm font-medium text-foreground">
                {t('onboarding.account.signedIn', {
                  email: session.user.email,
                })}
              </div>
            )}
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={onAdvance}
            >
              {session
                ? t('onboarding.nav.continue')
                : t('onboarding.account.skip')}
            </Button>
          </motion.div>
        )}

        {view === 'email' && (
          <motion.form
            key="email"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            onSubmit={(e) => {
              e.preventDefault()
              sendOtp.mutate()
            }}
            className="flex flex-col gap-[9px]"
          >
            <Input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                if (sendOtp.isError) sendOtp.reset()
                setEmail(e.target.value)
              }}
              autoFocus
            />
            {sendOtp.isError && (
              <p className="text-center text-xs text-destructive">
                {sendOtp.error.message}
              </p>
            )}
            <Button size="lg" type="submit" disabled={sendOtp.isPending}>
              {sendOtp.isPending
                ? t('signIn.sendingCode')
                : t('signIn.continue')}
            </Button>
          </motion.form>
        )}

        {view === 'otp' && (
          <motion.div
            key="otp"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center gap-3"
          >
            <p className="text-center text-sm text-muted-foreground">
              {t('signIn.codeSent', { email: otpSentTo })}
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                signIn.mutate()
              }}
              className="flex flex-col items-center gap-3"
            >
              <InputOTP
                autoFocus
                maxLength={OTP_LENGTH}
                value={otp}
                onChange={(value) => {
                  if (signIn.isError) signIn.reset()
                  setOtp(value)
                }}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                </InputOTPGroup>
                <InputOTPSeparator className="mx-2" />
                <InputOTPGroup>
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
              {errorMessage && (
                <p className="text-center text-xs text-destructive">
                  {errorMessage}
                </p>
              )}
            </form>
            <button
              type="button"
              onClick={() => sendOtp.mutate()}
              disabled={sendOtp.isPending || secondsLeft > 0}
              className="w-full cursor-pointer text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              {secondsLeft > 0
                ? t('signIn.resendCodeTimer', { seconds: secondsLeft })
                : sendOtp.isPending
                  ? t('signIn.sendingCode')
                  : t('signIn.resendCode')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
