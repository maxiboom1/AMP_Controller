import { Circle, RefreshCcw } from "lucide-react";
import type { ReactElement } from "react";
import { isShortClip } from "../../shared/clipDuration.js";
import type { AppSnapshot, InventoryClip } from "../../shared/types.js";
import { classNames } from "../utils.js";

export function InventoryPanel({
  snapshot,
  title,
  addClipToPlaylist
}: {
  snapshot: AppSnapshot;
  title: string;
  addClipToPlaylist: (clip: InventoryClip) => void;
}): ReactElement {
  const isShort = (clip: InventoryClip): boolean =>
    isShortClip(clip.duration, snapshot.settings.shortClipThresholdSeconds, snapshot.settings.frameRate);

  return (
    <section className="inventory-column" aria-label="Inventory">
      <div className="section-title">
        <span>{title}</span>
        <div className="inventory-actions">
          <button className="icon-button" title="Refresh inventory" onClick={() => void window.tria.refreshInventory()}>
            <RefreshCcw size={16} />
          </button>
        </div>
      </div>

      <div className="inventory-body">
        <div className="clip-list">
          {snapshot.inventory.clips.map((clip) => (
            <div
              key={clip.id}
              className={classNames("inventory-clip", isShort(clip) && "short-clip")}
              draggable
              onDoubleClick={() => addClipToPlaylist(clip)}
              onDragStart={(event) => {
                event.dataTransfer.setData("application/x-tria-clip", clip.id);
                event.dataTransfer.effectAllowed = "copy";
              }}
            >
              <Circle size={8} className="clip-dot" />
              <span>{clip.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
