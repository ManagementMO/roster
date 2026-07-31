/**
 * Scene shell.
 *
 * Every scene's content group is wrapped in this. It owns the arrival/departure
 * envelope and the camera transform, so no scene re-implements its own fade and
 * two scenes can never disagree about how long a handoff takes.
 */
import type React from "react";
import type { CSSProperties } from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { type CameraState, cameraStyle, NEUTRAL } from "../motion/camera";
import { sceneEnvelope } from "../motion/transitions";

export const SceneShell: React.FC<{
  duration: number;
  children: React.ReactNode;
  camera?: CameraState;
  /** Parallax plane, 0 = focal. */
  depth?: number;
  style?: CSSProperties;
}> = ({ duration, children, camera = NEUTRAL, depth = 0, style }) => {
  const frame = useCurrentFrame();
  const env = sceneEnvelope(frame, duration);
  const cam = cameraStyle(camera, depth);

  return (
    <AbsoluteFill
      style={{
        opacity: env.opacity,
        filter: env.blur > 0.15 ? `blur(${env.blur.toFixed(2)}px)` : undefined,
        ...style,
      }}
    >
      <AbsoluteFill
        style={{
          ...cam,
          scale: (cam.scale as number) * env.scale,
          translate: `${cam.translate?.toString().split(" ")[0] ?? "0px"} calc(${cam.translate?.toString().split(" ")[1] ?? "0px"} + ${env.lift.toFixed(2)}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * A text column anchored to the editorial grid. Used by six scenes; having it
 * here is why the copy in those scenes lands on the same baseline every time.
 */
export const TextColumn: React.FC<{
  x: number;
  y: number;
  width?: number;
  gap?: number;
  align?: "flex-start" | "center";
  children: React.ReactNode;
}> = ({ x, y, width = 620, gap = 18, align = "flex-start", children }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width,
      display: "flex",
      flexDirection: "column",
      alignItems: align,
      gap,
    }}
  >
    {children}
  </div>
);
