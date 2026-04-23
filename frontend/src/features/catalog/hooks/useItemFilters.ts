import { useMemo } from "react";
import { CategoryId, Item } from "../../../types";

export type PriorityMode = "orange-first" | "red-first";
export type PriorityFilter = "all" | "orange" | "red" | "none";

const hayPriority = (hay: number, mode: PriorityMode): number => {
  if (mode === "orange-first") return hay > 0 && hay <= 5 ? 0 : hay > 5 ? 1 : 2;
  return hay > 5 ? 0 : hay > 0 && hay <= 5 ? 1 : 2;
};

const matchesPriorityFilter = (hay: number, filter: PriorityFilter): boolean => {
  if (filter === "all") return true;
  if (filter === "orange") return hay > 0 && hay <= 5;
  if (filter === "red") return hay > 5;
  return hay === 0;
};

export function useItemFilters(params: {
  items: Item[];
  search: string;
  categoryFilter: CategoryId | "all";
  priorityFilter: PriorityFilter;
  priorityMode: PriorityMode;
}) {
  const { items, search, categoryFilter, priorityFilter, priorityMode } = params;

  return useMemo(() => {
    let list = items;

    if (categoryFilter !== "all") {
      list = list.filter((item) => item.categoria === categoryFilter);
    }

    if (search.trim()) {
      const query = search.toLowerCase().trim();
      list = list.filter((item) => item.nombre.toLowerCase().includes(query));
    }

    list = list.filter((item) => matchesPriorityFilter(item.hay, priorityFilter));
    return [...list].sort((a, b) => hayPriority(a.hay, priorityMode) - hayPriority(b.hay, priorityMode));
  }, [items, search, categoryFilter, priorityFilter, priorityMode]);
}
