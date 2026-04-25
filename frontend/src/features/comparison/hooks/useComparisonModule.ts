import { useProductFilters } from "../../products";
import { useShoppingModule } from "../../shopping";
import { useGlobalUI } from "../../ui";

export function useComparisonModule() {
  const shopping = useShoppingModule();
  const ui = useGlobalUI();

  const filteredItems = useProductFilters({
    items: shopping.items,
    search: ui.search,
    categoryFilter: ui.categoryFilter,
    priorityFilter: ui.priorityFilter,
    priorityMode: ui.priorityMode
  });

  function getComparisonForItem(itemId: string) {
    const prices = shopping.activeStores.map((store) => {
      const entry = shopping.getEntry(store, itemId);

      if (!entry || entry.subtotal <= 0) return null;

      return {
        store,
        subtotal: entry.subtotal,
        inCart: entry.inCart
      };
    });

    const validPrices = prices.filter(
      (p): p is { store: string; subtotal: number; inCart: boolean } => p !== null
    );

    const minPrice =
      validPrices.length > 0
        ? Math.min(...validPrices.map((p) => p.subtotal))
        : null;

    return {
      prices,
      minPrice
    };
  }

  return {
    filteredItems,
    activeStores: shopping.activeStores,
    totals: shopping.totals,
    entryMap: shopping.entryMap,
    entryKey: shopping.entryKey,
    refreshTotals: shopping.refreshRemoteTotals,
    getComparisonForItem
  };
}
