import { useTicker } from "@diffusionstudio/jsx";
import { createEffect } from "solid-js";
import { COLOR, DURATION, HEIGHT, WIDTH } from "./inspired/design.js";
import { drawFilm } from "./inspired/scenes.js";

const AUDIO_PATH = "/Users/mo/Downloads/roster/apps/launch-film-diffusion-inspired/assets/roster-launch-inspired-score.wav";

export default function RosterLaunchInspired() {
  const { time } = useTicker();
  return (
    <rect
      scene="roster-launch-inspired"
      name="Roster Launch Film · Signal / Route / Resolve"
      width={WIDTH}
      height={HEIGHT}
      fill={COLOR.black}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: original instrumental score contains no speech */}
      <audio src={AUDIO_PATH} start={0} end={DURATION} volume={0.78} />
      <surface
        name="Roster Inspired Master Canvas"
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
