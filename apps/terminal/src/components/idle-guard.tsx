// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'

import { useMarketData } from '@/lib/market-data-provider'
import { usePersistedState } from '@/hooks/use-persisted-state'

const IDLE_TIMEOUT_MS = 60 * 60 * 1000 // 1 hour
const ACTIVITY_THROTTLE_MS = 30_000 // reset timer at most every 30s

const ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
  'touchstart',
] as const

// Persistence contract shared with the desktop menu's synced accessor.
export const IDLE_GUARD_KEY = 'idle-guard-enabled'
export const IDLE_GUARD_DEFAULT = false

export function useIdleGuardEnabled() {
  return usePersistedState<boolean>(IDLE_GUARD_KEY, IDLE_GUARD_DEFAULT)
}

export function IdleGuard() {
  const { t } = useTranslation()
  const { pauseStreams, resumeStreams } = useMarketData()
  const [enabled] = useIdleGuardEnabled()
  const [isIdle, setIsIdle] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idleRef = useRef(false)
  const lastActivityRef = useRef(Date.now())

  const startTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!enabled) return
    timerRef.current = setTimeout(() => {
      idleRef.current = true
      setIsIdle(true)
      pauseStreams()
    }, IDLE_TIMEOUT_MS)
  }, [pauseStreams, enabled])

  const handleReconnect = useCallback(() => {
    idleRef.current = false
    setIsIdle(false)
    resumeStreams()
    lastActivityRef.current = Date.now()
    startTimer()
  }, [resumeStreams, startTimer])

  useEffect(() => {
    if (!enabled) {
      // If disabled while idle, resume immediately
      if (idleRef.current) {
        handleReconnect()
      }
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    const onActivity = () => {
      if (idleRef.current) return
      const now = Date.now()
      if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return
      lastActivityRef.current = now
      startTimer()
    }

    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, onActivity, { passive: true })
    }
    startTimer()

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        document.removeEventListener(event, onActivity)
      }
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [startTimer, enabled, handleReconnect])

  if (!isIdle) return null

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) handleReconnect()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>{t('idle.title')}</DialogTitle>
        <DialogDescription>{t('idle.description')}</DialogDescription>
        <Button onClick={handleReconnect} className="w-full">
          <RefreshCw className="size-4" />
          {t('idle.reconnect')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
