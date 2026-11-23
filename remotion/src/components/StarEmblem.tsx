import React from "react";
import { Easing, interpolate } from "remotion";
import { THEME_PALETTE } from "../theme";
import type { SceneTheme } from "../types";

type StarEmblemProps = {
  theme: SceneTheme;
  frame: number;
  fps: number;
  sceneStartFrame: number;
  lastWordStartFrame: number | null;
  sceneId: number;
  canvasMinDim: number;
};

// Classic 5-pointed star centered in 40x40 viewBox (outerR=16, innerR=6.8)
const STAR_POINTS =
  "20,4 24.0,14.5 35.2,15.1 26.5,22.1 29.4,32.9 20,26.8 10.6,32.9 13.5,22.1 4.8,15.1 16.0,14.5";

/**
 * Bottom-center 5-pointed star emblem.
 * Solid dark purple on light scenes; lavender outline on dark scenes.
 * Pulses subtly on phrase and word transitions with gentle organic rock.
 */
export const StarEmblem: React.FC<StarEmblemProps> = ({
  theme,
  frame,
  fps,
  sceneStartFrame,
  lastWordStartFrame,
  sceneId,
  canvasMinDim,
}) => {
  const tokens = THEME_PALETTE[theme];
  const timeSec = frame / fps;

  // Phrase transition pulse (1.28 -> 1.0 over 8 frames)
  const framesSinceScene = Math.max(0, frame - sceneStartFrame);
  const phrasePulse = interpolate(framesSinceScene, [0, 8], [1.28, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Word reveal micro-pulse (1.13 -> 1.0 over 5 frames)
  const wordPulse =
    lastWordStartFrame !== null && frame >= lastWordStartFrame
      ? interpolate(frame - lastWordStartFrame, [0, 5], [1.13, 1.0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.quad),
        })
      : 1.0;

  // Subtle idle breathing + tilt
  const idleScale = 1 + Math.sin(timeSec * 2.2 + sceneId * 1.1) * 0.025;
  const scale = Math.max(phrasePulse, wordPulse) * idleScale;
  const rotateDeg = Math.sin(timeSec * 1.25 + sceneId * 1.9 + 0.4) * 5.0;

  // Proportional refined size (~32px on 1080x810, ~38px on 1080x1080/1920)
  const size = Math.round(Math.max(28, Math.min(44, canvasMinDim * 0.039)));

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "7%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        pointerEvents: "none",
        zIndex: 15,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        style={{
          transform: `scale(${scale.toFixed(4)}) rotate(${rotateDeg.toFixed(2)}deg)`,
          filter: tokens.starGlow,
          overflow: "visible",
        }}
      >
        <polygon
          points={STAR_POINTS}
          fill={tokens.starFill}
          stroke={tokens.starStroke}
          strokeWidth={theme === "dark" ? 2.3 : 0}
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
