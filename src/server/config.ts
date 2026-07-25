import path from "node:path";
import os from "node:os";

export const harborPort = Number(process.env.HARBOR_PORT || "47832");

export const harborDataDir =
  process.env.HARBOR_DATA_DIR ||
  (process.env.NODE_ENV === "development"
    ? path.join(process.env.LOCALAPPDATA || os.tmpdir(), "SupabaseHarbor-dev")
    : path.join(process.env.LOCALAPPDATA || os.tmpdir(), "SupabaseHarbor"));

export const databasePath = path.join(harborDataDir, "harbor.db");
export const logsDir = path.join(harborDataDir, "logs");
export const backupsDir = path.join(harborDataDir, "backups");
export const canonicalOrigin = `http://127.0.0.1:${harborPort}`;
