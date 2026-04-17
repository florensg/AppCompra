import { BootstrapResponse, Entry, TotalsResponse } from "./types";
import { APP_SCRIPT_URL } from "./constants";
import { MOCK_ITEMS } from "./mockCatalog";

// Helper for fetching Apps Script backend
async function fetchGas(path: string, options: RequestInit = {}) {
  if (!APP_SCRIPT_URL) throw new Error("Aún no has configurado tu APP_SCRIPT_URL.");
  
  // Clean base URL and append path (for Google Apps Script pathInfo)
  const baseUrl = APP_SCRIPT_URL.replace(/\/+$/, "");
  const [route, queryStr] = path.split("?");
  const cleanRoute = route.replace(/^\/+/, "");
  const url = `${baseUrl}/${cleanRoute}${queryStr ? "?" + queryStr : ""}`;

  // GAS requires plain text to avoid CORS preflight OPTIONS rejection
  const headers = new Headers(options.headers || {});
  if (options.method === "POST" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "text/plain;charset=utf-8");
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  try {
    const data = await fetchGas("bootstrap");
    return data.items && data.items.length > 0 ? data : { items: MOCK_ITEMS, latestPrices: {} };
  } catch (err) {
    console.warn("fetchBootstrap falló, usando catálogo local:", err);
    return { items: MOCK_ITEMS, latestPrices: {} };
  }
}

export async function sendEntriesBatch(entries: Entry[]): Promise<{ ok: boolean }> {
  await fetchGas("entries/batch", {
    method: "POST",
    body: JSON.stringify({ entries })
  });
  return { ok: true };
}

export async function syncEntries(entries: Entry[]): Promise<{ ok: boolean }> {
  await fetchGas("sync", {
    method: "POST",
    body: JSON.stringify({ entries })
  });
  return { ok: true };
}

export async function fetchTotals(date?: string): Promise<TotalsResponse> {
  const path = date ? `totals?date=${encodeURIComponent(date)}` : "totals";
  return fetchGas(path);
}
