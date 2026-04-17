/**
 * Google Sheets API v4 — reemplaza el backend de Apps Script.
 * Replica la lógica de Code.gs (buildBootstrap_, saveBatch_, computeTotals_)
 * directamente en el frontend con el token OAuth2 del usuario.
 */

import { requestToken } from "./auth";
import { ACTIVE_STORES, SPREADSHEET_ID } from "./constants";
import { BootstrapResponse, CategoryId, Entry, StoreName, TotalsResponse } from "./types";

const BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEET_COMPRAS = "Compras";
const SHEET_ENTRIES = "app_entries";
const START_ROW = 3; // datos empiezan en fila 3 (fila 1 = headers, fila 2 = vacía o subtítulo)

// ─── helpers ──────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function normalizeText(v: unknown): string {
  return String(v ?? "").trim();
}

type SheetRow = (string | number | boolean)[];

async function sheetsGet<T>(path: string): Promise<T> {
  const token = await requestToken();
  const res = await fetch(`${BASE}/${SPREADSHEET_ID}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function sheetsPost<T>(path: string, body: unknown): Promise<T> {
  const token = await requestToken();
  const res = await fetch(`${BASE}/${SPREADSHEET_ID}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── bootstrap ────────────────────────────────────────────────────────────────

interface ValuesResponse {
  values?: SheetRow[];
}

/**
 * Lee la hoja "Compras" y arma el catálogo de ítems + últimos precios.
 * Replica buildBootstrap_() de Code.gs.
 */
export async function fetchBootstrap(): Promise<BootstrapResponse> {
  const range = encodeURIComponent(`${SHEET_COMPRAS}!A1:Z`);
  const data = await sheetsGet<ValuesResponse>(`/values/${range}`);
  const rows: SheetRow[] = data.values ?? [];

  if (rows.length === 0) return { items: [], latestPrices: {} };

  // Fila 0 = encabezados (HEADERS_ROW = 1 en Apps Script, índice 0 aquí)
  const headerRow = rows[0] as string[];
  const storeColumns = findRightmostStoreColumns(headerRow, ACTIVE_STORES);

  const items = [];
  const latestPrices: BootstrapResponse["latestPrices"] = {};

  // Datos arrancan desde START_ROW (fila 3) → índice START_ROW - 1 = 2
  const dataStartIdx = START_ROW - 1;

  for (let idx = dataStartIdx; idx < rows.length; idx++) {
    const row = rows[idx];
    const categoriaRaw = row[0];
    const nombre = normalizeText(row[1]);
    if (!nombre) continue;

    const categoria = Number(categoriaRaw);
    if (![1, 2, 3].includes(categoria)) continue;

    const hay = Number(row[2] ?? 0);
    const itemId = `r${idx + 1}`; // +1 porque el spreadsheet es 1-indexed
    const stockObjetivo = Math.max(hay, 1);
    const sugerida = Math.max(stockObjetivo - hay, 0);

    items.push({
      id: itemId,
      nombre,
      categoria: categoria as CategoryId,
      hay,
      stockObjetivo,
      sugerida
    });

    latestPrices[itemId] = {};
    for (const store of ACTIVE_STORES) {
      const col = storeColumns[store];
      if (col === null) continue;
      const value = Number(row[col] ?? 0);
      if (value > 0) latestPrices[itemId][store] = value;
    }
  }

  return { items, latestPrices };
}

// ─── saveBatch ────────────────────────────────────────────────────────────────

interface BatchUpdateValuesBody {
  valueInputOption: string;
  data: { range: string; values: SheetRow[] }[];
}

interface SpreadsheetMetadata {
  sheets: { properties: { title: string; sheetId: number } }[];
}

/**
 * Verifica si la hoja app_entries existe; si no, la crea con los headers.
 * Equivale a getOrCreateEntriesSheet_() de Code.gs.
 */
async function ensureEntriesSheet(): Promise<void> {
  const meta = await sheetsGet<SpreadsheetMetadata>(`?fields=sheets.properties.title`);
  const exists = meta.sheets.some((s) => s.properties.title === SHEET_ENTRIES);
  if (exists) return;

  await sheetsPost(`:batchUpdate`, {
    requests: [{ addSheet: { properties: { title: SHEET_ENTRIES } } }]
  });

  const headersRange = encodeURIComponent(`${SHEET_ENTRIES}!A1`);
  await sheetsPost(`/values/${headersRange}:append?valueInputOption=USER_ENTERED`, {
    values: [["timestamp", "rondaId", "fecha", "supermercado", "itemId",
               "precioUnitario", "cantidad", "subtotal", "source", "createdAt"]]
  });
}

/**
 * Finds existing columns for the given date in the Compras sheet.
 * NEW structure: row 1 = date (merged across store cols), row 2 = store names.
 * When a merge is present, row1 has the date only in the leftmost cell; others are empty.
 * So: find c where row1[c]=fecha, then scan row2[c..c+stores-1] for store names.
 */
function findDateColumns(
  row1: string[],
  row2: string[],
  fecha: string,
  stores: StoreName[]
): Record<StoreName, number | null> {
  const found = Object.fromEntries(stores.map((s) => [s, null])) as Record<StoreName, number | null>;
  for (let c = 0; c < row1.length; c++) {
    if (normalizeText(row1[c]) !== fecha) continue;
    // Found the start of a date group. Check this column + next (stores.length-1) for store names.
    for (let offset = 0; offset < stores.length; offset++) {
      const col = c + offset;
      if (col >= row2.length) break;
      const store = normalizeText(String(row2[col] ?? "")).toUpperCase() as StoreName;
      if ((stores as string[]).includes(store) && found[store as StoreName] === null) {
        found[store as StoreName] = col;
      }
    }
  }
  return found;
}

/**
 * Creates new column group by INSERTING 4 cols at position D (index 3).
 * Structure:
 *   Row 1: D1:F1 merged → date string
 *   Row 2: D2=CHEEK, E2=CUCHER, F2=VITAL
 *   Row 3+: prices per product
 *   Col G: empty separator
 */
async function createDateColumns(
  fecha: string,
  stores: StoreName[]
): Promise<Record<StoreName, number>> {
  const meta = await sheetsGet<SpreadsheetMetadata>(`?fields=sheets.properties`);
  const comprasSheet = meta.sheets.find((s) => s.properties.title === SHEET_COMPRAS);
  if (!comprasSheet) throw new Error(`Hoja "${SHEET_COMPRAS}" no encontrada en el Spreadsheet.`);
  const sheetId = comprasSheet.properties.sheetId;

  const numNew = stores.length + 1; // 3 store cols + 1 separator

  // Insert columns AND merge the date header in a single batchUpdate
  await sheetsPost(`:batchUpdate`, {
    requests: [
      {
        insertDimension: {
          range: {
            sheetId,
            dimension: "COLUMNS",
            startIndex: 3,
            endIndex: 3 + numNew
          },
          inheritFromBefore: false
        }
      },
      {
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: 0,             // row 1 (0-based)
            endRowIndex: 1,               // exclusive
            startColumnIndex: 3,          // column D
            endColumnIndex: 3 + stores.length // D..F (exclusive G separator)
          },
          mergeType: "MERGE_ALL"
        }
      }
    ]
  });

  // Write date in merged D1, store names in D2/E2/F2, SUM formula in D3/E3/F3
  const data: { range: string; values: SheetRow[] }[] = [];
  data.push({ range: `${SHEET_COMPRAS}!D1`, values: [[fecha]] });

  const colIndices: Record<StoreName, number> = {} as Record<StoreName, number>;
  stores.forEach((store, i) => {
    const col = 3 + i; // D=3, E=4, F=5
    colIndices[store] = col;
    const letter = colIndexToLetter(col);
    // Row 2 → store name
    data.push({ range: `${SHEET_COMPRAS}!${letter}2`, values: [[store]] });
    // Row 3 → SUM formula for the entire product column (products from row 4 onwards)
    data.push({ range: `${SHEET_COMPRAS}!${letter}3`, values: [[`=SUM(${letter}4:${letter}167)`]] });
  });

  const body: BatchUpdateValuesBody = { valueInputOption: "USER_ENTERED", data };
  await sheetsPost("/values:batchUpdate", body);

  return colIndices;
}

/**
 * Guarda un lote de entradas creando nuevas columnas por fecha en la hoja "Compras".
 * Estructura: fila 1 = nombre tienda (CHEEK/CUCHER/VITAL), fila 2 = fecha.
 * Si ya existe un grupo de columnas para esa fecha, lo reutiliza.
 * Replica saveBatch_() de Code.gs con nuevo comportamiento por columna/fecha.
 */
export async function saveBatch(entries: Entry[]): Promise<{ ok: boolean; inserted: number }> {
  if (entries.length === 0) return { ok: true, inserted: 0 };

  const fecha = entries[0]?.fecha ?? "";
  if (!fecha) throw new Error("La fecha es obligatoria para guardar una ronda.");

  // 1. Read rows 1 and 2 (all columns) + product data
  const [headerData, productData] = await Promise.all([
    sheetsGet<ValuesResponse>(`/values/${encodeURIComponent(`${SHEET_COMPRAS}!1:2`)}`),
    sheetsGet<ValuesResponse>(`/values/${encodeURIComponent(`${SHEET_COMPRAS}!A3:B`)}`)
  ]);

  const row1 = ((headerData.values?.[0] ?? []) as string[]).map(String); // row 1 = dates (merged)
  const row2 = ((headerData.values?.[1] ?? []) as string[]).map(String); // row 2 = store names
  const productRows: SheetRow[] = productData.values ?? [];

  // 2. Map itemId → sheet row number (1-indexed, starting at row 3)
  const rowById: Record<string, number> = {};
  for (let i = 0; i < productRows.length; i++) {
    const nombre = normalizeText(productRows[i][1]);
    if (nombre) rowById[`r${i + START_ROW}`] = i + START_ROW;
  }

  // 3. Find or create date columns for this fecha
  let dateColIndices = findDateColumns(row1, row2, fecha, ACTIVE_STORES);
  const allFound = ACTIVE_STORES.every((s) => dateColIndices[s] !== null);

  if (!allFound) {
    // Insert new columns at position D (pushing history right)
    const newCols = await createDateColumns(fecha, ACTIVE_STORES);
    dateColIndices = { ...dateColIndices, ...newCols };
  }

  // 4. Build batchUpdate — write prices as =precio*cantidad formulas
  // New date column structure: row1=date, row2=store, row3=SUM → products at row4+
  const priceUpdates: { range: string; values: SheetRow[] }[] = [];
  for (const entry of entries) {
    const targetRow = rowById[entry.itemId];
    const colIdx = dateColIndices[entry.supermercado];
    if (!targetRow || colIdx == null) continue;
    const colLetter = colIndexToLetter(colIdx);
    // +1: skip SUM row 3 — products in new date columns start at row 4
    const writeRow = targetRow + 1;
    const formula = `=${round2(entry.precioUnitario)}*${round2(entry.cantidad)}`;
    priceUpdates.push({
      range: `${SHEET_COMPRAS}!${colLetter}${writeRow}`,
      values: [[formula]]
    });
  }

  if (priceUpdates.length > 0) {
    const body: BatchUpdateValuesBody = { valueInputOption: "USER_ENTERED", data: priceUpdates };
    await sheetsPost("/values:batchUpdate", body);
  }

  // 5. Append to app_entries log
  const now = new Date().toISOString();
  const logRows: SheetRow[] = entries.map((entry) => [
    now,
    entry.rondaId ?? "",
    entry.fecha ?? "",
    entry.supermercado,
    entry.itemId,
    entry.precioUnitario,
    entry.cantidad,
    entry.subtotal,
    entry.offline ? "offline" : "online",
    entry.createdAt ?? ""
  ]);

  await ensureEntriesSheet();
  const appendRange = encodeURIComponent(`${SHEET_ENTRIES}!A1`);
  await sheetsPost(`/values/${appendRange}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    values: logRows
  });

  return { ok: true, inserted: logRows.length };
}

// ─── totals ───────────────────────────────────────────────────────────────────

/**
 * Lee la hoja "app_entries" y calcula totales por supermercado.
 * Replica computeTotals_() de Code.gs.
 */
export async function computeTotals(dateParam?: string): Promise<TotalsResponse> {
  let data: ValuesResponse;
  try {
    const range = encodeURIComponent(`${SHEET_ENTRIES}!A2:J`);
    data = await sheetsGet<ValuesResponse>(`/values/${range}`);
  } catch {
    return { totals: [] };
  }

  const rows: SheetRow[] = data.values ?? [];
  const map: Record<string, { total: number; itemsCount: number }> = {};

  for (const row of rows) {
    const fecha = String(row[2] ?? "");
    const store = String(row[3] ?? "") as StoreName;
    const subtotal = Number(row[7] ?? 0);
    if (!(ACTIVE_STORES as string[]).includes(store)) continue;
    if (dateParam && fecha && fecha !== dateParam) continue;
    if (!map[store]) map[store] = { total: 0, itemsCount: 0 };
    map[store].total += subtotal;
    map[store].itemsCount += 1;
  }

  const now = new Date().toISOString();
  const totals = ACTIVE_STORES.map((store) => ({
    supermercado: store,
    total: round2(map[store]?.total ?? 0),
    itemsCount: map[store]?.itemsCount ?? 0,
    updatedAt: now
  }));

  return { totals };
}

// ─── utilidades ───────────────────────────────────────────────────────────────

/**
 * Encuentra la columna más a la derecha para cada tienda en los headers.
 * Devuelve índice 0-based (directo para indexar arrays).
 */
function findRightmostStoreColumns(
  headers: string[],
  stores: StoreName[]
): Record<StoreName, number | null> {
  const found = Object.fromEntries(stores.map((s) => [s, null])) as Record<StoreName, number | null>;
  for (let c = 0; c < headers.length; c++) {
    const val = normalizeText(headers[c]).toUpperCase();
    for (const store of stores) {
      if (val === store) found[store] = c;
    }
  }
  return found;
}

/** Convierte índice 0-based de columna a letra (0→A, 25→Z, 26→AA, etc.) */
function colIndexToLetter(idx: number): string {
  let letter = "";
  let n = idx;
  while (n >= 0) {
    letter = String.fromCharCode((n % 26) + 65) + letter;
    n = Math.floor(n / 26) - 1;
  }
  return letter;
}
