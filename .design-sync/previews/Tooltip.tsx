// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  Button,
} from '@pairlens/ui'

const freeze = `
[data-slot='tooltip-content']{animation:none !important;transform:none !important;opacity:1 !important;}
`

export const RiskGuardrail = () => (
  <div
    style={{
      padding: 16,
      minHeight: 320,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <style>{freeze}</style>
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger
          render={<Button variant="outline">Max position size</Button>}
        />
        <TooltipContent side="top">
          Guardrail: single position capped at 25% of equity ($10,545)
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  </div>
)
