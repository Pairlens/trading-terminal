// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import { motion, useAnimation } from 'motion/react'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'

import { cn } from '../../lib/utils'
import type { HTMLAttributes } from 'react'
import type { Variants } from 'motion/react'

export interface BellIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface BellIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const BELL_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: (custom: number) => ({
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: {
      delay: 0.15 * custom,
      opacity: { delay: 0.1 * custom },
    },
  }),
}

const CLAPPER_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
    translateY: 0,
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    translateY: [2, 0],
    transition: {
      delay: 0.15,
      opacity: { delay: 0.1 },
      translateY: { delay: 0.15, type: 'spring', stiffness: 500, damping: 15 },
    },
  },
}

const BellIcon = forwardRef<BellIconHandle, BellIconProps>(
  ({ onMouseEnter, onMouseLeave, className, size = 28, ...props }, ref) => {
    const controls = useAnimation()
    const isControlledRef = useRef(false)

    useImperativeHandle(ref, () => {
      isControlledRef.current = true

      return {
        startAnimation: () => controls.start('animate'),
        stopAnimation: () => controls.start('normal'),
      }
    })

    const handleMouseEnter = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseEnter?.(e)
        } else {
          controls.start('animate')
        }
      },
      [controls, onMouseEnter],
    )

    const handleMouseLeave = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        if (isControlledRef.current) {
          onMouseLeave?.(e)
        } else {
          controls.start('normal')
        }
      },
      [controls, onMouseLeave],
    )

    return (
      <div
        className={cn(className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        <svg
          fill="none"
          height={size}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width={size}
          xmlns="http://www.w3.org/2000/svg"
        >
          <motion.path
            animate={controls}
            custom={0}
            d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"
            variants={BELL_VARIANTS}
          />
          <motion.path
            animate={controls}
            custom={1}
            d="M10.3 21a1.94 1.94 0 0 0 3.4 0"
            variants={CLAPPER_VARIANTS}
          />
        </svg>
      </div>
    )
  },
)

BellIcon.displayName = 'BellIcon'

export { BellIcon }
