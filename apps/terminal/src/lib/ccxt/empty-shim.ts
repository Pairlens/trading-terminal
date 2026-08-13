// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0

// Empty stand-in for Node-only modules ccxt imports lazily (undici,
// protobufjs/minimal.js). The importing code paths either never run in the
// browser or catch the missing symbols and fall back (see ccxt's
// Exchange.js fetchImplementation resolution and dydx helpers).
export default {}
