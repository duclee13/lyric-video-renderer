export type AspectRatio = "4:3" | "9:16" | "1:1";

export type SceneTheme = "light" | "dark";

export type WordTiming = {
  word: string;
  start: number;
  end: number;
  startFrame: number;
  endFrame: number;
};

export type SceneData = {
  id: number;
  theme: SceneTheme;
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  text: string;
  words: WordTiming[];
};

export type LyricVideoProps = {
  aspectRatio?: AspectRatio;
  audioSrc?: string;
  fps?: number;
  durationInSeconds?: number;
  durationInFrames?: number;
  sceneCount?: number;
  scenes: SceneData[];
};
