import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { HarborError } from "@/shared/errors/harbor-error";
import type { ApiFailure, ApiSuccess } from "@/shared/types/api";

export function ok<T>(data: T, init?: { status?: number; stale?: boolean }) {
  const payload: ApiSuccess<T> = {
    data,
    meta: {
      requestId: randomUUID(),
      generatedAt: new Date().toISOString(),
      stale: init?.stale,
    },
  };
  return NextResponse.json(payload, { status: init?.status ?? 200 });
}

export function failure(error: unknown) {
  const normalized =
    error instanceof HarborError
      ? error
      : new HarborError(
          "INTERNAL_ERROR",
          "Harbor could not complete the request.",
          500,
          false,
        );
  const payload: ApiFailure = {
    error: {
      code: normalized.code,
      message: normalized.message,
      retryable: normalized.retryable,
      ...normalized.context,
    },
    meta: { requestId: randomUUID() },
  };
  const response = NextResponse.json(payload, { status: normalized.status });
  if (normalized.retryAfterMs !== undefined) {
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil(normalized.retryAfterMs / 1000))),
    );
  }
  return response;
}
