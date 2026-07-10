import { timecodeToFrames } from "./timecode.js";

export function isShortClip(duration: string | undefined, thresholdSeconds: number, frameRate: number): boolean {
  if (!duration || thresholdSeconds <= 0 || frameRate <= 0) {
    return false;
  }

  const durationFrames = timecodeToFrames(duration, frameRate);
  if (durationFrames === null) {
    return false;
  }

  return durationFrames < thresholdSeconds * frameRate;
}
