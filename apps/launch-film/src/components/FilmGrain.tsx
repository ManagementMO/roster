import { AbsoluteFill, useCurrentFrame } from "remotion";

export const FilmGrain = () => {
  const frame = useCurrentFrame();
  const step = frame % 8;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        opacity: 0.105,
        mixBlendMode: "soft-light",
        backgroundImage:
          "repeating-linear-gradient(0deg, rgba(255,255,255,0.12) 0px, rgba(255,255,255,0.12) 1px, transparent 1px, transparent 3px), repeating-linear-gradient(90deg, rgba(255,255,255,0.055) 0px, transparent 1px, transparent 4px)",
        backgroundSize: `${5 + (step % 3)}px ${7 + (step % 2)}px`,
        translate: `${(step * 7) % 13}px ${(step * 11) % 17}px`,
      }}
    />
  );
};
