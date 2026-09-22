import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function localEnvValue(name) {
  try {
    const contents = readFileSync(resolve(".env.local"), "utf8");
    const line = contents.split(/\r?\n/).find((entry) => entry.startsWith(`${name}=`));
    if (!line) return "";
    return line.slice(name.length + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
  } catch {
    return "";
  }
}

const apiKey = process.env.GROQ_API_KEY || localEnvValue("GROQ_API_KEY");
if (!apiKey) {
  process.stderr.write("GROQ_API_KEY is required in the environment or .env.local.\n");
  process.exit(1);
}

const vitest = resolve("node_modules", "vitest", "vitest.mjs");
const result = spawnSync(
  process.execPath,
  [vitest, "run", "src/lib/ai/answer-quality-live.test.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      GROQ_API_KEY: apiKey,
      OWLIE_LIVE_EVAL: "1",
    },
  },
);

process.exit(result.status ?? 1);
