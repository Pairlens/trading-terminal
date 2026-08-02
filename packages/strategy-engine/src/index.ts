// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
export {
  computeSignals,
  computeSignalsWithRegime,
  findRecentSignal,
} from './compute'
export { detectRegime, detectRegimeWithAtr } from './regime'
export {
  ema,
  emaLast,
  emaScalar,
  atr,
  atrLast,
  atrLastN,
  volumeMa,
  volumeMaLast,
  highestHigh,
  highestHighLast,
  lowestLow,
  lowestLowLast,
} from './indicators/index'
export {
  breakoutStrategy,
  emaPullbackStrategy,
  meanReversionStrategy,
} from './strategies/index'
export type { Candle, Regime, SignalPayload } from '@pairlens/shared/types'
