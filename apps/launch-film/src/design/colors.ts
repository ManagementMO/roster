export const COLORS = {
  background: "#F7F6F2",
  backgroundRaised: "#FFFFFF",
  backgroundSoft: "#EEEDE9",
  surface: "#FFFFFF",
  surfaceBright: "#FFFFFF",
  line: "#D9DDE4",
  lineBright: "#B8C0CC",
  text: "#17191E",
  textSecondary: "#606977",
  textFaint: "#939CAA",
  roster: "#4F7CFF",
  selection: "#8A63FF",
  warning: "#F76568",
  warm: "#5BCBFF",
  gold: "#ECA940",
  success: "#34C98D",
  glass: "rgba(255,255,255,0.68)",
  glassStrong: "rgba(255,255,255,0.88)",
  black: "#17191E",
} as const;

export type FilmColor = (typeof COLORS)[keyof typeof COLORS];
