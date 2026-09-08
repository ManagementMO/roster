export const FILM_FPS = 60;
export const MASTER_DURATION = 57 * FILM_FPS;
export const TEASER_DURATION = 15 * FILM_FPS;

export type SceneId =
  | "hook"
  | "terminal"
  | "overload"
  | "init"
  | "search"
  | "clear"
  | "startingFive"
  | "toolCall"
  | "sixthMan"
  | "coachLeague"
  | "final";

export type SceneTiming = {
  readonly id: SceneId;
  readonly label: string;
  readonly from: number;
  readonly to: number;
  readonly duration: number;
};

const scene = (id: SceneId, label: string, from: number, to: number): SceneTiming => ({
  id,
  label,
  from,
  to,
  duration: to - from,
});

export const SCENES: readonly SceneTiming[] = [
  scene("hook", "01 · Immediate hook", 0, 180),
  scene("terminal", "02 · Terminal opens the world", 180, 600),
  scene("overload", "03 · Tool overload", 600, 1020),
  scene("init", "04 · Roster initializes", 1020, 1380),
  scene("search", "05 · Search and evaluation", 1380, 1860),
  scene("clear", "06 · Clear the field", 1860, 2220),
  scene("startingFive", "07 · The starting five", 2220, 2580),
  scene("toolCall", "08 · Calls flow through Roster", 2580, 2820),
  scene("sixthMan", "09 · The Sixth Man", 2820, 3000),
  scene("coachLeague", "10 · Coach and League", 3000, 3240),
  scene("final", "11 · Final reveal", 3240, 3420),
] as const;

export const sceneById = (id: SceneId): SceneTiming => {
  const found = SCENES.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown scene: ${id}`);
  return found;
};

export const QA_FRAMES = SCENES.flatMap((item) => [
  { scene: item.id, phase: "enter" as const, frame: item.from + Math.min(12, item.duration - 1) },
  { scene: item.id, phase: "middle" as const, frame: Math.floor((item.from + item.to) / 2) },
  { scene: item.id, phase: "exit" as const, frame: item.to - 12 },
]);

export const CONTACT_FRAMES = [90, 390, 810, 1190, 1620, 2040, 2400, 2700, 2910, 3120, 3300, 3385] as const;
