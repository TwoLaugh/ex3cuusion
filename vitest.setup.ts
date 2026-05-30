import "@testing-library/jest-dom/vitest";
import fs from "node:fs";
import path from "node:path";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const [key, ...rest] = line.split("=");
    if (key && rest.length > 0 && !process.env[key]) {
      process.env[key] = rest.join("=");
    }
  }
}
