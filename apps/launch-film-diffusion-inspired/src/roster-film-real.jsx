import { useTicker } from "@diffusionstudio/jsx";
import { createEffect } from "solid-js";
import { COLOR, DURATION, HEIGHT, WIDTH } from "./real/design.js";
import { drawFilm } from "./real/scenes.js";

const AUDIO_PATH = "/Users/mo/Downloads/roster/apps/launch-film-diffusion/assets/roster-launch-real-score.wav";

export default function RosterLaunchReal() {
  const { time } = useTicker();
  return (
    <rect
      scene="roster-launch-real"
      name="Roster Launch Film · Real Asset Pass"
      width={WIDTH}
      height={HEIGHT}
      fill={COLOR.paper}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: original instrumental score contains no speech */}
      <audio src={AUDIO_PATH} start={0} end={DURATION} volume={0.82} />
      <surface
        name="Roster Real Asset Master Canvas"
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
