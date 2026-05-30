import { spawn, spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const runner = isWindows ? "cmd.exe" : "npx";
const env = {
  ...process.env,
  EX3CUUSION_AI_MODE: "fixture"
};
const baseUrl = "http://127.0.0.1:3017";

let server = null;
let stopped = false;
let startupError = null;

async function isServerReady() {
  try {
    const response = await fetch(baseUrl);
    return response.ok || response.status < 500;
  } catch {
    return false;
  }
}

function startServer() {
  const args = isWindows
    ? ["/c", "npx", "next", "dev", "--hostname", "127.0.0.1", "--port", "3017"]
    : ["next", "dev", "--hostname", "127.0.0.1", "--port", "3017"];

  server = spawn(runner, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    process.stderr.write(chunk);
    if (text.includes("EADDRINUSE")) {
      startupError = new Error("Port 3017 is already in use.");
      stopServer();
    }
  });
  server.on("exit", (code) => {
    if (!stopped && code !== 0) {
      startupError = new Error(`Next dev server exited before becoming ready with code ${code ?? 1}.`);
    }
  });
}

function stopServer() {
  if (stopped || !server || server.exitCode !== null) return;
  stopped = true;
  if (isWindows) {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    server.kill("SIGTERM");
  }
}

async function waitForServer() {
  const deadline = Date.now() + 120_000;
  while (Date.now() <= deadline) {
    if (startupError) throw startupError;
    if (await isServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Timed out waiting for Next dev server on port 3017.");
}

function runPlaywright() {
  return new Promise((resolve) => {
    const args = isWindows ? ["/c", "npx", "playwright", "test"] : ["playwright", "test"];
    const testProcess = spawn(runner, args, {
      env,
      stdio: "inherit"
    });
    testProcess.on("exit", (code) => resolve(code ?? 1));
  });
}

try {
  if (!(await isServerReady())) {
    startServer();
    await waitForServer();
  }
  const code = await runPlaywright();
  stopServer();
  process.exit(code);
} catch (error) {
  stopServer();
  console.error(error);
  process.exit(1);
}
