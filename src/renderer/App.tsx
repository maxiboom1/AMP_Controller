import { Plug, Settings, Unplug } from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { CHANNELS } from "../shared/channels.js";
import { createPlaylistItem, hasClipName, removePlaylistItem } from "../shared/listState.js";
import type { AppSettings, AppSnapshot, InventoryClip, PersistedState, PlaylistItem } from "../shared/types.js";
import { InventoryPanel } from "./components/InventoryPanel.js";
import { PlayerPanel } from "./components/PlayerPanel.js";
import { RundownTable } from "./components/RundownTable.js";
import { SettingsDialog } from "./components/SettingsDialog.js";
import { SplashOverlay } from "./components/SplashOverlay.js";
import { usePlaylistShortcuts, useSelectedItemAutoScroll } from "./hooks/usePlaylistShortcuts.js";
import { useSmoothedTimecodes } from "./hooks/useSmoothedTimecodes.js";
import { classNames } from "./utils.js";

export function App(): ReactElement {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSettings, setDraftSettings] = useState<AppSettings | null>(null);
  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const smoothedTimecodes = useSmoothedTimecodes(snapshot);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 3200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    void window.tria.getSnapshot().then((next) => {
      setSnapshot(next);
      setDraftSettings(next.settings);
    });
    const offSnapshot = window.tria.onSnapshot((next) => {
      setSnapshot(next);
      setDraftSettings((current) => current ?? next.settings);
    });
    const offMenu = window.tria.onMenuAction((action) => {
      if (action === "settings") {
        setSettingsOpen(true);
      }
    });
    return () => {
      offSnapshot();
      offMenu();
    };
  }, []);

  const saveState = useCallback(async (state: PersistedState) => {
    const next = await window.tria.saveState(state);
    setSnapshot(next);
  }, []);

  const updatePlaylist = useCallback(
    (playlist: PlaylistItem[], selectedItemId = snapshot?.state.selectedItemId ?? null) => {
      if (!snapshot) {
        return;
      }
      void saveState({
        ...snapshot.state,
        playlist,
        selectedItemId
      });
    },
    [saveState, snapshot]
  );

  const addClipToPlaylist = useCallback(
    (clip: InventoryClip) => {
      if (!snapshot) {
        return;
      }
      const existing = snapshot.state.playlist.find(
        (item) => item.clipName.trim().toLocaleLowerCase() === clip.name.trim().toLocaleLowerCase()
      );
      if (existing || hasClipName(snapshot.state.playlist, clip.name)) {
        void window.tria.notify(`${clip.name} is already in the list`);
        void saveState({
          ...snapshot.state,
          selectedItemId: existing?.id ?? snapshot.state.selectedItemId
        });
        return;
      }

      const item = createPlaylistItem(clip);
      void saveState({
        ...snapshot.state,
        playlist: [...snapshot.state.playlist, item],
        selectedItemId: item.id
      });
    },
    [saveState, snapshot]
  );

  const removeClipFromPlaylist = useCallback(
    (itemId: string) => {
      if (!snapshot) {
        return;
      }

      const playlist = removePlaylistItem(snapshot.state.playlist, itemId);
      void saveState({
        ...snapshot.state,
        playlist,
        selectedItemId: snapshot.state.selectedItemId === itemId ? null : snapshot.state.selectedItemId
      });
    },
    [saveState, snapshot]
  );

  usePlaylistShortcuts(snapshot, saveState, updatePlaylist);
  useSelectedItemAutoScroll(snapshot?.state.selectedItemId);

  if (!snapshot || !draftSettings) {
    return (
      <>
        <div className="boot">TRIA AMP CONTROLLER</div>
        {showSplash && <SplashOverlay />}
      </>
    );
  }

  const connectedCount = CHANNELS.filter((channel) => snapshot.players[channel].connection === "connected").length;
  const isConnected = connectedCount > 0;
  const workingFolderTitle = snapshot.settings.workingFolder.trim() || snapshot.inventory.selectedFolder || "Clips";
  const hasTriaError = CHANNELS.some((channel) => snapshot.players[channel].connection === "error");
  const triaIndicatorState = isConnected ? "ok" : hasTriaError ? "error" : "error";
  const tallyIndicatorState = !snapshot.tally.enabled ? "disabled" : snapshot.tally.clientCount > 0 ? "ok" : "error";

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand">TRIA AMP CONTROLLER</div>
        <div className="top-actions">
          <button
            className={classNames("text-button", isConnected && "connected")}
            onClick={() => void (isConnected ? window.tria.disconnect() : window.tria.connect())}
            title={isConnected ? "Disconnect" : "Connect"}
          >
            {isConnected ? <Unplug size={15} /> : <Plug size={15} />}
            {isConnected ? `Connected ${connectedCount}/4` : "Connect"}
          </button>
          <button className="icon-button" title="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings size={17} />
          </button>
        </div>
      </header>

      <main className="workspace" dir="ltr">
        <section className="players-column" aria-label="Players">
          <div className="players-header">Available channels</div>
          {CHANNELS.map((channel) => (
            <PlayerPanel key={channel} snapshot={snapshot} channel={channel} timecodes={smoothedTimecodes[channel]} />
          ))}
        </section>

        <RundownTable
          snapshot={snapshot}
          draggingItemId={draggingItemId}
          setDraggingItemId={setDraggingItemId}
          saveState={saveState}
          updatePlaylist={updatePlaylist}
          addClipToPlaylist={addClipToPlaylist}
          removeClipFromPlaylist={removeClipFromPlaylist}
        />

        <InventoryPanel snapshot={snapshot} title={workingFolderTitle} addClipToPlaylist={addClipToPlaylist} />
      </main>

      <footer className={classNames("status-footer", snapshot.status.level)}>
        <div className="status-main">
          <span>{connectedCount}/4 connected</span>
          <span>v{snapshot.appVersion}</span>
          <span>{snapshot.status.text}</span>
        </div>
        <div className="footer-indicators" aria-label="System indicators">
          <span className={classNames("footer-indicator", triaIndicatorState)} title="Tria connection">
            <span className="indicator-dot" />
            Tria
          </span>
          <span className={classNames("footer-indicator", tallyIndicatorState)} title={snapshot.tally.lastMessage || "TSL"}>
            <span className="indicator-dot" />
            TSL
          </span>
          <span className="footer-indicator disabled" title="Newsroom integration is not active yet">
            <span className="indicator-dot" />
            Newsroom
          </span>
        </div>
      </footer>

      {settingsOpen && (
        <SettingsDialog
          settings={draftSettings}
          tally={snapshot.tally}
          onClose={() => setSettingsOpen(false)}
          onChange={setDraftSettings}
          onClearTallyMessages={async () => {
            const next = await window.tria.clearTallyMessages();
            setSnapshot(next);
          }}
          onSave={async () => {
            const next = await window.tria.saveSettings(draftSettings);
            setSnapshot(next);
            setSettingsOpen(false);
          }}
        />
      )}
      {showSplash && <SplashOverlay />}
    </div>
  );
}
