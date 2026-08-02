// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** PostHog project key — analytics is fully disabled when unset. */
  readonly PUBLIC_POSTHOG_KEY?: string
  /** PostHog ingest host, defaults to https://us.i.posthog.com. */
  readonly PUBLIC_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
