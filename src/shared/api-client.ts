"use client";

export type ClientFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

function cookie(name: string) {
  return document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export async function api<T>(
  path: string,
  init: RequestInit & { interaction?: boolean } = {},
): Promise<T> {
  const method = init.method ?? "GET";
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (!["GET", "HEAD"].includes(method)) {
    const csrf = cookie("harbor_csrf");
    if (csrf) headers.set("x-harbor-csrf", decodeURIComponent(csrf));
  }
  if (init.interaction) headers.set("x-harbor-interaction", "1");
  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });
  const payload = (await response.json()) as {
    data?: T;
    error?: ClientFailure;
  };
  if (!response.ok || payload.error) {
    throw Object.assign(
      new Error(payload.error?.message ?? "Request failed."),
      {
        code: payload.error?.code ?? "REQUEST_FAILED",
        retryable: payload.error?.retryable ?? false,
      },
    );
  }
  return payload.data as T;
}
