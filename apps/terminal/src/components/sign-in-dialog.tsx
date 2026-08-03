// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import type { SignInPhase } from '@/components/sign-in-experience'
import { SignInExperience } from '@/components/sign-in-experience'
import { SignInStatueScene } from '@/components/sign-in-statue'
import { useOptimisticSession } from '@/lib/session'
import { useSignInFlow } from '@/hooks/use-sign-in-flow'

// Success splash beat before the dialog closes — a touch quicker than the
// full page's since the user is mid-task.
const SPLASH_MS = 1600

type SignInDialogProps = {
  children: React.ReactNode
}

export function SignInDialog({ children }: SignInDialogProps) {
  const [open, setOpen] = useState(false)
  const { session } = useOptimisticSession()
  const reduceMotion = useReducedMotion() ?? false
  // A fresh sign-in holds the dialog for a "You're in." beat before closing.
  const [celebrating, setCelebrating] = useState(false)
  const splashTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const flow = useSignInFlow({
    onSignedIn: () => {
      setCelebrating(true)
      splashTimerRef.current = setTimeout(
        () => setOpen(false),
        reduceMotion ? 400 : SPLASH_MS,
      )
    },
  })

  useEffect(() => () => clearTimeout(splashTimerRef.current), [])

  // Signed in from elsewhere (another tab, /sign-in) — close without a splash.
  useEffect(() => {
    if (session && open && !celebrating) {
      setOpen(false)
    }
  }, [session, open, celebrating])

  const openFresh = () => {
    clearTimeout(splashTimerRef.current)
    setCelebrating(false)
    flow.reset()
    setOpen(true)
  }

  const phase: SignInPhase = celebrating
    ? 'success'
    : flow.otpSentTo
      ? 'otp'
      : 'email'

  return (
    <>
      <span onClick={openFresh}>{children}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="gap-0 overflow-clip p-0 sm:max-w-md md:max-w-[760px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Sign in</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in to access this feature
          </DialogDescription>
          {/* Statue band + form: the /sign-in page composition at dialog
              scale. The statue column only appears at md+; mobile keeps the
              single-column form. */}
          <div className="relative grid md:grid-cols-[280px_1fr]">
            <SignInStatueScene className="hidden md:block" />
            <SignInExperience
              variant="dialog"
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
              onSkip={() => setOpen(false)}
            />
            {/* Seam blend — melts the statue band into the form's background.
                Outside the scene's `dark` scope so it targets the actual
                (theme-aware) form background. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-[280px] hidden w-20 -translate-x-full bg-gradient-to-r from-transparent to-background md:block"
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
