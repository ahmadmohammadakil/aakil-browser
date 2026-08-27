const { spawn } = require("node:child_process");

const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const env = { ...process.env, ELECTRON_START_URL: "http://127.0.0.1:1420" };
const vite = spawn(command, ["dev", "--", "--host", "127.0.0.1"], { stdio: "inherit", env });
let electronProcess;
let closed = false;

function shutdown(code = 0) {
  if (closed) return;
  closed = true;
  if (electronProcess && !electronProcess.killed) electronProcess.kill();
  if (!vite.killed) vite.kill();
  process.exit(code);
}

setTimeout(() => {
  electronProcess = spawn(command, ["exec", "electron", "electron/main.cjs"], { stdio: "inherit", env });
  electronProcess.on("exit", (code) => shutdown(code || 0));
}, 1500);

vite.on("error", (error) => {
  console.error("تعذر تشغيل Vite:", error.message);
  shutdown(1);
});
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
