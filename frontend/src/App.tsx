import React, { useEffect, useMemo, useRef, useState } from "react";
import { BASE_STORES, CATEGORY_LABELS } from "./constants";
import {
  createCatalogItem,
  deleteCatalogItem,
  fetchBootstrap,
  fetchRound,
  fetchTotals,
  sendEntriesBatch,
  syncEntries,
  updateCatalogItem
} from "./api";
import { signIn, signOut as authSignOut, onAuthStatusChange } from "./auth";
import { db } from "./db";
import { cleanupDuplicateEntriesForDate, getOrCreateLiveSessionId, listenToLiveEntries, saveDraftEntry } from "./firestoreApi";
import { CategoryId, Entry, Item, Ronda, StoreConfig, StoreName, StoreTotal, SyncJob } from "./types";
import { makeId, nowIso, parseDecimal, toMoney } from "./utils";
import "./styles.css";

type View = "lista" | "carga" | "comparacion";
type PriorityMode = "orange-first" | "red-first";
type PriorityFilter = "all" | "orange" | "red" | "none";

const DEFAULT_VIEW: View = "carga";
const STORES_STORAGE_KEY = "appcompras.storeConfigs.v1";
const DEFAULT_INACTIVE_STORES: StoreName[] = ["MAXI", "VEA"];

const STORE_ALIASES: Record<string, string> = {
  "MAXI CARREFOUR": "MAXI"
};

const normalizeStoreName = (name: string): string => {
  const normalized = name.trim().replace(/\s+/g, " ").toUpperCase();
  return STORE_ALIASES[normalized] ?? normalized;
};
const normalizeProductName = (name: string): string =>
  name.trim().replace(/\s+/g, " ").toLowerCase();

const createStoreConfig = (name: StoreName, isBase: boolean, isActive: boolean): StoreConfig => ({
  name,
  isBase,
  isActive
});

const buildDefaultStoreConfigs = (): StoreConfig[] =>
  [
    ...BASE_STORES.map((name) => createStoreConfig(name, true, true)),
    ...DEFAULT_INACTIVE_STORES.map((name) => createStoreConfig(name, false, false))
  ];

const sortStoreConfigs = (stores: StoreConfig[]): StoreConfig[] => {
  const baseRank = new Map(BASE_STORES.map((name, idx) => [name, idx]));
  return [...stores].sort((a, b) => {
    if (a.isBase && b.isBase) {
      return (baseRank.get(a.name) ?? 999) - (baseRank.get(b.name) ?? 999);
    }
    if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
};

const mergeStoreConfigs = (incomingStores: StoreName[], localStores: StoreConfig[]): StoreConfig[] => {
  const map = new Map<string, StoreConfig>();
  buildDefaultStoreConfigs().forEach((store) => map.set(store.name, store));
  localStores.forEach((store) => map.set(store.name, { ...store }));
  incomingStores.forEach((rawName) => {
    const name = normalizeStoreName(rawName);
    if (!name) return;
    const current = map.get(name);
    map.set(
      name,
      current ?? createStoreConfig(name, BASE_STORES.includes(name), BASE_STORES.includes(name))
    );
  });
  return sortStoreConfigs(Array.from(map.values()));
};

const loadStoredStoreConfigs = (): StoreConfig[] => {
  try {
    const raw = localStorage.getItem(STORES_STORAGE_KEY);
    if (!raw) return buildDefaultStoreConfigs();
    const parsed = JSON.parse(raw) as StoreConfig[];
    if (!Array.isArray(parsed)) return buildDefaultStoreConfigs();
    const normalized = parsed
      .map((entry) => {
        const name = normalizeStoreName(String(entry?.name ?? ""));
        if (!name) return null;
        const isBase = BASE_STORES.includes(name);
        return createStoreConfig(name, isBase, isBase ? true : Boolean(entry?.isActive));
      })
      .filter((entry): entry is StoreConfig => entry !== null);
    return mergeStoreConfigs([], normalized);
  } catch {
    return buildDefaultStoreConfigs();
  }
};

const newRonda = (storesActivos: StoreName[]): Ronda => ({
  id: makeId(),
  fecha: nowIso().slice(0, 10),
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

// ── Priority helpers ─────────────────────────────────────────────
const hayClass = (hay: number): string =>
  hay > 5 ? "priority-red" : hay > 0 ? "priority-orange" : "";

const hayPriority = (hay: number, mode: PriorityMode): number => {
  if (mode === "orange-first") return hay > 0 && hay <= 5 ? 0 : hay > 5 ? 1 : 2;
  return hay > 5 ? 0 : hay > 0 && hay <= 5 ? 1 : 2;
};

const matchesPriorityFilter = (hay: number, f: PriorityFilter): boolean => {
  if (f === "all") return true;
  if (f === "orange") return hay > 0 && hay <= 5;
  if (f === "red") return hay > 5;
  return hay === 0;
};

// ── Memoized ItemCard Component ──────────────────────────────────
interface ItemCardProps {
  item: Item;
  entry?: Entry;
  onUpdate: (item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) => void;
  onToggleCart: (item: Item) => void;
  onBumpQuantity: (item: Item, delta: number) => void;
}

const ItemCard = React.memo(({ item, entry, onUpdate, onToggleCart, onBumpQuantity }: ItemCardProps) => {
  const [localPrecio, setLocalPrecio] = useState(entry?.precioUnitario !== undefined ? entry.precioUnitario.toString() : "");
  const [localCantidad, setLocalCantidad] = useState(entry?.cantidad !== undefined ? entry.cantidad.toString() : "");
  const hasEntry = entry && (entry.precioUnitario > 0 || entry.cantidad > 0);

  // Sincronizar con el estado global solo si no tenemos el foco en el input
  useEffect(() => {
    const isFocused = document.activeElement?.getAttribute("data-item-id") === item.id;
    if (!isFocused) {
      setLocalPrecio(entry?.precioUnitario !== undefined ? entry.precioUnitario.toString() : "");
      setLocalCantidad(entry?.cantidad !== undefined ? entry.cantidad.toString() : "");
    }
  }, [entry?.precioUnitario, entry?.cantidad, item.id]);

  const handlePrecioChange = (val: string) => {
    setLocalPrecio(val);
    const num = parseDecimal(val);
    onUpdate(item, { precioUnitario: num });
  };

  const handleCantidadChange = (val: string) => {
    setLocalCantidad(val);
    const num = Math.round(Number(val)) || 0;
    onUpdate(item, { cantidad: num });
  };

  return (
    <article className={`item-card ${hayClass(item.hay)} ${entry?.inCart ? "in-cart" : ""}`}>
      <div className="item-row compact">
        <span className="item-row-name">{item.nombre}</span>
        <span className="item-row-stat">HAY <strong>{item.hay}</strong></span>
        <span className="item-row-stat">SUG <strong>{item.sugerida}</strong></span>
        <span className="item-row-cat">{CATEGORY_LABELS[item.categoria]}</span>
      </div>
      <div className="entry-inputs">
        <label className="entry-label">
          <span>Precio</span>
          <input
            type="text"
            inputMode="decimal"
            data-item-id={item.id}
            value={localPrecio}
            onChange={(e) => handlePrecioChange(e.target.value)}
          />
        </label>
        <label className="entry-label">
          <span>Cant.</span>
          <div className="qty-row">
            <button type="button" onClick={() => onBumpQuantity(item, -1)}>−</button>
            <input
              type="number"
              inputMode="numeric"
              data-item-id={item.id}
              min="0"
              step="1"
              value={localCantidad}
              onChange={(e) => handleCantidadChange(e.target.value)}
            />
            <button type="button" onClick={() => onBumpQuantity(item, 1)}>+</button>
          </div>
        </label>
        <div className="entry-subtotal">
          ${(entry?.subtotal ?? 0).toFixed(2)}
        </div>
        {hasEntry && (
          <button
            type="button"
            className={`cart-btn ${entry?.inCart ? "cart-active" : ""}`}
            onClick={() => onToggleCart(item)}
            title={entry?.inCart ? "Quitar del carrito" : "Agregar al carrito"}
          >
            🛒
          </button>
        )}
      </div>
    </article>
  );
});

export default function App() {
  const [storeConfigs, setStoreConfigs] = useState<StoreConfig[]>(() => loadStoredStoreConfigs());
  const activeStores = useMemo(
    () => sortStoreConfigs(storeConfigs.filter((store) => store.isActive)).map((store) => store.name),
    [storeConfigs]
  );
  const inactiveStores = useMemo(
    () => sortStoreConfigs(storeConfigs.filter((store) => !store.isActive)).map((store) => store.name),
    [storeConfigs]
  );
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
  // entryMap is intentionally NOT persisted across sessions — reset on load
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [totals, setTotals] = useState<StoreTotal[]>(() => initialTotals(activeStores));
  const [status, setStatus] = useState("Cargando...");
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
    localStorage.setItem(STORES_STORAGE_KEY, JSON.stringify(storeConfigs));
  }, [storeConfigs]);

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
        setStatus("Iniciá sesión para comenzar.");
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
    // NOTE: intentionally NOT calling loadDraftEntries() — entries reset each session
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
        setStatus("Inactividad detectada. Guardando y cerrando sesión...");
        // Guardamos automáticamente antes de salir
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

  // Cargar datos históricos de Google Sheets cuando cambia la fecha
  useEffect(() => {
    if (!signedIn || !currentRonda.fecha) return;
    
    async function loadHistory() {
      const targetDate = currentRonda.fecha;
      if (!targetDate) return;
      setStatus(`Buscando datos del ${targetDate} en Sheets...`);
      try {
        const sessionId = await getOrCreateLiveSessionId(targetDate);
        setLiveSessionId(sessionId);
        const { entries: sheetEntries } = await fetchRound(targetDate);
        setAllowFirestoreLiveForDate(true);
        if (sheetEntries.length > 0) {
          setEntryMap(prev => {
            const next = { ...prev };
            sheetEntries.forEach((se: any) => {
              const key = entryKey(se.supermercado, se.itemId);
              // Solo cargamos el dato de Sheets si no tenemos ya algo editándose "en vivo" 
              // (lo de Firebase tiene prioridad según lo pedido)
              if (!next[key]) {
                next[key] = {
                  ...se,
                  id: makeId(),
                  rondaId: currentRonda.id,
                  sessionId,
                  fecha: targetDate,
                  subtotal: toMoney(se.precioUnitario * se.cantidad),
                  inCart: true,
                  offline: false,
                  createdAt: nowIso()
                };
              }
            });
            return next;
          });
          setStatus(`Se sincronizaron ${sheetEntries.length} artículos del historial.`);
        } else {
          setStatus(`No hay registros en Sheets para ${targetDate}. Sesión colaborativa activa.`);
        }
      } catch (err) {
        setAllowFirestoreLiveForDate(false);
        setLiveSessionId(null);
        console.error("Error cargando historial:", err);
      }
    }

    // Al cambiar la fecha, primero limpiamos para que no se vea data vieja 
    // pero el listener de Firebase (en el otro useEffect) traerá lo nuevo
    setAllowFirestoreLiveForDate(false);
    setLiveSessionId(null);
    setEntryMap({}); 
    void loadHistory();
  }, [signedIn, currentRonda.fecha]);

  // Limpieza de duplicados históricos del día para evitar que reaparezcan valores viejos.
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
          // Ignorar nuestras propias actualizaciones para no pisar el input mientras escribimos
          if ((le as any).sender === CLIENT_ID) return;

          const key = entryKey(le.supermercado, le.itemId);
          const local = prev[key];
          const localTs = entryTimestamp(local);
          const remoteTs = entryTimestamp(le);
          // No sobrescribir edición local más nueva con datos remotos viejos.
          if (local && localTs > 0 && remoteTs > 0 && localTs >= remoteTs) return;
          // Omitir actualización si el valor local es idéntico al de la nube
          if (JSON.stringify(local) !== JSON.stringify(le)) {
            next[key] = le;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    return () => unsub();
  }, [signedIn, currentRonda.fecha, allowFirestoreLiveForDate, liveSessionId]);

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
    setStatus("Sesión cerrada.");
  }

  useEffect(() => {
    recalcTotals(entryMap);
  }, [entryMap, activeStores]);

  const filteredItems = useMemo(() => {
    let list = items;
    // Filtrado por categoría (si es 'all' muestra todos)
    if (categoryFilter !== "all") {
      list = list.filter((i) => i.categoria === categoryFilter);
    }
    
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter((i) => i.nombre.toLowerCase().includes(q));
    }
    list = list.filter((i) => matchesPriorityFilter(i.hay, priorityFilter));
    return [...list].sort((a, b) => hayPriority(a.hay, priorityMode) - hayPriority(b.hay, priorityMode));
  }, [items, search, categoryFilter, priorityFilter, priorityMode]);

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
        throw new Error("El catálogo de Google Sheets está vacío o no se pudo leer.");
      }
      setItems(data.items);
      setStoreConfigs((prev) => mergeStoreConfigs(data.stores ?? [], prev));
      await db.itemsCache.put({ key: "catalog", items: data.items, savedAt: nowIso() });
      
      if (data.source === "sheets") {
         setStatus("Catálogo cargado exitosamente desde Google Sheets.");
      } else {
         setStatus("⚠️ FALLÓ GOOGLE SHEETS: Cargando respaldo de datos viejos desde Firestore.");
      }
    } catch (error) {
      console.error("Fallo total de carga:", error);
      const cached = await db.itemsCache.get("catalog");
      if (cached && cached.items.length > 0) {
        setItems(cached.items);
        setStatus(`Sin conexión a Google Sheets. Usando copia local (${cached.savedAt.slice(0,10)}).`);
      } else {
        setItems([]);
        setStatus(`⚠️ ERROR DE CONEXIÓN: ${String(error)}. Verificá que el enlace de Google Sheets sea correcto y público.`);
      }
    }
  }

  function activateStore(storeName: StoreName) {
    setStoreConfigs((prev) =>
      sortStoreConfigs(prev.map((store) => (store.name === storeName ? { ...store, isActive: true } : store)))
    );
    setSelectedStore(storeName);
    setStoreMenuOpen(false);
    setShowAddStoreInput(false);
    setStatus(`${storeName} ahora está activo.`);
  }

  function disableStore(storeName: StoreName) {
    if (BASE_STORES.includes(storeName)) return;
    setStoreConfigs((prev) =>
      sortStoreConfigs(prev.map((store) => (store.name === storeName ? { ...store, isActive: false } : store)))
    );
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
      setStatus("IngresÃ¡ un nombre de supermercado.");
      return;
    }
    const existing = storeConfigs.find((store) => store.name === normalized);
    if (existing) {
      setStatus(existing.isActive ? `${normalized} ya existe y estÃ¡ activo.` : `${normalized} ya existe y estÃ¡ inactivo.`);
      setShowAddStoreInput(false);
      setNewStoreName("");
      return;
    }
    setStoreConfigs((prev) => sortStoreConfigs([...prev, createStoreConfig(normalized, false, false)]));
    setShowAddStoreInput(false);
    setNewStoreName("");
    setStatus(`${normalized} agregado. PodÃ©s activarlo desde el menÃº +.`);
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
      setStatus("IngresÃ¡ el nombre del producto.");
      return;
    }
    const exists = items.some((item) => normalizeProductName(item.nombre) === normalizeProductName(nombre));
    if (exists) {
      setStatus("Ese producto ya existe en el catÃ¡logo.");
      return;
    }
    try {
      await createCatalogItem({ nombre, categoria: productCategory, hay: productHay });
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
      await updateCatalogItem({
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
    const confirmed = window.confirm(`¿Eliminar ${editingItem.nombre}?`);
    if (!confirmed) return;
    try {
      await deleteCatalogItem({ itemId: editingItem.id });
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
      setStatus("Ítem cargado con advertencia: precio >= 0 y cantidad > 0 requeridos.");
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
      setStatus("⚠️ La fecha es obligatoria. Seleccioná una fecha antes de guardar la ronda.");
      return;
    }
    const activeStoreSet = new Set(activeStores.map((s) => normalizeStoreName(String(s))));
    // Guardar los que están en el carrito o tienen algún dato cargado (para comparar)
    const entriesToSave = Object.values(entryMap).filter((e) => {
      const hasData = e.inCart || e.precioUnitario > 0 || e.cantidad > 0;
      if (!hasData) return false;
      return activeStoreSet.has(normalizeStoreName(String(e.supermercado)));
    });
    if (entriesToSave.length === 0) {
      setStatus("No hay artículos cargados o en carrito para guardar.");
      return;
    }
    const invalid = entriesToSave.find((e) => e.precioUnitario < 0 || (e.inCart && e.cantidad <= 0));
    if (invalid) {
      setStatus("Hay ítems inválidos: verificá precio y cantidad.");
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
      setStatus("✅ Ronda sincronizada con Google Sheets.");
    } catch (error) {
      const job: SyncJob = { id: makeId(), payload: entriesWithFecha, stores: allStoreNames, attempts: 1, createdAt: nowIso() };
      await db.syncQueue.put(job);
      setStatus(`❌ Error al guardar: ${String(error)}`);
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

  // ── Login screen ─────────────────────────────────────────────
  if (!signedIn) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="login-logo">🛒</div>
          <h1>AppCompras v2</h1>
          <p>Carga rápida de precios y cantidades</p>
          <button
            id="btn-google-signin"
            type="button"
            className="google-btn"
            onClick={() => void handleSignIn()}
            disabled={authLoading}
          >
            {authLoading ? "Conectando..." : "Iniciar sesión con Google"}
          </button>
          {status !== "Iniciá sesión para cargar datos." && (
            <p className="status-inline">{status}</p>
          )}
        </div>
      </div>
    );
  }


  const optionalActiveStores = activeStores.filter((store) => !BASE_STORES.includes(store));
  const hasDisableOptions = optionalActiveStores.length > 0;
  const hasStoreMenuOptions = inactiveStores.length > 0 || showAddStoreInput || hasDisableOptions;

  return (
    <div className="app-shell">
      {/* ── Header ── */}
      <header className="top-header">
        <div className="header-title">
          <span>🛒</span>
          <h1>AppCompras</h1>
        </div>
        <div className="header-right">
          <div className={`badge ${isOnline ? "online" : "offline"}`}>
            <span className="status-dot" />
            {isOnline ? "Online" : "Sin red"}
          </div>

          <button id="btn-signout" type="button" className="badge signout-btn" onClick={handleSignOut}>Salir</button>
        </div>
      </header>

      {/* ── Store totals bar (only cart items count) ── */}
      <div className="store-totals-bar">
        {totals.map((t) => (
          <div key={t.supermercado} className="store-total-chip">
            <span className="store-total-name">{t.supermercado}</span>
            <span className="store-total-amount">${t.total.toFixed(0)}</span>
            <span className="store-total-items">{t.itemsCount} 🛒</span>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <nav className="tabs">
        {(["lista", "carga", "comparacion"] as View[]).map((id) => (
          <button key={id} className={view === id ? "tab active" : "tab"} onClick={() => setView(id)} type="button">
            {id === "lista" ? "Lista" : id === "carga" ? "Carga" : "Comparar"}
          </button>
        ))}
      </nav>

      {/* ── Filters bar ── */}
      <section className="filters-bar">
        <select
          value={String(categoryFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setCategoryFilter(v === "all" ? "all" : Number(v));
          }}
        >
          <option value="all">Todo</option>
          {Array.from(new Set(items.map(i => i.categoria))).sort((a,b)=>a-b).map(cid => (
             <option key={cid} value={cid}>{CATEGORY_LABELS[cid] || `Categoría ${cid}`}</option>
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
              🔍
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
              <button type="button" className="search-clear" onClick={() => { setSearch(""); setSearchOpen(false); }}>✕</button>
            )}
          </div>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityFilter)}
            title="Filtrar por criticidad"
          >
            <option value="all">🔘 Todos</option>
            <option value="orange">🟡 Naranja</option>
            <option value="red">🔴 Rojo</option>
            <option value="none">⚪ Sin color</option>
          </select>
          <select
            value={priorityMode}
            onChange={(e) => setPriorityMode(e.target.value as PriorityMode)}
            title="Orden de criticidad"
          >
            <option value="orange-first">Asc: 🟡 Naranja, 🔴 Rojo</option>
            <option value="red-first">Desc: 🔴 Rojo, 🟡 Naranja</option>
          </select>
        </div>
      </section>
 
      {/* ── Lista ── */}
      {view === "lista" && (
        <section className="panel">
          {filteredItems.map((item) => (
            <article key={item.id} className={`item-row ${hayClass(item.hay)}`}>
              <span className="item-row-name">{item.nombre}</span>
              <span className="item-row-stat">HAY <strong>{item.hay}</strong></span>
              <span className="item-row-stat">SUG <strong>{item.sugerida}</strong></span>
              <span className="item-row-cat">{CATEGORY_LABELS[item.categoria] || `Cat. ${item.categoria}`}</span>
            </article>
          ))}
          {filteredItems.length === 0 && (
            <p className="empty-msg">No hay artículos que coincidan con los filtros.</p>
          )}
        </section>
      )}

      {/* ── Carga ── */}
      {view === "carga" && (
        <section className="panel carga-panel">
          <div className="carga-sticky-header">
            <div className="store-switcher">
              {activeStores.map((store) => (
                <button
                  key={store}
                  type="button"
                  className={selectedStore === store ? "store active" : "store"}
                  onClick={() => setSelectedStore(store)}
                >
                  {store}
                </button>
              ))}
              <div className="store-menu-wrap">
                <button
                  type="button"
                  className={`store add-store-btn ${storeMenuOpen ? "active" : ""}`}
                  onClick={() => {
                    setStoreMenuOpen((prev) => !prev);
                    setShowAddStoreInput(false);
                    setNewStoreName("");
                  }}
                  title="Gestionar supermercados"
                >
                  Super {storeMenuOpen ? "▾" : "▸"}
                </button>
                {storeMenuOpen && (
                  <div className="store-menu">
                    <button
                      type="button"
                      className="store-menu-action"
                      onClick={() => {
                        setShowAddStoreInput(true);
                      }}
                    >
                      + Agregar supermercado
                    </button>
                    {showAddStoreInput && (
                      <div className="store-add-form">
                        <input
                          ref={addStoreInputRef}
                          type="text"
                          value={newStoreName}
                          onChange={(e) => setNewStoreName(e.target.value)}
                          placeholder="Nombre del supermercado"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              addStore();
                            }
                          }}
                        />
                        <button type="button" onClick={addStore}>Agregar</button>
                      </div>
                    )}
                    {inactiveStores.map((store) => (
                      <button
                        key={store}
                        type="button"
                        className="store-menu-item"
                        onClick={() => activateStore(store)}
                      >
                        {store}
                      </button>
                    ))}
                    {hasDisableOptions && (
                      <div className="store-menu-group-label">Activos</div>
                    )}
                    {optionalActiveStores.map((store) => (
                      <button
                        key={`disable-${store}`}
                        type="button"
                        className="store-menu-item warn"
                        onClick={() => disableStore(store)}
                      >
                        Ocultar {store}
                      </button>
                    ))}
                    {!hasStoreMenuOptions && (
                      <p className="store-menu-empty">No hay supermercados inactivos.</p>
                    )}
                  </div>
                )}
              </div>
              <div className="store-total">
                Carrito: <strong>${currentStoreTotal.toFixed(2)}</strong>
              </div>
            </div>
            <div className="actions-row">
              <label className="fecha-label">
                Fecha
                <input
                  type="date"
                  value={currentRonda.fecha ?? ""}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    setCurrentRonda((prev) => ({ ...prev, fecha: value }));
                  }}
                />
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setProductMenuOpen((prev) => !prev);
                  if (!productMenuOpen) resetProductForm();
                }}
              >
                Productos {productMenuOpen ? "▾" : "▸"}
              </button>
              <button className="primary" id="btn-save" type="button" onClick={() => void saveCurrentRound()}>
                Guardar ronda
              </button>
            </div>
            {productMenuOpen && (
              <div className="product-admin-panel">
                <div className="product-admin-row">
                  <label className="fecha-label">
                    Producto existente
                    <select
                      value={editingItemId}
                      onChange={(e) => {
                        const id = e.target.value;
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
                    >
                      <option value="">Nuevo producto...</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>{item.nombre} — HAY: {item.hay}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="product-admin-row">
                  <label className="fecha-label">
                    Nombre
                    <input
                      type="text"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      placeholder="Ej: Yerba 1kg"
                    />
                  </label>
                  <label className="fecha-label">
                    CategorÃ­a
                    <select
                      value={String(productCategory)}
                      onChange={(e) => setProductCategory(Number(e.target.value) || 1)}
                    >
                      {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
                        <option key={id} value={id}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="fecha-label">
                    HAY
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={String(productHay)}
                      onChange={(e) => setProductHay(Math.max(0, Number(e.target.value) || 0))}
                    />
                  </label>
                </div>
                <div className="product-admin-actions">
                  <button type="button" className="secondary" onClick={() => void handleCreateProduct()}>
                    Agregar
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={!editingItemId}
                    onClick={() => void handleUpdateProduct()}
                  >
                    Modificar
                  </button>
                  <button
                    type="button"
                    className="secondary danger"
                    disabled={!editingItemId}
                    onClick={() => void handleDeleteProduct()}
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="carga-items-list">
            {filteredItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                entry={entryMap[entryKey(selectedStore, item.id)]}
                onUpdate={updateEntry}
                onToggleCart={toggleCart}
                onBumpQuantity={bumpQuantity}
              />
            ))}
            {filteredItems.length === 0 && (
              <p className="empty-msg">No hay artículos que coincidan con los filtros.</p>
            )}
          </div>
        </section>
      )}

      {/* ── Comparación ── */}
      {view === "comparacion" && (
        <section className="panel">
          <div className="compare-header">
            <div className="compare-name-col">Producto / HAY</div>
            {activeStores.map((s) => (
              <div key={s} className="compare-store-col">
                <div className="compare-store-name">{s}</div>
                <div className="compare-store-total">
                  ${totals.find((t) => t.supermercado === s)?.total.toFixed(0) ?? "0"}
                </div>
              </div>
            ))}
          </div>
          <div className="compare-body">
            {filteredItems.map((item) => {
              const prices = activeStores.map((s) => {
                const e = entryMap[entryKey(s, item.id)];
                return e ? { subtotal: e.subtotal, inCart: e.inCart } : null;
              });
              const validPrices = prices.filter((p): p is { subtotal: number; inCart: boolean } => p !== null && p.subtotal > 0);
              const minPrice = validPrices.length > 0 ? Math.min(...validPrices.map((p) => p.subtotal)) : null;
              return (
                <div key={item.id} className={`compare-row ${hayClass(item.hay)}`}>
                  <div className="compare-name-col">
                    <span className="item-row-name">{item.nombre}</span>
                    <span className="item-row-stat" style={{ fontSize: "0.72rem" }}>HAY {item.hay}</span>
                  </div>
                  {prices.map((p, i) => (
                    <div
                      key={activeStores[i]}
                      className={`compare-price-col ${p && p.subtotal > 0 && p.subtotal === minPrice ? "best-price" : ""} ${p?.inCart ? "is-cart" : ""}`}
                    >
                      {p && p.subtotal > 0 ? (
                        <>
                          <span>${p.subtotal.toFixed(2)}</span>
                          {p.inCart && <span className="cart-icon-sm">🛒</span>}
                        </>
                      ) : "—"}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <button type="button" className="secondary refresh-btn" onClick={() => void refreshRemoteTotals()}>
            Actualizar totales
          </button>
        </section>
      )}

      {/* ── Toast ── */}
      {status && (
        <div className="toast-notification" role="alert">
          <span>{status}</span>
          <button type="button" className="toast-close" onClick={() => setStatus("")} aria-label="Cerrar">✕</button>
        </div>
      )}
    </div>
  );
}
