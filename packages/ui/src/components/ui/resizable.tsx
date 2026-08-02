// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
'use client'

import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '../../lib/utils'

function ResizablePanelGroup({
  className,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full aria-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        'group bg-border focus-visible:ring-ring ring-offset-background relative flex w-px items-center justify-center transition-colors hover:bg-primary/50 active:bg-primary after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:outline-hidden aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-2 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90',
        className,
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border group-hover:bg-primary/70 group-active:bg-primary h-6 w-1 rounded-lg z-10 flex shrink-0 transition-[height,background-color] group-hover:h-8" />
      )}
    </ResizablePrimitive.Separator>
  )
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup }
