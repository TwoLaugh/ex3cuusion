import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const lockDir = ".ex3cuusion-dev-server.lock";

export async function acquireDevServerLock(owner, timeoutMs = 180_000) {
  const started = Date.now();
  let announced = false;

  while (true) {
    try {
      mkdirSync(lockDir);
      writeFileSync(join(lockDir, "owner"), `${owner}\n${process.pid}\n${new Date().toISOString()}\n`);
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        rmSync(lockDir, { recursive: true, force: true });
      };
      process.once("exit", release);
      return release;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (removeStaleLock()) continue;
      if (!announced) {
        console.warn(`[dev-server-lock] ${owner} waiting for another Next dev runner to finish: ${lockOwner()}`);
        announced = true;
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`${owner} timed out waiting for Next dev runner lock held by ${lockOwner()}`);
      }
      await delay(500);
    }
  }
}

function removeStaleLock() {
  const ownerPath = join(lockDir, "owner");
  if (!existsSync(ownerPath)) return false;
  const [, pidLine] = readFileSync(ownerPath, "utf8").trim().split(/\r?\n/);
  const pid = Number(pidLine);
  if (!Number.isInteger(pid) || isPidRunning(pid)) return false;
  rmSync(lockDir, { recursive: true, force: true });
  return true;
}

function isPidRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function lockOwner() {
  const ownerPath = join(lockDir, "owner");
  if (!existsSync(ownerPath)) return "unknown process";
  return readFileSync(ownerPath, "utf8").trim().replace(/\r?\n/g, " / ");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
