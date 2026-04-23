import { 
  collection, 
  getDocs, 
  setDoc, 
  doc, 
  query, 
  orderBy, 
  limit, 
  where,
  writeBatch,
  Timestamp,
  onSnapshot,
  runTransaction
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { Item, Entry, StoreTotal, BootstrapResponse } from "./types";

const ITEMS_COL = "items";
const ENTRIES_COL = "entries";
const TOTALS_COL = "totals";
const SESSIONS_COL = "liveSessions";

function entryDocId(entry: Entry): string {
  const sessionId = String(entry.sessionId ?? "").trim();
  const fecha = String(entry.fecha ?? "").trim();
  const store = String(entry.supermercado ?? "").trim().toUpperCase();
  const item = String(entry.itemId ?? "").trim();
  // ID estable por sesion+fecha+supermercado+item para aislar rondas colaborativas.
  return `${sessionId}__${fecha}__${store}__${item}`;
}

/**
 * Obtiene el catálogo cacheado en Firestore (para modo offline).
 */
export async function getFirestoreBootstrap(): Promise<BootstrapResponse> {
  const itemsSnap = await getDocs(collection(db, ITEMS_COL));
  const items: Item[] = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Item));
  const latestPrices: Record<string, Partial<Record<string, number>>> = {};
  return { items, latestPrices, stores: [] };
}

/**
 * Guarda un lote de entradas (compras) en Firestore.
 */
export async function saveEntriesToFirestore(entries: Entry[]): Promise<void> {
  const batch = writeBatch(db);
  entries.forEach((entry) => {
    const docRef = doc(collection(db, ENTRIES_COL), entryDocId(entry));
    batch.set(docRef, {
      ...entry,
      serverTimestamp: Timestamp.now(),
    });
  });
  await batch.commit();
}

/**
 * Guarda o actualiza un entry en estado "borrador" (en vivo) para sincronización multiusuario.
 */
export function saveDraftEntry(entry: Entry): void {
  const docRef = doc(collection(db, ENTRIES_COL), entryDocId(entry));
  setDoc(docRef, { ...entry, serverTimestamp: Timestamp.now() }, { merge: true }).catch(console.error);
}

function entrySortTime(entry: Partial<Entry>): number {
  const raw = entry.updatedAt ?? entry.createdAt ?? "";
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Limpia documentos duplicados históricos para una fecha.
 * Conserva un único documento por fecha+supermercado+item (el más reciente).
 */
export async function cleanupDuplicateEntriesForDate(fecha: string, sessionId?: string): Promise<number> {
  const normalizedDate = String(fecha || "").trim();
  if (!normalizedDate) return 0;
  const normalizedSession = String(sessionId ?? "").trim();
  const q = normalizedSession
    ? query(collection(db, ENTRIES_COL), where("fecha", "==", normalizedDate), where("sessionId", "==", normalizedSession))
    : query(collection(db, ENTRIES_COL), where("fecha", "==", normalizedDate));
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const byKey = new Map<string, { ref: any; entry: Entry }[]>();
  snap.docs.forEach((d) => {
    const entry = d.data() as Entry;
    const key = `${String(entry.sessionId ?? "").trim()}__${String(entry.fecha ?? "").trim()}__${String(entry.supermercado ?? "").trim().toUpperCase()}__${String(entry.itemId ?? "").trim()}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push({ ref: d.ref, entry });
  });

  const toDelete: any[] = [];
  byKey.forEach((rows) => {
    if (rows.length <= 1) return;
    rows.sort((a, b) => entrySortTime(b.entry) - entrySortTime(a.entry));
    for (let i = 1; i < rows.length; i++) {
      toDelete.push(rows[i].ref);
    }
  });

  if (toDelete.length === 0) return 0;
  const batch = writeBatch(db);
  toDelete.forEach((ref) => batch.delete(ref));
  await batch.commit();
  return toDelete.length;
}

/**
 * Obtiene (o crea) una sesion colaborativa compartida para una fecha.
 */
export async function getOrCreateLiveSessionId(fecha: string): Promise<string> {
  const normalizedDate = String(fecha || "").trim();
  if (!normalizedDate) throw new Error("Fecha invalida para sesion colaborativa.");

  const sessionRef = doc(db, SESSIONS_COL, normalizedDate);
  const sessionId = await runTransaction(db, async (tx) => {
    const snap = await tx.get(sessionRef);
    const existing = String(snap.data()?.sessionId ?? "").trim();
    if (existing) return existing;
    const created = `${normalizedDate}__${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    tx.set(sessionRef, { fecha: normalizedDate, sessionId: created, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    return created;
  });
  return sessionId;
}

/**
 * Suscribe a los cambios en tiempo real de los entries para una fecha y sesion específica.
 */
export function listenToLiveEntries(
  fecha: string,
  sessionId: string,
  callback: (entries: Entry[]) => void,
  options?: { skipInitialSnapshot?: boolean }
): () => void {
  const q = query(
    collection(db, ENTRIES_COL),
    where("fecha", "==", fecha),
    where("sessionId", "==", sessionId)
  );
  let isFirstSnapshot = true;
  return onSnapshot(q, (snap) => {
    if (options?.skipInitialSnapshot && isFirstSnapshot) {
      isFirstSnapshot = false;
      return;
    }
    isFirstSnapshot = false;
    const entries = snap.docs.map(d => d.data() as Entry);
    callback(entries);
  }, (err) => {
    console.error("Error en live sync:", err);
  });
}

/**
 * Obtiene los totales por supermercado desde Firestore.
 */
export async function getFirestoreTotals(date?: string): Promise<StoreTotal[]> {
  const q = date 
    ? query(collection(db, TOTALS_COL), where("fecha", "==", date))
    : query(collection(db, TOTALS_COL), orderBy("updatedAt", "desc"), limit(1));
    
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as StoreTotal);
}

/**
 * Sincroniza el catálogo de Sheets hacia Firestore para respaldo offline.
 */
export async function syncCatalogToFirestore(items: Item[]): Promise<void> {
  if (items.length === 0) return;
  
  const batch = writeBatch(db);
  items.forEach((item) => {
    const docRef = doc(db, ITEMS_COL, item.id);
    batch.set(docRef, item);
  });
  await batch.commit();
}

// Alias for compatibility
export const seedCatalog = syncCatalogToFirestore;
