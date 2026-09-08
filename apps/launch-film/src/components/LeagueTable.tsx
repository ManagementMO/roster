import { useCurrentFrame } from "remotion";
import { PRODUCT_COPY } from "../data/productCopy";
import { COLORS } from "../design/colors";
import { MATERIALS } from "../design/materials";
import { FONT_DISPLAY, FONT_MONO, FONT_UI } from "../design/typography";
import { enter } from "../motion/timing";

export const LeagueTable = ({ startAt = 0 }: { readonly startAt?: number }) => {
  const frame = useCurrentFrame();
  const reveal = enter(frame, startAt, 30);
  return (
    <div
      style={{
        width: 620,
        minHeight: 390,
        borderRadius: 42,
        ...MATERIALS.heroGlass,
        color: COLORS.text,
        opacity: reveal,
        transform: `translateY(${(1 - reveal) * 32}px) scale(${0.94 + reveal * 0.06})`,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "36px 42px 28px", borderBottom: `2px solid ${COLORS.line}` }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 34, fontWeight: 700, letterSpacing: "-0.04em" }}>ROSTER LEAGUE</div>
          <div style={{ marginLeft: "auto", fontFamily: FONT_MONO, fontSize: 15, color: COLORS.gold, letterSpacing: "0.1em" }}>PRE-SEASON</div>
        </div>
        <div style={{ marginTop: 10, fontFamily: FONT_UI, fontSize: 20, color: COLORS.textSecondary }}>Evidence before rank.</div>
      </div>
      <div style={{ padding: "34px 42px" }}>
        <div style={{ fontFamily: FONT_MONO, fontSize: 15, color: COLORS.textFaint, letterSpacing: "0.1em" }}>SERVER</div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center" }}>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 42, fontWeight: 700, letterSpacing: "-0.045em" }}>filesystem</div>
          <div style={{ marginLeft: "auto", fontFamily: FONT_MONO, fontSize: 18, color: COLORS.warning }}>0 / 8</div>
        </div>
        <div style={{ marginTop: 28, height: 10, borderRadius: 99, backgroundColor: COLORS.line }}>
          <div style={{ width: "8%", height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${COLORS.gold}, ${COLORS.warning})` }} />
        </div>
        <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between", fontFamily: FONT_UI, fontSize: 20, color: COLORS.textSecondary }}>
          <span>Certified suites</span><span>No public rank yet</span>
        </div>
      </div>
      <div style={{ padding: "20px 42px 24px", borderTop: `2px solid ${COLORS.line}`, fontFamily: FONT_MONO, fontSize: 14, color: COLORS.textFaint, letterSpacing: "0.08em" }}>
        {PRODUCT_COPY.leagueState}
      </div>
    </div>
  );
};
