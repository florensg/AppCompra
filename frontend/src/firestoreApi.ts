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
  onSnapshot
} from "firebase/firestore";
import { db } from "./firebaseConfig";
import { Item, Entry, StoreTotal, BootstrapResponse } from "./types";

const ITEMS_COL = "items";
const ENTRIES_COL = "entries";
const TOTALS_COL = "totals";

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
    const docRef = doc(collection(db, ENTRIES_COL), entry.id);
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
  const docRef = doc(collection(db, ENTRIES_COL), entry.id);
  setDoc(docRef, { ...entry, serverTimestamp: Timestamp.now() }, { merge: true }).catch(console.error);
}

/**
 * Suscribe a los cambios en tiempo real de los entries para una fecha específica.
 */
export function listenToLiveEntries(fecha: string, callback: (entries: Entry[]) => void): () => void {
  const q = query(collection(db, ENTRIES_COL), where("fecha", "==", fecha));
  return onSnapshot(q, (snap) => {
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
