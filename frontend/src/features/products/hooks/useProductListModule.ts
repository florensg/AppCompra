import { useProductFilters } from "./useProductFilters";
import { useShoppingModule } from "../../shopping";
import { useGlobalUI } from "../../ui";

export function useProductListModule() {
  const shopping = useShoppingModule();
  const ui = useGlobalUI();

  const filteredItems = useProductFilters({
    items: shopping.items,
    search: ui.search,
    categoryFilter: ui.categoryFilter,
    priorityFilter: ui.priorityFilter,
    priorityMode: ui.priorityMode
  });

  return { filteredItems };
}
