// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// The feature dialog behind the landing's "what it is" section. A real
// @pairlens/ui Dialog (focus trap, scroll lock, Esc/scrim close and focus
// restore all come from the DS — none of it is hand-rolled here), fed by the
// Astro side over two window events: `pl:feature-open` asks it to open on an
// index, and every step it takes is echoed back as `pl:feature-sync` so the
// rail behind the dialog parks on the feature the visitor last read.
import { useCallback, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@pairlens/ui/components/ui/dialog'
import type { CSSProperties } from 'react'

export type FeatureDialogItem = {
  n: string
  name: string
  detail: string
  alt: string
  accent: string
  shot: string
}

declare global {
  interface Window {
    /** A click that landed before this island hydrated, replayed on mount. */
    __plFeaturePending?: number
  }
}

const contentStyle: CSSProperties = {
  maxWidth: 'min(1120px, 94vw)',
  width: '100%',
  padding: 0,
  gap: 0,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  borderRadius: '22px',
  background: 'var(--pl-inset)',
  maxHeight: '90vh',
  boxShadow: '0 70px 130px -50px rgba(0,0,0,.95)',
}

const arrowButtonStyle: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 48,
  height: 48,
  borderRadius: 9999,
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--foreground)',
  cursor: 'pointer',
}

function ArrowButton({
  dir,
  label,
  onClick,
}: {
  dir: -1 | 1
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={arrowButtonStyle}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
        style={{ width: 19, height: 19 }}
      >
        <path d={dir === -1 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
      </svg>
    </button>
  )
}

export default function FeatureDialog({
  features,
}: {
  features: Array<FeatureDialogItem>
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  const step = useCallback(
    (dir: number) => {
      setOpenIdx((current) => {
        if (current == null) return current
        const count = features.length
        const next = (((current + dir) % count) + count) % count
        window.dispatchEvent(
          new CustomEvent('pl:feature-sync', { detail: { index: next } }),
        )
        return next
      })
    },
    [features.length],
  )

  useEffect(() => {
    const onOpen = (event: Event) => {
      const index = (event as CustomEvent<{ index: number }>).detail?.index
      delete window.__plFeaturePending
      if (typeof index === 'number') setOpenIdx(index)
    }
    window.addEventListener('pl:feature-open', onOpen)
    if (typeof window.__plFeaturePending === 'number') {
      setOpenIdx(window.__plFeaturePending)
      delete window.__plFeaturePending
    }
    return () => window.removeEventListener('pl:feature-open', onOpen)
  }, [])

  useEffect(() => {
    if (openIdx == null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        step(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        step(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openIdx, step])

  const feature = openIdx == null ? null : features[openIdx]
  const total = String(features.length).padStart(2, '0')

  return (
    <Dialog
      open={openIdx != null}
      onOpenChange={(open) => {
        if (!open) setOpenIdx(null)
      }}
    >
      <DialogContent style={contentStyle}>
        {feature && (
          <>
            <div
              style={{
                flex: '0 1 auto',
                overflow: 'hidden',
                width: '100%',
                aspectRatio: '1608 / 1024',
                maxHeight: '56vh',
                background: '#08080a',
                borderBottom:
                  '1px solid color-mix(in oklch, var(--border) 70%, transparent)',
              }}
            >
              <img
                src={feature.shot}
                alt={feature.alt}
                style={{
                  display: 'block',
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  objectPosition: '50% 0',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 28,
                overflowY: 'auto',
                padding: '30px 34px 32px',
              }}
            >
              <div style={{ flex: '1 1 460px', minWidth: 0 }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    color: feature.accent,
                  }}
                >
                  {feature.n}
                </span>
                <DialogTitle
                  style={{
                    margin: '12px 0 0',
                    fontFamily: 'var(--font-serif)',
                    fontSize: 30,
                    fontWeight: 600,
                    lineHeight: 1.14,
                    letterSpacing: '-0.026em',
                    color: 'var(--foreground)',
                  }}
                >
                  {feature.name}
                </DialogTitle>
                <DialogDescription
                  style={{
                    margin: '14px 0 0',
                    maxWidth: '62ch',
                    fontSize: 16,
                    lineHeight: 1.72,
                    textWrap: 'pretty',
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {feature.detail}
                </DialogDescription>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: 14,
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    letterSpacing: '0.1em',
                    color:
                      'color-mix(in oklch, var(--muted-foreground) 76%, transparent)',
                  }}
                >
                  <span style={{ color: 'var(--foreground)' }}>
                    {feature.n}
                  </span>{' '}
                  / {total}
                </p>
                <div style={{ display: 'flex', gap: 10 }}>
                  <ArrowButton
                    dir={-1}
                    label="Previous feature"
                    onClick={() => step(-1)}
                  />
                  <ArrowButton
                    dir={1}
                    label="Next feature"
                    onClick={() => step(1)}
                  />
                </div>
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10.5,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color:
                      'color-mix(in oklch, var(--muted-foreground) 55%, transparent)',
                  }}
                >
                  &larr; &rarr; to browse &middot; Esc to close
                </p>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
