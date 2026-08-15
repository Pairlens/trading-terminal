// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
// ── Chart screenshots the assistant took ─────────────────────────────
//
// `take_screenshot` asked the engine for a PNG, got one, and dropped it:
// `executeCommand({type:'takeScreenshot'})` returns `{dataUrl}` and the
// client-tool dispatcher ignored every return value. The tool then told
// the user "Captured a chart screenshot", which was not true of anything
// they could see.
//
// The image cannot ride in the tool result. That result is what goes to
// the model, and half a megabyte of base64 in the context window buys
// nothing: a screenshot is for the person, not for a model that mostly
// cannot see. So the image is kept here, keyed by tool call, and the
// message renderer pairs it back up with its chip.
//
// Session-only by design. A reloaded thread shows the chip without the
// image rather than growing a store of PNGs in localStorage.

/** Enough for a long session's worth without holding megabytes of PNG. */
const MAX_ENTRIES = 12

const shots = new Map<string, string>()

export function putScreenshot(toolCallId: string, dataUrl: string): void {
  if (!toolCallId || !dataUrl.startsWith('data:image/')) return
  // Map iterates in insertion order, so the first key is the oldest.
  if (shots.size >= MAX_ENTRIES) {
    const oldest = shots.keys().next().value
    if (oldest !== undefined) shots.delete(oldest)
  }
  shots.set(toolCallId, dataUrl)
}

export function getScreenshot(toolCallId: string | undefined): string | null {
  if (!toolCallId) return null
  return shots.get(toolCallId) ?? null
}

/** Clearing the conversation should not leave its images behind. */
export function clearScreenshots(): void {
  shots.clear()
}
