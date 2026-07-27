import path from "node:path";
import os from "node:os";

export const harborPort = Number(process.env.HARBOR_PORT || "47832");

const localAppData = process.env.LOCALAPPDATA || os.tmpdir();
export const logsDir = path.join(
  localAppData,
  process.env.NODE_ENV === "development"
    ? "SupabaseHarbor-dev"
    : "SupabaseHarbor",
  "logs",
);
export const canonicalOrigin = `http://127.0.0.1:${harborPort}`;
