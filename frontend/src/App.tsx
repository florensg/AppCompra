import React, { useEffect, useMemo, useRef, useState } from "react";
import { ACTIVE_STORES, CATEGORY_LABELS } from "./constants";
import { fetchBootstrap, fetchRound, fetchTotals, sendEntriesBatch, syncEntries } from "./api";
import { signIn, signOut as authSignOut, onAuthStatusChange } from "./auth";
import { db } from "./db";
import { listenToLiveEntries, saveDraftEntry } from "./firestoreApi";
import { MOCK_ITEMS } from "./mockCatalog";
import { CategoryId, Entry, Item, Ronda, StoreName, StoreTotal, SyncJob } from "./types";
import { makeId, nowIso, parseDecimal, toMoney } from "./utils";
import "./styles.css";

type View = "lista" | "carga" | "comparacion";
type PriorityMode = "orange-first" | "red-first";
type PriorityFilter = "all" | "orange" | "red" | "none";

const DEFAULT_VIEW: View = "carga";

const newRonda = (): Ronda => ({
  id: makeId(),
  fecha: nowIso().slice(0, 10),
  storesActivos: ACTIVE_STORES,
  createdAt: nowIso()
});

const entryKey = (store: StoreName, itemId: string): string => `${store}::${itemId}`;

const CLIENT_ID = makeId();

const initialTotals = (): StoreTotal[] =>
  ACTIVE_STORES.map((store) => ({
    supermercado: store,
    total: 0,
    itemsCount: 0,
    updatedAt: nowIso()
  }));

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
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [items, setItems] = useState<Item[]>([]);
  const [currentRonda, setCurrentRonda] = useState<Ronda>(newRonda());
  const [selectedStore, setSelectedStore] = useState<StoreName>("CHEEK");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");
  const [priorityMode, setPriorityMode] = useState<PriorityMode>("orange-first");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  // entryMap is intentionally NOT persisted across sessions — reset on load
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [totals, setTotals] = useState<StoreTotal[]>(initialTotals());
  const [status, setStatus] = useState("Cargando...");
  const [signedIn, setSignedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

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
        const cartEntries = Object.values(entryMap).filter((e) => e.inCart);
        if (cartEntries.length > 0) {
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
      setStatus(`Buscando datos del ${currentRonda.fecha} en Sheets...`);
      try {
        const { entries: sheetEntries } = await fetchRound(currentRonda.fecha!);
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
                  fecha: currentRonda.fecha,
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
          // Si no hay datos, nos aseguramos de no mostrar basura de fechas anteriores
          // Pero con cuidado de no borrar lo que el compañero está editando ahora mismo
          setStatus(`No hay registros para el ${currentRonda.fecha}.`);
        }
      } catch (err) {
        console.error("Error cargando historial:", err);
      }
    }

    // Al cambiar la fecha, primero limpiamos para que no se vea data vieja 
    // pero el listener de Firebase (en el otro useEffect) traerá lo nuevo
    setEntryMap({}); 
    void loadHistory();
  }, [signedIn, currentRonda.fecha]);

  // Sync en vivo del carrito (Firestore) para la fecha seleccionada
  useEffect(() => {
    if (!signedIn || !currentRonda.fecha) return;
    const unsub = listenToLiveEntries(currentRonda.fecha, (liveEntries) => {
      setEntryMap(prev => {
        const next = { ...prev };
        let changed = false;
        liveEntries.forEach(le => {
          // Ignorar nuestras propias actualizaciones para no pisar el input mientras escribimos
          if ((le as any).sender === CLIENT_ID) return;

          const key = entryKey(le.supermercado, le.itemId);
          // Omitir actualización si el valor local es idéntico al de la nube
          if (JSON.stringify(prev[key]) !== JSON.stringify(le)) {
            next[key] = le;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    });
    return () => unsub();
  }, [signedIn, currentRonda.fecha]);

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
  }, [entryMap]);

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

  async function bootstrap() {
    try {
      const data = await fetchBootstrap();
      if (!data.items || data.items.length === 0) {
        throw new Error("El catálogo de Google Sheets está vacío o no se pudo leer.");
      }
      setItems(data.items);
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

  function updateEntry(item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const precioUnitario = patch.precioUnitario ?? current?.precioUnitario ?? 0;
    const cantidad = Math.round(patch.cantidad ?? current?.cantidad ?? 0);
    const subtotal = toMoney(precioUnitario * cantidad);
    const entry: Entry = {
      id: current?.id ?? makeId(),
      rondaId: currentRonda.id,
      fecha: currentRonda.fecha,
      supermercado: selectedStore,
      itemId: item.id,
      precioUnitario,
      cantidad,
      subtotal,
      inCart: current?.inCart ?? false,
      offline: !navigator.onLine,
      createdAt: current?.createdAt ?? nowIso(),
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
    const unsigned = { ...current, inCart: !current.inCart, sender: CLIENT_ID };
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
    for (const store of ACTIVE_STORES) rollup.set(store, { total: 0, itemsCount: 0 });
    Object.values(map)
      .filter((e) => e.inCart)
      .forEach((entry) => {
        const bucket = rollup.get(entry.supermercado);
        if (!bucket) return;
        bucket.total += entry.subtotal;
        bucket.itemsCount += 1;
      });
    setTotals(
      ACTIVE_STORES.map((store) => {
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
    // Only save entries that are "inCart"
    const cartEntries = Object.values(entryMap).filter((e) => e.inCart);
    if (cartEntries.length === 0) {
      setStatus("No hay artículos en el carrito. Marcá con 🛒 los artículos a guardar.");
      return;
    }
    const invalid = cartEntries.find((e) => e.precioUnitario < 0 || e.cantidad <= 0);
    if (invalid) {
      setStatus("Hay ítems inválidos: verificá precio y cantidad.");
      return;
    }
    const entriesWithFecha = cartEntries.map((e) => ({ ...e, fecha: currentRonda.fecha }));
    await db.rondas.put(currentRonda);
    if (!navigator.onLine) {
      const job: SyncJob = { id: makeId(), payload: entriesWithFecha, attempts: 0, createdAt: nowIso() };
      await db.syncQueue.put(job);
      setStatus("Sin internet: ronda guardada localmente para sincronizar.");
      return;
    }
    try {
      await sendEntriesBatch(entriesWithFecha);
      setStatus("✅ Ronda sincronizada con Google Sheets.");
    } catch (error) {
      const job: SyncJob = { id: makeId(), payload: entriesWithFecha, attempts: 1, createdAt: nowIso() };
      await db.syncQueue.put(job);
      setStatus(`❌ Error al guardar: ${String(error)}`);
    }
  }

  async function flushSyncQueue() {
    const jobs = await db.syncQueue.toArray();
    for (const job of jobs) {
      try {
        await syncEntries(job.payload);
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

  const priorityPills: { label: string; value: PriorityFilter }[] = [
    { label: "Todos", value: "all" },
    { label: "🟡 Naranja", value: "orange" },
    { label: "🔴 Rojo", value: "red" },
    { label: "Sin color", value: "none" }
  ];

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
          {/* Expandable search */}
          <div className={`search-wrap ${searchOpen ? "open" : ""}`}>
            <button
              type="button"
              className="search-icon-btn"
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              aria-label="Buscar"
            >
              🔍
            </button>
            <input
              ref={searchInputRef}
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar artículo..."
              onBlur={() => { if (!search) setSearchOpen(false); }}
            />
            {searchOpen && search && (
              <button type="button" className="search-clear" onClick={() => { setSearch(""); setSearchOpen(false); }}>✕</button>
            )}
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
          <option value="all">Todas las categorías</option>
          {Array.from(new Set(items.map(i => i.categoria))).sort((a,b)=>a-b).map(cid => (
             <option key={cid} value={cid}>{CATEGORY_LABELS[cid] || `Categoría ${cid}`}</option>
          ))}
        </select>
        <div className="priority-controls">
          {priorityPills.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`priority-pill ${priorityFilter === p.value ? "active" : ""}`}
              onClick={() => setPriorityFilter(p.value)}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            className="priority-pill order-toggle"
            title="Cambiar orden de prioridad"
            onClick={() => setPriorityMode((m) => m === "orange-first" ? "red-first" : "orange-first")}
          >
            {priorityMode === "orange-first" ? "↑🟡" : "↑🔴"}
          </button>
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
              {ACTIVE_STORES.map((store) => (
                <button
                  key={store}
                  type="button"
                  className={selectedStore === store ? "store active" : "store"}
                  onClick={() => setSelectedStore(store)}
                >
                  {store}
                </button>
              ))}
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
              <button className="primary" id="btn-save" type="button" onClick={() => void saveCurrentRound()}>
                Guardar ronda
              </button>
            </div>
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
            {ACTIVE_STORES.map((s) => (
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
              const prices = ACTIVE_STORES.map((s) => {
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
                      key={ACTIVE_STORES[i]}
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
