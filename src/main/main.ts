import { app, BrowserWindow, dialog, Menu } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AmpClient } from "./amp/ampClient.js";
import { AppController } from "./appController.js";
import { AppLogger } from "./logger.js";
import { AppStorage } from "./storage.js";
import { TallyListener } from "./tally/tallyListener.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
let controller: AppController | null = null;
let closeConfirmationOpen = false;
let confirmedClose = false;

async function createWindow(): Promise<void> {
  const logger = new AppLogger();
  await logger.init();

  const storage = new AppStorage();
  const amp = new AmpClient(logger);
  const tally = new TallyListener();
  controller = new AppController(storage, amp, logger, tally);
  controller.installIpc();
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#1a1a1a",
    icon: join(app.getAppPath(), "public/assets/app-icon.ico"),
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  mainWindow.on("close", (event) => {
    if (confirmedClose) {
      return;
    }
    event.preventDefault();
    if (closeConfirmationOpen || !mainWindow) {
      return;
    }

    closeConfirmationOpen = true;
    void dialog
      .showMessageBox(mainWindow, {
        type: "warning",
        buttons: ["Yes", "No"],
        defaultId: 1,
        cancelId: 1,
        title: "Exit?",
        message: "Exit?"
      })
      .then((result) => {
        closeConfirmationOpen = false;
        if (result.response === 0) {
          confirmedClose = true;
          controller?.shutdown();
          mainWindow?.close();
        }
      });
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    void logger.write("ERROR", "Renderer failed to load", {
      errorCode,
      errorDescription,
      validatedUrl
    });
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    void logger.write("ERROR", "Renderer process gone", details);
  });

  mainWindow.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      void logger.write("WARN", "Renderer console message", {
        level,
        message,
        line,
        sourceId
      });
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await mainWindow.loadURL(devServerUrl);
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  controller?.shutdown();
  if (process.platform !== "darwin") {
    app.quit();
  }
});
