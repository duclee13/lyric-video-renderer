import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { LyricVideo } from "./LyricVideo";
import {
  ASPECT_RATIO_PRESETS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_FPS,
} from "./theme";
import type { AspectRatio, LyricVideoProps } from "./types";

const DEMO_PROPS: LyricVideoProps = {
  aspectRatio: DEFAULT_ASPECT_RATIO,
  audioSrc: "",
  fps: DEFAULT_FPS,
  durationInFrames: 150,
  scenes: [
    {
      id: 0,
      theme: "light",
      startFrame: 0,
      endFrame: 75,
      startTime: 0,
      endTime: 2.5,
      text: "WE'LL DRINK HENNY BY THE OCEAN",
      words: [
        { word: "WE'LL", start: 0.0, end: 0.3, startFrame: 0, endFrame: 9 },
        { word: "DRINK", start: 0.3, end: 0.65, startFrame: 9, endFrame: 20 },
        { word: "HENNY", start: 0.65, end: 1.05, startFrame: 20, endFrame: 32 },
        { word: "BY", start: 1.05, end: 1.25, startFrame: 32, endFrame: 38 },
        { word: "THE", start: 1.25, end: 1.45, startFrame: 38, endFrame: 44 },
        { word: "OCEAN", start: 1.45, end: 2.3, startFrame: 44, endFrame: 69 },
      ],
    },
    {
      id: 1,
      theme: "dark",
      startFrame: 75,
      endFrame: 150,
      startTime: 2.5,
      endTime: 5.0,
      text: "ĐÊM NAY MÌNH CÙNG NHAU CHÁY HẾT",
      words: [
        { word: "ĐÊM", start: 2.5, end: 2.8, startFrame: 75, endFrame: 84 },
        { word: "NAY", start: 2.8, end: 3.1, startFrame: 84, endFrame: 93 },
        { word: "MÌNH", start: 3.1, end: 3.4, startFrame: 93, endFrame: 102 },
        { word: "CÙNG", start: 3.4, end: 3.7, startFrame: 102, endFrame: 111 },
        { word: "NHAU", start: 3.7, end: 4.05, startFrame: 111, endFrame: 122 },
        { word: "CHÁY", start: 4.05, end: 4.4, startFrame: 122, endFrame: 132 },
        { word: "HẾT", start: 4.4, end: 4.9, startFrame: 132, endFrame: 147 },
      ],
    },
  ],
};

const calculateMetadata: CalculateMetadataFunction<LyricVideoProps> = ({
  props,
}) => {
  const ratio: AspectRatio =
    props.aspectRatio && props.aspectRatio in ASPECT_RATIO_PRESETS
      ? props.aspectRatio
      : DEFAULT_ASPECT_RATIO;
  const preset = ASPECT_RATIO_PRESETS[ratio];
  const fps = props.fps && props.fps > 0 ? props.fps : DEFAULT_FPS;

  const lastSceneEnd =
    props.scenes && props.scenes.length > 0
      ? props.scenes[props.scenes.length - 1].endFrame
      : fps * 5;

  const durationInFrames = Math.max(
    1,
    Math.round(
      props.durationInFrames && props.durationInFrames > 0
        ? props.durationInFrames
        : lastSceneEnd
    )
  );

  return {
    width: preset.width,
    height: preset.height,
    fps,
    durationInFrames,
  };
};

export const RemotionRoot: React.FC = () => {
  const defaultPreset = ASPECT_RATIO_PRESETS[DEFAULT_ASPECT_RATIO];

  return (
    <Composition
      id="LyricVideo"
      component={LyricVideo}
      durationInFrames={DEMO_PROPS.durationInFrames ?? 150}
      fps={DEFAULT_FPS}
      width={defaultPreset.width}
      height={defaultPreset.height}
      defaultProps={DEMO_PROPS}
      calculateMetadata={calculateMetadata}
    />
  );
};
