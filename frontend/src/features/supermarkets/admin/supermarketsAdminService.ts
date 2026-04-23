import { StoreConfig, StoreName } from "../../../types";
import {
  createStoreConfig,
  normalizeStoreName,
  sortStoreConfigs
} from "../hooks/useSupermarketConfigs";

export function activateSupermarket(configs: StoreConfig[], storeName: StoreName): StoreConfig[] {
  return sortStoreConfigs(
    configs.map((store) => (store.name === storeName ? { ...store, isActive: true } : store))
  );
}

export function disableSupermarket(configs: StoreConfig[], storeName: StoreName): StoreConfig[] {
  return sortStoreConfigs(
    configs.map((store) => (store.name === storeName ? { ...store, isActive: false } : store))
  );
}

export function addSupermarket(configs: StoreConfig[], storeName: string): StoreConfig[] {
  const normalized = normalizeStoreName(storeName);
  if (!normalized) return configs;
  const exists = configs.some((store) => store.name === normalized);
  if (exists) return configs;
  return sortStoreConfigs([...configs, createStoreConfig(normalized, false, false)]);
}
