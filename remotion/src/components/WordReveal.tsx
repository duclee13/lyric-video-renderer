import React from "react";
import { Easing, interpolate } from "remotion";

type WordRevealProps = {
  word: string;
  wordStartFrame: number;
  currentFrame: number;
  filterId: string;
  color: string;
  textShadow: string;
};

const BLUR_FRAMES = 4;
const OPACITY_FRAMES = 3;

/**
 * Kinetic word entrance with directional horizontal motion blur
 * (SVG feGaussianBlur stdDeviation="16 0" -> "0 0" over 4 frames),
 * horizontal stretch pop (scaleX 1.15 -> 1.0), and fast opacity fade-in.
 */
export const WordReveal: React.FC<WordRevealProps> = ({
  word,
  wordStartFrame,
  currentFrame,
  filterId,
  color,
  textShadow,
}) => {
  const localFrame = currentFrame - wordStartFrame;
  if (localFrame < 0) {
    return null;
  }

  // Directional horizontal motion blur: 16 -> 0 over 4 frames
  const blurX = interpolate(localFrame, [0, BLUR_FRAMES], [16, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.quad),
  });

  // Subtle horizontal stretch/pop: 1.15 -> 1.0 over 4 frames
  const scaleX = interpolate(localFrame, [0, BLUR_FRAMES], [1.15, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Fast entrance fade (0 when unmounted at -1, ~0.58 on frame 0 so the
  // full 16px horizontal blur streak is immediately visible, 1.0 by frame 3)
  const opacity = interpolate(localFrame, [-1, OPACITY_FRAMES], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  const isBlurring = blurX > 0.15;

  return (
    <span
      style={{
        display: "inline-block",
        position: "relative",
        overflow: "visible",
      }}
    >
      {/* Mount SVG filter only during the active 4-frame blur window */}
      {isBlurring && (
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            width: 0,
            height: 0,
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          <defs>
            <filter
              id={filterId}
              x="-50%"
              y="-35%"
              width="200%"
              height="170%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation={`${blurX.toFixed(2)} 0`}
              />
            </filter>
          </defs>
        </svg>
      )}

      <span
        style={{
          display: "inline-block",
          color,
          textShadow,
          opacity,
          transform: `scaleX(${scaleX.toFixed(4)})`,
          transformOrigin: "center center",
          filter: isBlurring ? `url(#${filterId})` : undefined,
          willChange: isBlurring ? "transform, opacity, filter" : undefined,
        }}
      >
        {word.toLocaleUpperCase("vi")}
      </span>
    </span>
  );
};
