import { ListRestart, X } from "lucide-react";
import type { ReactElement } from "react";
import { useState } from "react";
import { CHANNELS } from "../../shared/channels.js";
import type { AppSettings, ChannelId, TallyRuntimeState } from "../../shared/types.js";
import { classNames } from "../utils.js";

type SettingsTab = "server" | "newsroom" | "tally" | "shortcuts" | "logging";

const tabs: Array<[SettingsTab, string]> = [
  ["server", "Server"],
  ["newsroom", "Newsroom"],
  ["tally", "Tally"],
  ["shortcuts", "Shortcuts"],
  ["logging", "Logging"]
];

export function SettingsDialog({
  settings,
  tally,
  onChange,
  onClearTallyMessages,
  onSave,
  onClose
}: {
  settings: AppSettings;
  tally: TallyRuntimeState;
  onChange: (settings: AppSettings) => void;
  onClearTallyMessages: () => void;
  onSave: () => void;
  onClose: () => void;
}): ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>("server");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [tallyAdvancedOpen, setTallyAdvancedOpen] = useState(false);
  const shortcutEntries: Array<[keyof AppSettings["shortcuts"], string]> = [
    ["cue", "Cue"],
    ["play", "Play"],
    ["loop", "Loop"],
    ["assignA", "Assign A"],
    ["assignB", "Assign B"],
    ["assignC", "Assign C"],
    ["assignD", "Assign D"]
  ];
  const updateTallyChannel = (channel: ChannelId, value: number): void => {
    onChange({
      ...settings,
      tallyChannelIds: {
        ...settings.tallyChannelIds,
        [channel]: value
      }
    });
  };

  return (
    <div className="modal-backdrop">
      <section className="settings-modal">
        <div className="modal-head">
          <h2>Settings</h2>
          <button className="icon-button" title="Close" onClick={onClose}>
            <X size={17} />
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-tabs" aria-label="Settings sections">
            {tabs.map(([key, label]) => (
              <button key={key} className={classNames("settings-tab", activeTab === key && "selected")} onClick={() => setActiveTab(key)}>
                {label}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            {activeTab === "server" && (
              <div className="settings-pane">
                <div className="settings-grid">
                  <label>
                    Tria IP
                    <input value={settings.triaIp} onChange={(event) => onChange({ ...settings, triaIp: event.target.value })} />
                  </label>
                  <label>
                    TCP Port
                    <input
                      type="number"
                      value={settings.port}
                      onChange={(event) => onChange({ ...settings, port: Number(event.target.value) })}
                    />
                  </label>
                  <label className="settings-wide">
                    Working Folder
                    <input
                      value={settings.workingFolder}
                      onChange={(event) => onChange({ ...settings, workingFolder: event.target.value })}
                    />
                  </label>
                </div>

                <button className="text-button settings-advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
                  {advancedOpen ? "Hide Advanced" : "Show Advanced"}
                </button>

                {advancedOpen && (
                  <div className="settings-grid advanced-grid">
                    <label title="Lightweight AMP changed-ID check.">
                      ID Change Poll ms
                      <input
                        type="number"
                        value={settings.idChangePollMs}
                        onChange={(event) => onChange({ ...settings, idChangePollMs: Number(event.target.value) })}
                      />
                    </label>
                    <label title="Full folder and clip refresh.">
                      Full Inventory ms
                      <input
                        type="number"
                        value={settings.inventoryFullRefreshMs}
                        onChange={(event) => onChange({ ...settings, inventoryFullRefreshMs: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Transport Poll ms
                      <input
                        type="number"
                        value={settings.transportPollMs}
                        onChange={(event) => onChange({ ...settings, transportPollMs: Number(event.target.value) })}
                      />
                    </label>
                    <label title="Used for timecode, remaining time, and short-clip calculations.">
                      Frame Rate
                      <input
                        type="number"
                        value={settings.frameRate}
                        onChange={(event) => onChange({ ...settings, frameRate: Number(event.target.value) })}
                      />
                    </label>
                    <label>
                      Short Clip Seconds
                      <input
                        type="number"
                        min="0"
                        value={settings.shortClipThresholdSeconds}
                        onChange={(event) => onChange({ ...settings, shortClipThresholdSeconds: Number(event.target.value) })}
                      />
                    </label>
                  </div>
                )}
              </div>
            )}

            {activeTab === "newsroom" && (
              <div className="settings-pane placeholder-pane">
                <h3>Newsroom</h3>
                <p>MOS integration</p>
              </div>
            )}

            {activeTab === "tally" && (
              <div className="settings-pane">
                <div className="settings-grid">
                  <label className="settings-check settings-wide">
                    <input
                      type="checkbox"
                      checked={settings.tallyEnabled}
                      onChange={(event) => onChange({ ...settings, tallyEnabled: event.target.checked })}
                    />
                    TSL Listener On
                  </label>
                  <label className="settings-check settings-wide">
                    <input
                      type="checkbox"
                      checked={settings.onAirGuardEnabled}
                      onChange={(event) => onChange({ ...settings, onAirGuardEnabled: event.target.checked })}
                    />
                    OnAir Warning
                  </label>
                  <label>
                    TSL Port
                    <input
                      type="number"
                      value={settings.tallyPort}
                      onChange={(event) => onChange({ ...settings, tallyPort: Number(event.target.value) })}
                    />
                  </label>
                  {CHANNELS.map((channel) => (
                    <label key={channel}>
                      Channel {channel} TSL ID
                      <input
                        type="number"
                        min="0"
                        value={settings.tallyChannelIds[channel]}
                        onChange={(event) => updateTallyChannel(channel, Number(event.target.value))}
                      />
                    </label>
                  ))}
                </div>

                <button className="text-button settings-advanced-toggle" onClick={() => setTallyAdvancedOpen((value) => !value)}>
                  {tallyAdvancedOpen ? "Hide Advanced" : "Show Advanced"}
                </button>

                {tallyAdvancedOpen && (
                  <section className="tsl-console" aria-label="Incoming TSL messages">
                    <div className="console-head">
                      <div className="settings-subhead">Incoming TSL messages</div>
                      <button className="text-button" onClick={onClearTallyMessages}>
                        Clear
                      </button>
                    </div>
                    {tally.recentMessages.length === 0 ? (
                      <div className="console-empty">No matching TSL messages</div>
                    ) : (
                      tally.recentMessages.map((message) => (
                        <div key={`${message.at}-${message.sourceId}-${message.text}`} className="console-row">
                          <span>{new Date(message.at).toLocaleTimeString()}</span>
                          <span>Ch {message.channel}</span>
                          <span>ID {message.sourceId}</span>
                          <span>{message.state === "on-air" ? "ON AIR" : "OFF AIR"}</span>
                          <span>{message.kind}</span>
                          <span>{message.text}</span>
                        </div>
                      ))
                    )}
                  </section>
                )}
              </div>
            )}

            {activeTab === "shortcuts" && (
              <div className="settings-pane">
                <div className="shortcut-grid">
                  {shortcutEntries.map(([key, label]) => (
                    <label key={key}>
                      {label}
                      <input
                        value={settings.shortcuts[key]}
                        onKeyDown={(event) => {
                          event.preventDefault();
                          onChange({
                            ...settings,
                            shortcuts: {
                              ...settings.shortcuts,
                              [key]: event.code
                            }
                          });
                        }}
                        onChange={(event) =>
                          onChange({
                            ...settings,
                            shortcuts: {
                              ...settings.shortcuts,
                              [key]: event.target.value
                            }
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "logging" && (
              <div className="settings-pane">
                <div className="settings-grid">
                  <div className="settings-wide">
                    <div className="settings-subhead">Logging level</div>
                    <div className="segmented-control">
                      <button
                        className={classNames(settings.loggingLevel === "normal" && "selected")}
                        onClick={() => onChange({ ...settings, loggingLevel: "normal" })}
                      >
                        Normal
                      </button>
                      <button
                        className={classNames(settings.loggingLevel === "debug" && "selected")}
                        onClick={() => onChange({ ...settings, loggingLevel: "debug" })}
                      >
                        Debug
                      </button>
                    </div>
                    <p className="helper-text">
                      Turn Debug off during normal operation. It records high-volume protocol traffic and can create large local log files.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-actions">
          <button className="text-button" onClick={() => void window.tria.openLogsFolder()}>
            <ListRestart size={15} />
            Logs
          </button>
          <button className="text-button primary" onClick={onSave}>
            Save
          </button>
        </div>
      </section>
    </div>
  );
}
