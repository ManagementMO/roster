export type SceneProps = {
  readonly durationInFrames: number;
  readonly frameOffset?: number;
  readonly worldFrameOffset?: number;
  readonly format?: "wide" | "square";
};
