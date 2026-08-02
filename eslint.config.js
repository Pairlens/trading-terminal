// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
//  @ts-check

import { tanstackConfig } from '@tanstack/eslint-config'
import reactHooks from 'eslint-plugin-react-hooks'

export default [
  {
    ignores: [
      '**/routeTree.gen.ts',
      '**/.output/**',
      '**/.astro/**',
      'apps/terminal/public/_sdk/**',
      // Pyodide runtime assets staged by apps/terminal/scripts/copy-pyodide.ts
      'apps/terminal/public/_pyodide/**',
      'apps/registry/static/**',
      'apps/desktop/src-tauri/target/**',
      'apps/desktop/src-tauri/gen/**',
      // design-sync tooling + its (gitignored) build artifacts — preview
      // fixtures and scripts that live outside every package tsconfig.
      '.design-sync/**',
      'ds-bundle/**',
      'packages/ui/.ds-tmp/**',
      'documents/**',
      // Design handoff bundles: HTML prototypes + prototype runtime, reference
      // material only — never production code.
      'design_handoff*/**',
      '.gitnexus/**',
      '.claude/**',
      '.agents/**',
    ],
  },
  ...tanstackConfig,
  {
    // The tanstack preset uses `project: true` (nearest-tsconfig lookup),
    // which can't parse files outside any package tsconfig `include` —
    // scripts, config files, and test files (tests are excluded from the
    // package tsconfigs). tsconfig.eslint.json covers the whole repo for
    // linting purposes only.
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.tsx', '**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Hook-call placement bugs are unconditional correctness errors.
      'react-hooks/rules-of-hooks': 'error',
      // Deliberately off: this codebase's render-perf invariants rely on
      // intentionally omitted deps (per-tick values flow through refs, not
      // effect re-runs). The intentional omissions are documented with
      // comments at each hook site.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    rules: {
      // Deliberately off: exchange/aggregator data is typed optimistically,
      // and in a real-money terminal the "unnecessary" runtime guards this
      // rule wants removed are intentional defense in depth.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Deliberately off: plugin capability handlers and adapter interfaces
      // are promise-shaped by contract, so async-without-await is the
      // required implementation shape here, not an accident.
      '@typescript-eslint/require-await': 'off',
    },
  },
]
