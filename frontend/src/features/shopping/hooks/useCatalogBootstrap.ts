import { useEffect } from "react";
import { Entry, Item, StoreConfig, StoreName } from "../../../types";
import { nowIso } from "../../../utils";
import { cleanupDuplicateEntriesForDate, getOrCreateLiveSessionId, listenToLiveEntries, shoppingApiService } from "../../../infrastructure/api";
import { shoppingStorageService } from "../../../infrastructure/storage";
import { entryTimestamp } from "./useShopping";

interface UseCatalogBootstrapParams {
  signedIn: boolean;
  currentDate: string | null;
  activeStores: StoreName[];
  allowFirestoreLiveForDate: boolean;
  liveSessionId: string | null;
  clientId: string;
  normalizeStoreName: (name: string) => string;
  mergeStoreConfigs: (incomingStores: StoreName[], localStores: StoreConfig[]) => StoreConfig[];
  flushSyncQueue: () => Promise<void>;
  setStatus: (value: string) => void;
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  setStoreConfigs: React.Dispatch<React.SetStateAction<StoreConfig[]>>;
  setEntryMap: React.Dispatch<React.SetStateAction<Record<string, Entry>>>;
  setLiveSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setAllowFirestoreLiveForDate: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useCatalogBootstrap({
  signedIn,
  currentDate,
  activeStores,
  allowFirestoreLiveForDate,
  liveSessionId,
  clientId,
  normalizeStoreName,
  mergeStoreConfigs,
  flushSyncQueue,
  setStatus,
  setItems,
  setStoreConfigs,
  setEntryMap,
  setLiveSessionId,
  setAllowFirestoreLiveForDate
}: UseCatalogBootstrapParams) {
  const bootstrap = async () => {
    try {
      const data = await shoppingApiService.fetchBootstrap();
      if (!data.items || data.items.length === 0) throw new Error("El catalogo de Google Sheets esta vacio o no se pudo leer.");

      setItems(data.items);
      setStoreConfigs((prev) => mergeStoreConfigs(data.stores ?? [], prev));
      await shoppingStorageService.saveItemsCache({ key: "catalog", items: data.items, savedAt: nowIso() });

      setStatus(
        data.source === "sheets"
          ? "Catalogo cargado exitosamente desde Google Sheets."
          : "ALERTA: FALLO GOOGLE SHEETS. Cargando respaldo desde Firestore."
      );
    } catch (error) {
      const cached = await shoppingStorageService.getItemsCache("catalog");
      if (cached && cached.items.length > 0) {
        setItems(cached.items);
        setStatus(`Sin conexion a Google Sheets. Usando copia local (${cached.savedAt.slice(0, 10)}).`);
      } else {
        setItems([]);
        setStatus(`ALERTA: ERROR DE CONEXION: ${String(error)}. Verifica que el enlace de Google Sheets sea correcto y publico.`);
      }
    }
  };

  useEffect(() => {
    if (!signedIn) return;
    void bootstrap();

    const onOnline = () => {
      setStatus("Conectado: sincronizando cola pendiente...");
      void flushSyncQueue();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn || !currentDate) return;

    async function initSession() {
      setStatus(`Sesion iniciada para ${currentDate}. Sin carga automatica de historial.`);
      try {
        const sessionId = await getOrCreateLiveSessionId(String(currentDate));
        setLiveSessionId(sessionId);
        setAllowFirestoreLiveForDate(false);
      } catch (err) {
        setAllowFirestoreLiveForDate(false);
        setLiveSessionId(null);
        console.error("Error cargando historial:", err);
      }
    }

    setAllowFirestoreLiveForDate(false);
    setLiveSessionId(null);
    setEntryMap({});
    void initSession();
  }, [signedIn, currentDate]);

  useEffect(() => {
    if (!signedIn || !currentDate || !liveSessionId) return;
    void cleanupDuplicateEntriesForDate(currentDate, liveSessionId).catch((err) => {
      console.warn("No se pudo limpiar duplicados en Firestore:", err);
    });
  }, [signedIn, currentDate, liveSessionId]);

  useEffect(() => {
    if (!signedIn || !currentDate || !allowFirestoreLiveForDate || !liveSessionId) return;

    const unsub = listenToLiveEntries(
      currentDate,
      liveSessionId,
      (liveEntries) => {
        setEntryMap((prev) => {
          const next = { ...prev };
          let changed = false;

          liveEntries.forEach((entry) => {
            if (!activeStores.includes(normalizeStoreName(String(entry.supermercado)))) return;
            if ((entry as any).sender === clientId) return;

            const key = `${entry.supermercado}::${entry.itemId}`;
            const local = prev[key];
            const localTs = entryTimestamp(local);
            const remoteTs = entryTimestamp(entry);
            if (local && localTs > 0 && remoteTs > 0 && localTs >= remoteTs) return;

            if (JSON.stringify(local) !== JSON.stringify(entry)) {
              next[key] = entry;
              changed = true;
            }
          });

          return changed ? next : prev;
        });
      },
      { skipInitialSnapshot: true }
    );

    return () => unsub();
  }, [signedIn, currentDate, allowFirestoreLiveForDate, liveSessionId, activeStores, clientId, normalizeStoreName, setEntryMap]);

  return { bootstrap };
}
