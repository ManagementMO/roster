import { COLORS } from "./colors";

export const EFFECTS = {
  panelShadow: "0 38px 110px rgba(50, 66, 98, 0.16), inset 0 2px 1px rgba(255, 255, 255, 0.96)",
  cardShadow: "0 28px 78px rgba(23, 25, 30, 0.12)",
  rosterGlow: "0 22px 74px rgba(79, 124, 255, 0.22)",
  selectionGlow: "0 22px 74px rgba(138, 99, 255, 0.18)",
  warningGlow: "0 20px 64px rgba(247, 101, 104, 0.18)",
  hairline: `2px solid ${COLORS.line}`,
} as const;
