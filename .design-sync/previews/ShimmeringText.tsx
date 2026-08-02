// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
import { ShimmeringText, AiOrb } from '@pairlens/ui'

// The capture pins a fixed clock, which freezes framer-motion's opacity
// fade-in at 0 (the shimmer is invisible in a static frame). This override
// forces the resting/visible state so the screenshot matches how the
// component actually looks once animated.
const forceVisible = <style>{`.ds-shimmer span{opacity:1 !important}`}</style>

export const AnalyzingMarket = () => (
  <div
    className="ds-shimmer"
    style={{ padding: 16, fontSize: 18, fontWeight: 500 }}
  >
    {forceVisible}
    <ShimmeringText text="Analyzing market conditions…" startOnView={false} />
  </div>
)

export const CopilotThinking = () => (
  <div
    className="ds-shimmer"
    style={{
      padding: 16,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      fontSize: 20,
      fontWeight: 600,
    }}
  >
    {forceVisible}
    <AiOrb size="32px" state="thinking" />
    <ShimmeringText
      text="Co-pilot is evaluating BTC/USDT…"
      startOnView={false}
    />
  </div>
)

export const LoadingLines = () => (
  <div
    className="ds-shimmer"
    style={{ padding: 16, display: 'grid', gap: 10, fontSize: 15 }}
  >
    {forceVisible}
    <ShimmeringText
      text="Fetching order book from Coinbase…"
      startOnView={false}
    />
    <ShimmeringText text="Computing EMA / ATR signals…" startOnView={false} />
    <ShimmeringText text="Checking risk guardrails…" startOnView={false} />
  </div>
)
