// Copyright (c) 2026 Juan Ignacio Molina Estrada
// SPDX-License-Identifier: FSL-1.1-Apache-2.0
/**
 * Remotion media pane for section tours. Loaded lazily (this module pulls in
 * remotion + @remotion/player) so tours never weigh on terminal boot.
 */
import { Player } from '@remotion/player'

import { SCENES } from './scenes/scenes'
import { SCENE_FPS, SCENE_HEIGHT, SCENE_WIDTH } from './scenes/primitives'
import type { SectionTourSceneId } from '../section-tours'

export default function TourMedia({
  scene,
  reduceMotion,
}: {
  scene: SectionTourSceneId
  reduceMotion: boolean
}) {
  const definition = SCENES[scene]
  return (
    <Player
      component={definition.component}
      durationInFrames={definition.durationInFrames}
      fps={SCENE_FPS}
      compositionWidth={SCENE_WIDTH}
      compositionHeight={SCENE_HEIGHT}
      autoPlay={!reduceMotion}
      // Reduced motion: hold the finished composition as a still.
      initialFrame={reduceMotion ? definition.durationInFrames - 1 : 0}
      loop
      // Scenes are silent; muting also keeps the frame loop off the shared
      // AudioContext, which browsers refuse to resume before a user gesture —
      // an unmuted Player would stall at frame 0 when auto-opened.
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
