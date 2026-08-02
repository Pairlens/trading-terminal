// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Remotion media for onboarding story steps. Lazily imported so the
 * welcome frame — a new user's first paint — never waits on remotion.
 */
import { Player } from '@remotion/player'

import { SCENE_FPS } from '../spotlight-tour/scenes/primitives'
import {
  STORY_SCENES,
  STORY_SCENE_HEIGHT,
  STORY_SCENE_WIDTH,
} from './story-scenes'
import type { StorySceneId } from './story-scenes'

export default function StoryMedia({ scene }: { scene: StorySceneId }) {
  const definition = STORY_SCENES[scene]
  return (
    <Player
      component={definition.component}
      durationInFrames={definition.durationInFrames}
      fps={SCENE_FPS}
      compositionWidth={STORY_SCENE_WIDTH}
      compositionHeight={STORY_SCENE_HEIGHT}
      autoPlay
      loop
      // Scenes are silent; unmuted Players stall pre-gesture on
      // AudioContext.resume() (see tour-media.tsx).
      initiallyMuted
      controls={false}
      clickToPlay={false}
      doubleClickToFullscreen={false}
      spaceKeyToPlayOrPause={false}
      acknowledgeRemotionLicense
      style={{ width: '100%', height: '100%' }}
    />
  )
}
