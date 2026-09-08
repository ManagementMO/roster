import cues from "./cues.json";

export const AUDIO_CUES = cues;

export const cueFrame = (seconds: number, fps = 60): number => Math.round(seconds * fps);
