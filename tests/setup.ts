import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll } from "vitest";

const testRoot = path.resolve(
  os.tmpdir(),
  "supabase-harbor-tests",
  String(process.pid),
);
process.env.HARBOR_DATA_DIR = testRoot;
process.env.HARBOR_LOG_LEVEL = "silent";

beforeAll(() => {
  fs.mkdirSync(testRoot, { recursive: true });
});

afterAll(() => {
  const resolved = path.resolve(testRoot);
  if (
    resolved.startsWith(path.resolve(os.tmpdir(), "supabase-harbor-tests")) &&
    fs.existsSync(resolved)
  ) {
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
