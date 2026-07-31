/**
 * Scene 7 — The Starting Five (0:37–0:43).
 *
 * The payoff, and the most satisfying beat in the film. Five hero cards arrive
 * rotated away from camera, swing to face it and lock, centre outward — the
 * order a lineup is actually announced in. The prism sits above them as the
 * crest, and a ribbon drops from one of its apertures to each starter as that
 * starter locks, so the geometry says "these five are the ones Roster is serving"
 * without a single label saying so.
 */
import type React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { accent, alpha } from "../design/colors";
import { Eyebrow } from "../components/Type/Type";
import { Connection, ConnectionLayer } from "../components/Connection/Connection";
import { coreEdge, RosterCore } from "../components/RosterCore/RosterCore";
import { HeroTool } from "../components/ToolObject/ToolObject";
import { bloomVeil } from "../design/effects";
import { LINEUP, LINEUP_CORE, LINEUP_CORE_SIZE, LINEUP_FLOOR, LINEUP_ORDER } from "../lib/world";
import { clamp, ease } from "../motion/easings";
import { STARTERS, STARTING_FIVE } from "../productCopy";
import { SceneShell } from "./SceneShell";

/** Frame each card starts, keyed by lineup position. Centre first, then outward. */
const START_AT: number[] = (() => {
  const out = [0, 0, 0, 0, 0];
  LINEUP_ORDER.forEach((position, order) => {
    out[position] = 44 + order * 26;
  });
  return out;
})();

/**
 * Blade of the prism each lineup position lights. The RIBBONS, though, leave
 * from evenly-spaced points along the prism's lower edge rather than from the
 * blade tips: five apertures on a pentagon cannot fan to five cards below
 * without the ribbons crossing each other, and crossed ribbons read as a mess.
 */
const BLADE_FOR = [3, 4, 0, 1, 2] as const;

/** Exit angle on the housing per lineup position (0° = up, 90° = right, 180° = down). */
const EXIT_ANGLE = [224, 202, 180, 158, 136] as const;

export const S07StartingFive: React.FC<{ duration: number }> = ({ duration }) => {
  const frame = useCurrentFrame();

  const coreIn = interpolate(frame, [0, 40], [0, 1], { ...clamp, easing: ease.arrive });
  // Each lock adds a little light to the room; five locks build to a soft peak.
  const veil = START_AT.reduce(
    (sum, at) => sum + interpolate(frame, [at + 26, at + 33, at + 54], [0, 0.16, 0], { ...clamp, easing: ease.glide }),
    0,
  );

  const zoom = interpolate(frame, [0, 70, duration], [1.09, 1.0, 1.02], { ...clamp, easing: ease.glide });
  const camY = interpolate(frame, [0, 70, duration], [40, 0, -10], { ...clamp, easing: ease.glide });

  const bladeLum = [0, 1, 2, 3, 4].map((blade) => {
    const position = BLADE_FOR.indexOf(blade as (typeof BLADE_FOR)[number]);
    const at = START_AT[position] ?? 0;
    return interpolate(frame, [at + 24, at + 40], [0.18, 0.94], { ...clamp, easing: ease.arrive });
  });

  return (
    <SceneShell duration={duration} camera={{ zoom, x: 0, y: camY, focus: 0 }}>
      <Eyebrow
        delay={10}
        color={accent.blue}
        style={{ position: "absolute", left: 0, right: 0, top: 116, textAlign: "center" }}
      >
        {STARTING_FIVE.eyebrow}
      </Eyebrow>

      {/* ribbons drop from the crest as each starter locks */}
      <ConnectionLayer>
        {LINEUP.map((slot, i) => {
          const at = START_AT[i] ?? 0;
          const draw = interpolate(frame, [at + 22, at + 54], [0, 1], { ...clamp, easing: ease.arrive });
          if (draw <= 0.001) return null;
          const cardTop = LINEUP_FLOOR - slot.height;
          return (
            <Connection
              key={`lineup-link-${slot.x}`}
              trace={`lineup-link-${i}`}
              from={coreEdge(LINEUP_CORE, LINEUP_CORE_SIZE, EXIT_ANGLE[i] ?? 90)}
              to={{ x: slot.x, y: cardTop - 6 }}
              variant="selected"
              weight={0.82}
              bow={(i - 2) * 10}
              progress={draw}
              presence={draw}
            />
          );
        })}
      </ConnectionLayer>

      <RosterCore
        center={LINEUP_CORE}
        size={LINEUP_CORE_SIZE}
        state="routing"
        blades={bladeLum}
        presence={coreIn}
        rotation={interpolate(coreIn, [0, 1], [-18, 0])}
      />

      {/* the lineup */}
      <AbsoluteFill>
        {LINEUP.map((slot, i) => {
          const s = STARTERS[i];
          if (!s) return null;
          return (
            <HeroTool
              key={`starter-${s.no}`}
              x={slot.x}
              bottom={LINEUP_FLOOR}
              width={slot.width}
              height={slot.height}
              no={s.no}
              name={s.name}
              capability={s.capability}
              glyph={s.glyph}
              startFrame={START_AT[i] ?? 0}
              tint={i === 2 ? accent.blue : i % 2 === 0 ? accent.cyan : accent.violet}
            />
          );
        })}
      </AbsoluteFill>

      {/* the floor: one soft contact shadow band, so the lineup is standing on something */}
      <div
        style={{
          position: "absolute",
          left: 150,
          right: 150,
          top: LINEUP_FLOOR - 4,
          height: 78,
          borderRadius: "50%",
          filter: "blur(26px)",
          background: `radial-gradient(60% 100% at 50% 0%, ${alpha("#2A2D33", 0.16)} 0%, rgba(0,0,0,0) 74%)`,
          opacity: interpolate(frame, [40, 110], [0, 1], clamp),
        }}
      />

      <AbsoluteFill style={bloomVeil(Math.min(0.4, veil), accent.blueLift)} />
    </SceneShell>
  );
};
