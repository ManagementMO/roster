import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile } from "remotion";
import { FilmStage } from "../components/FilmStage";
import { SCENES, sceneById } from "../data/timeline";
import { ClearFieldScene } from "../scenes/ClearFieldScene";
import { CoachLeagueScene } from "../scenes/CoachLeagueScene";
import { FinalRevealScene } from "../scenes/FinalRevealScene";
import { HookScene } from "../scenes/HookScene";
import { RosterInitScene } from "../scenes/RosterInitScene";
import { SearchScene } from "../scenes/SearchScene";
import { SixthManScene } from "../scenes/SixthManScene";
import { StartingFiveScene } from "../scenes/StartingFiveScene";
import { TerminalScene } from "../scenes/TerminalScene";
import { ToolCallScene } from "../scenes/ToolCallScene";
import { ToolOverloadScene } from "../scenes/ToolOverloadScene";

export type FilmProps = {
  readonly format: "wide" | "square";
  readonly audio: boolean;
};

const sceneComponent = {
  hook: HookScene,
  terminal: TerminalScene,
  overload: ToolOverloadScene,
  init: RosterInitScene,
  search: SearchScene,
  clear: ClearFieldScene,
  startingFive: StartingFiveScene,
  toolCall: ToolCallScene,
  sixthMan: SixthManScene,
  coachLeague: CoachLeagueScene,
  final: FinalRevealScene,
} as const;

export const RosterLaunchMaster = ({ format, audio }: FilmProps) => (
  <AbsoluteFill>
    <FilmStage>
      {SCENES.map((timing) => {
        const Component = sceneComponent[timing.id];
        return (
          <Sequence
            key={timing.id}
            name={timing.label}
            from={timing.from}
            durationInFrames={timing.duration}
            premountFor={30}
          >
            <Component durationInFrames={timing.duration} format={format} worldFrameOffset={timing.from} />
          </Sequence>
        );
      })}
    </FilmStage>
    {audio ? <Audio src={staticFile("audio/roster-launch-bed.wav")} volume={0.94} /> : null}
  </AbsoluteFill>
);

export const RosterLaunchTeaser = ({ audio }: Pick<FilmProps, "audio">) => {
  const beats = [
    { from: 0, duration: 180, Component: HookScene, sourceDuration: sceneById("hook").duration },
    { from: 180, duration: 180, Component: TerminalScene, sourceDuration: sceneById("terminal").duration },
    { from: 360, duration: 180, Component: StartingFiveScene, sourceDuration: sceneById("startingFive").duration },
    { from: 540, duration: 180, Component: ToolCallScene, sourceDuration: sceneById("toolCall").duration },
    { from: 720, duration: 180, Component: FinalRevealScene, sourceDuration: sceneById("final").duration },
  ] as const;

  return (
    <AbsoluteFill>
      <FilmStage>
        {beats.map(({ from, duration, Component, sourceDuration }) => (
          <Sequence key={from} from={from} durationInFrames={duration} premountFor={20}>
            <Component durationInFrames={sourceDuration} format="wide" />
          </Sequence>
        ))}
      </FilmStage>
      {audio ? <Audio src={staticFile("audio/roster-launch-bed.wav")} volume={0.92} /> : null}
    </AbsoluteFill>
  );
};
