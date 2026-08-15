// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ChevronDown, GraduationCap, Scale, Terminal } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@pairlens/ui/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pairlens/ui/components/ui/dropdown-menu'

export type Persona = 'mentor' | 'balanced' | 'technical'

export const PERSONA_OPTIONS: Array<{
  value: Persona
  labelKey: string
  descriptionKey: string
  icon: typeof GraduationCap
}> = [
  {
    value: 'mentor',
    labelKey: 'copilot.persona.mentor',
    descriptionKey: 'copilot.persona.mentorDescription',
    icon: GraduationCap,
  },
  {
    value: 'balanced',
    labelKey: 'copilot.persona.balanced',
    descriptionKey: 'copilot.persona.balancedDescription',
    icon: Scale,
  },
  {
    value: 'technical',
    labelKey: 'copilot.persona.technical',
    descriptionKey: 'copilot.persona.technicalDescription',
    icon: Terminal,
  },
]

type PersonaMenuProps = {
  persona: Persona
  onPersonaChange: (persona: Persona) => void
  align?: 'start' | 'center' | 'end'
}

export function PersonaMenu({
  persona,
  onPersonaChange,
  align = 'end',
}: PersonaMenuProps) {
  const { t } = useTranslation()
  const activePersona =
    PERSONA_OPTIONS.find((o) => o.value === persona) ?? PERSONA_OPTIONS[1]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            className="ai-tile text-muted-foreground hover:text-foreground h-7 gap-1 rounded-full px-2.5 text-[11px]"
          />
        }
      >
        <activePersona.icon className="size-3" />
        {t(activePersona.labelKey)}
        <ChevronDown className="size-2.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('copilot.lensPersona')}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup
          value={persona}
          onValueChange={(v) => onPersonaChange(v as Persona)}
        >
          {PERSONA_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <option.icon className="size-4 shrink-0" />
              <div className="min-w-0">
                <p>{t(option.labelKey)}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t(option.descriptionKey)}
                </p>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
