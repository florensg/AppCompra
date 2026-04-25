import { useEffect, useMemo, useRef, useState } from "react";
import { Entry, Item, Ronda, StoreName, StoreTotal } from "../../../types";
import { makeId, nowIso, toMoney } from "../../../utils";
import { saveDraftEntry } from "../../../infrastructure/api";

const entryKey = (store: StoreName, itemId: string): string => `${store}::${itemId}`;

const initialTotals = (stores: StoreName[]): StoreTotal[] =>
  stores.map((store) => ({
    supermercado: store,
    total: 0,
    itemsCount: 0,
    updatedAt: nowIso()
  }));

const recalcTotals = (map: Record<string, Entry>, stores: StoreName[]): StoreTotal[] => {
  const rollup = new Map<StoreName, { total: number; itemsCount: number }>();
  for (const store of stores) rollup.set(store, { total: 0, itemsCount: 0 });

  Object.values(map)
    .filter((entry) => entry.inCart)
    .forEach((entry) => {
      const bucket = rollup.get(entry.supermercado);
      if (!bucket) return;
      bucket.total += entry.subtotal;
      bucket.itemsCount += 1;
    });

  return stores.map((store) => {
    const b = rollup.get(store) ?? { total: 0, itemsCount: 0 };
    return {
      supermercado: store,
      total: toMoney(b.total),
      itemsCount: b.itemsCount,
      updatedAt: nowIso()
    };
  });
};

export function entryTimestamp(entry: Partial<Entry> | null | undefined): number {
  if (!entry) return 0;
  const raw = entry.updatedAt ?? entry.createdAt;
  if (!raw) return 0;
  const t = Date.parse(String(raw));
  return Number.isFinite(t) ? t : 0;
}

interface UseShoppingParams {
  activeStores: StoreName[];
  selectedStore: StoreName;
  currentRonda: Ronda;
  liveSessionId: string | null;
  setStatus: (value: string) => void;
  clientId: string;
}

export function useShopping({ activeStores, selectedStore, currentRonda, liveSessionId, setStatus, clientId }: UseShoppingParams) {
  const [entryMap, setEntryMap] = useState<Record<string, Entry>>({});
  const [totals, setTotals] = useState<StoreTotal[]>(() => initialTotals(activeStores));
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    setTotals((prev) => {
      const byStore = new Map(prev.map((entry) => [entry.supermercado, entry]));
      return activeStores.map((store) => {
        const existing = byStore.get(store);
        return existing ?? { supermercado: store, total: 0, itemsCount: 0, updatedAt: nowIso() };
      });
    });
  }, [activeStores]);

  useEffect(() => {
    setTotals(recalcTotals(entryMap, activeStores));
  }, [entryMap, activeStores]);

  const updateEntry = (item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) => {
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
      sender: clientId
    };

    setEntryMap((prev) => ({ ...prev, [key]: entry }));

    if (debounceTimerRef.current[key]) clearTimeout(debounceTimerRef.current[key]);
    debounceTimerRef.current[key] = setTimeout(() => {
      saveDraftEntry(entry);
    }, 500);

    if (entry.precioUnitario < 0 || entry.cantidad < 0) {
      setStatus("Item cargado con advertencia: precio >= 0 y cantidad > 0 requeridos.");
    }
  };

  const toggleCart = (item: Item) => {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    if (!current) return;
    const updated = { ...current, inCart: !current.inCart, updatedAt: nowIso(), sender: clientId };
    setEntryMap((prev) => ({ ...prev, [key]: updated }));
    saveDraftEntry(updated);
  };

  const bumpQuantity = (item: Item, delta: number) => {
    const key = entryKey(selectedStore, item.id);
    const current = entryMap[key];
    const nextQty = Math.max(0, Math.round((current?.cantidad ?? 0) + delta));
    updateEntry(item, { cantidad: nextQty });
  };

  const currentStoreTotal = useMemo(
    () => totals.find((t) => t.supermercado === selectedStore)?.total ?? 0,
    [totals, selectedStore]
  );

  return {
    entryMap,
    setEntryMap,
    totals,
    setTotals,
    currentStoreTotal,
    entryKey,
    updateEntry,
    toggleCart,
    bumpQuantity
  };
}
