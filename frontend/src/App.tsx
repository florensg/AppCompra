import React, { useEffect, useMemo, useState } from "react";
import { ACTIVE_STORES, CATEGORY_LABELS } from "./constants";
import { fetchBootstrap, fetchTotals, sendEntriesBatch, syncEntries } from "./api";
import { db } from "./db";
import { MOCK_ITEMS } from "./mockCatalog";
import { CategoryId, Entry, Item, Ronda, StoreName, StoreTotal, SyncJob } from "./types";
import { makeId, nowIso, parseDecimal, toMoney } from "./utils";
import "./styles.css";

type View = "lista" | "carga" | "comparacion" | "historial";

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

export default function App() {
  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [items, setItems] = useState<Item[]>([]);
  const [currentRonda, setCurrentRonda] = useState<Ronda>(newRonda());
  const [selectedStore, setSelectedStore] = useState<StoreName>("CHEK");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [totals, setTotals] = useState<StoreTotal[]>(initialTotals());
  const [status, setStatus] = useState("Listo para cargar precios.");

  useEffect(() => {
    void bootstrap();
    void loadDraftEntries();

    const onOnline = () => {
      setStatus("Conectado: sincronizando cola pendiente...");
      void flushSyncQueue();
    };

    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  useEffect(() => {
    recalcTotals(entryMap);
  }, [entryMap]);

  const filteredItems = useMemo(() => {
    const byCategory =
      categoryFilter === "all" ? items : items.filter((item) => item.categoria === categoryFilter);

    if (!search.trim()) return byCategory;
    const q = search.toLowerCase().trim();
    return byCategory.filter((item) => item.nombre.toLowerCase().includes(q));
  }, [items, search, categoryFilter]);

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

  async function loadDraftEntries() {
    const stored = await db.entries.toArray();
    const map: Record<string, Entry> = {};
    for (const entry of stored) {
      map[entryKey(entry.supermercado, entry.itemId)] = entry;
    }
    setEntryMap(map);
  }

  function updateEntry(item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const precioUnitario = patch.precioUnitario ?? current?.precioUnitario ?? 0;
    const cantidad = patch.cantidad ?? current?.cantidad ?? item.sugerida ?? 0;
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
      offline: !navigator.onLine,
      createdAt: current?.createdAt ?? nowIso()
    };

    if (entry.precioUnitario < 0 || entry.cantidad <= 0) {
      setStatus("Validación: precio >= 0 y cantidad > 0.");
      return;
    }

    const next = { ...entryMap, [key]: entry };
    setEntryMap(next);
    void db.entries.put(entry);
  }

  function bumpQuantity(item: Item, delta: number) {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const baseQty = current?.cantidad ?? Math.max(item.sugerida, 1);
    const nextQty = Math.max(0.1, toMoney(baseQty + delta));
    updateEntry(item, { cantidad: nextQty });
  }

  function recalcTotals(map: Record<string, Entry>) {
    const rollup = new Map<StoreName, { total: number; itemsCount: number }>();
    for (const store of ACTIVE_STORES) rollup.set(store, { total: 0, itemsCount: 0 });

    Object.values(map).forEach((entry) => {
      const bucket = rollup.get(entry.supermercado);
      if (!bucket) return;
      bucket.total += entry.subtotal;
      bucket.itemsCount += 1;
    });

    const nextTotals = ACTIVE_STORES.map((store) => {
      const bucket = rollup.get(store)!;
      return {
        supermercado: store,
        total: toMoney(bucket.total),
        itemsCount: bucket.itemsCount,
        updatedAt: nowIso()
      };
    });
    setTotals(nextTotals);
  }

  async function saveCurrentRound() {
    const entries = Object.values(entryMap).filter((entry) => entry.rondaId === currentRonda.id);
    if (entries.length === 0) {
      setStatus("No hay ítems cargados para guardar.");
      return;
    }

    const invalid = entries.find((entry) => entry.precioUnitario < 0 || entry.cantidad <= 0);
    if (invalid) {
      setStatus("Hay ítems inválidos: verificá precio y cantidad.");
      return;
    }

    await db.rondas.put(currentRonda);

    if (!navigator.onLine) {
      const job: SyncJob = { id: makeId(), payload: entries, attempts: 0, createdAt: nowIso() };
      await db.syncQueue.put(job);
      setStatus("Sin internet: ronda guardada localmente para sincronizar.");
      return;
    }

    try {
      await sendEntriesBatch(entries);
      setStatus("Ronda sincronizada con Google Sheets.");
    } catch {
      const job: SyncJob = { id: makeId(), payload: entries, attempts: 1, createdAt: nowIso() };
      await db.syncQueue.put(job);
      setStatus("Error de red: ronda en cola para reintento automático.");
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
        setStatus("Totales actualizados desde backend.");
      }
    } catch {
      setStatus("No se pudieron consultar totales remotos. Mostrando totales locales.");
    }
  }

  const currentStoreTotal = totals.find((t) => t.supermercado === selectedStore)?.total ?? 0;

  return (
    <div className="app-shell">
      <header className="top-header">
        <div>
          <h1>AppCompras</h1>
          <p>Carga rápida de precios y cantidades</p>
        </div>
        <div className={`badge ${navigator.onLine ? "online" : "offline"}`}>
          {navigator.onLine ? "Online" : "Offline"}
        </div>
      </header>

      <nav className="tabs">
        {[
          ["lista", "Lista"],
          ["carga", "Carga"],
          ["comparacion", "Comparación"],
          ["historial", "Historial"]
        ].map(([id, label]) => (
          <button
            key={id}
            className={view === id ? "tab active" : "tab"}
            onClick={() => setView(id as View)}
            type="button"
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="filters">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar artículo por nombre..."
        />
        <select
          value={String(categoryFilter)}
          onChange={(event) => {
            const value = event.target.value;
            setCategoryFilter(value === "all" ? "all" : (Number(value) as CategoryId));
          }}
        >
          <option value="all">Todas las categorías</option>
          <option value="1">1 - Comestibles</option>
          <option value="2">2 - Aseo y limpieza</option>
          <option value="3">3 - Otros artículos</option>
        </select>
      </section>

      {view === "lista" && (
        <section className="panel">
          {filteredItems.map((item) => (
            <article key={item.id} className="item-card">
              <div>
                <h3>{item.nombre}</h3>
                <small>{CATEGORY_LABELS[item.categoria]}</small>
              </div>
              <div className="item-meta">
                <span>HAY: {item.hay}</span>
                <span>Sugerida: {item.sugerida}</span>
              </div>
            </article>
          ))}
        </section>
      )}

      {view === "carga" && (
        <section className="panel">
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
            <div className="store-total">Total {selectedStore}: ${currentStoreTotal.toFixed(2)}</div>
          </div>

          {filteredItems.map((item) => {
            const key = entryKey(selectedStore, item.id);
            const entry = entryMap[key];
            return (
              <article key={item.id} className="item-card">
                <div>
                  <h3>{item.nombre}</h3>
                  <small>HAY: {item.hay} | Sugerida: {item.sugerida}</small>
                </div>
                <div className="entry-grid">
                  <label>
                    Precio unitario
                    <input
                      type="text"
                      inputMode="decimal"
                      value={entry?.precioUnitario ?? ""}
                      onChange={(event) =>
                        updateEntry(item, { precioUnitario: parseDecimal(event.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Cantidad
                    <div className="qty-row">
                      <button type="button" onClick={() => bumpQuantity(item, -1)}>
                        -
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={entry?.cantidad ?? ""}
                        onChange={(event) => updateEntry(item, { cantidad: parseDecimal(event.target.value) })}
                      />
                      <button type="button" onClick={() => bumpQuantity(item, 1)}>
                        +
                      </button>
                    </div>
                  </label>
                </div>
                <div className="subtotal">Subtotal: ${(entry?.subtotal ?? 0).toFixed(2)}</div>
              </article>
            );
          })}

          <div className="actions">
            <label>
              Fecha (opcional)
              <input
                type="date"
                value={currentRonda.fecha ?? ""}
                onChange={(event) => {
                  const value = event.target.value || null;
                  setCurrentRonda((prev) => ({ ...prev, fecha: value }));
                }}
              />
            </label>
            <button className="primary" type="button" onClick={() => void saveCurrentRound()}>
              Guardar ronda
            </button>
          </div>
        </section>
      )}

      {view === "comparacion" && (
        <section className="panel">
          <div className="comparison-grid">
            {totals.map((total) => (
              <article key={total.supermercado} className="store-box">
                <h3>{total.supermercado}</h3>
                <p>${total.total.toFixed(2)}</p>
                <small>{total.itemsCount} ítems</small>
              </article>
            ))}
          </div>
          <button type="button" className="secondary" onClick={() => void refreshRemoteTotals()}>
            Actualizar desde backend
          </button>
        </section>
      )}

      {view === "historial" && (
        <section className="panel">
          <p>Historial local de rondas guardadas.</p>
          <HistorySection />
        </section>
      )}

      <footer className="status">{status}</footer>
    </div>
  );
}

function HistorySection() {
  const [rows, setRows] = useState<Ronda[]>([]);

  useEffect(() => {
    void db.rondas.orderBy("createdAt").reverse().limit(20).toArray().then(setRows);
  }, []);

  if (rows.length === 0) {
    return <p className="muted">Todavía no hay rondas guardadas.</p>;
  }

  return (
    <ul className="history-list">
      {rows.map((row) => (
        <li key={row.id}>
          <strong>{row.fecha ?? "Sin fecha"}</strong> - {new Date(row.createdAt).toLocaleString()}
        </li>
      ))}
    </ul>
  );
}
