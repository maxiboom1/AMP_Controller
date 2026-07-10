import { Pause, Play, RotateCw } from "lucide-react";
import type { ReactElement } from "react";
import type { AppSnapshot, ChannelId } from "../../shared/types.js";
import type { SmoothedTimecode } from "../hooks/useSmoothedTimecodes.js";
import { classNames, timeText } from "../utils.js";

function EjectIcon({ size = 17 }: { size?: number }): ReactElement {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 5 4.5 14h15L12 5Z" fill="currentColor" />
      <path d="M5 18.5h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function PlayerPanel({
  snapshot,
  channel,
  timecodes
}: {
  snapshot: AppSnapshot;
  channel: ChannelId;
  timecodes: SmoothedTimecode;
}): ReactElement {
  const player = snapshot.players[channel];
  const online = player.connection === "connected";
  const hasClip = Boolean(player.currentClip);

  return (
    <article className={classNames("player-panel", online && "online", player.state)}>
      <div className="player-head">
        <div className="player-title">
          <span className={classNames("player-channel", player.onAir && "on-air")}>{channel}</span>
          {hasClip && <span className="amp-name">{player.ampChannel}</span>}
        </div>
        <span className={classNames("conn-dot", player.connection)} />
      </div>

      <div className="player-content">
        {hasClip && (
          <>
            <div className="loaded-clip">{player.currentClip}</div>
            <div className="timecodes">
              <div>
                <span>TC</span>
                <strong>{timeText(timecodes.timecode)}</strong>
              </div>
              <div>
                <span>REM</span>
                <strong>{timeText(timecodes.remaining)}</strong>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="player-controls">
        <button className="icon-button primary" title={`Play ${channel}`} onClick={() => void window.tria.playChannel(channel)}>
          <Play size={17} />
        </button>
        <button className="icon-button" title="Pause" onClick={() => void window.tria.pauseChannel(channel)}>
          <Pause size={17} />
        </button>
        <button
          className={classNames("icon-button", player.loop && "active")}
          title={`Loop (${player.loopSource})`}
          onClick={() => void window.tria.setChannelLoop(channel, !player.loop)}
        >
          <RotateCw size={17} />
        </button>
        <button className="icon-button danger" title="Eject" onClick={() => void window.tria.ejectChannel(channel)}>
          <EjectIcon size={17} />
        </button>
      </div>
    </article>
  );
}
