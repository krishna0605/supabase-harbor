import { HarborError } from "@/shared/errors/harbor-error";
import {
  organizationsSchema,
  profileSchema,
  projectApiKeysSchema,
  projectSchema,
  projectsSchema,
  serviceHealthSchema,
} from "@/server/supabase/schemas";
import { logger } from "@/server/logging/logger";
import type { ZodType } from "zod";

const BASE_URL = "https://api.supabase.com";
const READ_RETRIES = 2;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelay(response: Response | null, attempt: number) {
  const retryAfter = response?.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
  }
  return Math.min(1000 * 2 ** attempt + Math.random() * 250, 10_000);
}

function upstreamError(
  response: Response,
  context?: { accountId?: string; projectRef?: string },
) {
  if (response.status === 401) {
    return new HarborError(
      "SUPABASE_UNAUTHORIZED",
      "Supabase rejected this account token.",
      401,
      false,
      context,
    );
  }
  if (response.status === 403) {
    return new HarborError(
      "SUPABASE_FORBIDDEN",
      "This token does not have the required Supabase permissions.",
      403,
      false,
      context,
    );
  }
  if (response.status === 429) {
    return new HarborError(
      "SUPABASE_RATE_LIMITED",
      "Supabase rate-limited this request. Try again shortly.",
      429,
      true,
      context,
    );
  }
  return new HarborError(
    "SUPABASE_UPSTREAM_ERROR",
    `Supabase returned HTTP ${response.status}.`,
    502,
    response.status >= 500,
    context,
  );
}

async function request<T>(
  token: string,
  pathname: string,
  schema: ZodType<T> | null,
  options: {
    method?: "GET" | "POST";
    timeoutMs?: number;
    retryReads?: boolean;
    context?: { accountId?: string; projectRef?: string };
  } = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const retries =
    method === "GET" && options.retryReads !== false ? READ_RETRIES : 0;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? 15_000,
    );
    let response: Response | null = null;
    try {
      response = await fetch(`${BASE_URL}${pathname}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          "user-agent": "supabase-harbor/0.1.0",
        },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        const error = upstreamError(response, options.context);
        if (attempt < retries && error.retryable) {
          await delay(retryDelay(response, attempt));
          continue;
        }
        throw error;
      }
      if (!schema) return undefined as T;
      const json = await response.json();
      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        logger.warn(
          {
            pathname,
            issues: parsed.error.issues.map((issue) => issue.path.join(".")),
          },
          "Supabase response did not match the expected schema",
        );
        throw new HarborError(
          "SUPABASE_INVALID_RESPONSE",
          "Supabase returned an unexpected response.",
          502,
          false,
          options.context,
        );
      }
      return parsed.data;
    } catch (error) {
      lastError = error;
      if (error instanceof HarborError) throw error;
      if (attempt < retries) {
        await delay(retryDelay(response, attempt));
        continue;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new HarborError(
          "SUPABASE_TIMEOUT",
          "Supabase did not respond in time.",
          504,
          true,
          options.context,
        );
      }
      throw new HarborError(
        "SUPABASE_OFFLINE",
        "Could not reach the Supabase Management API.",
        503,
        true,
        options.context,
      );
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export const supabaseManagement = {
  profile(token: string) {
    return request(token, "/v1/profile", profileSchema);
  },
  organizations(token: string) {
    return request(token, "/v1/organizations", organizationsSchema);
  },
  projects(token: string) {
    return request(token, "/v1/projects", projectsSchema);
  },
  project(token: string, ref: string, accountId?: string) {
    return request(
      token,
      `/v1/projects/${encodeURIComponent(ref)}`,
      projectSchema,
      {
        context: { accountId, projectRef: ref },
      },
    );
  },
  health(token: string, ref: string, accountId?: string) {
    const params = new URLSearchParams({
      services: "auth,db,pooler,realtime,rest,storage",
      timeout_ms: "5000",
    });
    return request(
      token,
      `/v1/projects/${encodeURIComponent(ref)}/health?${params}`,
      serviceHealthSchema,
      {
        timeoutMs: 10_000,
        context: { accountId, projectRef: ref },
      },
    );
  },
  projectApiKeys(token: string, ref: string, accountId?: string) {
    return request(
      token,
      `/v1/projects/${encodeURIComponent(ref)}/api-keys?reveal=true`,
      projectApiKeysSchema,
      {
        context: { accountId, projectRef: ref },
      },
    );
  },
  restore(token: string, ref: string, accountId?: string) {
    return request<void>(
      token,
      `/v1/projects/${encodeURIComponent(ref)}/restore`,
      null,
      {
        method: "POST",
        retryReads: false,
        context: { accountId, projectRef: ref },
      },
    );
  },
};
