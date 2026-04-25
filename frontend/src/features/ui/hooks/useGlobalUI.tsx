import React, { createContext, useContext, useState } from "react";
import { CategoryId } from "../../../types";
import { PriorityFilter, PriorityMode } from "../../products";

interface GlobalUIContextValue {
  search: string;
  setSearch: React.Dispatch<React.SetStateAction<string>>;
  searchOpen: boolean;
  setSearchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  categoryFilter: CategoryId | "all";
  setCategoryFilter: React.Dispatch<React.SetStateAction<CategoryId | "all">>;
  priorityFilter: PriorityFilter;
  setPriorityFilter: React.Dispatch<React.SetStateAction<PriorityFilter>>;
  priorityMode: PriorityMode;
  setPriorityMode: React.Dispatch<React.SetStateAction<PriorityMode>>;
}

const GlobalUIContext = createContext<GlobalUIContextValue | null>(null);

export function GlobalUIProvider({ children }: { children: React.ReactNode }) {
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [priorityMode, setPriorityMode] = useState<PriorityMode>("orange-first");

  return (
    <GlobalUIContext.Provider
      value={{
        search,
        setSearch,
        searchOpen,
        setSearchOpen,
        categoryFilter,
        setCategoryFilter,
        priorityFilter,
        setPriorityFilter,
        priorityMode,
        setPriorityMode
      }}
    >
      {children}
    </GlobalUIContext.Provider>
  );
}

export function useGlobalUI() {
  const ctx = useContext(GlobalUIContext);
  if (!ctx) throw new Error("useGlobalUI debe usarse dentro de GlobalUIProvider");
  return ctx;
}
