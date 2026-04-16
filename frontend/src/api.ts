import { APP_SCRIPT_URL } from "./constants";
import { BootstrapResponse, Entry, TotalsResponse } from "./types";

const isApiEnabled = (): boolean => APP_SCRIPT_URL.length > 0;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!isApiEnabled()) {
    throw new Error("APP_SCRIPT_URL no configurado.");
  }

  const response = await fetch(`${APP_SCRIPT_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });

  if (!response.ok) {
    throw new Error(`API error (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  if (!isApiEnabled()) {
    return { items: [], latestPrices: {} };
  }
  return request<BootstrapResponse>("/bootstrap");
}

export async function sendEntriesBatch(entries: Entry[]): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/entries/batch", {
    method: "POST",
    body: JSON.stringify({ entries })
  });
}

export async function syncEntries(entries: Entry[]): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>("/sync", {
    method: "POST",
    body: JSON.stringify({ entries })
  });
}

export async function fetchTotals(date?: string): Promise<TotalsResponse> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  return request<TotalsResponse>(`/totals${query}`);
}
