import React from "react";
import { AbsoluteFill } from "remotion";
import { THEME_PALETTE } from "../theme";
import type { SceneTheme } from "../types";

type VignetteProps = {
  theme: SceneTheme;
};

/**
 * Analog retro edge vignette + subtle warm center lens bloom overlay.
 * Pure CSS gradients keep CPU rendering fast on GitHub Actions runners.
 */
export const Vignette: React.FC<VignetteProps> = ({ theme }) => {
  const tokens = THEME_PALETTE[theme];

  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        zIndex: 20,
      }}
    >
      {/* Subtle warm central bloom */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 58% 54% at 50% 46%, ${tokens.innerGlow} 0%, rgba(0, 0, 0, 0) 100%)`,
        }}
      />

      {/* Retro dark radial edge & corner vignette */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 84% 82% at 50% 50%, ${tokens.vignetteCenter} 44%, ${tokens.vignetteMid} 74%, ${tokens.vignetteEdge} 100%)`,
        }}
      />
    </AbsoluteFill>
  );
};
