import { Dispatch, SetStateAction, useState } from "react";
import { Entry, Ronda, StoreTotal, SyncJob, StoreName } from "../../../types";
import { makeId, nowIso, toMoney } from "../../../utils";
import { shoppingApiService } from "../../../infrastructure/api";
import { shoppingStorageService } from "../../../infrastructure/storage";
import { entryTimestamp } from "./useShopping";

interface UseShoppingSyncParams {
  activeStores: StoreName[];
  normalizeStoreName: (name: string) => string;
  currentRonda: Ronda;
  entryMap: Record<string, Entry>;
  liveSessionId: string | null;
  setEntryMap: Dispatch<SetStateAction<Record<string, Entry>>>;
  setTotals: Dispatch<SetStateAction<StoreTotal[]>>;
  setStatus: (value: string) => void;
}

export function useShoppingSync({
  activeStores,
  normalizeStoreName,
  currentRonda,
  entryMap,
  liveSessionId,
  setEntryMap,
  setTotals,
  setStatus
}: UseShoppingSyncParams) {
  const [historyLoading, setHistoryLoading] = useState(false);

  const saveCurrentRound = async () => {
    if (!currentRonda.fecha) {
      setStatus("ALERTA: la fecha es obligatoria. Selecciona una fecha antes de guardar la ronda.");
      return;
    }

    const activeStoreSet = new Set(activeStores.map((s) => normalizeStoreName(String(s))));
    const entriesToSave = Object.values(entryMap).filter((entry) => {
      const hasData = entry.inCart || entry.precioUnitario > 0 || entry.cantidad > 0;
      if (!hasData) return false;
      return activeStoreSet.has(normalizeStoreName(String(entry.supermercado)));
    });

    if (entriesToSave.length === 0) {
      setStatus("No hay articulos cargados o en carrito para guardar.");
      return;
    }

    const invalid = entriesToSave.find((entry) => entry.precioUnitario < 0 || (entry.inCart && entry.cantidad <= 0));
    if (invalid) {
      setStatus("Hay items invalidos: verifica precio y cantidad.");
      return;
    }

    const entriesWithFecha = entriesToSave.map((entry) => ({
      ...entry,
      fecha: currentRonda.fecha,
      sessionId: entry.sessionId ?? liveSessionId ?? undefined
    }));

    const allStoreNames = [...new Set(activeStores.map((s) => normalizeStoreName(String(s))).filter(Boolean))];

    await shoppingStorageService.saveRound(currentRonda);

    if (!navigator.onLine) {
      const job: SyncJob = { id: makeId(), payload: entriesWithFecha, stores: allStoreNames, attempts: 0, createdAt: nowIso() };
      await shoppingStorageService.enqueueSyncJob(job);
      setStatus("Sin internet: ronda guardada localmente para sincronizar.");
      return;
    }

    try {
      await shoppingApiService.sendEntriesBatch(entriesWithFecha, allStoreNames);
      setStatus("Ronda sincronizada con Google Sheets.");
    } catch (error) {
      const job: SyncJob = { id: makeId(), payload: entriesWithFecha, stores: allStoreNames, attempts: 1, createdAt: nowIso() };
      await shoppingStorageService.enqueueSyncJob(job);
      setStatus(`Error al guardar: ${String(error)}`);
    }
  };

  const flushSyncQueue = async () => {
    const jobs = await shoppingStorageService.getSyncJobs();
    const activeStoreSet = new Set(activeStores.map((s) => normalizeStoreName(String(s))));
    const activeStoreNames = [...activeStoreSet];

    for (const job of jobs) {
      try {
        const filteredPayload = (job.payload ?? []).filter((entry) =>
          activeStoreSet.has(normalizeStoreName(String(entry.supermercado)))
        );

        if (filteredPayload.length === 0) {
          await shoppingStorageService.deleteSyncJob(job.id);
          continue;
        }

        await shoppingApiService.syncEntries(filteredPayload, activeStoreNames);
        await shoppingStorageService.deleteSyncJob(job.id);
      } catch {
        await shoppingStorageService.updateSyncJob({ ...job, attempts: job.attempts + 1 });
      }
    }
  };

  const refreshRemoteTotals = async () => {
    try {
      const response = await shoppingApiService.fetchTotals(currentRonda.fecha ?? undefined);
      if (response.totals.length > 0) {
        setTotals(response.totals);
        setStatus("Totales actualizados.");
      }
    } catch {
      setStatus("Error al actualizar totales.");
    }
  };

  const handleLoadHistoryFromSheets = async () => {
    if (!currentRonda.fecha) {
      setStatus("Selecciona una fecha antes de cargar historial.");
      return;
    }

    setHistoryLoading(true);
    setStatus(`Cargando historial de Sheets para ${currentRonda.fecha}...`);

    try {
      const { entries: sheetEntries } = await shoppingApiService.fetchRound(currentRonda.fecha);
      if (!Array.isArray(sheetEntries) || sheetEntries.length === 0) {
        setStatus(`No hay historial en Sheets para ${currentRonda.fecha}.`);
        return;
      }

      let mergedCount = 0;
      setEntryMap((prev) => {
        const next = { ...prev };

        sheetEntries.forEach((se: any) => {
          const store = normalizeStoreName(String(se?.supermercado ?? ""));
          if (!store || !activeStores.includes(store)) return;

          const itemId = String(se?.itemId ?? "");
          if (!itemId) return;

          const key = `${store}::${itemId}`;
          const local = prev[key];

          const incoming: Entry = {
            id: local?.id ?? makeId(),
            rondaId: currentRonda.id,
            sessionId: liveSessionId ?? undefined,
            fecha: currentRonda.fecha,
            supermercado: store,
            itemId,
            precioUnitario: Number(se?.precioUnitario) || 0,
            cantidad: Math.round(Number(se?.cantidad) || 0),
            subtotal: toMoney((Number(se?.precioUnitario) || 0) * (Math.round(Number(se?.cantidad) || 0))),
            inCart: true,
            offline: !navigator.onLine,
            createdAt: local?.createdAt ?? nowIso(),
            updatedAt: nowIso(),
            sender: "sheets-history-load"
          };

          const localTs = entryTimestamp(local);
          const incomingTs = entryTimestamp(incoming);
          if (local && localTs > 0 && incomingTs > 0 && localTs >= incomingTs) return;

          next[key] = incoming;
          mergedCount += 1;
        });

        return next;
      });

      setStatus(`Historial cargado manualmente: ${mergedCount} articulos actualizados.`);
    } catch (error) {
      setStatus(`No se pudo cargar historial: ${String(error)}`);
    } finally {
      setHistoryLoading(false);
    }
  };

  return {
    historyLoading,
    saveCurrentRound,
    flushSyncQueue,
    refreshRemoteTotals,
    handleLoadHistoryFromSheets
  };
}

