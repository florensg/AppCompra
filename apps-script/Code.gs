const SHEET_NAME = "Compras";
const HEADERS_ROW = 2; // Los supermercados ahora están en la Fila 2
const START_ROW = 4; // Los productos empiezan en la fila 4 (fila 3 tiene totales)
const ACTIVE_STORES = ["CHEEK", "CUCHER", "VITAL"];
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
    if (path === "entries/batch" && method === "POST") return jsonResponse_(saveBatch_(payload.entries || []));
    if (path === "sync" && method === "POST") return jsonResponse_(saveBatch_(payload.entries || []));
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
  if (!sheet) throw new Error("No se encontró la hoja Compras");

  const lastRow = sheet.getLastRow();
  // ROW 2 has the store names
  const headerRange = sheet.getRange(HEADERS_ROW, 1, 1, sheet.getLastColumn()).getValues()[0];
  // IMPORTANTE: Buscamos de izquierda a derecha y nos quedamos con el primero que aparece.
  // Como las compras nuevas empujan a la derecha, las columnas activas son siempre las primeras de la izquierda.
  const storeColumns = findLeftmostStoreColumns_(headerRange, ACTIVE_STORES);
  
  // Leemos desde la fila de inicio (4) hasta el final
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
      
      const val = row[col - 1];
      const value = Number(val || 0);
      if (value > 0) latestPrices[itemId][store] = value;
    });
  }

  return { items: items, latestPrices: latestPrices };
}

function saveBatch_(entries) {
  if (!Array.isArray(entries)) throw new Error("entries debe ser un array");
  if (entries.length === 0) return { ok: true, processed: 0 };

  const ss = getSpreadsheet_();
  const compras = ss.getSheetByName(SHEET_NAME);
  
  // Extraemos la fecha (asumimos formato YYYY-MM-DD generado por la App)
  const fechaRonda = entries[0].fecha;
  if (!fechaRonda) throw new Error("Las entradas no tienen fecha asignada");

  const lastCol = compras.getLastColumn();
  let dateColumns = null;

  // LECTURA DE FECHAS (Buscando en la fila 1 si la fecha ya existe)
  if (lastCol >= 4) { // La primer posible columna es D (col 4)
    const row1 = compras.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const row2 = compras.getRange(2, 1, 1, lastCol).getValues()[0];
    
    // Buscamos fecha en Fila 1 a partir de la columna D
    for (let c = 3; c < row1.length; c++) {
      if (row1[c].trim() === fechaRonda) {
        // Encontramos la fecha. Vamos a indexar las columnas de sus tiendas abajo
        let localStores = {};
        for (let i = 0; i < ACTIVE_STORES.length; i++) {
            if (c + i >= row2.length) break;
            const sn = normalizeText_(row2[c + i]).toUpperCase();
            if (ACTIVE_STORES.includes(sn)) {
                localStores[sn] = c + i + 1; // Índice base 1
            }
        }
        if (Object.keys(localStores).length > 0) {
           dateColumns = localStores;
           break; 
        }
      }
    }
  }

  let storeColumns;
  const startCol = 4; // Columna base de inserción (D)

  if (dateColumns) {
    // FECHA EXISTENTE: Usar columnas encontradas para sobrescribir compras previas
    storeColumns = dateColumns;
  } else {
    // FECHA NUEVA: Crear columnas e inicializarlas
    const numCols = ACTIVE_STORES.length; // 3
    
    const maxCols = compras.getMaxColumns();
    if (startCol <= maxCols) {
       compras.insertColumns(startCol, numCols);
    } else {
       compras.insertColumnsAfter(maxCols, numCols);
    }
    
    // 1. Copiar formato entero de las "viejas recientes" (que ahora están en startCol + numCols)
    // a las nuevas columnas
    if (compras.getMaxColumns() >= startCol + numCols) {
       const sourceRange = compras.getRange(1, startCol + numCols, compras.getMaxRows(), numCols);
       const targetRange = compras.getRange(1, startCol, compras.getMaxRows(), numCols);
       sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    }
    
    // 2. Escribir Fecha y Fusionar (Fila 1)
    const fechaRange = compras.getRange(1, startCol, 1, numCols);
    fechaRange.merge();
    fechaRange.setValue("'" + fechaRonda); // El apóstrofe fuerza modo texto
    fechaRange.setHorizontalAlignment("center");
    
    // 3. Escribir Supermercados (Fila 2)
    compras.getRange(2, startCol, 1, numCols).setValues([ACTIVE_STORES]);
    
    // 4. Escribir Fórmulas =SUM() de Subtotales (Fila 3)
    for (let i = 0; i < numCols; i++) {
       const colLetter = columnToLetter_(startCol + i);
       compras.getRange(3, startCol + i).setFormula(`=SUM(${colLetter}4:${colLetter})`);
    }
    
    storeColumns = {};
    for (let i = 0; i < ACTIVE_STORES.length; i++) {
        storeColumns[ACTIVE_STORES[i]] = startCol + i;
    }
  }

  // MAPEO DE FILAS A PRODUCTOS
  const comprasRows = compras.getRange(START_ROW, 1, Math.max(compras.getLastRow() - START_ROW + 1, 0), 2).getValues();
  const rowById = {};
  for (let i = 0; i < comprasRows.length; i++) {
    const nombre = normalizeText_(comprasRows[i][1]);
    if (nombre) rowById[`r${START_ROW + i}`] = START_ROW + i;
  }

  // ESCRITURA DE VALORES DE LA RONDA
  let count = 0;
  let debugLog = [];
  entries.forEach((entry) => {
    const targetRow = rowById[entry.itemId];
    const targetCol = storeColumns[entry.supermercado];
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

function findLeftmostStoreColumns_(headers, stores) {
  const found = {};
  stores.forEach((store) => (found[store] = null));
  for (let c = 0; c < headers.length; c++) {
    const value = normalizeText_(headers[c]).toUpperCase();
    stores.forEach((store) => {
      // Solo registra la primera aparición de izquierda a derecha.
      if (value === store && found[store] === null) {
          found[store] = c + 1; 
      }
    });
  }
  return found;
}

function normalizeText_(value) {
  return String(value || "").trim();
}

function columnToLetter_(column) {
  let temp, letter = '';
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
  if (!sheet) throw new Error("No se encontró la hoja Compras");

  const lastCol = sheet.getLastColumn();
  let storeColumns = null;

  if (lastCol >= 4) {
    const row1 = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
    const row2 = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    
    for (let c = 3; c < row1.length; c++) {
      if (row1[c].trim() === fecha) {
        let localStores = {};
        for (let i = 0; i < ACTIVE_STORES.length; i++) {
            if (c + i >= row2.length) break;
            const sn = normalizeText_(row2[c + i]).toUpperCase();
            if (ACTIVE_STORES.includes(sn)) {
                localStores[sn] = c + i + 1;
            }
        }
        if (Object.keys(localStores).length > 0) {
           storeColumns = localStores;
           break; 
        }
      }
    }
  }

  if (!storeColumns) return { entries: [] };

  const lastRow = sheet.getLastRow();
  const rows = sheet.getRange(START_ROW, 1, Math.max(lastRow - START_ROW + 1, 0), lastCol).getValues();

  const entries = [];
  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const itemId = `r${START_ROW + idx}`;
    
    ACTIVE_STORES.forEach(store => {
      const col = storeColumns[store];
      if (!col) return;
      
      const val = row[col - 1];
      const formula = sheet.getRange(START_ROW + idx, col).getFormula();
      
      if (val > 0 || formula) {
        let precioUnitario = Number(val) || 0;
        let cantidad = 1;
        
        if (formula && formula.startsWith('=')) {
          const parts = formula.substring(1).split('*');
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
