# Tria AMP Controller

Version: `1.0.17`

Tria AMP Controller is a portable Windows Electron app for controlling four Ross Tria VTR channels over AMP over Ethernet. It is designed for an operator workflow: browse the working Tria clip folder, build a rundown list, assign list items to channels `A-D`, cue/play items, and control each VTR channel directly.

The app was built for offline development on a Windows PC and live validation on the target Tria machine.

## System Overview

- Runtime: Electron main process + React/Vite renderer.
- Language: TypeScript.
- AMP transport: Node TCP sockets in the Electron main process.
- UI process access: secure preload IPC API, no direct TCP access from React.
- Target: Ross Tria configured for `AMP over Ethernet`.
- Default TCP port: `3811`.
- Channel mapping:
  - App channel `A` -> AMP `Vtr1`
  - App channel `B` -> AMP `Vtr2`
  - App channel `C` -> AMP `Vtr3`
  - App channel `D` -> AMP `Vtr4`

On connect, the app opens four TCP sockets to the configured Tria IP and sends one greeting per channel:

```text
CRAT0007204Vtr1
CRAT0007204Vtr2
CRAT0007204Vtr3
CRAT0007204Vtr4
```

The app then sends an initial eject and auto-mode command on each channel. This is intentional: on the tested Tria system, AMP transport control was reliable only after ejecting any currently loaded channel state.

## Operator Workflow

The main UI has three working areas:

- Left: four player panels for channels `A-D`.
- Center: rundown/list table.
- Right: clip inventory for the configured working folder.

Typical workflow:

1. Configure Tria IP, TCP port, working folder, frame rate, and shortcuts in Settings.
2. Connect to Tria.
3. Drag clips from the right inventory into the center rundown list.
4. Assign list items to channels with shortcuts or by the UI assignment flow.
5. Select a list item and use Cue/Play shortcuts for rundown-driven operation.
6. Use the channel transport buttons for direct channel control.

Important rundown behavior:

- A clip name can appear only once in the list.
- If an operator tries to add an existing clip again, the existing row is selected and the footer shows a status message.
- Multiple list items can be assigned to the same channel, but only one item per channel can be `CUED` or `PLAYING`.
- Offline list items are shown red and cue/play is inhibited.
- The list can be traversed with `ArrowUp` and `ArrowDown`.

Important channel behavior:

- Channel Play buttons send `PLAY` directly to that channel and do not depend on the selected list item.
- Pause, Loop, and Eject are direct channel controls.
- The channel Loop button reflects the last loop command sent by the app, because the tested Tria status bit did not reliably represent loop state.
- Cueing a list item also sends its item loop attribute to the assigned player after cue. Looped items send loop on; non-looped items send loop off.

## Inventory And Polling

Inventory is loaded from the configured working folder. In the tested Tria setup, the Tria RS-422/AMP settings used:

- Protocol: `AMP over Ethernet`
- Folder format: `Sony`
- Protocol ID: `Generic DDR`
- AMP port: `3811`

The app polls Tria so the UI stays synchronized:

- ID change polling: default `6000 ms`
- Full inventory refresh: default `30000 ms`
- Transport/timecode polling: default `500 ms`

Transport polling requests:

- channel status
- current timecode
- loaded ID, every few polling cycles

The renderer smooths running timecode locally between Tria polls, then resynchronizes from the next Tria timecode response.

## TSL Tally

The app listens for Ross Carbonite TSL 3.1 UMD messages over TCP on the configured TSL port. In the validated Carbonite setup, the PGM source update reports source IDs such as `006:VTR-A`, `007:VTR-B`, `008:VTR-C`, and `009:VTR-D`. The matching channel badge turns red while its configured source ID is on-air.

## Settings, Shortcuts, And Persistence

Settings are persisted with `electron-store` under Electron `userData`.

Default settings:

```text
Tria IP: 192.168.1.100
Port: 3811
Working folder: empty
ID change poll: 6000 ms
Full inventory refresh: 30000 ms
Transport poll: 500 ms
Frame rate: 25
Short clip threshold: 10 seconds
TSL port: 8900
TSL channel IDs: A=6, B=7, C=8, D=9
Play shortcut: Space
Cue shortcut: Enter
Loop shortcut: KeyL
Assign A/B/C/D: Digit1/Digit2/Digit3/Digit4
```

Shortcut values use browser keyboard codes. Examples:

- Main Enter: `Enter`
- Numeric keypad Enter: `NumpadEnter`
- Spacebar: `Space`
- Letter L: `KeyL`
- Number row 1: `Digit1`
- Numpad 1: `Numpad1`

The operator list is also persisted locally between launches.

## Logging And Debugging

The app writes dated debug logs under:

```text
Electron userData/logs
```

Use Settings -> Logs to open the log folder on the running machine.

Logs include:

- raw AMP TX/RX
- parsed AMP messages
- socket connection errors
- skipped commands when a channel is not connected
- high-level UI/status actions

These logs are important for target-site debugging because development can happen on a PC that is not connected to Tria.

## AMP Implementation Notes

AMP protocol helpers live in the main process code. The app currently implements the commands needed for this workflow:

- list folders
- set bin / working folder
- list first/next clip ID
- ID changed polling
- cue/load clip
- play
- stop/pause
- eject
- loop on/off
- auto mode
- status sense
- current timecode
- loaded ID request
- clip duration request

String commands are encoded as AMP `CMDS` messages with UTF-8 payload bytes. Incoming AMP data is parsed from TCP stream buffers and can contain multiple AMP messages in one socket data event.

The renderer never talks to sockets directly. It calls the preload API, which invokes Electron IPC handlers in the main process.

## Development

Install dependencies:

```powershell
npm install
```

If using the bundled local Node toolchain in this workspace, prepend `.tools\node` to PATH first:

```powershell
$env:Path = "$(Resolve-Path .\.tools\node);$env:Path"
```

Run the renderer dev server only:

```powershell
npm run dev
```

Run Electron in development mode:

```powershell
npm run electron:dev
```

Typecheck:

```powershell
npm run typecheck
```

Run tests:

```powershell
npm test
```

Build production files:

```powershell
npm run build
```

Build the portable Windows EXE:

```powershell
npm run package
```

The portable EXE is written to:

```text
release/Tria AMP Controller.exe
```

For the fastest startup on the operator machine, run the unpacked build directly:

```text
release/win-unpacked/Tria AMP Controller.exe
```

## Test Coverage

Current unit tests cover:

- AMP command building and parsing
- AMP name list decoding
- status/timecode parsing helpers
- playlist state helpers, including duplicate clip-name prevention
- IPC channel contract between preload and main process

Before copying a new EXE to the Tria machine, run:

```powershell
npm run typecheck
npm test
npm run package
```

## Known Operational Assumptions

- The app controls one Tria IP at a time.
- The app uses four Tria AMP connections, mapped to `Vtr1-Vtr4`.
- The working folder should be configured to the folder the operator actually uses, for example `IMPORTS`.
- The Tria AMP folder format may need to be `Sony` for clip listing to work as expected.
- Cue/play from the rundown requires the item to be online and assigned to a channel.
- Direct channel Play does not require a selected rundown item.
- Final protocol validation must happen on a Tria-connected machine.
