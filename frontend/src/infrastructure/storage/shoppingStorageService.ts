import { db, ItemsCache } from "../../db";
import { Ronda, SyncJob } from "../../types";

export const shoppingStorageService = {
  saveRound: (ronda: Ronda) => db.rondas.put(ronda),
  enqueueSyncJob: (job: SyncJob) => db.syncQueue.put(job),
  getSyncJobs: () => db.syncQueue.toArray(),
  deleteSyncJob: (id: string) => db.syncQueue.delete(id),
  updateSyncJob: (job: SyncJob) => db.syncQueue.put(job),
  saveItemsCache: (cache: ItemsCache) => db.itemsCache.put(cache),
  getItemsCache: (key: "catalog") => db.itemsCache.get(key)
};
