// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { track } from '@/lib/analytics-events'

import { appServerHost, authClient } from '@/lib/auth-client'
import { useResendTimer } from '@/hooks/use-resend-timer'

const OTP_LENGTH = 6

/**
 * A request that never reached the App Server surfaces as the browser's own
 * transport error — "fetch failed" in Chrome, "Load failed" in WebKit — which
 * tells the user nothing about what to do. Name the host instead, so an
 * unreachable server, an offline machine, and a rejected code read as three
 * different problems.
 */
const NETWORK_ERROR_PATTERN =
  /fetch failed|failed to fetch|load failed|network ?error|networkerror/i

function describeAuthError(error: Error, fallback: string): string {
  const message = error.message?.trim()
  if (!message) return fallback
  if (!NETWORK_ERROR_PATTERN.test(message)) return message
  return `Couldn't reach ${appServerHost}. Check your connection and try again.`
}

type UseSignInFlowOptions = {
  /** Called once the OTP verifies — celebrate, navigate, close the dialog. */
  onSignedIn?: () => void
}

/**
 * The email → OTP sign-in state machine shared by /sign-in and the sign-in
 * dialog: send-code + verify mutations, resend timer, and auto-submit once
 * the sixth digit lands.
 */
export function useSignInFlow({ onSignedIn }: UseSignInFlowOptions = {}) {
  const { secondsLeft, startTimer } = useResendTimer()
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSentTo, setOtpSentTo] = useState<string | null>(null)
  const [lastAutoSubmittedOtp, setLastAutoSubmittedOtp] = useState<
    string | null
  >(null)

  const sendOtp = useMutation({
    mutationFn: async () => {
      const value = email.trim()
      if (!value) {
        throw new Error('Email is required')
      }

      const result = await authClient.emailOtp.sendVerificationOtp({
        email: value,
        type: 'sign-in',
      })

      if (result.error) {
        throw new Error(result.error.message ?? 'Failed to send OTP')
      }

      return value
    },
    onSuccess: (value) => {
      track('otp_requested')
      setEmail(value)
      setOtpSentTo(value)
      setOtp('')
      setLastAutoSubmittedOtp(null)
      signIn.reset()
      startTimer()
    },
  })

  const signIn = useMutation({
    mutationFn: async () => {
      const verifiedEmail = (otpSentTo ?? email).trim()
      if (!verifiedEmail) {
        throw new Error('Email is required')
      }

      const value = otp.trim()
      if (!value) {
        throw new Error('Verification code is required')
      }

      const result = await authClient.signIn.emailOtp({
        email: verifiedEmail,
        otp: value,
      })

      if (result.error) {
        throw new Error(result.error.message ?? 'Failed to sign in')
      }
    },
    onSuccess: () => {
      track('signed_in')
      onSignedIn?.()
    },
  })

  const isVerifyingOtp = signIn.isPending
  const triggerSignIn = signIn.mutate

  useEffect(() => {
    if (!otpSentTo) {
      return
    }

    const value = otp.trim()
    if (value.length < OTP_LENGTH) {
      if (lastAutoSubmittedOtp !== null) {
        setLastAutoSubmittedOtp(null)
      }
      return
    }

    if (isVerifyingOtp) {
      return
    }

    if (lastAutoSubmittedOtp === value) {
      return
    }

    setLastAutoSubmittedOtp(value)
    triggerSignIn()
  }, [isVerifyingOtp, lastAutoSubmittedOtp, otp, otpSentTo, triggerSignIn])

  return {
    email,
    otp,
    otpSentTo,
    errorMessage: signIn.isError
      ? describeAuthError(signIn.error, 'Failed to sign in')
      : sendOtp.isError
        ? describeAuthError(sendOtp.error, 'Failed to send OTP')
        : null,
    isSendingOtp: sendOtp.isPending,
    isVerifyingOtp,
    resendSecondsLeft: secondsLeft,
    onEmailChange: (value: string) => {
      if (sendOtp.isError) {
        sendOtp.reset()
      }
      setEmail(value)
    },
    onOtpChange: (value: string) => {
      if (signIn.isError) {
        signIn.reset()
      }
      setOtp(value)
    },
    onSendOtp: () => sendOtp.mutate(),
    onVerify: () => triggerSignIn(),
    onBack: () => {
      setOtp('')
      setOtpSentTo(null)
      setLastAutoSubmittedOtp(null)
      sendOtp.reset()
      signIn.reset()
    },
    onResend: () => sendOtp.mutate(),
    reset: () => {
      setEmail('')
      setOtp('')
      setOtpSentTo(null)
      setLastAutoSubmittedOtp(null)
      sendOtp.reset()
      signIn.reset()
    },
  }
}
