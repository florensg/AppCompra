import { BootstrapResponse, Entry, TotalsResponse } from "./types";
import { MOCK_ITEMS } from "./mockCatalog";
import { getFirestoreBootstrap, saveEntriesToFirestore, getFirestoreTotals, syncCatalogToFirestore } from "./firestoreApi";

/**
 * api.ts — Capa de acceso a datos híbrida.
 * Fuente de Verdad (Display): Google Sheets (vía Apps Script Proxy).
 * Respaldo (Offline): Firebase Firestore.
 */

declare global {
  interface Window {
    APP_SCRIPT_URL?: string;
  }
}

async function fetchGas(path: string, options: RequestInit = {}) {
  const urlBase = window.APP_SCRIPT_URL;
  if (!urlBase) throw new Error("APP_SCRIPT_URL no configurada en index.html");
  
  const baseUrl = urlBase.replace(/\/+$/, "");
  const [route, queryStr] = path.split("?");
  const cleanRoute = route.replace(/^\/+/, "");
  // Forzamos el uso de Query Parameters (?path=...) porque Apps Script 
  // no soporta ruteo directo (/ruta) sin configuraciones avanzadas.
  const separator = baseUrl.includes("?") ? "&" : "?";
  const url = `${baseUrl}${separator}path=${cleanRoute}${queryStr ? "&" + queryStr : ""}`;

  const headers = new Headers(options.headers || {});
  if (options.method === "POST" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "text/plain;charset=utf-8");
  }

  const fetchOptions: RequestInit = { ...options, headers };
  if (options.method === "POST") {
    fetchOptions.mode = "no-cors";
  }

  const response = await fetch(url, fetchOptions);
  
  // En modo no-cors la respuesta es opaca (status 0), no podemos parsear JSON.
  if (fetchOptions.mode === "no-cors") {
     return { ok: true };
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error);
  return data;
}

/**
 * Descarga el catálogo. 
 * Prioriza Google Sheets (Proxy) y guarda una copia en Firestore por si luego se queda offline.
 */
export async function fetchBootstrap(): Promise<BootstrapResponse> {
  try {
    const data = await fetchGas("bootstrap");
    if (data.items && data.items.length > 0) {
      void syncCatalogToFirestore(data.items);
      return { ...data, source: "sheets" };
    }
    throw new Error("La respuesta de Google Sheets está vacía o es inválida.");
  } catch (err) {
    console.warn("No se pudo conectar con Sheets, intentando Firestore:", err);
    const cached = await getFirestoreBootstrap();
    if (cached.items.length > 0) return { ...cached, source: "firestore" };
    
    // Si llegamos acá, falló todo. Lanzamos error para que la UI lo maneje.
    throw err;
  }
}

/**
 * Guarda en Firestore y automáticamente intenta sincronizar con Google Sheets.
 */
export async function sendEntriesBatch(entries: Entry[]): Promise<{ ok: boolean }> {
  await saveEntriesToFirestore(entries);
  
  if (navigator.onLine) {
    try {
      await fetchGas("entries/batch", {
        method: "POST",
        body: JSON.stringify({ entries })
      });
      console.info("Sincronización con Google Sheets exitosa.");
    } catch (err) {
      console.warn("No se pudo sincronizar con Sheets ahora, los datos están seguros en Firestore:", err);
    }
  }
  
  return { ok: true };
}

export async function syncEntries(entries: Entry[]): Promise<{ ok: boolean }> {
  return sendEntriesBatch(entries);
}

export async function fetchTotals(date?: string): Promise<TotalsResponse> {
  try {
    // Priorizamos Firestore para totales históricos rápidos por ahora
    const totals = await getFirestoreTotals(date);
    return { totals };
  } catch (err) {
    console.error("Error al obtener totales:", err);
    return { totals: [] };
  }
}

/**
 * Obtiene los registros de una ronda específica (fecha) desde Google Sheets.
 */
export async function fetchRound(fecha: string): Promise<{ entries: any[] }> {
  try {
    const data = await fetchGas(`round?fecha=${fecha}`);
    return data;
  } catch (err) {
    console.warn(`No se pudo obtener la ronda del ${fecha} desde Sheets:`, err);
    return { entries: [] };
  }
}
