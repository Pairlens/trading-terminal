// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * The panel a section shows before the user has made anything.
 *
 * Two jobs, in order: say what the feature is for in one breath, then hand
 * over something to click. A blank canvas with a "create one" button asks the
 * user to invent the first example; a shelf of starter templates hands them a
 * working one to take apart, which is how people actually learn a builder.
 *
 * Styled after the Spotlight onboarding — mono eyebrow, serif heading, aurora
 * wash behind — so the first thing a section says looks like the tour that
 * just finished saying it.
 */
import { cn } from '@pairlens/ui'
import { Button } from '@pairlens/ui/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@pairlens/ui/components/ui/empty'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@pairlens/ui/components/ui/item'

import type { LucideIcon } from 'lucide-react'

export type StarterTemplate = {
  id: string
  title: string
  description: string
  icon: LucideIcon
  /** The flow in three or four words per chip — the shape, before the click. */
  chips: Array<string>
}

type StarterEmptyStateProps = {
  /** Mono kicker above the heading. */
  eyebrow: string
  title: string
  description: string
  icon: LucideIcon
  templates: Array<StarterTemplate>
  onPickTemplate: (template: StarterTemplate) => void
  /** Label for the "skip the templates" escape hatch. */
  blankLabel: string
  onCreateBlank: () => void
  /** One line of small print under the shelf — caveats, where things run. */
  footnote?: string
}

export function StarterEmptyState({
  eyebrow,
  title,
  description,
  icon: Icon,
  templates,
  onPickTemplate,
  blankLabel,
  onCreateBlank,
  footnote,
}: StarterEmptyStateProps) {
  return (
    <div className="relative flex min-w-0 flex-1 overflow-y-auto">
      {/* Aurora wash, echoing the onboarding page. Purely decorative. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute -left-[8%] -top-[18%] h-[55%] w-[45%] rounded-full opacity-25 blur-[80px]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, color-mix(in oklch, var(--primary) 55%, transparent), transparent 68%)',
          }}
        />
        <div
          className="absolute -bottom-[25%] -right-[6%] h-[55%] w-[42%] rounded-full opacity-20 blur-[90px]"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, oklch(60% .2 320 / .5), transparent 68%)',
          }}
        />
      </div>

      {/* `min-h-full` + `justify-center`: centred when it fits, top-anchored
          and scrollable when it doesn't. Plain `justify-center` inside a
          scroll container clips the top of tall content out of reach. */}
      <div className="relative mx-auto flex min-h-full w-full max-w-[720px] flex-col justify-center px-6 py-10">
        <Empty className="border-none p-0">
          <EmptyHeader className="max-w-none">
            <EmptyMedia
              variant="icon"
              className="size-9 rounded-xl bg-primary/12 text-primary"
            >
              <Icon className="size-[18px]" />
            </EmptyMedia>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.22em] text-primary">
              {eyebrow}
            </span>
            <EmptyTitle className="text-balance font-serif text-[23px] font-semibold leading-[1.14] tracking-[-0.02em]">
              {title}
            </EmptyTitle>
            <EmptyDescription className="max-w-[54ch] text-pretty text-[13.5px]">
              {description}
            </EmptyDescription>
          </EmptyHeader>

          <EmptyContent className="max-w-none gap-3">
            <div className="flex w-full items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                Start from a template
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="grid w-full gap-2 sm:grid-cols-2">
              {templates.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onPick={() => onPickTemplate(template)}
                />
              ))}
            </div>

            <Button variant="ghost" size="sm" onClick={onCreateBlank}>
              {blankLabel}
            </Button>

            {footnote && (
              <p className="max-w-[60ch] text-center text-[11px] leading-relaxed text-muted-foreground">
                {footnote}
              </p>
            )}
          </EmptyContent>
        </Empty>
      </div>
    </div>
  )
}

function TemplateCard({
  template,
  onPick,
}: {
  template: StarterTemplate
  onPick: () => void
}) {
  const Icon = template.icon
  return (
    <Item
      variant="outline"
      size="sm"
      className={cn(
        'h-full cursor-pointer items-start text-left transition-colors',
        'hover:border-primary/45 hover:bg-primary/[0.04]',
      )}
      render={<button type="button" onClick={onPick} />}
    >
      <ItemMedia
        variant="icon"
        className="mt-0.5 size-7 rounded-lg bg-muted text-muted-foreground"
      >
        <Icon className="size-3.5" />
      </ItemMedia>
      <ItemContent className="gap-1.5">
        <ItemTitle className="text-[13px]">{template.title}</ItemTitle>
        <ItemDescription className="text-[11.5px] leading-snug">
          {template.description}
        </ItemDescription>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {template.chips.map((chip) => (
            <span
              key={chip}
              className="rounded border border-border/70 bg-muted/50 px-1.5 py-px font-mono text-[9.5px] uppercase tracking-wide text-muted-foreground"
            >
              {chip}
            </span>
          ))}
        </div>
      </ItemContent>
    </Item>
  )
}
