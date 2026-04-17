import Dexie, { Table } from "dexie";
import { Entry, Item, Ronda, SyncJob } from "./types";

/** Wraps the items array with a fixed key so we can upsert easily */
export interface ItemsCache {
  key: "catalog";
  items: Item[];
  savedAt: string;
}

export class AppComprasDB extends Dexie {
  rondas!: Table<Ronda, string>;
  entries!: Table<Entry, string>;
  syncQueue!: Table<SyncJob, string>;
  itemsCache!: Table<ItemsCache, string>;

  constructor() {
    super("appcompras-db");

    this.version(1).stores({
      rondas: "id,fecha,createdAt",
      entries: "id,rondaId,supermercado,itemId,createdAt",
      syncQueue: "id,createdAt,attempts"
    });

    // v2 adds itemsCache for offline catalog
    this.version(2).stores({
      rondas: "id,fecha,createdAt",
      entries: "id,rondaId,supermercado,itemId,createdAt",
      syncQueue: "id,createdAt,attempts",
      itemsCache: "key"
    });
  }
}

export const db = new AppComprasDB();

