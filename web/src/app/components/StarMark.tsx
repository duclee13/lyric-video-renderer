import React from "react";

const STAR_POINTS =
  "20,4 24.0,14.5 35.2,15.1 26.5,22.1 29.4,32.9 20,26.8 10.6,32.9 13.5,22.1 4.8,15.1 16.0,14.5";

type StarMarkProps = {
  variant?: "solid" | "outline";
  size?: number;
  className?: string;
};

export function StarMark({
  variant = "solid",
  size = 18,
  className = "",
}: StarMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-hidden="true"
      className={className}
    >
      <polygon
        points={STAR_POINTS}
        fill={variant === "solid" ? "currentColor" : "none"}
        stroke={variant === "outline" ? "currentColor" : "none"}
        strokeWidth={variant === "outline" ? 2.6 : 0}
        strokeLinejoin="round"
      />
    </svg>
  );
}
