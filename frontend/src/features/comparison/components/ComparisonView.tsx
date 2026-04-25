import React from "react";
import { useComparisonModule } from "../hooks/useComparisonModule";

const hayClass = (hay: number): string =>
  hay > 5 ? "priority-red" : hay > 0 ? "priority-orange" : "";

const normalizeUiText = (value: string): string =>
  value
    .replace(/Ã¢â‚¬â€œ|Ã¢â‚¬â€/g, "-")
    .replace(/ÃƒÂ¡/g, "a")
    .replace(/ÃƒÂ©/g, "e")
    .replace(/ÃƒÂ­/g, "i")
    .replace(/ÃƒÂ³/g, "o")
    .replace(/ÃƒÂº/g, "u")
    .replace(/ÃƒÂ±/g, "n")
    .replace(/Ãƒ/g, "")
    .replace(/Ã‚/g, "");

export function ComparisonView() {
  const comparison = useComparisonModule();

  return (
    <section className="panel">
      <div className="compare-header">
        <div className="compare-name-col">Producto / HAY</div>
        {comparison.activeStores.map((s) => (
          <div key={s} className="compare-store-col">
            <div className="compare-store-name">{s}</div>
            <div className="compare-store-total">
              ${comparison.totals.find((t) => t.supermercado === s)?.total.toFixed(0) ?? "0"}
            </div>
          </div>
        ))}
      </div>
      <div className="compare-body">
        {comparison.filteredItems.map((item) => {
          const { prices, minPrice } = comparison.getComparisonForItem(item.id);
          return (
            <div key={item.id} className={`compare-row ${hayClass(item.hay)}`}>
              <div className="compare-name-col">
                <span className="item-row-name">{normalizeUiText(item.nombre)}</span>
                <span className="item-row-stat" style={{ fontSize: "0.72rem" }}>HAY {item.hay}</span>
              </div>
              {prices.map((p, i) => (
                <div
                  key={comparison.activeStores[i]}
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
      <button type="button" className="secondary refresh-btn" onClick={() => void comparison.refreshTotals()}>
        Actualizar totales
      </button>
    </section>
  );
}
