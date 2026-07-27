import { z } from "zod";
import { HarborError } from "@/shared/errors/harbor-error";

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const timestampSchema = z.string().datetime({ offset: true });

export type HeartbeatResult = {
  pingedAt: string;
  upstreamStatus: number;
};

export function heartbeatUrl(projectRef: string) {
  if (!PROJECT_REF_PATTERN.test(projectRef)) {
    throw new HarborError(
      "KEEPALIVE_PROJECT_REF_INVALID",
      "The Supabase project reference is invalid.",
      400,
    );
  }
  return `https://${projectRef}.supabase.co/rest/v1/rpc/harbor_ping`;
}

function heartbeatError(response: Response) {
  if (response.status === 401 || response.status === 403) {
    return new HarborError(
      "KEEPALIVE_KEY_REJECTED",
      "Supabase rejected the project publishable key.",
      409,
      false,
    );
  }
  if (response.status === 404) {
    return new HarborError(
      "KEEPALIVE_RPC_NOT_INSTALLED",
      "Run the Harbor enrollment SQL in this project before enrolling it.",
      409,
      false,
    );
  }
  if (response.status === 429) {
    return new HarborError(
      "KEEPALIVE_RATE_LIMITED",
      "Supabase rate-limited the heartbeat request.",
      429,
      true,
    );
  }
  return new HarborError(
    "KEEPALIVE_UPSTREAM_ERROR",
    `Supabase returned HTTP ${response.status} for the heartbeat request.`,
    502,
    response.status >= 500,
  );
}

export async function pingProject(
  projectRef: string,
  credential: string,
  timeoutMs = 10_000,
): Promise<HeartbeatResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(heartbeatUrl(projectRef), {
      method: "POST",
      headers: {
        apikey: credential,
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": "supabase-harbor/0.1.0",
      },
      body: "{}",
      redirect: "error",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw heartbeatError(response);
    const parsed = timestampSchema.safeParse(await response.json());
    if (!parsed.success) {
      throw new HarborError(
        "KEEPALIVE_INVALID_RESPONSE",
        "Supabase returned an unexpected heartbeat response.",
        502,
        false,
      );
    }
    const timestamp = Date.parse(parsed.data);
    if (
      timestamp < Date.now() - 5 * 60_000 ||
      timestamp > Date.now() + 5 * 60_000
    ) {
      throw new HarborError(
        "KEEPALIVE_INVALID_RESPONSE",
        "Supabase returned an invalid heartbeat timestamp.",
        502,
        false,
      );
    }
    return { pingedAt: parsed.data, upstreamStatus: response.status };
  } catch (error) {
    if (error instanceof HarborError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new HarborError(
        "KEEPALIVE_TIMEOUT",
        "The Supabase heartbeat request timed out.",
        504,
        true,
      );
    }
    throw new HarborError(
      "KEEPALIVE_OFFLINE",
      "Could not reach the Supabase project Data API.",
      503,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}
