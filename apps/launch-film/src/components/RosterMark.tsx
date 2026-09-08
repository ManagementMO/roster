import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO } from "../design/typography";
import { RosterPrism } from "./RosterPrism";

type RosterMarkProps = {
  readonly size?: number;
  readonly progress?: number;
  readonly color?: string;
  readonly showWordmark?: boolean;
  readonly compact?: boolean;
};

export const RosterMark = ({ size = 240, progress = 1, showWordmark = false, compact = false }: RosterMarkProps) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.20, opacity: progress }}>
    <RosterPrism size={size * (compact ? 0.74 : 1)} progress={progress} state="success" />
    {showWordmark ? (
      <div>
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: size * 0.45, lineHeight: 0.9, letterSpacing: "-0.058em", color: COLORS.text }}>ROSTER</div>
        <div style={{ marginTop: size * 0.095, fontFamily: FONT_MONO, color: COLORS.textSecondary, fontSize: size * 0.085, letterSpacing: "0.13em" }}>THE RIGHT FIVE · ON YOUR MACHINE</div>
      </div>
    ) : null}
  </div>
);
