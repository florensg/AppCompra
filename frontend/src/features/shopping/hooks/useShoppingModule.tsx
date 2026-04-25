import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { BASE_STORES } from "../../../constants";
import { Item, Ronda, StoreName } from "../../../types";
import { makeId, nowIso, todayLocalIso } from "../../../utils";
import { productsAdminService, useProductsAdmin } from "../../products";
import {
  useSupermarketConfigs,
  normalizeStoreName,
  mergeStoreConfigs,
  activateSupermarket,
  addSupermarket,
  disableSupermarket
} from "../../supermarkets";
import { useShopping } from "./useShopping";
import { useShoppingSync } from "./useShoppingSync";
import { useCatalogBootstrap } from "./useCatalogBootstrap";

const CLIENT_ID = makeId();

type View = "lista" | "carga" | "comparacion";
const DEFAULT_VIEW: View = "carga";

const newRonda = (storesActivos: StoreName[]): Ronda => ({
  id: makeId(),
  fecha: todayLocalIso(),
  storesActivos,
  createdAt: nowIso()
});

interface ShoppingModuleContextValue {
  view: View;
  setView: React.Dispatch<React.SetStateAction<View>>;
  items: Item[];
  activeStores: StoreName[];
  inactiveStores: StoreName[];
  selectedStore: StoreName;
  setSelectedStore: React.Dispatch<React.SetStateAction<StoreName>>;
  currentRonda: Ronda;
  setCurrentRonda: React.Dispatch<React.SetStateAction<Ronda>>;
  entryMap: ReturnType<typeof useShopping>["entryMap"];
  totals: ReturnType<typeof useShopping>["totals"];
  currentStoreTotal: number;
  entryKey: ReturnType<typeof useShopping>["entryKey"];
  getEntry: (store: string, itemId: string) => ReturnType<typeof useShopping>["entryMap"][string] | undefined;
  updateEntry: ReturnType<typeof useShopping>["updateEntry"];
  toggleCart: ReturnType<typeof useShopping>["toggleCart"];
  bumpQuantity: ReturnType<typeof useShopping>["bumpQuantity"];
  saveCurrentRound: ReturnType<typeof useShoppingSync>["saveCurrentRound"];
  refreshRemoteTotals: ReturnType<typeof useShoppingSync>["refreshRemoteTotals"];
  handleLoadHistoryFromSheets: ReturnType<typeof useShoppingSync>["handleLoadHistoryFromSheets"];
  historyLoading: boolean;
  storeMenuOpen: boolean;
  setStoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  showAddStoreInput: boolean;
  setShowAddStoreInput: React.Dispatch<React.SetStateAction<boolean>>;
  newStoreName: string;
  setNewStoreName: React.Dispatch<React.SetStateAction<string>>;
  addStoreInputRef: React.RefObject<HTMLInputElement>;
  optionalActiveStores: StoreName[];
  hasDisableOptions: boolean;
  hasStoreMenuOptions: boolean;
  activateStore: (store: StoreName) => void;
  disableStore: (store: StoreName) => void;
  addStore: () => void;
  productMenuOpen: boolean;
  editingItemId: string;
  productName: string;
  productCategory: number;
  productHay: number;
  setProductName: React.Dispatch<React.SetStateAction<string>>;
  setProductCategory: React.Dispatch<React.SetStateAction<number>>;
  setProductHay: React.Dispatch<React.SetStateAction<number>>;
  handleSelectExistingProduct: (id: string) => void;
  toggleProductMenu: () => void;
  handleCreateProduct: () => Promise<void>;
  handleUpdateProduct: () => Promise<void>;
  handleDeleteProduct: () => Promise<void>;
}

const ShoppingModuleContext = createContext<ShoppingModuleContextValue | null>(null);

interface ShoppingModuleProviderProps {
  signedIn: boolean;
  setStatus: (value: string) => void;
  onIdleSignOut?: () => void;
  children: React.ReactNode;
}

export function ShoppingModuleProvider({ signedIn, setStatus, onIdleSignOut, children }: ShoppingModuleProviderProps) {
  const { storeConfigs, setStoreConfigs, activeStores, inactiveStores, storesStorageKey } = useSupermarketConfigs();

  const [view, setView] = useState<View>(DEFAULT_VIEW);
  const [items, setItems] = useState<Item[]>([]);
  const [currentRonda, setCurrentRonda] = useState<Ronda>(() => newRonda(activeStores));
  const [selectedStore, setSelectedStore] = useState<StoreName>(activeStores[0] ?? BASE_STORES[0]);

  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [showAddStoreInput, setShowAddStoreInput] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const addStoreInputRef = useRef<HTMLInputElement>(null);

  const [allowFirestoreLiveForDate, setAllowFirestoreLiveForDate] = useState(false);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const {
    entryMap,
    setEntryMap,
    totals,
    setTotals,
    currentStoreTotal,
    entryKey,
    updateEntry,
    toggleCart,
    bumpQuantity
  } = useShopping({ activeStores, selectedStore, currentRonda, liveSessionId, setStatus, clientId: CLIENT_ID });

  const {
    historyLoading,
    saveCurrentRound,
    flushSyncQueue,
    refreshRemoteTotals,
    handleLoadHistoryFromSheets
  } = useShoppingSync({
    activeStores,
    normalizeStoreName,
    currentRonda,
    entryMap,
    liveSessionId,
    setEntryMap,
    setTotals,
    setStatus
  });

  const { bootstrap } = useCatalogBootstrap({
    signedIn,
    currentDate: currentRonda.fecha,
    activeStores,
    allowFirestoreLiveForDate,
    liveSessionId,
    clientId: CLIENT_ID,
    normalizeStoreName,
    mergeStoreConfigs,
    flushSyncQueue,
    setStatus,
    setItems,
    setStoreConfigs,
    setEntryMap,
    setLiveSessionId,
    setAllowFirestoreLiveForDate
  });

  const {
    productMenuOpen,
    editingItemId,
    productName,
    productCategory,
    productHay,
    setProductName,
    setProductCategory,
    setProductHay,
    handleSelectExistingProduct,
    toggleProductMenu,
    handleCreateProduct,
    handleUpdateProduct,
    handleDeleteProduct
  } = useProductsAdmin({
    items,
    productsAdminService,
    setStatus,
    onAfterChange: async () => {
      await bootstrap();
    },
    onAfterDelete: () => {
      setEntryMap({});
    }
  });

  useEffect(() => {
    localStorage.setItem(storesStorageKey, JSON.stringify(storeConfigs));
  }, [storeConfigs, storesStorageKey]);

  useEffect(() => {
    if (activeStores.length === 0) {
      setSelectedStore(BASE_STORES[0]);
      return;
    }
    if (!activeStores.includes(selectedStore)) setSelectedStore(activeStores[0]);
  }, [activeStores, selectedStore]);

  useEffect(() => {
    setCurrentRonda((prev) => ({ ...prev, storesActivos: activeStores }));
  }, [activeStores]);

  useEffect(() => {
    if (showAddStoreInput) setTimeout(() => addStoreInputRef.current?.focus(), 0);
  }, [showAddStoreInput]);

  useEffect(() => {
    if (!signedIn) return;

    const resetTimer = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(async () => {
        setStatus("Inactividad detectada. Guardando y cerrando sesion...");
        const entriesToSave = Object.values(entryMap).filter((e) => e.inCart || e.precioUnitario > 0 || e.cantidad > 0);
        if (entriesToSave.length > 0) await saveCurrentRound();
        onIdleSignOut?.();
      }, 20 * 60 * 1000);
    };

    const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];
    const handler = () => resetTimer();
    events.forEach((eventName) => window.addEventListener(eventName, handler));
    resetTimer();

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach((eventName) => window.removeEventListener(eventName, handler));
    };
  }, [signedIn, entryMap, currentRonda.fecha, saveCurrentRound, onIdleSignOut, setStatus]);

  const activateStore = (storeName: StoreName) => {
    setStoreConfigs((prev) => activateSupermarket(prev, storeName));
    setSelectedStore(storeName);
    setStoreMenuOpen(false);
    setShowAddStoreInput(false);
    setStatus(`${storeName} ahora esta activo.`);
  };

  const disableStore = (storeName: StoreName) => {
    if (BASE_STORES.includes(storeName)) return;
    setStoreConfigs((prev) => disableSupermarket(prev, storeName));
    setStoreMenuOpen(false);
    setShowAddStoreInput(false);
    if (selectedStore === storeName) {
      const fallback = activeStores.find((name) => name !== storeName) ?? BASE_STORES[0];
      setSelectedStore(fallback);
    }
    setStatus(`${storeName} fue deshabilitado.`);
  };

  const addStore = () => {
    const normalized = normalizeStoreName(newStoreName);
    if (!normalized) {
      setStatus("Ingresa un nombre de supermercado.");
      return;
    }
    const existing = storeConfigs.find((store) => store.name === normalized);
    if (existing) {
      setStatus(existing.isActive ? `${normalized} ya existe y esta activo.` : `${normalized} ya existe y esta inactivo.`);
      setShowAddStoreInput(false);
      setNewStoreName("");
      return;
    }
    setStoreConfigs((prev) => addSupermarket(prev, normalized));
    setShowAddStoreInput(false);
    setNewStoreName("");
    setStatus(`${normalized} agregado. Podes activarlo desde el menu +.`);
  };

  const optionalActiveStores = useMemo(() => activeStores.filter((store) => !BASE_STORES.includes(store)), [activeStores]);
  const hasDisableOptions = optionalActiveStores.length > 0;
  const hasStoreMenuOptions = inactiveStores.length > 0 || showAddStoreInput || hasDisableOptions;
  const getEntry = (store: string, itemId: string) => entryMap[entryKey(store, itemId)];

  const value: ShoppingModuleContextValue = {
    view,
    setView,
    items,
    activeStores,
    inactiveStores,
    selectedStore,
    setSelectedStore,
    currentRonda,
    setCurrentRonda,
    entryMap,
    totals,
    currentStoreTotal,
    entryKey,
    getEntry,
    updateEntry,
    toggleCart,
    bumpQuantity,
    saveCurrentRound,
    refreshRemoteTotals,
    handleLoadHistoryFromSheets,
    historyLoading,
    storeMenuOpen,
    setStoreMenuOpen,
    showAddStoreInput,
    setShowAddStoreInput,
    newStoreName,
    setNewStoreName,
    addStoreInputRef,
    optionalActiveStores,
    hasDisableOptions,
    hasStoreMenuOptions,
    activateStore,
    disableStore,
    addStore,
    productMenuOpen,
    editingItemId,
    productName,
    productCategory,
    productHay,
    setProductName,
    setProductCategory,
    setProductHay,
    handleSelectExistingProduct,
    toggleProductMenu,
    handleCreateProduct,
    handleUpdateProduct,
    handleDeleteProduct
  };

  return <ShoppingModuleContext.Provider value={value}>{children}</ShoppingModuleContext.Provider>;
}

export function useShoppingModule() {
  const ctx = useContext(ShoppingModuleContext);
  if (!ctx) throw new Error("useShoppingModule debe usarse dentro de ShoppingModuleProvider");
  return ctx;
}
