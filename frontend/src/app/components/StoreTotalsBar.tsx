import React from "react";
import { useShoppingModule } from "../../features/shopping";

export function StoreTotalsBar() {
  const { totals } = useShoppingModule();

  return (
    <div className="store-totals-bar">
      {totals.map((t) => (
        <div key={t.supermercado} className="store-total-chip">
          <span className="store-total-name">{t.supermercado}</span>
          <span className="store-total-amount">${t.total.toFixed(0)}</span>
          <span className="store-total-items">{t.itemsCount} items</span>
        </div>
      ))}
    </div>
  );
}
