import React from "react";
import { CATEGORY_LABELS } from "../../../constants";
import { useProductListModule } from "../hooks/useProductListModule";

const hayClass = (hay: number): string => (hay > 5 ? "priority-red" : hay > 0 ? "priority-orange" : "");
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

export function ProductListView() {
  const { filteredItems } = useProductListModule();

  return (
    <section className="panel">
      {filteredItems.map((item) => (
        <article key={item.id} className={`item-row ${hayClass(item.hay)}`}>
          <span className="item-row-name">{normalizeUiText(item.nombre)}</span>
          <span className="item-row-stat">HAY <strong>{item.hay}</strong></span>
          <span className="item-row-stat">SUG <strong>{item.sugerida}</strong></span>
          <span className="item-row-cat">{CATEGORY_LABELS[item.categoria] || `Cat. ${item.categoria}`}</span>
        </article>
      ))}
      {filteredItems.length === 0 && <p className="empty-msg">No hay articulos que coincidan con los filtros.</p>}
    </section>
  );
}
