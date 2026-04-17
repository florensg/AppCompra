/**
 * api.ts — capa de acceso a datos.
 * Ahora usa directamente la Google Sheets API v4 (sheetsApi.ts)
 * en lugar del backend de Apps Script.
 */

import { BootstrapResponse, Entry, TotalsResponse } from "./types";
import { fetchBootstrap as sheetsFetchBootstrap, saveBatch, computeTotals } from "./sheetsApi";
import { MOCK_ITEMS } from "./mockCatalog";

export async function fetchBootstrap(): Promise<BootstrapResponse> {
  try {
    const data = await sheetsFetchBootstrap();
    return data.items.length > 0 ? data : { items: MOCK_ITEMS, latestPrices: {} };
  } catch (err) {
    console.warn("fetchBootstrap falló, usando catálogo local:", err);
    return { items: MOCK_ITEMS, latestPrices: {} };
  }
}

export async function sendEntriesBatch(entries: Entry[]): Promise<{ ok: boolean }> {
  await saveBatch(entries);
  return { ok: true };
}

export async function syncEntries(entries: Entry[]): Promise<{ ok: boolean }> {
  await saveBatch(entries);
  return { ok: true };
}

export async function fetchTotals(date?: string): Promise<TotalsResponse> {
  return computeTotals(date);
}
