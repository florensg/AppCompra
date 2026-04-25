import { fetchBootstrap, fetchRound, fetchTotals, sendEntriesBatch, syncEntries } from "../../api";
import { Entry, StoreName } from "../../types";

export const shoppingApiService = {
  fetchBootstrap,
  fetchRound,
  fetchTotals,
  sendEntriesBatch: (entries: Entry[], stores: StoreName[]) => sendEntriesBatch(entries, stores),
  syncEntries: (entries: Entry[], stores: StoreName[]) => syncEntries(entries, stores)
};
