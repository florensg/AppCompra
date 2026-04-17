import React, { useEffect, useMemo, useRef, useState } from "react";
import { ACTIVE_STORES, CATEGORY_LABELS, GOOGLE_CLIENT_ID } from "./constants";
import { fetchBootstrap, fetchTotals, sendEntriesBatch, syncEntries } from "./api";
import { initAuth, requestToken, signOut as authSignOut } from "./auth";
import { db } from "./db";
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
  fecha: null,
  storesActivos: ACTIVE_STORES,
  createdAt: nowIso()
});

const entryKey = (store: StoreName, itemId: string): string => `${store}::${itemId}`;

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

export default function App() {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [items, setItems] = useState<Item[]>([]);
  const [currentRonda, setCurrentRonda] = useState<Ronda>(newRonda());
  const [selectedStore, setSelectedStore] = useState<StoreName>("CHEK");
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");
  const [priorityMode, setPriorityMode] = useState<PriorityMode>("orange-first");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  // entryMap is intentionally NOT persisted across sessions — reset on load
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [totals, setTotals] = useState<StoreTotal[]>(initialTotals());
  const [status, setStatus] = useState("Iniciá sesión para cargar datos.");
  const [signedIn, setSignedIn] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tryInit = () => {
      if (window.google?.accounts?.oauth2) {
        initAuth(GOOGLE_CLIENT_ID);
      } else {
        setTimeout(tryInit, 200);
      }
    };
    tryInit();
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

  async function handleSignIn() {
    setAuthLoading(true);
    try {
      await requestToken("consent");
      setSignedIn(true);
      setStatus("Autenticado. Cargando catálogo...");
    } catch (err) {
      setStatus(`Error al iniciar sesión: ${String(err)}`);
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
    let list = categoryFilter === "all" ? items : items.filter((i) => i.categoria === categoryFilter);
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
      const resolved = data.items.length > 0 ? data.items : MOCK_ITEMS;
      setItems(resolved);
      setStatus(data.items.length > 0 ? "Catálogo cargado desde Google Sheets." : "Catálogo demo local cargado.");
    } catch (error) {
      setItems(MOCK_ITEMS);
      setStatus(`Sin conexión API. Modo local activo. (${String(error)})`);
    }
  }

  function updateEntry(item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const precioUnitario = patch.precioUnitario ?? current?.precioUnitario ?? 0;
    const cantidad = patch.cantidad ?? current?.cantidad ?? Math.max(item.sugerida || 0, 1);
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
      createdAt: current?.createdAt ?? nowIso()
    };
    setEntryMap((prev) => ({ ...prev, [key]: entry }));
    if (entry.precioUnitario < 0 || entry.cantidad <= 0) {
      setStatus("Ítem cargado con advertencia: precio >= 0 y cantidad > 0 requeridos.");
    }
  }

  function toggleCart(item: Item) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    if (!current) return;
    const updated: Entry = { ...current, inCart: !current.inCart };
    setEntryMap((prev) => ({ ...prev, [key]: updated }));
  }

  function bumpQuantity(item: Item, delta: number) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const nextQty = Math.max(0.1, toMoney((current?.cantidad ?? Math.max(item.sugerida, 1)) + delta));
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
          <h1>AppCompras</h1>
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
          <div className={`badge ${navigator.onLine ? "online" : "offline"}`}>
            {navigator.onLine ? "●" : "○"}
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
            setCategoryFilter(v === "all" ? "all" : (Number(v) as CategoryId));
          }}
        >
          <option value="all">Todas las categorías</option>
          <option value="1">Comestibles</option>
          <option value="2">Aseo</option>
          <option value="3">Otros</option>
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
              <span className="item-row-cat">{CATEGORY_LABELS[item.categoria]}</span>
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
            {filteredItems.map((item) => {
              const key = entryKey(selectedStore, item.id);
              const entry = entryMap[key];
              const hasEntry = entry && (entry.precioUnitario > 0 || entry.cantidad > 0);
              return (
                <article key={item.id} className={`item-card ${hayClass(item.hay)} ${entry?.inCart ? "in-cart" : ""}`}>
                  {/* Compact item info */}
                  <div className="item-row compact">
                    <span className="item-row-name">{item.nombre}</span>
                    <span className="item-row-stat">HAY <strong>{item.hay}</strong></span>
                    <span className="item-row-stat">SUG <strong>{item.sugerida}</strong></span>
                    <span className="item-row-cat">{CATEGORY_LABELS[item.categoria]}</span>
                  </div>
                  {/* Entry inputs + cart button */}
                  <div className="entry-inputs">
                    <label className="entry-label">
                      <span>Precio</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={entry?.precioUnitario ?? ""}
                        onChange={(e) => updateEntry(item, { precioUnitario: parseDecimal(e.target.value) })}
                      />
                    </label>
                    <label className="entry-label">
                      <span>Cant.</span>
                      <div className="qty-row">
                        <button type="button" onClick={() => bumpQuantity(item, -1)}>−</button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={entry?.cantidad ?? ""}
                          onChange={(e) => updateEntry(item, { cantidad: parseDecimal(e.target.value) })}
                        />
                        <button type="button" onClick={() => bumpQuantity(item, 1)}>+</button>
                      </div>
                    </label>
                    <div className="entry-subtotal">
                      ${(entry?.subtotal ?? 0).toFixed(2)}
                    </div>
                    {/* Cart toggle — only shown when there's an entry */}
                    {hasEntry && (
                      <button
                        type="button"
                        className={`cart-btn ${entry?.inCart ? "cart-active" : ""}`}
                        onClick={() => toggleCart(item)}
                        title={entry?.inCart ? "Quitar del carrito" : "Agregar al carrito"}
                      >
                        🛒
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
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
