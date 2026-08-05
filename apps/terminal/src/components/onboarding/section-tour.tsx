// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { Suspense, useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { cn } from '@pairlens/ui'
import { AiOrb } from '@pairlens/ui/components/ui/ai-orb'
import { Button } from '@pairlens/ui/components/ui/button'

import { SECTION_TOURS } from './section-tours'
import { useSectionTour } from './use-section-tour'
import type { SectionTourId } from './section-tours'
import { lazyChunk } from '@/lib/lazy-chunk'

// Remotion (player + scenes) loads on demand — tours only appear on a
// section's first open, so the boot bundle never pays for it.
const TourMedia = lazyChunk(() => import('./spotlight-tour/tour-media'))

/**
 * First-open showcase for a section, styled after the Spotlight onboarding:
 * mono eyebrow + serif heading over a looping Remotion scene that animates
 * what the page can do. Entirely optional — backdrop click, Esc, and "Got it"
 * all dismiss it; "Don't show section tips" opts out globally. Renders
 * nothing once seen (or if the welcome onboarding hasn't finished).
 */
export function SectionTour({ sectionId }: { sectionId: SectionTourId }) {
  const { t } = useTranslation()
  const { showTour, completeTour, skipAll } = useSectionTour(sectionId)
  const reduceMotion = useReducedMotion() ?? false
  const [stepIndex, setStepIndex] = useState(0)
  const tour = SECTION_TOURS[sectionId]

  const dismiss = useCallback(() => completeTour(), [completeTour])

  useEffect(() => {
    if (!showTour) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showTour, dismiss])

  if (!showTour) return null

  const step = tour.steps[stepIndex]
  const isLast = stepIndex === tour.steps.length - 1

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={dismiss}
      role="dialog"
      aria-modal="true"
      aria-label={t(step.titleKey)}
    >
      <motion.div
        initial={
          reduceMotion ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.97 }
        }
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-[0_24px_60px_-34px_rgba(0,0,0,.85)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Media pane — looping Remotion scene */}
        <div className="relative aspect-[16/9] w-full overflow-hidden border-b border-border">
          {/* Aurora accents behind the scene, echoing the onboarding page */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="absolute -left-[10%] -top-[30%] h-[70%] w-[55%] rounded-full opacity-40 blur-[60px]"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 55%, transparent), transparent 68%)',
              }}
            />
            <div
              className="absolute -bottom-[35%] -right-[8%] h-[70%] w-[50%] rounded-full opacity-30 blur-[70px]"
              style={{
                background:
                  'radial-gradient(circle at 50% 50%, oklch(60% .2 320 / .5), transparent 68%)',
              }}
            />
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.scene}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="absolute inset-0"
            >
              <Suspense fallback={null}>
                <TourMedia scene={step.scene} reduceMotion={reduceMotion} />
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Copy + nav */}
        <div className="flex flex-col items-center gap-2.5 px-7 pb-6 pt-5 text-center">
          <div className="flex items-center gap-2">
            <AiOrb size="18px" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-primary">
              {t(tour.eyebrowKey)}
            </span>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step.titleKey}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-1.5"
            >
              <h2 className="text-balance font-serif text-[24px] font-semibold leading-[1.12] tracking-[-0.02em]">
                {t(step.titleKey)}
              </h2>
              <p className="max-w-[46ch] text-pretty text-[13.5px] leading-normal text-muted-foreground">
                {t(step.descriptionKey)}
              </p>
            </motion.div>
          </AnimatePresence>

          {tour.steps.length > 1 && (
            <div className="mt-1 flex items-center gap-1.5">
              {tour.steps.map((tourStep, i) => (
                <button
                  key={tourStep.titleKey}
                  type="button"
                  aria-label={`${i + 1} / ${tour.steps.length}`}
                  onClick={() => setStepIndex(i)}
                  className={cn(
                    'size-[7px] cursor-pointer rounded-full transition-colors',
                    i === stepIndex
                      ? 'bg-primary'
                      : 'bg-[color-mix(in_oklch,var(--muted-foreground)_38%,transparent)]',
                  )}
                />
              ))}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-center gap-2.5">
            {stepIndex > 0 && (
              <Button
                variant="ghost"
                onClick={() => setStepIndex(stepIndex - 1)}
              >
                {t('sectionTours.back')}
              </Button>
            )}
            {isLast ? (
              <Button size="lg" onClick={completeTour}>
                {t('sectionTours.gotIt')}
              </Button>
            ) : (
              <Button size="lg" onClick={() => setStepIndex(stepIndex + 1)}>
                {t('sectionTours.next')}
              </Button>
            )}
          </div>

          <button
            type="button"
            onClick={skipAll}
            className="mt-0.5 cursor-pointer text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('sectionTours.dontShowTips')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
