// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import { motion, useAnimation } from 'motion/react'
import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'

import { cn } from '../../lib/utils'
import type { HTMLAttributes } from 'react'
import type { Transition, Variants } from 'motion/react'

export interface WorkflowIconHandle {
  startAnimation: () => void
  stopAnimation: () => void
}

interface WorkflowIconProps extends HTMLAttributes<HTMLDivElement> {
  size?: number
}

const TRANSITION: Transition = {
  duration: 0.3,
  opacity: { duration: 0.15 },
}

const FIRST_RECT_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { ...TRANSITION, delay: 0 },
  },
}

const PATH_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { ...TRANSITION, delay: 0.2 },
  },
}

const SECOND_RECT_VARIANTS: Variants = {
  normal: {
    pathLength: 1,
    opacity: 1,
  },
  animate: {
    pathLength: [0, 1],
    opacity: [0, 1],
    transition: { ...TRANSITION, delay: 0.4 },
  },
}

const WorkflowIcon = forwardRef<WorkflowIconHandle, WorkflowIconProps>(
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
          {/* Top-left box */}
          <motion.rect
            animate={controls}
            x="3"
            y="3"
            width="8"
            height="8"
            rx="2"
            variants={FIRST_RECT_VARIANTS}
          />
          {/* Connector path */}
          <motion.path
            animate={controls}
            d="M7 11v4a2 2 0 0 0 2 2h4"
            variants={PATH_VARIANTS}
          />
          {/* Bottom-right box */}
          <motion.rect
            animate={controls}
            x="13"
            y="13"
            width="8"
            height="8"
            rx="2"
            variants={SECOND_RECT_VARIANTS}
          />
        </svg>
      </div>
    )
  },
)

WorkflowIcon.displayName = 'WorkflowIcon'

export { WorkflowIcon }
