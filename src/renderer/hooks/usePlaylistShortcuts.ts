import { useCallback, useEffect } from "react";
import { CHANNELS } from "../../shared/channels.js";
import { assignItemToChannel } from "../../shared/listState.js";
import type { AppSnapshot, ChannelId, PersistedState, PlaylistItem } from "../../shared/types.js";
import { isEditableTarget } from "../utils.js";

export function usePlaylistShortcuts(
  snapshot: AppSnapshot | null,
  saveState: (state: PersistedState) => Promise<void>,
  updatePlaylist: (playlist: PlaylistItem[], selectedItemId?: string | null) => void
): void {
  const handleShortcut = useCallback(
    (event: KeyboardEvent) => {
      if (!snapshot || isEditableTarget(event.target)) {
        return;
      }

      const shortcuts = snapshot.settings.shortcuts;
      const selectedId = snapshot.state.selectedItemId;
      const code = event.code;
      const currentIndex = snapshot.state.playlist.findIndex((item) => item.id === selectedId);

      if (code === "ArrowUp" || code === "ArrowDown") {
        event.preventDefault();
        if (snapshot.state.playlist.length === 0) {
          return;
        }

        const fallbackIndex = code === "ArrowUp" ? snapshot.state.playlist.length - 1 : 0;
        const nextIndex =
          currentIndex === -1
            ? fallbackIndex
            : code === "ArrowUp"
              ? Math.max(0, currentIndex - 1)
              : Math.min(snapshot.state.playlist.length - 1, currentIndex + 1);
        const nextItem = snapshot.state.playlist[nextIndex];
        void saveState({
          ...snapshot.state,
          selectedItemId: nextItem.id
        });
        return;
      }

      if (code === shortcuts.cue && selectedId) {
        event.preventDefault();
        void window.tria.cueItem(selectedId);
      }
      if (code === shortcuts.play && selectedId) {
        event.preventDefault();
        void window.tria.playItem(selectedId);
      }
      if (code === shortcuts.loop && selectedId) {
        event.preventDefault();
        const item = snapshot.state.playlist.find((entry) => entry.id === selectedId);
        if (item) {
          void window.tria.setLoop(selectedId, !item.loop);
        }
      }

      const assignment = CHANNELS.map(
        (channel) => [shortcuts[`assign${channel}` as keyof typeof shortcuts], channel] as [string, ChannelId]
      );
      const match = assignment.find(([shortcut]) => shortcut === code);
      if (match && selectedId) {
        event.preventDefault();
        updatePlaylist(assignItemToChannel(snapshot.state.playlist, selectedId, match[1]), selectedId);
      }
    },
    [saveState, snapshot, updatePlaylist]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [handleShortcut]);
}

export function useSelectedItemAutoScroll(selectedItemId: string | null | undefined): void {
  useEffect(() => {
    if (!selectedItemId) {
      return;
    }

    const row = document.querySelector(`[data-item-id="${CSS.escape(selectedItemId)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedItemId]);
}
