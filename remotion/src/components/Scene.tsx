import React, { useMemo } from "react";
import { AbsoluteFill, useVideoConfig } from "remotion";
import { THEME_PALETTE } from "../theme";
import type { SceneData } from "../types";
import { calculatePhraseLayout } from "../utils/layout";
import { StarEmblem } from "./StarEmblem";
import { Vignette } from "./Vignette";
import { WordReveal } from "./WordReveal";

type SceneProps = {
  scene: SceneData;
  frame: number;
  fontFamily: string;
};

/**
 * Renders one dual-tone kinetic typography phrase scene:
 * - Hard-cut radial gradient backdrop (light lavender or deep purple)
 * - Centered, continuously floating 1-3 line phrase block
 * - Sequential word accumulation with horizontal motion blur entrance
 * - Bottom-center pulsing star emblem and analog vignette overlay
 */
export const Scene: React.FC<SceneProps> = ({ scene, frame, fontFamily }) => {
  const { width, height, fps } = useVideoConfig();
  const tokens = THEME_PALETTE[scene.theme];

  const layout = useMemo(
    () => calculatePhraseLayout(scene.words, width, height),
    [scene.words, width, height]
  );

  // Continuous sinusoidal tilt (±1.4deg) and drift (±3.8px)
  const timeSec = frame / fps;
  const phase = scene.id * 1.83 + 0.55;
  const rotateDeg = Math.sin(timeSec * 1.45 + phase) * 1.4;
  const driftX = Math.sin(timeSec * 1.05 + phase * 1.27) * 3.6;
  const driftY = Math.cos(timeSec * 0.92 + phase * 0.79) * 3.6;

  // Track the most recently revealed word startFrame to pulse the bottom star
  let lastWordStartFrame: number | null = null;
  for (const w of scene.words) {
    if (frame >= w.startFrame) {
      lastWordStartFrame = w.startFrame;
    }
  }

  // Filter to lines that have at least one revealed word so visible text stays centered
  const visibleLines = layout.lines
    .map((line) => line.filter((w) => frame >= w.startFrame))
    .filter((line) => line.length > 0);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse 82% 76% at 50% 48%, ${tokens.bgCenter} 0%, ${tokens.bgEdge} 100%)`,
        overflow: "hidden",
      }}
    >
      {/* Centered floating typography container */}
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          paddingLeft: "8%",
          paddingRight: "8%",
          paddingBottom: "6%",
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: `translate3d(${driftX.toFixed(2)}px, ${driftY.toFixed(2)}px, 0) rotate(${rotateDeg.toFixed(3)}deg)`,
            fontFamily,
            fontWeight: 800,
            fontSize: layout.fontSize,
            lineHeight: 1.12,
            letterSpacing: "0.005em",
            textAlign: "center",
            userSelect: "none",
            overflow: "visible",
          }}
        >
          {visibleLines.map((lineWords, lineIdx) => (
            <div
              key={`${scene.id}-line-${lineIdx}`}
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "nowrap",
                justifyContent: "center",
                alignItems: "baseline",
                columnGap: "0.28em",
                whiteSpace: "nowrap",
                overflow: "visible",
              }}
            >
              {lineWords.map((item) => (
                <WordReveal
                  key={`${scene.id}-word-${item.wordIndex}`}
                  word={item.word}
                  wordStartFrame={item.startFrame}
                  currentFrame={frame}
                  filterId={`motion-blur-s${scene.id}-w${item.wordIndex}`}
                  color={tokens.textColor}
                  textShadow={tokens.textBloom}
                />
              ))}
            </div>
          ))}
        </div>
      </AbsoluteFill>

      <StarEmblem
        theme={scene.theme}
        frame={frame}
        fps={fps}
        sceneStartFrame={scene.startFrame}
        lastWordStartFrame={lastWordStartFrame}
        sceneId={scene.id}
        canvasMinDim={Math.min(width, height)}
      />

      <Vignette theme={scene.theme} />
    </AbsoluteFill>
  );
};
