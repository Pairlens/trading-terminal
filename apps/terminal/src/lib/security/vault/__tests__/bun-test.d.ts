// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// `test-globals.ts` is the one file under __tests__ the app typecheck still
// covers (the tsconfig excludes only `*.test.ts`), and the app compiles
// against `vite/client` types, not bun's. Declaring the single hook that
// helper uses keeps it in the typecheck without adding bun-types to an app
// that otherwise never imports bun. Runtime resolution is bun's own.
declare module 'bun:test' {
  export function afterAll(fn: () => void | Promise<void>): void
}
