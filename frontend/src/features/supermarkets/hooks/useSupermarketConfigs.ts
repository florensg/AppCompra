import { useMemo, useState } from "react";
import { BASE_STORES } from "../../../constants";
import { StoreConfig, StoreName } from "../../../types";

const DEFAULT_INACTIVE_STORES: StoreName[] = ["MAXI", "VEA"];

const STORE_ALIASES: Record<string, string> = {
  "MAXI CARREFOUR": "MAXI"
};

const STORES_STORAGE_KEY = "appcompras.storeConfigs.v1";

export const normalizeStoreName = (name: string): string => {
  const normalized = name.trim().replace(/\s+/g, " ").toUpperCase();
  return STORE_ALIASES[normalized] ?? normalized;
};

export const createStoreConfig = (name: StoreName, isBase: boolean, isActive: boolean): StoreConfig => ({
  name,
  isBase,
  isActive
});

export const buildDefaultStoreConfigs = (): StoreConfig[] => [
  ...BASE_STORES.map((name) => createStoreConfig(name, true, true)),
  ...DEFAULT_INACTIVE_STORES.map((name) => createStoreConfig(name, false, false))
];

export const sortStoreConfigs = (stores: StoreConfig[]): StoreConfig[] => {
  const baseRank = new Map(BASE_STORES.map((name, idx) => [name, idx]));
  return [...stores].sort((a, b) => {
    if (a.isBase && b.isBase) {
      return (baseRank.get(a.name) ?? 999) - (baseRank.get(b.name) ?? 999);
    }
    if (a.isBase !== b.isBase) return a.isBase ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
};

export const mergeStoreConfigs = (incomingStores: StoreName[], localStores: StoreConfig[]): StoreConfig[] => {
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

export const loadStoredStoreConfigs = (): StoreConfig[] => {
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

export function useSupermarketConfigs() {
  const [storeConfigs, setStoreConfigs] = useState<StoreConfig[]>(() => loadStoredStoreConfigs());

  const activeStores = useMemo(
    () => sortStoreConfigs(storeConfigs.filter((store) => store.isActive)).map((store) => store.name),
    [storeConfigs]
  );

  const inactiveStores = useMemo(
    () => sortStoreConfigs(storeConfigs.filter((store) => !store.isActive)).map((store) => store.name),
    [storeConfigs]
  );

  return {
    storeConfigs,
    setStoreConfigs,
    activeStores,
    inactiveStores,
    storesStorageKey: STORES_STORAGE_KEY
  };
}
