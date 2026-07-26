"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock as an external store.
 *
 * Reading `Date.now()` during render is impure and risks a hydration mismatch —
 * the server and client would disagree about how stale a timestamp is. This is
 * the sanctioned way to read a mutable external value, and it earns something
 * useful: relative times tick forward on their own, so "2m ago" becomes "3m
 * ago" without a refetch.
 *
 * Snapshots are bucketed so `getSnapshot` stays stable between ticks. Returning
 * a fresh `Date.now()` every call would loop forever.
 */

const BUCKET_MS = 60_000;

let listeners: (() => void)[] = [];
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(onChange: () => void) {
  listeners.push(onChange);
  timer ??= setInterval(() => {
    for (const listener of listeners) listener();
  }, BUCKET_MS);

  return () => {
    listeners = listeners.filter((listener) => listener !== onChange);
    if (listeners.length === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

function getSnapshot() {
  return Math.floor(Date.now() / BUCKET_MS) * BUCKET_MS;
}

/**
 * Server snapshot is 0. Nothing time-relative is server-rendered on these
 * screens, and a constant keeps hydration quiet.
 */
function getServerSnapshot() {
  return 0;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
