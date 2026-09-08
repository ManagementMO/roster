import { COLORS } from "./colors";

export const MATERIALS = {
  quietGlass: {
    background: "linear-gradient(145deg, rgba(255,255,255,0.72), rgba(243,246,252,0.48))",
    border: "2px solid rgba(255,255,255,0.92)",
    boxShadow: "0 24px 70px rgba(23,25,30,0.10), inset 0 2px 1px rgba(255,255,255,0.94)",
    backdropFilter: "blur(26px) saturate(1.18)",
  },
  candidateGlass: {
    background: "linear-gradient(145deg, rgba(255,255,255,0.84), rgba(234,239,248,0.62))",
    border: `2px solid ${COLORS.line}`,
    boxShadow: "0 28px 78px rgba(23,25,30,0.12), inset 0 2px 1px rgba(255,255,255,0.98)",
    backdropFilter: "blur(32px) saturate(1.22)",
  },
  heroGlass: {
    background: "linear-gradient(142deg, rgba(255,255,255,0.96), rgba(236,242,255,0.76) 58%, rgba(246,240,255,0.70))",
    border: "3px solid rgba(255,255,255,0.98)",
    boxShadow: "0 42px 110px rgba(50,66,98,0.18), 0 12px 34px rgba(79,124,255,0.12), inset 0 2px 1px rgba(255,255,255,1)",
    backdropFilter: "blur(38px) saturate(1.28)",
  },
} as const;

export const GLASS_RADIUS = {
  quiet: 22,
  candidate: 30,
  hero: 42,
} as const;
