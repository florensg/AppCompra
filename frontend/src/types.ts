export type StoreName = "CHEK" | "CUCHER" | "VITAL";

export type CategoryId = 1 | 2 | 3;

export interface Item {
  id: string;
  nombre: string;
  categoria: CategoryId;
  hay: number;
  stockObjetivo?: number;
  sugerida: number;
}

export interface Entry {
  id: string;
  rondaId: string;
  fecha: string | null;
  supermercado: StoreName;
  itemId: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
  inCart: boolean;       // true = confirmed purchase; false = just comparing price
  offline: boolean;
  createdAt: string;
}

export interface Ronda {
  id: string;
  fecha: string | null;
  storesActivos: StoreName[];
  createdAt: string;
}

export interface StoreTotal {
  supermercado: StoreName;
  total: number;
  itemsCount: number;
  updatedAt: string;
}

export interface SyncJob {
  id: string;
  payload: Entry[];
  attempts: number;
  createdAt: string;
}

export interface BootstrapResponse {
  items: Item[];
  latestPrices: Record<string, Partial<Record<StoreName, number>>>;
}

export interface TotalsResponse {
  totals: StoreTotal[];
}
