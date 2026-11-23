import type { AspectRatio, SceneTheme } from "./types";

export const DEFAULT_FPS = 30;
export const DEFAULT_ASPECT_RATIO: AspectRatio = "4:3";

export const ASPECT_RATIO_PRESETS: Record<
  AspectRatio,
  { width: number; height: number }
> = {
  "4:3": { width: 1080, height: 810 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
};

export type ThemeTokens = {
  bgCenter: string;
  bgEdge: string;
  textColor: string;
  textBloom: string;
  starFill: string;
  starStroke: string;
  starGlow: string;
  vignetteCenter: string;
  vignetteMid: string;
  vignetteEdge: string;
  innerGlow: string;
};

export const THEME_PALETTE: Record<SceneTheme, ThemeTokens> = {
  light: {
    bgCenter: "#D29BFF",
    bgEdge: "#B476E8",
    textColor: "#2B084A",
    textBloom:
      "0 0 10px rgba(43, 8, 74, 0.22), 0 0 24px rgba(180, 118, 232, 0.35)",
    starFill: "#2B084A",
    starStroke: "none",
    starGlow: "drop-shadow(0 0 5px rgba(43, 8, 74, 0.28))",
    vignetteCenter: "rgba(43, 8, 74, 0)",
    vignetteMid: "rgba(43, 8, 74, 0.14)",
    vignetteEdge: "rgba(28, 4, 52, 0.56)",
    innerGlow: "rgba(255, 235, 255, 0.10)",
  },
  dark: {
    bgCenter: "#2B084A",
    bgEdge: "#1F0536",
    textColor: "#C98BF5",
    textBloom:
      "0 0 8px rgba(201, 139, 245, 0.26), 0 0 22px rgba(201, 139, 245, 0.12)",
    starFill: "none",
    starStroke: "#C98BF5",
    starGlow: "drop-shadow(0 0 7px rgba(201, 139, 245, 0.42))",
    vignetteCenter: "rgba(8, 1, 18, 0)",
    vignetteMid: "rgba(8, 1, 18, 0.22)",
    vignetteEdge: "rgba(5, 0, 12, 0.76)",
    innerGlow: "rgba(180, 118, 232, 0.06)",
  },
};
