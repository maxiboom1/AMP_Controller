import { useEffect, useMemo, useRef, useState } from "react";
import { CHANNELS } from "../../shared/channels.js";
import { framesToTimecode, timecodeToFrames } from "../../shared/timecode.js";
import type { AppSnapshot, ChannelId } from "../../shared/types.js";

export interface SmoothedTimecode {
  timecode: string;
  remaining: string;
}

export function useSmoothedTimecodes(snapshot: AppSnapshot | null): Record<ChannelId, SmoothedTimecode> {
  const [tick, setTick] = useState(0);
  const syncRef = useRef<
    Record<
      ChannelId,
      {
        key: string;
        loadedPath: string;
        timecodeFrames: number | null;
        remainingFrames: number | null;
        receivedAt: number;
      }
    >
  >({
    A: { key: "", loadedPath: "", timecodeFrames: null, remainingFrames: null, receivedAt: 0 },
    B: { key: "", loadedPath: "", timecodeFrames: null, remainingFrames: null, receivedAt: 0 },
    C: { key: "", loadedPath: "", timecodeFrames: null, remainingFrames: null, receivedAt: 0 },
    D: { key: "", loadedPath: "", timecodeFrames: null, remainingFrames: null, receivedAt: 0 }
  });

  useEffect(() => {
    if (!snapshot) {
      return;
    }

    const now = performance.now();
    for (const channel of CHANNELS) {
      const player = snapshot.players[channel];
      const key = [player.loadedPath, player.state, player.timecode, player.remaining].join("|");
      if (syncRef.current[channel].key !== key) {
        syncRef.current[channel] = {
          key,
          loadedPath: player.loadedPath,
          timecodeFrames: timecodeToFrames(player.timecode, snapshot.settings.frameRate),
          remainingFrames: timecodeToFrames(player.remaining, snapshot.settings.frameRate),
          receivedAt: now
        };
      }
    }
  }, [snapshot]);

  useEffect(() => {
    if (!snapshot || !CHANNELS.some((channel) => snapshot.players[channel].currentClip)) {
      return;
    }

    const frameMs = Math.max(16, Math.round(1000 / Math.max(1, snapshot.settings.frameRate)));
    const timer = window.setInterval(() => setTick((value) => value + 1), frameMs);
    return () => window.clearInterval(timer);
  }, [snapshot]);

  return useMemo(() => {
    const frameRate = snapshot?.settings.frameRate ?? 25;
    const now = performance.now();

    return CHANNELS.reduce(
      (accumulator, channel) => {
        const player = snapshot?.players[channel];
        const sync = syncRef.current[channel];
        if (!player || !player.currentClip || player.state !== "playing" || sync.timecodeFrames === null) {
          accumulator[channel] = {
            timecode: player?.timecode ?? "--:--:--:--",
            remaining: player?.remaining ?? "--:--:--:--"
          };
          return accumulator;
        }

        const elapsedFrames = Math.floor(((now - sync.receivedAt) / 1000) * frameRate);
        accumulator[channel] = {
          timecode: framesToTimecode(sync.timecodeFrames + elapsedFrames, frameRate),
          remaining: sync.remainingFrames === null ? "--:--:--:--" : framesToTimecode(sync.remainingFrames - elapsedFrames, frameRate)
        };
        return accumulator;
      },
      {} as Record<ChannelId, SmoothedTimecode>
    );
  }, [snapshot, tick]);
}
