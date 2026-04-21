const SHEET_NAME = "Compras";
const HEADERS_ROW = 2; // Supermercados en fila 2
const START_ROW = 4; // Productos desde fila 4 (fila 3 tiene totales)
const BASE_STORES = ["CHEEK", "CUCHER", "VITAL"];
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
    const rawPath = e && e.pathInfo ? String(e.pathInfo) : (e && e.parameter && e.parameter.path ? String(e.parameter.path) : "");
    const path = rawPath.replace(/^\/+/, "");

    const method = (e && e.postData) ? "POST" : "GET";
    const payload = method === "POST" && e.postData ? JSON.parse(e.postData.contents || "{}") : {};

    if (path === "bootstrap" && method === "GET") return jsonResponse_(buildBootstrap_());
    if (path === "entries/batch" && method === "POST") return jsonResponse_(saveBatch_(payload.entries || [], payload.stores || []));
    if (path === "sync" && method === "POST") return jsonResponse_(saveBatch_(payload.entries || [], payload.stores || []));
    if (path === "items/create" && method === "POST") return jsonResponse_(createItem_(payload));
    if (path === "items/update" && method === "POST") return jsonResponse_(updateItem_(payload));
    if (path === "items/delete" && method === "POST") return jsonResponse_(deleteItem_(payload));
    if (path === "totals" && method === "GET") return jsonResponse_({ totals: [] });
    if (path === "round" && method === "GET") return jsonResponse_(fetchRoundByDate_(e.parameter.fecha));

    return jsonResponse_({ ok: false, error: "Ruta no encontrada: " + path }, 404);
  } catch (error) {
    return jsonResponse_({ ok: false, error: String(error) }, 500);
  }
}

function buildBootstrap_() {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("No se encontro la hoja Compras");

  const lastRow = sheet.getLastRow();
  const headerRange = sheet.getRange(HEADERS_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  const stores = buildOrderedStores_(extractStoresFromHeader_(headerRange));
  const storeColumns = findLeftmostStoreColumns_(headerRange, stores);
  const rows = sheet.getRange(START_ROW, 1, Math.max(lastRow - START_ROW + 1, 0), sheet.getLastColumn()).getValues();

  const items = [];
  const latestPrices = {};

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const categoriaRaw = row[0];
    const nombre = normalizeText_(row[1]);
    if (!nombre) continue;

    const categoria = Number(categoriaRaw) || 0;
    const hay = Number(row[2] || 0);
    const itemId = `r${START_ROW + idx}`;
    const stockObjetivo = Math.max(hay, 1);
    const sugerida = Math.max(stockObjetivo - hay, 0);

    items.push({
      id: itemId,
      nombre,
      categoria,
      hay,
      stockObjetivo,
      sugerida
    });

    latestPrices[itemId] = {};
    stores.forEach((store) => {
      const col = storeColumns[store];
      if (!col) return;
      const val = row[col - 1];
      const value = Number(val || 0);
      if (value > 0) latestPrices[itemId][store] = value;
    });
  }

  return { items, latestPrices, stores };
}

function saveBatch_(entries, incomingStores) {
  if (!Array.isArray(entries)) throw new Error("entries debe ser un array");
  if (entries.length === 0) return { ok: true, processed: 0 };

  const ss = getSpreadsheet_();
  const compras = ss.getSheetByName(SHEET_NAME);

  const fechaRonda = entries[0].fecha;
  if (!fechaRonda) throw new Error("Las entradas no tienen fecha asignada");

  const normalizedFecha = String(fechaRonda).trim();
  const lastCol = compras.getLastColumn();
  const row1 = lastCol >= 4 ? compras.getRange(1, 1, 1, lastCol).getDisplayValues()[0] : [];
  const row2 = lastCol >= 4 ? compras.getRange(2, 1, 1, lastCol).getValues()[0] : [];

  const existingDateColumns = findDateStoreColumns_(row1, row2, normalizedFecha);
  let storeColumns = existingDateColumns;

  if (!storeColumns) {
    const allStores = buildOrderedStores_(incomingStores);
    const numCols = allStores.length;
    const startCol = 4;

    const maxCols = compras.getMaxColumns();
    if (startCol <= maxCols) {
      compras.insertColumns(startCol, numCols);
    } else {
      compras.insertColumnsAfter(maxCols, numCols);
    }

    if (compras.getMaxColumns() >= startCol + numCols) {
      const sourceRange = compras.getRange(1, startCol + numCols, compras.getMaxRows(), numCols);
      const targetRange = compras.getRange(1, startCol, compras.getMaxRows(), numCols);
      sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }

    const fechaRange = compras.getRange(1, startCol, 1, numCols);
    fechaRange.merge();
    fechaRange.setValue("'" + normalizedFecha);
    fechaRange.setHorizontalAlignment("center");

    compras.getRange(2, startCol, 1, numCols).setValues([allStores]);

    for (let i = 0; i < numCols; i++) {
      const colLetter = columnToLetter_(startCol + i);
      compras.getRange(3, startCol + i).setFormula(`=SUM(${colLetter}4:${colLetter})`);
    }

    storeColumns = {};
    for (let i = 0; i < allStores.length; i++) {
      storeColumns[allStores[i]] = startCol + i;
    }
  }

  const comprasRows = compras.getRange(START_ROW, 1, Math.max(compras.getLastRow() - START_ROW + 1, 0), 2).getValues();
  const rowById = {};
  for (let i = 0; i < comprasRows.length; i++) {
    const nombre = normalizeText_(comprasRows[i][1]);
    if (nombre) rowById[`r${START_ROW + i}`] = START_ROW + i;
  }

  let count = 0;
  const debugLog = [];
  entries.forEach((entry) => {
    const targetRow = rowById[entry.itemId];
    const targetCol = storeColumns[normalizeStoreName_(entry.supermercado)];
    debugLog.push({ id: entry.itemId, targetRow, targetCol });
    if (!targetRow || !targetCol) return;

    const precio = Number(entry.precioUnitario);
    const cantidad = Number(entry.cantidad);
    const formula = `=${precio}*${cantidad}`;

    compras.getRange(targetRow, targetCol).setFormula(formula);
    count++;
  });

  return { ok: true, processed: count, debugLog, storeColumns, rowByIdKeys: Object.keys(rowById) };
}

function findDateStoreColumns_(row1, row2, fecha) {
  for (let c = 3; c < row1.length; c++) {
    if (normalizeText_(row1[c]) !== fecha) continue;

    const localStores = {};
    for (let k = c; k < row2.length; k++) {
      if (k > c && normalizeText_(row1[k])) break;
      const storeName = normalizeStoreName_(row2[k]);
      if (!storeName) {
        if (k === c) continue;
        break;
      }
      localStores[storeName] = k + 1;
    }

    if (Object.keys(localStores).length > 0) {
      return localStores;
    }
  }
  return null;
}

function findLeftmostStoreColumns_(headers, stores) {
  const found = {};
  stores.forEach((store) => {
    found[store] = null;
  });

  for (let c = 0; c < headers.length; c++) {
    const value = normalizeStoreName_(headers[c]);
    stores.forEach((store) => {
      if (value === store && found[store] === null) {
        found[store] = c + 1;
      }
    });
  }

  return found;
}

function extractStoresFromHeader_(headers) {
  const found = [];
  for (let c = 3; c < headers.length; c++) {
    const value = normalizeStoreName_(headers[c]);
    if (value) found.push(value);
  }
  return found;
}

function buildOrderedStores_(stores) {
  const incoming = Array.isArray(stores) ? stores : [];
  const normalized = incoming.map(normalizeStoreName_).filter(Boolean);
  const set = {};

  BASE_STORES.forEach((store) => {
    set[store] = true;
  });
  normalized.forEach((store) => {
    set[store] = true;
  });

  const extras = Object.keys(set).filter((store) => !BASE_STORES.includes(store)).sort();
  return [...BASE_STORES, ...extras];
}

function normalizeStoreName_(value) {
  return normalizeText_(value).toUpperCase();
}

function normalizeText_(value) {
  return String(value || "").trim();
}

function columnToLetter_(column) {
  let temp;
  let letter = "";
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

function jsonResponse_(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function fetchRoundByDate_(fecha) {
  if (!fecha) return { entries: [] };
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("No se encontro la hoja Compras");

  const lastCol = sheet.getLastColumn();
  if (lastCol < 4) return { entries: [] };

  const row1 = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const row2 = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
  const storeColumns = findDateStoreColumns_(row1, row2, String(fecha).trim());

  if (!storeColumns) return { entries: [] };

  const stores = Object.keys(storeColumns);
  const lastRow = sheet.getLastRow();
  const rows = sheet.getRange(START_ROW, 1, Math.max(lastRow - START_ROW + 1, 0), lastCol).getValues();

  const entries = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const itemId = `r${START_ROW + idx}`;

    stores.forEach((store) => {
      const col = storeColumns[store];
      if (!col) return;

      const val = row[col - 1];
      const formula = sheet.getRange(START_ROW + idx, col).getFormula();

      if (val > 0 || formula) {
        let precioUnitario = Number(val) || 0;
        let cantidad = 1;

        if (formula && formula.startsWith("=")) {
          const parts = formula.substring(1).split("*");
          if (parts.length === 2) {
            precioUnitario = Number(parts[0]) || 0;
            cantidad = Number(parts[1]) || 0;
          }
        }

        if (precioUnitario > 0 || cantidad > 0) {
          entries.push({
            itemId,
            supermercado: store,
            precioUnitario,
            cantidad
          });
        }
      }
    });
  }

  return { entries };
}

function parseItemRow_(itemId) {
  const match = String(itemId || "").match(/^r(\d+)$/);
  if (!match) return null;
  const row = Number(match[1]);
  return Number.isFinite(row) && row >= START_ROW ? row : null;
}

function createItem_(payload) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("No se encontro la hoja Compras");

  const nombre = normalizeText_(payload.nombre);
  if (!nombre) throw new Error("El nombre del producto es obligatorio");

  const categoria = Number(payload.categoria) || 0;
  const hay = Number(payload.hay) || 0;
  const lastRow = Math.max(sheet.getLastRow(), START_ROW - 1);
  const rows = lastRow >= START_ROW
    ? sheet.getRange(START_ROW, 2, lastRow - START_ROW + 1, 1).getValues()
    : [];

  const normalizedName = normalizeStoreName_(nombre);
  for (let i = 0; i < rows.length; i++) {
    const existing = normalizeStoreName_(rows[i][0]);
    if (existing && existing === normalizedName) {
      throw new Error("Ya existe un producto con ese nombre");
    }
  }

  const targetRow = lastRow + 1;
  sheet.getRange(targetRow, 1, 1, 3).setValues([[categoria, nombre, hay]]);
  return { ok: true, itemId: `r${targetRow}` };
}

function updateItem_(payload) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("No se encontro la hoja Compras");

  const row = parseItemRow_(payload.itemId);
  if (!row || row > sheet.getLastRow()) throw new Error("itemId invalido");

  const nombre = normalizeText_(payload.nombre);
  if (!nombre) throw new Error("El nombre del producto es obligatorio");
  const categoria = Number(payload.categoria) || 0;
  const hay = Number(payload.hay) || 0;

  const lastRow = sheet.getLastRow();
  const rows = sheet.getRange(START_ROW, 2, Math.max(lastRow - START_ROW + 1, 0), 1).getValues();
  const normalizedName = normalizeStoreName_(nombre);
  for (let i = 0; i < rows.length; i++) {
    const currentRow = START_ROW + i;
    if (currentRow === row) continue;
    const existing = normalizeStoreName_(rows[i][0]);
    if (existing && existing === normalizedName) {
      throw new Error("Ya existe otro producto con ese nombre");
    }
  }

  sheet.getRange(row, 1, 1, 3).setValues([[categoria, nombre, hay]]);
  return { ok: true };
}

function deleteItem_(payload) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("No se encontro la hoja Compras");

  const row = parseItemRow_(payload.itemId);
  if (!row || row > sheet.getLastRow()) throw new Error("itemId invalido");
  if (row < START_ROW) throw new Error("No se puede borrar fuera del catalogo");

  sheet.deleteRow(row);
  return { ok: true };
}
