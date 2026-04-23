import React, { useEffect, useState } from "react";
import { CATEGORY_LABELS } from "../../../constants";
import { Entry, Item } from "../../../types";
import { parseDecimal } from "../../../utils";

interface ItemCardProps {
  item: Item;
  entry?: Entry;
  onUpdate: (item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) => void;
  onToggleCart: (item: Item) => void;
  onBumpQuantity: (item: Item, delta: number) => void;
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

export const ItemCard = React.memo(function ItemCard({ item, entry, onUpdate, onToggleCart, onBumpQuantity }: ItemCardProps) {
  const [localPrecio, setLocalPrecio] = useState(entry?.precioUnitario !== undefined ? entry.precioUnitario.toString() : "");
  const [localCantidad, setLocalCantidad] = useState(entry?.cantidad !== undefined ? entry.cantidad.toString() : "");
  const hasEntry = entry && (entry.precioUnitario > 0 || entry.cantidad > 0);

  useEffect(() => {
    const isFocused = document.activeElement?.getAttribute("data-item-id") === item.id;
    if (!isFocused) {
      setLocalPrecio(entry?.precioUnitario !== undefined ? entry.precioUnitario.toString() : "");
      setLocalCantidad(entry?.cantidad !== undefined ? entry.cantidad.toString() : "");
    }
  }, [entry?.precioUnitario, entry?.cantidad, item.id]);

  const handlePrecioChange = (val: string) => {
    setLocalPrecio(val);
    const num = parseDecimal(val);
    onUpdate(item, { precioUnitario: num });
  };

  const handleCantidadChange = (val: string) => {
    setLocalCantidad(val);
    const num = Math.round(Number(val)) || 0;
    onUpdate(item, { cantidad: num });
  };

  return (
    <article className={`item-card ${hayClass(item.hay)} ${entry?.inCart ? "in-cart" : ""}`}>
      <div className="item-row compact">
        <span className="item-row-name">{normalizeUiText(item.nombre)}</span>
        <span className="item-row-stat">HAY <strong>{item.hay}</strong></span>
        <span className="item-row-stat">SUG <strong>{item.sugerida}</strong></span>
        <span className="item-row-cat">{CATEGORY_LABELS[item.categoria]}</span>
      </div>
      <div className="entry-inputs">
        <label className="entry-label">
          <span>Precio</span>
          <input
            type="text"
            inputMode="decimal"
            data-item-id={item.id}
            value={localPrecio}
            onChange={(e) => handlePrecioChange(e.target.value)}
          />
        </label>
        <label className="entry-label">
          <span>Cant.</span>
          <div className="qty-row">
            <button type="button" onClick={() => onBumpQuantity(item, -1)}>−</button>
            <input
              type="number"
              inputMode="numeric"
              data-item-id={item.id}
              min="0"
              step="1"
              value={localCantidad}
              onChange={(e) => handleCantidadChange(e.target.value)}
            />
            <button type="button" onClick={() => onBumpQuantity(item, 1)}>+</button>
          </div>
        </label>
        <div className="entry-subtotal">
          ${(entry?.subtotal ?? 0).toFixed(2)}
        </div>
        {hasEntry && (
          <button
            type="button"
            className={`cart-btn ${entry?.inCart ? "cart-active" : ""}`}
            onClick={() => onToggleCart(item)}
            title={entry?.inCart ? "Quitar del carrito" : "Agregar al carrito"}
          >
            🛒
          </button>
        )}
      </div>
    </article>
  );
});
