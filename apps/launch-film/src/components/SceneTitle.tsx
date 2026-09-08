import type { ReactNode } from "react";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";

type SceneTitleProps = {
  readonly eyebrow?: string;
  readonly title: ReactNode;
  readonly support?: ReactNode;
  readonly align?: "left" | "center" | "right";
  readonly width?: number | string;
};

export const SceneTitle = ({ eyebrow, title, support, align = "left", width = 720 }: SceneTitleProps) => (
  <div style={{ width, textAlign: align }}>
    {eyebrow ? (
      <div style={{ fontFamily: FONT_MONO, fontSize: 16, fontWeight: 650, letterSpacing: "0.13em", color: COLORS.roster }}>
        {eyebrow}
      </div>
    ) : null}
    <div style={{ marginTop: eyebrow ? 14 : 0, fontFamily: FONT_DISPLAY, fontSize: 68, fontWeight: 700, lineHeight: 0.94, letterSpacing: "-0.058em", color: COLORS.text }}>
      {title}
    </div>
    {support ? (
      <div style={{ marginTop: 20, fontFamily: FONT_UI, fontSize: 24, lineHeight: 1.34, color: COLORS.textSecondary }}>
        {support}
      </div>
    ) : null}
  </div>
);
