import { useTicker } from "@diffusionstudio/jsx";
import { createEffect } from "solid-js";
import { COLOR, DURATION, HEIGHT, WIDTH } from "./spectacle/design.js";
import { drawFilm } from "./spectacle/scenes.js";

const AUDIO_PATH = "/Users/mo/Downloads/roster/apps/launch-film-diffusion/assets/roster-launch-spectacle-score.wav";

export default function RosterLaunchSpectacle() {
  const { time } = useTicker();
  return (
    <rect
      scene="roster-launch-spectacle"
      name="Roster Launch Film · Spectacle Pass"
      width={WIDTH}
      height={HEIGHT}
      fill={COLOR.paper}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: instrumental score and authored effects contain no dialogue */}
      <audio src={AUDIO_PATH} start={0} end={DURATION} volume={-2.5} />
      <surface
        name="Roster Launch · Spectacle Canvas"
        width={WIDTH}
        height={HEIGHT}
        end={DURATION}
        ref={(canvas) => {
          const context = canvas.getContext("2d");
          if (!context) return;
          createEffect(() => drawFilm(context, time()));
        }}
      />
    </rect>
  );
}
