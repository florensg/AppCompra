import React from "react";
import { CATEGORY_LABELS } from "../../../../constants";
import { Item } from "../../../../types";

interface ProductAdminPanelProps {
  isOpen: boolean;
  items: Item[];
  editingItemId: string;
  productName: string;
  productCategory: number;
  productHay: number;
  onSelectExisting: (itemId: string) => void;
  onProductNameChange: (value: string) => void;
  onProductCategoryChange: (category: number) => void;
  onProductHayChange: (hay: number) => void;
  onCreate: () => void;
  onUpdate: () => void;
  onDelete: () => void;
}

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

export function ProductAdminPanel({
  isOpen,
  items,
  editingItemId,
  productName,
  productCategory,
  productHay,
  onSelectExisting,
  onProductNameChange,
  onProductCategoryChange,
  onProductHayChange,
  onCreate,
  onUpdate,
  onDelete
}: ProductAdminPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="product-admin-panel">
      <div className="product-admin-row">
        <label className="fecha-label">
          Producto existente
          <select
            className="h-10 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={editingItemId}
            onChange={(e) => onSelectExisting(e.target.value)}
          >
            <option value="">Nuevo producto...</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>{normalizeUiText(item.nombre)} - HAY: {item.hay}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="product-admin-row">
        <label className="fecha-label">
          Nombre
          <input
            type="text"
            value={productName}
            onChange={(e) => onProductNameChange(e.target.value)}
            placeholder="Ej: Yerba 1kg"
          />
        </label>
        <label className="fecha-label">
          Categoria
          <select
            className="h-10 w-full rounded-lg border border-border-subtle bg-white px-3 text-sm text-text-primary outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            value={String(productCategory)}
            onChange={(e) => onProductCategoryChange(Number(e.target.value) || 1)}
          >
            {Object.entries(CATEGORY_LABELS).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </label>
        <label className="fecha-label">
          HAY
          <input
            type="number"
            min="0"
            step="1"
            value={String(productHay)}
            onChange={(e) => onProductHayChange(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
      </div>
      <div className="product-admin-actions">
        <button type="button" className="secondary" onClick={onCreate}>
          Agregar
        </button>
        <button
          type="button"
          className="secondary"
          disabled={!editingItemId}
          onClick={onUpdate}
        >
          Modificar
        </button>
        <button
          type="button"
          className="secondary danger"
          disabled={!editingItemId}
          onClick={onDelete}
        >
          Eliminar
        </button>
      </div>
    </div>
  );
}
