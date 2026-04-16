const SHEET_NAME = "Compras";
const APP_ENTRIES_SHEET = "app_entries";
const HEADERS_ROW = 1;
const START_ROW = 3;
const ACTIVE_STORES = ["CHEK", "CUCHER", "VITAL"];
const SPREADSHEET_ID = "1KDeMzrNf-Q_dCH5N6ef1irwJnLOtNrRWPeA44H0onQ4";

function getSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  try {
    const path = (e && e.pathInfo ? String(e.pathInfo) : "").replace(/^\/+/, "");
    const method = e && e.postData ? "POST" : "GET";
    const payload = method === "POST" && e.postData ? JSON.parse(e.postData.contents || "{}") : {};

    if (path === "bootstrap" && method === "GET") return jsonResponse_(buildBootstrap_());
    if (path === "entries/batch" && method === "POST") return jsonResponse_(saveBatch_(payload.entries || []));
    if (path === "sync" && method === "POST") return jsonResponse_(saveBatch_(payload.entries || []));
    if (path === "totals" && method === "GET") {
      const date = e?.parameter?.date || null;
      return jsonResponse_(computeTotals_(date));
    }

    return jsonResponse_({ ok: false, error: "Ruta no encontrada." }, 404);
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) }, 500);
  }
}

function buildBootstrap_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("No se encontró la hoja Compras");

  const lastRow = sheet.getLastRow();
  const headerRange = sheet.getRange(HEADERS_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  const storeColumns = findRightmostStoreColumns_(headerRange, ACTIVE_STORES);
  const rows = sheet.getRange(START_ROW, 1, Math.max(lastRow - START_ROW + 1, 0), sheet.getLastColumn()).getValues();

  const items = [];
  const latestPrices = {};

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const categoriaRaw = row[0];
    const nombre = normalizeText_(row[1]);
    if (!nombre) continue;

    const categoria = Number(categoriaRaw);
    if (![1, 2, 3].includes(categoria)) continue;
    const hay = Number(row[2] || 0);
    const itemId = `r${START_ROW + idx}`;
    const stockObjetivo = Math.max(hay, 1);
    const sugerida = Math.max(stockObjetivo - hay, 0);
    items.push({
      id: itemId,
      nombre: nombre,
      categoria: categoria,
      hay: hay,
      stockObjetivo: stockObjetivo,
      sugerida: sugerida
    });

    latestPrices[itemId] = {};
    ACTIVE_STORES.forEach((store) => {
      const col = storeColumns[store];
      if (!col) return;
      const value = Number(row[col - 1] || 0);
      if (value > 0) latestPrices[itemId][store] = value;
    });
  }

  return { items: items, latestPrices: latestPrices };
}

function saveBatch_(entries) {
  if (!Array.isArray(entries)) throw new Error("entries debe ser un array");
  if (entries.length === 0) return { ok: true, inserted: 0 };

  const ss = getSpreadsheet_();
  const sheet = getOrCreateEntriesSheet_(ss);
  const compras = ss.getSheetByName(SHEET_NAME);
  const headerRange = compras.getRange(HEADERS_ROW, 1, 1, compras.getLastColumn()).getValues()[0];
  const storeColumns = findRightmostStoreColumns_(headerRange, ACTIVE_STORES);

  const rowsForLog = [];
  entries.forEach((entry) => {
    validateEntry_(entry);

    const subtotal = round2_(Number(entry.precioUnitario) * Number(entry.cantidad));
    if (Math.abs(subtotal - Number(entry.subtotal)) > 0.05) {
      throw new Error(`Subtotal inválido para item ${entry.itemId}`);
    }

    rowsForLog.push([
      new Date(),
      entry.rondaId || "",
      entry.fecha || "",
      entry.supermercado,
      entry.itemId,
      Number(entry.precioUnitario),
      Number(entry.cantidad),
      Number(entry.subtotal),
      entry.offline ? "offline" : "online",
      entry.createdAt || ""
    ]);
  });

  const startLogRow = sheet.getLastRow() + 1;
  sheet.getRange(startLogRow, 1, rowsForLog.length, rowsForLog[0].length).setValues(rowsForLog);

  // Escribe en el bloque más reciente de CHEK/CUCHER/VITAL sin tocar bloque legado.
  const comprasRows = compras.getRange(START_ROW, 1, Math.max(compras.getLastRow() - START_ROW + 1, 0), 2).getValues();
  const rowById = {};
  for (let i = 0; i < comprasRows.length; i++) {
    const nombre = normalizeText_(comprasRows[i][1]);
    if (nombre) rowById[`r${START_ROW + i}`] = START_ROW + i;
  }

  entries.forEach((entry) => {
    const targetRow = rowById[entry.itemId];
    const targetCol = storeColumns[entry.supermercado];
    if (!targetRow || !targetCol) return;
    compras.getRange(targetRow, targetCol).setValue(Number(entry.subtotal));
  });

  return { ok: true, inserted: rowsForLog.length };
}

function computeTotals_(dateParam) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(APP_ENTRIES_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return { totals: [] };

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  const map = {};
  rows.forEach((row) => {
    const fecha = String(row[2] || "");
    const store = String(row[3] || "");
    const subtotal = Number(row[7] || 0);
    if (!ACTIVE_STORES.includes(store)) return;
    if (dateParam && fecha && fecha !== dateParam) return;
    if (!map[store]) map[store] = { total: 0, itemsCount: 0 };
    map[store].total += subtotal;
    map[store].itemsCount += 1;
  });

  const now = new Date().toISOString();
  const totals = ACTIVE_STORES.map((store) => ({
    supermercado: store,
    total: round2_(map[store] ? map[store].total : 0),
    itemsCount: map[store] ? map[store].itemsCount : 0,
    updatedAt: now
  }));
  return { totals: totals };
}

function getOrCreateEntriesSheet_(ss) {
  let sheet = ss.getSheetByName(APP_ENTRIES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(APP_ENTRIES_SHEET);
    sheet
      .getRange(1, 1, 1, 10)
      .setValues([
        [
          "timestamp",
          "rondaId",
          "fecha",
          "supermercado",
          "itemId",
          "precioUnitario",
          "cantidad",
          "subtotal",
          "source",
          "createdAt"
        ]
      ]);
  }
  return sheet;
}

function findRightmostStoreColumns_(headers, stores) {
  const found = {};
  stores.forEach((store) => (found[store] = null));
  for (let c = 0; c < headers.length; c++) {
    const value = normalizeText_(headers[c]).toUpperCase();
    stores.forEach((store) => {
      if (value === store) found[store] = c + 1;
    });
  }
  return found;
}

function validateEntry_(entry) {
  if (!entry) throw new Error("Entrada vacía");
  if (!ACTIVE_STORES.includes(entry.supermercado)) throw new Error("Supermercado inválido");
  if (Number(entry.precioUnitario) < 0) throw new Error("precioUnitario debe ser >= 0");
  if (Number(entry.cantidad) <= 0) throw new Error("cantidad debe ser > 0");
}

function normalizeText_(value) {
  return String(value || "").trim();
}

function round2_(n) {
  return Math.round(Number(n) * 100) / 100;
}

function jsonResponse_(obj, statusCode) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  if (statusCode && output.setResponseCode) output.setResponseCode(statusCode);
  return output;
}
