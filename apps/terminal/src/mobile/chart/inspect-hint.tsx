// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The line that tells a thumb the crosshair is there — three sessions, then
 * never again.
 *
 * A press and hold is invisible by nature: no cursor to change, no hover
 * state, nothing on the chart that says a gesture exists. So the chart says it
 * out loud, in the strip above the drawing toolbar. Two things retire it: the
 * first successful hold (it is no longer news) and the third session it has
 * been shown in (nobody is going to read it on the fourth).
 *
 * The count is captured on the FIRST render and the visibility decision is
 * made against that capture, not against the live value. Incrementing during
 * the session the hint is on screen would otherwise hide it mid-look on the
 * third one.
 *
 * The pill is `pointer-events-none` on purpose. Tapping it would be the one
 * gesture that does NOT demonstrate what it describes, and it sits over the
 * chart the user is being invited to press.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Crosshair } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { usePersistedState } from '@/hooks/use-persisted-state'

/** Sessions the hint gets before it gives up. */
const HINT_SESSIONS = 3
/** Written the moment the gesture is used: past every count, forever. */
const RETIRED = 99

export type InspectHintState = {
  visible: boolean
  /** Called from the gesture that made the hint redundant. */
  retire: () => void
}

export function useInspectHint(): InspectHintState {
  const [count, setCount] = usePersistedState('mobile.chart.inspectHint', 0)
  const [used, setUsed] = useState(false)
  const onMount = useRef<number | null>(null)
  if (onMount.current === null) onMount.current = count

  // Once per mount, and the chart mounts once per mobile session. The ref
  // guard is what keeps StrictMode's double-invoke from spending two of the
  // three showings on one session.
  const counted = useRef(false)
  useEffect(() => {
    if (counted.current) return
    counted.current = true
    setCount((n) => (n >= HINT_SESSIONS ? n : n + 1))
  }, [setCount])

  const retire = useCallback(() => {
    setUsed(true)
    setCount(RETIRED)
  }, [setCount])

  return { visible: !used && onMount.current < HINT_SESSIONS, retire }
}

export const InspectHint = memo(function InspectHint() {
  const { t } = useTranslation()
  return (
    // z-31 and not `auto`: the engine's own canvases climb to z-30 inside the
    // chart wrapper, and a pill left on the default layer paints UNDER the
    // plot. 34px up clears the time axis, whose labels it would otherwise sit
    // on top of.
    <div className="pointer-events-none absolute inset-x-0 bottom-[34px] z-[31] flex justify-center">
      <span className="pl-popover flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-medium text-muted-foreground">
        <Crosshair className="size-[13px]" strokeWidth={1.8} />
        {t('mobile.chart.inspect.hint')}
      </span>
    </div>
  )
})
