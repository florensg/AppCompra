import React from "react";
import { CATEGORY_LABELS } from "../../../constants";
import { Item } from "../../../types";

interface ProductListViewProps {
  items: Item[];
}

const hayClass = (hay: number): string => (hay > 5 ? "priority-red" : hay > 0 ? "priority-orange" : "");
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

export function ProductListView({ items }: ProductListViewProps) {
  return (
    <section className="panel">
      {items.map((item) => (
        <article key={item.id} className={`item-row ${hayClass(item.hay)}`}>
          <span className="item-row-name">{normalizeUiText(item.nombre)}</span>
          <span className="item-row-stat">HAY <strong>{item.hay}</strong></span>
          <span className="item-row-stat">SUG <strong>{item.sugerida}</strong></span>
          <span className="item-row-cat">{CATEGORY_LABELS[item.categoria] || `Cat. ${item.categoria}`}</span>
        </article>
      ))}
      {items.length === 0 && (
        <p className="empty-msg">No hay articulos que coincidan con los filtros.</p>
      )}
    </section>
  );
}
