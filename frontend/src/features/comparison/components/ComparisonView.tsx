import React from "react";
import { Entry, Item, StoreName, StoreTotal } from "../../../types";

interface ComparisonViewProps {
  items: Item[];
  activeStores: StoreName[];
  totals: StoreTotal[];
  entryMap: Record<string, Entry>;
  entryKey: (store: StoreName, itemId: string) => string;
  onRefreshTotals: () => void;
}

const hayClass = (hay: number): string =>
  hay > 5 ? "priority-red" : hay > 0 ? "priority-orange" : "";

const normalizeUiText = (value: string): string =>
  value
    .replace(/â€“|â€”/g, "-")
    .replace(/Ã¡/g, "a")
    .replace(/Ã©/g, "e")
    .replace(/Ã­/g, "i")
    .replace(/Ã³/g, "o")
    .replace(/Ãº/g, "u")
    .replace(/Ã±/g, "n")
    .replace(/Ã/g, "")
    .replace(/Â/g, "");

export function ComparisonView({
  items,
  activeStores,
  totals,
  entryMap,
  entryKey,
  onRefreshTotals
}: ComparisonViewProps) {
  return (
    <section className="panel">
      <div className="compare-header">
        <div className="compare-name-col">Producto / HAY</div>
        {activeStores.map((s) => (
          <div key={s} className="compare-store-col">
            <div className="compare-store-name">{s}</div>
            <div className="compare-store-total">
              ${totals.find((t) => t.supermercado === s)?.total.toFixed(0) ?? "0"}
            </div>
          </div>
        ))}
      </div>
      <div className="compare-body">
        {items.map((item) => {
          const prices = activeStores.map((s) => {
            const e = entryMap[entryKey(s, item.id)];
            return e ? { subtotal: e.subtotal, inCart: e.inCart } : null;
          });
          const validPrices = prices.filter((p): p is { subtotal: number; inCart: boolean } => p !== null && p.subtotal > 0);
          const minPrice = validPrices.length > 0 ? Math.min(...validPrices.map((p) => p.subtotal)) : null;
          return (
            <div key={item.id} className={`compare-row ${hayClass(item.hay)}`}>
              <div className="compare-name-col">
                <span className="item-row-name">{normalizeUiText(item.nombre)}</span>
                <span className="item-row-stat" style={{ fontSize: "0.72rem" }}>HAY {item.hay}</span>
              </div>
              {prices.map((p, i) => (
                <div
                  key={activeStores[i]}
                  className={`compare-price-col ${p && p.subtotal > 0 && p.subtotal === minPrice ? "best-price" : ""} ${p?.inCart ? "is-cart" : ""}`}
                >
                  {p && p.subtotal > 0 ? (
                    <>
                      <span>${p.subtotal.toFixed(2)}</span>
                      {p.inCart && <span className="cart-icon-sm">Cart</span>}
                    </>
                  ) : "-"}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <button type="button" className="secondary refresh-btn" onClick={onRefreshTotals}>
        Actualizar totales
      </button>
    </section>
  );
}
