// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@pairlens/ui'

// Frozen-clock safety: the open panel animates height from a CSS var; force it
// to its resting auto height so the content is visible at capture time.
const forceOpen = `
[data-slot='accordion-content'] { height: auto !important; }
[data-slot='accordion-content'] > div { height: auto !important; }
`

export const RiskGuardrails = () => (
  <div style={{ padding: 16, width: 380 }}>
    <style>{forceOpen}</style>
    <Accordion defaultValue={['risk']}>
      <AccordionItem value="risk">
        <AccordionTrigger>Risk guardrails</AccordionTrigger>
        <AccordionContent>
          <p style={{ color: 'var(--muted-foreground)' }}>
            Max position size is capped at 2% of equity per trade. Daily loss
            limit halts new entries at -5%. These limits are enforced at the
            infrastructure level and the AI co-pilot can never override them.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="signals">
        <AccordionTrigger>Signal sources</AccordionTrigger>
        <AccordionContent>
          <p>EMA cross, ATR breakout, mean reversion, regime filter.</p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="venues">
        <AccordionTrigger>Connected venues</AccordionTrigger>
        <AccordionContent>
          <p>OKX, Binance, Coinbase, Kraken.</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>
)

export const CopilotFaq = () => (
  <div style={{ padding: 16, width: 380 }}>
    <style>{forceOpen}</style>
    <Accordion defaultValue={['approve']}>
      <AccordionItem value="approve">
        <AccordionTrigger>What does APPROVE mean?</AccordionTrigger>
        <AccordionContent>
          <p style={{ color: 'var(--muted-foreground)' }}>
            The co-pilot judged the setup consistent with your strategy and risk
            profile. It is contextual analysis, not an order — you still confirm
            every trade.
          </p>
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="block">
        <AccordionTrigger>When is a trade BLOCKED?</AccordionTrigger>
        <AccordionContent>
          <p>When it would breach a configured risk guardrail.</p>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  </div>
)
