export function timecodeToFrames(timecode: string, frameRate: number): number | null {
  const match = /^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/.exec(timecode);
  if (!match) {
    return null;
  }

  const [, hh, mm, ss, ff] = match;
  return (
    Number.parseInt(hh, 10) * 3600 * frameRate +
    Number.parseInt(mm, 10) * 60 * frameRate +
    Number.parseInt(ss, 10) * frameRate +
    Number.parseInt(ff, 10)
  );
}

export function framesToTimecode(totalFrames: number, frameRate: number): string {
  const clamped = Math.max(0, totalFrames);
  const hours = Math.floor(clamped / (3600 * frameRate));
  const afterHours = clamped % (3600 * frameRate);
  const minutes = Math.floor(afterHours / (60 * frameRate));
  const afterMinutes = afterHours % (60 * frameRate);
  const seconds = Math.floor(afterMinutes / frameRate);
  const frames = afterMinutes % frameRate;

  return [hours, minutes, seconds, frames].map((value) => value.toString().padStart(2, "0")).join(":");
}
