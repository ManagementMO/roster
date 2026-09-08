import { Composition, Folder, Still } from "remotion";
import { RosterLaunchContactSheet } from "./compositions/RosterLaunchContactSheet";
import { RosterLaunchBeforeAfter } from "./compositions/RosterLaunchBeforeAfter";
import { RosterLaunchQASheet } from "./compositions/RosterLaunchQASheet";
import { RosterLaunchMaster, RosterLaunchTeaser } from "./compositions/RosterLaunchMaster";
import { RosterLaunchPoster } from "./compositions/RosterLaunchPoster";
import { FILM_FPS, MASTER_DURATION, TEASER_DURATION } from "./data/timeline";

export const RemotionRoot = () => (
  <Folder name="Roster-launch-film">
    <Composition
      id="RosterLaunchMaster"
      component={RosterLaunchMaster}
      durationInFrames={MASTER_DURATION}
      fps={FILM_FPS}
      width={1920}
      height={1080}
      defaultProps={{ format: "wide", audio: true }}
    />
    <Composition
      id="RosterLaunchTeaser"
      component={RosterLaunchTeaser}
      durationInFrames={TEASER_DURATION}
      fps={FILM_FPS}
      width={1920}
      height={1080}
      defaultProps={{ audio: true }}
    />
    <Composition
      id="RosterLaunchSquare"
      component={RosterLaunchMaster}
      durationInFrames={MASTER_DURATION}
      fps={FILM_FPS}
      width={1080}
      height={1080}
      defaultProps={{ format: "square", audio: true }}
    />
    <Still id="RosterLaunchPoster" component={RosterLaunchPoster} width={1920} height={1080} />
    <Still id="RosterLaunchContactSheet" component={RosterLaunchContactSheet} width={1920} height={1016} />
    <Still id="RosterLaunchQASheet" component={RosterLaunchQASheet} width={1920} height={1320} />
    <Still id="RosterLaunchBeforeAfter" component={RosterLaunchBeforeAfter} width={1920} height={1080} />
  </Folder>
);
