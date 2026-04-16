import Dexie, { Table } from "dexie";
import { Entry, Ronda, SyncJob } from "./types";

export class AppComprasDB extends Dexie {
  rondas!: Table<Ronda, string>;
  entries!: Table<Entry, string>;
  syncQueue!: Table<SyncJob, string>;

  constructor() {
    super("appcompras-db");

    this.version(1).stores({
      rondas: "id,fecha,createdAt",
      entries: "id,rondaId,supermercado,itemId,createdAt",
      syncQueue: "id,createdAt,attempts"
    });
  }
}

export const db = new AppComprasDB();
