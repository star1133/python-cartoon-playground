import React from 'react';
import type { SceneState } from './sceneReducer';
import type { TraceEvent } from '../runtime/types';
import { IsometricWorldScene } from './IsometricWorldScene';
import { NumberBoard2D } from './NumberBoard2D';

export interface AdaptiveExecutionSceneProps {
  sceneState: SceneState;
  currentEvent?: TraceEvent | null;
  sourceSnapshot?: string;
  activeLine?: number;
  isPlaying?: boolean;
  speed?: number;
  initialPhase?: 1 | 2 | 3;
}

/**
 * AdaptiveExecutionScene
 * Routes strictly:
 * - sceneState.isWorldMode === true -> IsometricWorldScene (3D high-angle / isometric scene with character movement)
 * - generic Python execution / numeric computation -> NumberBoard2D (2D front-facing readable data board with arrow-guided explanation)
 */
export const AdaptiveExecutionScene: React.FC<AdaptiveExecutionSceneProps> = ({
  sceneState,
  currentEvent,
  sourceSnapshot,
  activeLine,
  isPlaying,
  speed,
  initialPhase,
}) => {
  if (sceneState.isWorldMode) {
    return <IsometricWorldScene sceneState={sceneState} />;
  }

  return (
    <NumberBoard2D
      sceneState={sceneState}
      currentEvent={currentEvent}
      sourceSnapshot={sourceSnapshot}
      activeLine={activeLine}
      isPlaying={isPlaying}
      speed={speed}
      initialPhase={initialPhase}
    />
  );
};
