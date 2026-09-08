import { useTicker } from "@diffusionstudio/jsx";
import { createEffect } from "solid-js";
import { COLOR, DURATION, HEIGHT, WIDTH } from "./sprint/design.js";
import { drawFilm } from "./sprint/scenes.js";

const AUDIO_PATH = "/Users/mo/Downloads/roster/apps/launch-film-diffusion/assets/roster-launch-sprint-score.wav";

export default function RosterLaunchSprint() {
  const { time } = useTicker();
  return (
    <rect
      scene="roster-launch-sprint"
      name="Roster Launch Film · 9.6 Second Sprint"
      width={WIDTH}
      height={HEIGHT}
      fill={COLOR.paper}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: original instrumental score contains no speech */}
      <audio src={AUDIO_PATH} start={0} end={DURATION} volume={-1.8} />
      <surface
        name="Roster Sprint · Master Canvas"
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
