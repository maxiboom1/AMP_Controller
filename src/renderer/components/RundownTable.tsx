import { GripVertical, RotateCw, Trash2 } from "lucide-react";
import type { Dispatch, ReactElement, SetStateAction } from "react";
import { isShortClip } from "../../shared/clipDuration.js";
import { reorderPlaylist } from "../../shared/listState.js";
import { isLoadedOnAirPlaylistItem } from "../../shared/onAirGuard.js";
import type { AppSnapshot, InventoryClip, PersistedState, PlaylistItem } from "../../shared/types.js";
import { classNames } from "../utils.js";

export function RundownTable({
  snapshot,
  draggingItemId,
  setDraggingItemId,
  saveState,
  updatePlaylist,
  addClipToPlaylist,
  removeClipFromPlaylist
}: {
  snapshot: AppSnapshot;
  draggingItemId: string | null;
  setDraggingItemId: Dispatch<SetStateAction<string | null>>;
  saveState: (state: PersistedState) => Promise<void>;
  updatePlaylist: (playlist: PlaylistItem[], selectedItemId?: string | null) => void;
  addClipToPlaylist: (clip: InventoryClip) => void;
  removeClipFromPlaylist: (itemId: string) => void;
}): ReactElement {
  return (
    <section className="list-column" aria-label="Operator list">
      <div
        className="rundown-table-wrap"
        onWheel={(event) => {
          const target = event.currentTarget.querySelector("tbody");
          if (!target || target.scrollHeight <= target.clientHeight) {
            return;
          }

          event.preventDefault();
          target.scrollTop += event.deltaY;
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = event.dataTransfer.types.includes("application/x-tria-playlist") ? "move" : "copy";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const fromId = event.dataTransfer.getData("application/x-tria-playlist");
          if (fromId) {
            updatePlaylist(reorderPlaylist(snapshot.state.playlist, fromId, null), fromId);
            setDraggingItemId(null);
            return;
          }
          const clipId = event.dataTransfer.getData("application/x-tria-clip");
          const clip = snapshot.inventory.clips.find((entry) => entry.id === clipId);
          if (clip) {
            addClipToPlaylist(clip);
          }
        }}
      >
        <table className="rundown-table">
          <thead>
            <tr>
              <th />
              <th>Clip</th>
              <th>Loop</th>
              <th>Cue/Play</th>
              <th>Ch</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {snapshot.state.playlist.map((item) => {
              const player = item.assignedChannel ? snapshot.players[item.assignedChannel] : null;
              const onAirGuarded = Boolean(snapshot.settings.onAirGuardEnabled && player && isLoadedOnAirPlaylistItem(item, player));

              return (
                <tr
                  key={item.id}
                  data-item-id={item.id}
                  draggable
                  title={onAirGuarded && item.assignedChannel ? `OnAir Warning: channel ${item.assignedChannel} is on-air` : undefined}
                  className={classNames(
                    snapshot.state.selectedItemId === item.id && "selected",
                    draggingItemId === item.id && "dragging",
                    isShortClip(item.duration, snapshot.settings.shortClipThresholdSeconds, snapshot.settings.frameRate) && "short-clip",
                    !item.online && "offline",
                    onAirGuarded && "on-air-guarded"
                  )}
                  onClick={() => void saveState({ ...snapshot.state, selectedItemId: item.id })}
                  onDragStart={(event) => {
                    setDraggingItemId(item.id);
                    event.dataTransfer.setData("application/x-tria-playlist", item.id);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDraggingItemId(null)}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = event.dataTransfer.types.includes("application/x-tria-playlist") ? "move" : "copy";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const fromId = event.dataTransfer.getData("application/x-tria-playlist");
                    if (fromId && fromId !== item.id) {
                      updatePlaylist(reorderPlaylist(snapshot.state.playlist, fromId, item.id), fromId);
                      return;
                    }

                    const clipId = event.dataTransfer.getData("application/x-tria-clip");
                    const clip = snapshot.inventory.clips.find((entry) => entry.id === clipId);
                    if (clip) {
                      addClipToPlaylist(clip);
                    }
                  }}
                >
                  <td className="drag-cell">
                    <GripVertical size={15} />
                  </td>
                  <td className="clip-cell">{item.clipName}</td>
                  <td>
                    <span
                      className={classNames("loop-indicator", item.loop && "active")}
                      title={item.loop ? "Loop enabled" : "Loop disabled"}
                    >
                      <RotateCw size={14} />
                    </span>
                  </td>
                  <td>
                    {item.state === "idle" ? null : (
                      <span className={classNames("state-pill", item.state)}>{item.state.toUpperCase()}</span>
                    )}
                  </td>
                  <td>
                    <span className="channel-chip">{item.assignedChannel ?? "-"}</span>
                  </td>
                  <td>
                    <button
                      className="mini-icon danger"
                      title="Remove from list"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeClipFromPlaylist(item.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
