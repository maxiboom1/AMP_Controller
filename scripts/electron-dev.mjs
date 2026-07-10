import { spawn } from "node:child_process";
import net from "node:net";
import electronPath from "electron";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const vite = spawn(npmCommand, ["run", "dev"], {
  stdio: "inherit",
  shell: false
});

function waitForPort(port, host) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    function retry() {
      const socket = net.createConnection({ port, host });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt > 30000) {
          reject(new Error(`Timed out waiting for ${host}:${port}`));
          return;
        }
        setTimeout(retry, 250);
      });
    }

    retry();
  });
}

function stop(child) {
  if (!child.killed) {
    child.kill();
  }
}

try {
  await waitForPort(5173, "127.0.0.1");
  const electron = spawn(electronPath, ["."], {
    stdio: "inherit",
    shell: false,
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: "http://127.0.0.1:5173"
    }
  });

  electron.on("exit", (code) => {
    stop(vite);
    process.exit(code ?? 0);
  });
} catch (error) {
  console.error(error);
  stop(vite);
  process.exit(1);
}
