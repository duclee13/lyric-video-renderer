import React from "react";
import { loadFont } from "@remotion/google-fonts/Montserrat";
import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { Scene } from "./components/Scene";
import { StarEmblem } from "./components/StarEmblem";
import { Vignette } from "./components/Vignette";
import { THEME_PALETTE } from "./theme";
import type { LyricVideoProps, SceneData } from "./types";

const { fontFamily } = loadFont("normal", {
  weights: ["800", "900"],
  subsets: ["latin", "latin-ext", "vietnamese"],
});

function resolveAudioSource(audioSrc?: string): string | null {
  if (!audioSrc || !audioSrc.trim()) {
    return null;
  }
  const trimmed = audioSrc.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }
  return staticFile(trimmed.replace(/^\/+/, ""));
}

function findActiveScene(
  scenes: SceneData[],
  frame: number
): SceneData | null {
  if (scenes.length === 0) {
    return null;
  }
  if (frame < scenes[0].startFrame) {
    return null;
  }
  for (const scene of scenes) {
    if (frame >= scene.startFrame && frame < scene.endFrame) {
      return scene;
    }
  }
  return scenes[scenes.length - 1];
}

/**
 * Top-level Remotion composition rendering the audio track alongside
 * hard-cut alternating kinetic typography scenes.
 */
export const LyricVideo: React.FC<LyricVideoProps> = ({
  audioSrc,
  scenes,
}) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();

  const resolvedAudio = resolveAudioSource(audioSrc);
  const activeScene = findActiveScene(scenes, frame);
  const darkTokens = THEME_PALETTE.dark;

  return (
    <AbsoluteFill style={{ backgroundColor: darkTokens.bgEdge }}>
      {resolvedAudio && <Audio src={resolvedAudio} />}

      {activeScene ? (
        <Scene scene={activeScene} frame={frame} fontFamily={fontFamily} />
      ) : (
        /* Ambient dark intro/empty canvas before first phrase hard-cuts to light */
        <AbsoluteFill
          style={{
            background: `radial-gradient(ellipse 82% 76% at 50% 48%, ${darkTokens.bgCenter} 0%, ${darkTokens.bgEdge} 100%)`,
          }}
        >
          <StarEmblem
            theme="dark"
            frame={frame}
            fps={fps}
            sceneStartFrame={0}
            lastWordStartFrame={null}
            sceneId={-1}
            canvasMinDim={Math.min(width, height)}
          />
          <Vignette theme="dark" />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
