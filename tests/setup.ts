import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
process.env.HARBOR_LOG_LEVEL = "silent";
