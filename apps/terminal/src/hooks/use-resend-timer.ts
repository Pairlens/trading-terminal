// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'

const COOLDOWN_SECONDS = 30

export function useResendTimer() {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => {
    return () => clearInterval(intervalRef.current)
  }, [])

  const startTimer = useCallback(() => {
    setSecondsLeft(COOLDOWN_SECONDS)
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }, [])

  return { secondsLeft, canResend: secondsLeft === 0, startTimer }
}
