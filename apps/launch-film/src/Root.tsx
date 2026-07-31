/**
 * Composition registry.
 *
 * `LaunchFilm` is the deliverable. Each scene is also registered individually so
 * a scene can be scrubbed, retimed and re-rendered in isolation without waiting
 * on the other ten — double-click a sequence in the Studio timeline to jump to
 * it. `Teaser` is a short cut assembled from three windows of the same film.
 */
import type React from "react";
import { Composition, Folder, Sequence, Still } from "remotion";
import { fontsReady } from "./design/typography";
import { FilmBody, LaunchFilm } from "./LaunchFilm";
import { DURATION_IN_FRAMES, FPS, POSTER_FRAME, SCENES, TEASER, TEASER_DURATION } from "./motion/timing";
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
import { Stage, StageDefs } from "./components/Stage/Stage";
import { BEFORE_AFTER, BeforeAfter, CONTACT_SHEET, ContactSheet, QA_SHEET, QaSheet } from "./qa/Sheets";
import { REJECTED_BEATS, RejectedDirection } from "./qa/RejectedDirection";

// Installs the @font-face rules at module load, before the first paint.
void fontsReady;

const SCENE_COMPONENTS = [
  S01Hook,
  S02Terminal,
  S03Overload,
  S04Initialize,
  S05Search,
  S06Clearing,
  S07StartingFive,
  S08ToolCall,
  S09SixthMan,
  S10CoachLeague,
  S11Reveal,
] as const;

const VIDEO = { width: 1920, height: 1080, fps: FPS } as const;

/**
 * The teaser: three windows of the finished film, played back to back. It reuses
 * `FilmBody` rather than re-implementing anything, so it can never drift from
 * the master.
 */
const Teaser: React.FC = () => {
  let cursor = 0;
  return (
    <>
      {TEASER.segments.map((seg, i) => {
        const from = cursor;
        cursor += seg.duration;
        return (
          <Sequence
            key={`teaser-${seg.from}-${seg.duration}`}
            from={from}
            durationInFrames={seg.duration}
            trimBefore={seg.from}
            layout="none"
            name={`Teaser ${i + 1}`}
          >
            <FilmBody />
          </Sequence>
        );
      })}
    </>
  );
};

/** A single scene, wrapped in the stage so it looks the same as it does in the film. */
const SoloScene: React.FC<{ index: number }> = ({ index }) => {
  const spec = SCENES[index];
  const Component = SCENE_COMPONENTS[index];
  if (!spec || !Component) return null;
  return (
    <Stage>
      <StageDefs />
      <Component duration={spec.duration} />
    </Stage>
  );
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="LaunchFilm"
      component={LaunchFilm}
      durationInFrames={DURATION_IN_FRAMES}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
    <Composition
      id="Teaser"
      component={Teaser}
      durationInFrames={TEASER_DURATION}
      fps={VIDEO.fps}
      width={VIDEO.width}
      height={VIDEO.height}
    />
    <Still id="Poster" component={PosterFrame} width={VIDEO.width} height={VIDEO.height} />
    <Folder name="QA">
      <Still id="ContactSheet" component={ContactSheet} width={CONTACT_SHEET.width} height={CONTACT_SHEET.height} />
      <Still id="BeforeAfter" component={BeforeAfter} width={BEFORE_AFTER.width} height={BEFORE_AFTER.height} />
      <Still id="QaSheet" component={QaSheet} width={QA_SHEET.width} height={QA_SHEET.height} />
      {REJECTED_BEATS.map((beat, i) => (
        <Still
          key={beat}
          id={`Rejected-${beat}`}
          component={RejectedDirection}
          defaultProps={{ beat: i }}
          width={VIDEO.width}
          height={VIDEO.height}
        />
      ))}
    </Folder>
    <Folder name="Scenes">
      {SCENES.map((s, i) => (
        <Composition
          key={s.id}
          id={`Scene-${s.id}`}
          component={SoloScene}
          defaultProps={{ index: i }}
          durationInFrames={s.duration}
          fps={VIDEO.fps}
          width={VIDEO.width}
          height={VIDEO.height}
        />
      ))}
    </Folder>
  </>
);

/** The poster is the reveal held at its most complete frame. */
const PosterFrame: React.FC = () => (
  <Sequence from={0} durationInFrames={1} layout="none" trimBefore={POSTER_FRAME}>
    <FilmBody />
  </Sequence>
);
