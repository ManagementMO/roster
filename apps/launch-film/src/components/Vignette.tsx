import { AbsoluteFill } from "remotion";

export const Vignette = () => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background:
        "radial-gradient(ellipse at center, transparent 42%, rgba(2,3,4,0.28) 70%, rgba(2,3,4,0.82) 100%)",
      boxShadow: "inset 0 0 180px rgba(0,0,0,0.34)",
    }}
  />
);
