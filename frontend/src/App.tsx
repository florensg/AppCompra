import React, { useEffect, useMemo, useRef, useState } from "react";
import { BASE_STORES, CATEGORY_LABELS } from "./constants";
import {
  fetchBootstrap,
  fetchRound,
  fetchTotals,
  sendEntriesBatch,
  syncEntries
} from "./api";
import { signIn, signOut as authSignOut, onAuthStatusChange } from "./auth";
import { db } from "./db";
import { cleanupDuplicateEntriesForDate, getOrCreateLiveSessionId, listenToLiveEntries, saveDraftEntry } from "./firestoreApi";
import { CategoryId, Entry, Item, Ronda, StoreName, StoreTotal, SyncJob } from "./types";
import { makeId, nowIso, todayLocalIso, toMoney } from "./utils";
import { LoginScreen } from "./features/auth";
import { ShoppingView } from "./features/shopping";
import { ComparisonView } from "./features/comparison";
import { ProductListView, productsAdminService, PriorityFilter, PriorityMode, useProductFilters } from "./features/products";
import { AppHeader } from "./shared/ui/AppHeader";
import {
  mergeStoreConfigs,
  normalizeStoreName,
  useSupermarketConfigs,
  activateSupermarket,
  addSupermarket,
  disableSupermarket
} from "./features/supermarkets";
import "./styles.css";

type View = "lista" | "carga" | "comparacion";
const DEFAULT_VIEW: View = "carga";
const normalizeProductName = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLowerCase();
const newRonda = (storesActivos: StoreName[]): Ronda => ({
  id: makeId(),
  fecha: todayLocalIso(),
  storesActivos,
  createdAt: nowIso()
});

const entryKey = (store: StoreName, itemId: string): string => `${store}::${itemId}`;

const CLIENT_ID = makeId();

const initialTotals = (stores: StoreName[]): StoreTotal[] =>
  stores.map((store) => ({
    supermercado: store,
    total: 0,
    itemsCount: 0,
    updatedAt: nowIso()
  }));

const entryTimestamp = (entry: Partial<Entry> | null | undefined): number => {
  if (!entry) return 0;
  const raw = entry.updatedAt ?? entry.createdAt;
  if (!raw) return 0;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
};

// â”€â”€ Main App Coordinator â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function App() {
  const { storeConfigs, setStoreConfigs, activeStores, inactiveStores, storesStorageKey } = useSupermarketConfigs();
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [items, setItems] = useState<Item[]>([]);
  const [currentRonda, setCurrentRonda] = useState<Ronda>(() => newRonda(activeStores));
  const [selectedStore, setSelectedStore] = useState<StoreName>(activeStores[0] ?? BASE_STORES[0]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [showAddStoreInput, setShowAddStoreInput] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState(1);
  const [productHay, setProductHay] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");
  const [priorityMode, setPriorityMode] = useState<PriorityMode>("orange-first");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  // entryMap is intentionally NOT persisted across sessions â€” reset on load
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [totals, setTotals] = useState<StoreTotal[]>(() => initialTotals(activeStores));
  const [status, setStatus] = useState("Cargando...");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [allowFirestoreLiveForDate, setAllowFirestoreLiveForDate] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const addStoreInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    localStorage.setItem(storesStorageKey, JSON.stringify(storeConfigs));
  }, [storeConfigs, storesStorageKey]);

  useEffect(() => {
    if (activeStores.length === 0) {
      setSelectedStore(BASE_STORES[0]);
      return;
    }
    if (!activeStores.includes(selectedStore)) {
      setSelectedStore(activeStores[0]);
    }
  }, [activeStores, selectedStore]);

  useEffect(() => {
    setCurrentRonda((prev) => ({ ...prev, storesActivos: activeStores }));
    setTotals((prev) => {
      const byStore = new Map(prev.map((entry) => [entry.supermercado, entry]));
      return activeStores.map((store) => {
        const existing = byStore.get(store);
        return existing
          ? existing
          : { supermercado: store, total: 0, itemsCount: 0, updatedAt: nowIso() };
      });
    });
  }, [activeStores]);

  useEffect(() => {
    if (showAddStoreInput) {
      setTimeout(() => addStoreInputRef.current?.focus(), 0);
    }
  }, [showAddStoreInput]);

  // Monitor Firebase Auth State
  useEffect(() => {
    const unsubscribe = onAuthStatusChange((user) => {
      if (user) {
        setSignedIn(true);
        setStatus(`Bienvenido, ${user.displayName || "Usuario"}`);
      } else {
        setSignedIn(false);
        setItems([]);
        setEntryMap({});
        setStatus("Inicia sesion para comenzar.");
      }
    });
    return () => unsubscribe();
  }, []);

  // Track online/offline state reactively
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online",  goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online",  goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void bootstrap();
    // NOTE: intentionally NOT calling loadDraftEntries() â€” entries reset each session
    const onOnline = () => {
      setStatus("Conectado: sincronizando cola pendiente...");
      void flushSyncQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [signedIn]);

  // Temporizador de inactividad (20 minutos)
  useEffect(() => {
    if (!signedIn) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(async () => {
        setStatus("Inactividad detectada. Guardando y cerrando sesion...");
        // Guardamos automÃ¡ticamente antes de salir
        const entriesToSave = Object.values(entryMap).filter((e) => e.inCart || e.precioUnitario > 0 || e.cantidad > 0);
        if (entriesToSave.length > 0) {
          try {
            await saveCurrentRound();
          } catch (e) {
            console.error("Error al auto-guardar:", e);
          }
        }
        handleSignOut();
      }, 20 * 60 * 1000); // 20 minutos
    };

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    const handler = () => resetTimer();
    
    events.forEach(e => window.addEventListener(e, handler));
    resetTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach(e => window.removeEventListener(e, handler));
    };
  }, [signedIn, entryMap, currentRonda.fecha]);

  // Cargar datos histÃ³ricos de Google Sheets cuando cambia la fecha
  useEffect(() => {
    if (!signedIn || !currentRonda.fecha) return;
    
    async function loadHistory() {
      const targetDate = currentRonda.fecha;
      if (!targetDate) return;
      setStatus(`Sesion iniciada para ${targetDate}. Sin carga automatica de historial.`);
      try {
        const sessionId = await getOrCreateLiveSessionId(targetDate);
        setLiveSessionId(sessionId);
        // Importante: evitamos lectura live automatica para no hidratar entradas viejas.
        // El historial se carga solo con el boton "Cargar historial".
        setAllowFirestoreLiveForDate(false);
      } catch (err) {
        setAllowFirestoreLiveForDate(false);
        setLiveSessionId(null);
        console.error("Error cargando historial:", err);
      }
    }

    // Al cambiar la fecha, primero limpiamos para que no se vea data vieja 
    // pero el listener de Firebase (en el otro useEffect) traerÃ¡ lo nuevo
    setAllowFirestoreLiveForDate(false);
    setLiveSessionId(null);
    setEntryMap({}); 
    void loadHistory();
  }, [signedIn, currentRonda.fecha]);

  // Limpieza de duplicados histÃ³ricos del dÃ­a para evitar que reaparezcan valores viejos.
  useEffect(() => {
    if (!signedIn || !currentRonda.fecha || !liveSessionId) return;
    void cleanupDuplicateEntriesForDate(currentRonda.fecha, liveSessionId).catch((err) => {
      console.warn("No se pudo limpiar duplicados en Firestore:", err);
    });
  }, [signedIn, currentRonda.fecha, liveSessionId]);

  // Sync en vivo del carrito (Firestore) para la fecha seleccionada
  useEffect(() => {
    if (!signedIn || !currentRonda.fecha || !allowFirestoreLiveForDate || !liveSessionId) return;
    const unsub = listenToLiveEntries(currentRonda.fecha, liveSessionId, (liveEntries) => {
      setEntryMap(prev => {
        const next = { ...prev };
        let changed = false;
        liveEntries.forEach(le => {
          if (!activeStores.includes(normalizeStoreName(String(le.supermercado)))) return;
          // Ignorar nuestras propias actualizaciones para no pisar el input mientras escribimos
          if ((le as any).sender === CLIENT_ID) return;

          const key = entryKey(le.supermercado, le.itemId);
          const local = prev[key];
          const localTs = entryTimestamp(local);
          const remoteTs = entryTimestamp(le);
          // No sobrescribir ediciÃ³n local mÃ¡s nueva con datos remotos viejos.
          if (local && localTs > 0 && remoteTs > 0 && localTs >= remoteTs) return;
          // Omitir actualizaciÃ³n si el valor local es idÃ©ntico al de la nube
          if (JSON.stringify(local) !== JSON.stringify(le)) {
            next[key] = le;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, { skipInitialSnapshot: true });
    return () => unsub();
  }, [signedIn, currentRonda.fecha, allowFirestoreLiveForDate, liveSessionId, activeStores]);

  async function handleSignIn() {
    setAuthLoading(true);
    setStatus("Conectando con Google...");
    try {
      await signIn();
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${String(err)}`);
    } finally {
      setAuthLoading(false);
    }
  }

  function handleSignOut() {
    authSignOut();
    setSignedIn(false);
    setItems([]);
    setEntryMap({});
    setStatus("Sesion cerrada.");
  }

  useEffect(() => {
    recalcTotals(entryMap);
  }, [entryMap, activeStores]);

  const filteredItems = useProductFilters({
    items,
    search,
    categoryFilter,
    priorityFilter,
    priorityMode
  });

  const editingItem = useMemo(
    () => items.find((item) => item.id === editingItemId),
    [items, editingItemId]
  );

  useEffect(() => {
    if (!editingItem) return;
    setProductName(editingItem.nombre);
    setProductCategory(editingItem.categoria);
    setProductHay(editingItem.hay);
  }, [editingItem]);

  async function bootstrap() {
    try {
      const data = await fetchBootstrap();
      if (!data.items || data.items.length === 0) {
        throw new Error("El catalogo de Google Sheets esta vacio o no se pudo leer.");
      }
      setItems(data.items);
      setStoreConfigs((prev) => mergeStoreConfigs(data.stores ?? [], prev));
      await db.itemsCache.put({ key: "catalog", items: data.items, savedAt: nowIso() });
      
      if (data.source === "sheets") {
         setStatus("Catalogo cargado exitosamente desde Google Sheets.");
      } else {
         setStatus("ALERTA: FALLO GOOGLE SHEETS. Cargando respaldo desde Firestore.");
      }
    } catch (error) {
      console.error("Fallo total de carga:", error);
      const cached = await db.itemsCache.get("catalog");
      if (cached && cached.items.length > 0) {
        setItems(cached.items);
        setStatus(`Sin conexion a Google Sheets. Usando copia local (${cached.savedAt.slice(0,10)}).`);
      } else {
        setItems([]);
        setStatus(`ALERTA: ERROR DE CONEXION: ${String(error)}. Verifica que el enlace de Google Sheets sea correcto y publico.`);
      }
    }
  }

  function activateStore(storeName: StoreName) {
    setStoreConfigs((prev) => activateSupermarket(prev, storeName));
    setSelectedStore(storeName);
    setStoreMenuOpen(false);
    setShowAddStoreInput(false);
    setStatus(`${storeName} ahora esta activo.`);
  }

  function disableStore(storeName: StoreName) {
    if (BASE_STORES.includes(storeName)) return;
    setStoreConfigs((prev) => disableSupermarket(prev, storeName));
    setStoreMenuOpen(false);
    setShowAddStoreInput(false);
    if (selectedStore === storeName) {
      const fallback = activeStores.find((name) => name !== storeName) ?? BASE_STORES[0];
      setSelectedStore(fallback);
    }
    setStatus(`${storeName} fue deshabilitado.`);
  }

  function addStore() {
    const normalized = normalizeStoreName(newStoreName);
    if (!normalized) {
      setStatus("Ingresa un nombre de supermercado.");
      return;
    }
    const existing = storeConfigs.find((store) => store.name === normalized);
    if (existing) {
      setStatus(existing.isActive ? `${normalized} ya existe y esta activo.` : `${normalized} ya existe y esta inactivo.`);
      setShowAddStoreInput(false);
      setNewStoreName("");
      return;
    }
    setStoreConfigs((prev) => addSupermarket(prev, normalized));
    setShowAddStoreInput(false);
    setNewStoreName("");
    setStatus(`${normalized} agregado. Podes activarlo desde el menu +.`);
  }

  function resetProductForm() {
    setEditingItemId("");
    setProductName("");
    setProductCategory(1);
    setProductHay(0);
  }

  async function handleCreateProduct() {
    const nombre = productName.trim();
    if (!nombre) {
      setStatus("Ingresa el nombre del producto.");
      return;
    }
    const exists = items.some((item) => normalizeProductName(item.nombre) === normalizeProductName(nombre));
    if (exists) {
      setStatus("Ese producto ya existe en el catalogo.");
      return;
    }
    try {
      await productsAdminService.create({ nombre, categoria: productCategory, hay: productHay });
      await bootstrap();
      resetProductForm();
      setStatus(`Producto agregado: ${nombre}.`);
    } catch (error) {
      setStatus(`No se pudo agregar el producto: ${String(error)}`);
    }
  }

  async function handleUpdateProduct() {
    if (!editingItem) {
      setStatus("Selecciona un producto para modificar.");
      return;
    }
    const nombre = productName.trim();
    if (!nombre) {
      setStatus("Ingresa el nombre del producto.");
      return;
    }
    const exists = items.some(
      (item) => item.id !== editingItem.id && normalizeProductName(item.nombre) === normalizeProductName(nombre)
    );
    if (exists) {
      setStatus("Ya existe otro producto con ese nombre.");
      return;
    }
    try {
      await productsAdminService.update({
        itemId: editingItem.id,
        nombre,
        categoria: productCategory,
        hay: productHay
      });
      await bootstrap();
      setStatus(`Producto actualizado: ${nombre}.`);
    } catch (error) {
      setStatus(`No se pudo actualizar el producto: ${String(error)}`);
    }
  }

  async function handleDeleteProduct() {
    if (!editingItem) {
      setStatus("Selecciona un producto para eliminar.");
      return;
    }
    const confirmed = window.confirm(`Eliminar ${editingItem.nombre}?`);
    if (!confirmed) return;
    try {
      await productsAdminService.remove({ itemId: editingItem.id });
      setEntryMap({});
      await bootstrap();
      resetProductForm();
      setStatus("Producto eliminado.");
    } catch (error) {
      setStatus(`No se pudo eliminar el producto: ${String(error)}`);
    }
  }

  function updateEntry(item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const precioUnitario = patch.precioUnitario ?? current?.precioUnitario ?? 0;
    const cantidad = Math.round(patch.cantidad ?? current?.cantidad ?? 0);
    const subtotal = toMoney(precioUnitario * cantidad);
    const entry: Entry = {
      id: current?.id ?? makeId(),
      rondaId: currentRonda.id,
      sessionId: liveSessionId ?? undefined,
      fecha: currentRonda.fecha,
      supermercado: selectedStore,
      itemId: item.id,
      precioUnitario,
      cantidad,
      subtotal,
      inCart: current?.inCart ?? false,
      offline: !navigator.onLine,
      createdAt: current?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
      sender: CLIENT_ID, // Adjuntamos el ID del dispositivo
    };
    setEntryMap((prev) => ({ ...prev, [key]: entry }));
    
    // Debounce a nivel de item para evitar flickering e interrupciones al escribir
    if (debounceTimerRef.current[key]) clearTimeout(debounceTimerRef.current[key]);
    debounceTimerRef.current[key] = setTimeout(() => {
      saveDraftEntry(entry);
    }, 500);

    if (entry.precioUnitario < 0 || entry.cantidad < 0) {
      setStatus("Item cargado con advertencia: precio >= 0 y cantidad > 0 requeridos.");
    }
  }

  function toggleCart(item: Item) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    if (!current) return;
    const unsigned = { ...current, inCart: !current.inCart, updatedAt: nowIso(), sender: CLIENT_ID };
    setEntryMap((prev) => ({ ...prev, [key]: unsigned }));
    saveDraftEntry(unsigned);
  }

  function bumpQuantity(item: Item, delta: number) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const nextQty = Math.max(0, Math.round((current?.cantidad ?? 0) + delta));
    updateEntry(item, { cantidad: nextQty });
  }

  function recalcTotals(map: Record<string, Entry>) {
    const rollup = new Map<StoreName, { total: number; itemsCount: number }>();
    for (const store of activeStores) rollup.set(store, { total: 0, itemsCount: 0 });
    Object.values(map)
      .filter((e) => e.inCart)
      .forEach((entry) => {
        const bucket = rollup.get(entry.supermercado);
        if (!bucket) return;
        bucket.total += entry.subtotal;
        bucket.itemsCount += 1;
      });
    setTotals(
      activeStores.map((store) => {
        const b = rollup.get(store)!;
        return { supermercado: store, total: toMoney(b.total), itemsCount: b.itemsCount, updatedAt: nowIso() };
      })
    );
  }

  const currentStoreTotal = useMemo(
    () => totals.find((t) => t.supermercado === selectedStore)?.total ?? 0,
    [totals, selectedStore]
  );

  async function saveCurrentRound() {
    if (!currentRonda.fecha) {
      setStatus("ALERTA: la fecha es obligatoria. Selecciona una fecha antes de guardar la ronda.");
      return;
    }
    const activeStoreSet = new Set(activeStores.map((s) => normalizeStoreName(String(s))));
    // Guardar los que estÃ¡n en el carrito o tienen algÃºn dato cargado (para comparar)
    const entriesToSave = Object.values(entryMap).filter((e) => {
      const hasData = e.inCart || e.precioUnitario > 0 || e.cantidad > 0;
      if (!hasData) return false;
      return activeStoreSet.has(normalizeStoreName(String(e.supermercado)));
    });
    if (entriesToSave.length === 0) {
      setStatus("No hay articulos cargados o en carrito para guardar.");
      return;
    }
    const invalid = entriesToSave.find((e) => e.precioUnitario < 0 || (e.inCart && e.cantidad <= 0));
    if (invalid) {
      setStatus("Hay items invalidos: verifica precio y cantidad.");
      return;
    }
    const entriesWithFecha = entriesToSave.map((e) => ({
      ...e,
      fecha: currentRonda.fecha,
      sessionId: e.sessionId ?? liveSessionId ?? undefined
    }));
    const allStoreNames = [...new Set(activeStores.map((s) => normalizeStoreName(String(s))).filter(Boolean))];
    await db.rondas.put(currentRonda);
    if (!navigator.onLine) {
      const job: SyncJob = { id: makeId(), payload: entriesWithFecha, stores: allStoreNames, attempts: 0, createdAt: nowIso() };
      await db.syncQueue.put(job);
      setStatus("Sin internet: ronda guardada localmente para sincronizar.");
      return;
    }
    try {
      await sendEntriesBatch(entriesWithFecha, allStoreNames);
      setStatus("Ronda sincronizada con Google Sheets.");
    } catch (error) {
      const job: SyncJob = { id: makeId(), payload: entriesWithFecha, stores: allStoreNames, attempts: 1, createdAt: nowIso() };
      await db.syncQueue.put(job);
      setStatus(`Error al guardar: ${String(error)}`);
    }
  }

  async function flushSyncQueue() {
    const jobs = await db.syncQueue.toArray();
    const activeStoreSet = new Set(activeStores.map((s) => normalizeStoreName(String(s))));
    const activeStoreNames = [...activeStoreSet];
    for (const job of jobs) {
      try {
        const filteredPayload = (job.payload ?? []).filter((entry) =>
          activeStoreSet.has(normalizeStoreName(String(entry.supermercado)))
        );
        if (filteredPayload.length === 0) {
          await db.syncQueue.delete(job.id);
          continue;
        }
        await syncEntries(filteredPayload, activeStoreNames);
        await db.syncQueue.delete(job.id);
      } catch {
        await db.syncQueue.put({ ...job, attempts: job.attempts + 1 });
      }
    }
  }

  async function refreshRemoteTotals() {
    try {
      const response = await fetchTotals(currentRonda.fecha ?? undefined);
      if (response.totals.length > 0) {
        setTotals(response.totals);
        setStatus("Totales actualizados.");
      }
    } catch {
      setStatus("Error al actualizar totales.");
    }
  }

  async function handleLoadHistoryFromSheets() {
    if (!currentRonda.fecha) {
      setStatus("Selecciona una fecha antes de cargar historial.");
      return;
    }
    setHistoryLoading(true);
    setStatus(`Cargando historial de Sheets para ${currentRonda.fecha}...`);
    try {
      const { entries: sheetEntries } = await fetchRound(currentRonda.fecha);
      if (!Array.isArray(sheetEntries) || sheetEntries.length === 0) {
        setStatus(`No hay historial en Sheets para ${currentRonda.fecha}.`);
        return;
      }

      let mergedCount = 0;
      setEntryMap((prev) => {
        const next = { ...prev };
        sheetEntries.forEach((se: any) => {
          const store = normalizeStoreName(String(se?.supermercado ?? ""));
          if (!store || !activeStores.includes(store)) return;
          const itemId = String(se?.itemId ?? "");
          if (!itemId) return;

          const key = entryKey(store, itemId);
          const local = prev[key];

          const incoming: Entry = {
            id: local?.id ?? makeId(),
            rondaId: currentRonda.id,
            sessionId: liveSessionId ?? undefined,
            fecha: currentRonda.fecha,
            supermercado: store,
            itemId,
            precioUnitario: Number(se?.precioUnitario) || 0,
            cantidad: Math.round(Number(se?.cantidad) || 0),
            subtotal: toMoney((Number(se?.precioUnitario) || 0) * (Math.round(Number(se?.cantidad) || 0))),
            inCart: true,
            offline: !navigator.onLine,
            createdAt: local?.createdAt ?? nowIso(),
            updatedAt: nowIso(),
            sender: "sheets-history-load"
          };

          const localTs = entryTimestamp(local);
          const incomingTs = entryTimestamp(incoming);
          if (local && localTs > 0 && incomingTs > 0 && localTs >= incomingTs) return;

          next[key] = incoming;
          mergedCount += 1;
        });
        return next;
      });

      setStatus(`Historial cargado manualmente: ${mergedCount} articulos actualizados.`);
    } catch (error) {
      setStatus(`No se pudo cargar historial: ${String(error)}`);
    } finally {
      setHistoryLoading(false);
    }
  }

  if (!signedIn) {
    return <LoginScreen authLoading={authLoading} status={status} onSignIn={() => void handleSignIn()} />;
  }


  const optionalActiveStores = activeStores.filter((store) => !BASE_STORES.includes(store));
  const hasDisableOptions = optionalActiveStores.length > 0;
  const hasStoreMenuOptions = inactiveStores.length > 0 || showAddStoreInput || hasDisableOptions;

  return (
    <div className="app-shell">
      <AppHeader isOnline={isOnline} onSignOut={handleSignOut} />

      {/* â”€â”€ Store totals bar (only cart items count) â”€â”€ */}
      <div className="store-totals-bar">
        {totals.map((t) => (
          <div key={t.supermercado} className="store-total-chip">
            <span className="store-total-name">{t.supermercado}</span>
            <span className="store-total-amount">${t.total.toFixed(0)}</span>
            <span className="store-total-items">{t.itemsCount} items</span>
          </div>
        ))}
      </div>

      {/* â”€â”€ Tabs â”€â”€ */}
      <nav className="tabs">
        {(["lista", "carga", "comparacion"] as View[]).map((id) => (
          <button key={id} className={view === id ? "tab active" : "tab"} onClick={() => setView(id)} type="button">
            {id === "lista" ? "Lista" : id === "carga" ? "Carga" : "Comparar"}
          </button>
        ))}
      </nav>

      {/* â”€â”€ Filters bar â”€â”€ */}
      <section className="filters-bar">
        <select
          className="h-10 rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          value={String(categoryFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setCategoryFilter(v === "all" ? "all" : Number(v));
          }}
        >
          <option value="all">Todo</option>
          {Array.from(new Set(items.map(i => i.categoria))).sort((a,b)=>a-b).map(cid => (
             <option key={cid} value={cid}>{CATEGORY_LABELS[cid] || `Categoria ${cid}`}</option>
          ))}
        </select>
        <div className="priority-controls">
          <div className={`search-inline ${searchOpen || search ? "open" : ""}`}>
            <button
              type="button"
              className="search-inline-btn"
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              aria-label="Buscar"
            >
              Buscar
            </button>
            <input
              ref={searchInputRef}
              className="search-inline-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar..."
              onBlur={() => { if (!search) setSearchOpen(false); }}
            />
            {search && (
              <button type="button" className="search-clear" onClick={() => { setSearch(""); setSearchOpen(false); }}>x</button>
            )}
          </div>
          <select
            className="h-10 rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            title="Filtrar por criticidad"
          >
            <option value="all">Todos</option>
            <option value="orange">Naranja</option>
            <option value="red">Rojo</option>
            <option value="none">Sin color</option>
          </select>
          <select
            className="h-10 rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={priorityMode}
            onChange={(e) => setPriorityMode(e.target.value as PriorityMode)}
            title="Orden de criticidad"
          >
            <option value="orange-first">Asc: Naranja, Rojo</option>
            <option value="red-first">Desc: Rojo, Naranja</option>
          </select>
        </div>
      </section>
 
      {/* â”€â”€ Lista â”€â”€ */}
      {view === "lista" && (
        <ProductListView items={filteredItems} />
      )}

      {/* â”€â”€ Carga â”€â”€ */}
      {view === "carga" && (
        <ShoppingView
          items={items}
          activeStores={activeStores}
          selectedStore={selectedStore}
          currentStoreTotal={currentStoreTotal}
          currentRonda={currentRonda}
          filteredItems={filteredItems}
          entryMap={entryMap}
          entryKey={entryKey}
          storeMenuOpen={storeMenuOpen}
          showAddStoreInput={showAddStoreInput}
          newStoreName={newStoreName}
          inactiveStores={inactiveStores}
          optionalActiveStores={optionalActiveStores}
          hasDisableOptions={hasDisableOptions}
          hasStoreMenuOptions={hasStoreMenuOptions}
          addStoreInputRef={addStoreInputRef}
          productMenuOpen={productMenuOpen}
          editingItemId={editingItemId}
          productName={productName}
          productCategory={productCategory}
          productHay={productHay}
          onSelectedStoreChange={setSelectedStore}
          onToggleStoreMenu={() => {
            setStoreMenuOpen((prev) => !prev);
            setShowAddStoreInput(false);
            setNewStoreName("");
          }}
          onShowAddStoreInput={() => setShowAddStoreInput(true)}
          onNewStoreNameChange={setNewStoreName}
          onAddStore={addStore}
          onActivateStore={activateStore}
          onDisableStore={disableStore}
          onDateChange={(value) => setCurrentRonda((prev) => ({ ...prev, fecha: value }))}
          onToggleProductMenu={() => {
            setProductMenuOpen((prev) => !prev);
            if (!productMenuOpen) resetProductForm();
          }}
          onLoadHistoryFromSheets={() => void handleLoadHistoryFromSheets()}
          historyLoading={historyLoading}
          onSaveRound={() => void saveCurrentRound()}
          onSelectExistingProduct={(id) => {
            setEditingItemId(id);
            if (id) {
              const found = items.find((i) => i.id === id);
              if (found) {
                setProductName(found.nombre);
                setProductCategory(found.categoria);
                setProductHay(found.hay);
              }
            } else {
              resetProductForm();
            }
          }}
          onProductNameChange={setProductName}
          onProductCategoryChange={(value) => setProductCategory(value)}
          onProductHayChange={(value) => setProductHay(value)}
          onCreateProduct={() => void handleCreateProduct()}
          onUpdateProduct={() => void handleUpdateProduct()}
          onDeleteProduct={() => void handleDeleteProduct()}
          onUpdateEntry={updateEntry}
          onToggleCart={toggleCart}
          onBumpQuantity={bumpQuantity}
        />
      )}

      {/* â”€â”€ ComparaciÃ³n â”€â”€ */}
      {view === "comparacion" && (
        <ComparisonView
          items={filteredItems}
          activeStores={activeStores}
          totals={totals}
          entryMap={entryMap}
          entryKey={entryKey}
          onRefreshTotals={() => void refreshRemoteTotals()}
        />
      )}

      {/* â”€â”€ Toast â”€â”€ */}
      {status && (
        <div className="toast-notification" role="alert">
          <span>{status}</span>
          <button type="button" className="toast-close" onClick={() => setStatus("")} aria-label="Cerrar">x</button>
        </div>
      )}
    </div>
  );
}



