import type { CSSProperties, ReactNode } from "react";
import { COLORS } from "../design/colors";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";

export const Eyebrow = ({ children, color = COLORS.roster }: { readonly children: ReactNode; readonly color?: string }) => (
  <div
    style={{
      fontFamily: FONT_MONO,
      color,
      fontSize: 17,
      fontWeight: 650,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

type HeadlineProps = {
  readonly children: ReactNode;
  readonly size?: number;
  readonly align?: CSSProperties["textAlign"];
  readonly style?: CSSProperties;
};

export const Headline = ({ children, size = 112, align = "center", style }: HeadlineProps) => (
  <div
    style={{
      fontFamily: FONT_DISPLAY,
      fontSize: size,
      fontWeight: 690,
      lineHeight: 0.92,
      letterSpacing: "-0.058em",
      textAlign: align,
      textWrap: "balance",
      color: COLORS.text,
      ...style,
    }}
  >
    {children}
  </div>
);

export const BodyCopy = ({ children, style }: { readonly children: ReactNode; readonly style?: CSSProperties }) => (
  <div
    style={{
      fontFamily: FONT_UI,
      fontSize: 27,
      lineHeight: 1.35,
      color: COLORS.textSecondary,
      ...style,
    }}
  >
    {children}
  </div>
);

export const MonoLabel = ({ children, style }: { readonly children: ReactNode; readonly style?: CSSProperties }) => (
  <div
    style={{
      fontFamily: FONT_MONO,
      fontSize: 15,
      fontWeight: 600,
      letterSpacing: "0.08em",
      color: COLORS.textSecondary,
      ...style,
    }}
  >
    {children}
  </div>
);
