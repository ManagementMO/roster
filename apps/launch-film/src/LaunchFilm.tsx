/**
 * The film.
 *
 * Eleven scenes, one stage, one score. Scene boundaries come from
 * `motion/timing.ts` so this file contains no timing literals of its own, and
 * the light wipes that cover the handoffs are painted once here rather than
 * eleven times inside the scenes.
 */
import type React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { lightWipeStyle } from "./design/effects";
import { Stage, StageDefs } from "./components/Stage/Stage";
import { BOUNDARIES, SCENES } from "./motion/timing";
import { wipeAt, wipeStrength } from "./motion/transitions";
import { SCORE_FILE } from "./audio/cues";
import { S01Hook } from "./scenes/S01Hook";
import { S02Terminal } from "./scenes/S02Terminal";
import { S03Overload } from "./scenes/S03Overload";
import { S04Initialize } from "./scenes/S04Initialize";
import { S05Search } from "./scenes/S05Search";
import { S06Clearing } from "./scenes/S06Clearing";
import { S07StartingFive } from "./scenes/S07StartingFive";
import { S08ToolCall } from "./scenes/S08ToolCall";
import { S09SixthMan } from "./scenes/S09SixthMan";
import { S10CoachLeague } from "./scenes/S10CoachLeague";
import { S11Reveal } from "./scenes/S11Reveal";

const SCENE_COMPONENTS: Record<string, React.FC<{ duration: number }>> = {
  hook: S01Hook,
  terminal: S02Terminal,
  overload: S03Overload,
  initialize: S04Initialize,
  search: S05Search,
  clearing: S06Clearing,
  startingFive: S07StartingFive,
  toolCall: S08ToolCall,
  sixthMan: S09SixthMan,
  coachLeague: S10CoachLeague,
  reveal: S11Reveal,
};

/** Vignette per scene — wide scenes stay open, intimate ones close down. */
const VIGNETTE: Record<string, number> = {
  hook: 0.8,
  terminal: 1.25,
  overload: 1.15,
  initialize: 0.95,
  search: 0.9,
  clearing: 0.85,
  startingFive: 0.75,
  toolCall: 0.85,
  sixthMan: 0.95,
  coachLeague: 0.9,
  reveal: 0.6,
};

/** The scene stack without audio — reused by the teaser and the still passes. */
export const FilmBody: React.FC = () => {
  const frame = useCurrentFrame();
  const wipe = wipeAt(frame, BOUNDARIES);
  const strength = wipeStrength(frame, BOUNDARIES);
  const vignette = VIGNETTE[currentSceneId(frame)] ?? 1;

  return (
    <Stage vignette={vignette}>
      <StageDefs />
      {SCENES.map((s) => {
        const Component = SCENE_COMPONENTS[s.id];
        if (!Component) return null;
        return (
          <Sequence key={s.id} from={s.from} durationInFrames={s.duration} name={s.title} layout="none">
            <Component duration={s.duration} />
          </Sequence>
        );
      })}
      {wipe.intensity > 0.002 ? (
        <AbsoluteFill style={lightWipeStyle(wipe.progress, wipe.intensity * strength)} />
      ) : null}
    </Stage>
  );
};

function currentSceneId(frame: number): string {
  for (const s of SCENES) {
    if (frame >= s.from && frame < s.from + s.duration) return s.id;
  }
  return SCENES[SCENES.length - 1]?.id ?? "hook";
}

export const LaunchFilm: React.FC = () => (
  <AbsoluteFill>
    <FilmBody />
    <Audio src={staticFile(SCORE_FILE)} />
  </AbsoluteFill>
);
