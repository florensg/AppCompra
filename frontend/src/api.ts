import { APP_SCRIPT_URL } from "./constants";
import { BootstrapResponse, Entry, TotalsResponse } from "./types";

const isLocalDev =
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "[::1]";

const isApiEnabled = (): boolean => isLocalDev || APP_SCRIPT_URL.length > 0;

const buildUrl = (path: string): string => {
  const cleanPath = path.replace(/^\/+/, "");
  if (isLocalDev) {
    return `/api/${cleanPath}`;
  }
  const base = APP_SCRIPT_URL.replace(/\/+$/, "");
  return `${base}/${cleanPath}`;
};

async function requestGet<T>(path: string): Promise<T> {
  if (!isApiEnabled()) {
    throw new Error("APP_SCRIPT_URL no configurado.");
  }

  const response = await fetch(buildUrl(path), { method: "GET" });
  if (!response.ok) {
    throw new Error(`API GET error (${response.status}) url=${response.url}`);
  }
  return (await response.json()) as T;
}

async function requestPost<T>(path: string, payload: unknown): Promise<T> {
  if (!isApiEnabled()) {
    throw new Error("APP_SCRIPT_URL no configurado.");
  }

  // text/plain evita preflight CORS innecesario contra Apps Script.
  const response = await fetch(buildUrl(path), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`API POST error (${response.status}) url=${response.url}`);
  }

  return (await response.json()) as T;
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  if (!isApiEnabled()) {
    return { items: [], latestPrices: {} };
  }
  return requestGet<BootstrapResponse>("bootstrap");
}

export async function sendEntriesBatch(entries: Entry[]): Promise<{ ok: boolean }> {
  return requestPost<{ ok: boolean }>("entries/batch", { entries });
}

export async function syncEntries(entries: Entry[]): Promise<{ ok: boolean }> {
  return requestPost<{ ok: boolean }>("sync", { entries });
}

export async function fetchTotals(date?: string): Promise<TotalsResponse> {
  const query = date ? `totals?date=${encodeURIComponent(date)}` : "totals";
  return requestGet<TotalsResponse>(query);
}
