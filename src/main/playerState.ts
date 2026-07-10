import { AMP_CHANNELS } from "../shared/channels.js";
import type { ChannelId, PlayerState } from "../shared/types.js";

export function defaultPlayerState(channel: ChannelId): PlayerState {
  return {
    channel,
    ampChannel: AMP_CHANNELS[channel],
    connection: "disconnected",
    currentClip: "",
    loadedPath: "",
    loop: false,
    commandedLoop: false,
    reportedLoop: null,
    loopSource: "unknown",
    state: "idle",
    timecode: "--:--:--:--",
    remaining: "--:--:--:--",
    lastMessage: "",
    onAir: false
  };
}

export function withCommandedLoop(player: PlayerState, enabled: boolean): PlayerState {
  return {
    ...player,
    loop: enabled,
    commandedLoop: enabled,
    loopSource: "commanded"
  };
}

export function withReportedLoop(player: PlayerState, reportedLoop: boolean): PlayerState {
  return {
    ...player,
    reportedLoop,
    loop: player.loopSource === "commanded" ? player.commandedLoop : reportedLoop,
    loopSource: player.loopSource === "commanded" ? "commanded" : "reported"
  };
}

export function withUnknownLoop(player: PlayerState): PlayerState {
  return {
    ...player,
    loop: false,
    commandedLoop: false,
    reportedLoop: null,
    loopSource: "unknown"
  };
}
