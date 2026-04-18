export type StoreName = string; // Flexibilidad para cualquier supermercado

export type CategoryId = number; // Flexibilidad para cualquier categoría

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
  inCart: boolean;
  offline: boolean;
  createdAt: string;
  sender?: string;
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
  latestPrices: Record<string, Partial<Record<string, number>>>;
  source?: "sheets" | "firestore";
}

export interface TotalsResponse {
  totals: StoreTotal[];
}
