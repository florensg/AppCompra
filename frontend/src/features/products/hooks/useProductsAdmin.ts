import { useEffect, useMemo, useState } from "react";
import { Item } from "../../../types";

interface UseProductsAdminParams {
  items: Item[];
  productsAdminService: {
    create: (payload: { nombre: string; categoria: number; hay: number }) => Promise<{ ok: boolean }>;
    update: (payload: { itemId: string; nombre: string; categoria: number; hay: number }) => Promise<{ ok: boolean }>;
    remove: (payload: { itemId: string }) => Promise<{ ok: boolean }>;
  };
  setStatus: (value: string) => void;
  onAfterChange: () => Promise<void>;
  onAfterDelete: () => void;
}

const normalizeProductName = (name: string): string => name.trim().replace(/\s+/g, " ").toLowerCase();

export function useProductsAdmin({ items, productsAdminService, setStatus, onAfterChange, onAfterDelete }: UseProductsAdminParams) {
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState(1);
  const [productHay, setProductHay] = useState(0);

  const editingItem = useMemo(() => items.find((item) => item.id === editingItemId), [items, editingItemId]);

  useEffect(() => {
    if (!editingItem) return;
    setProductName(editingItem.nombre);
    setProductCategory(editingItem.categoria);
    setProductHay(editingItem.hay);
  }, [editingItem]);

  const resetProductForm = () => {
    setEditingItemId("");
    setProductName("");
    setProductCategory(1);
    setProductHay(0);
  };

  const handleSelectExistingProduct = (id: string) => {
    setEditingItemId(id);
    if (!id) {
      resetProductForm();
      return;
    }
    const found = items.find((item) => item.id === id);
    if (!found) return;
    setProductName(found.nombre);
    setProductCategory(found.categoria);
    setProductHay(found.hay);
  };

  const handleCreateProduct = async () => {
    const nombre = productName.trim();
    if (!nombre) {
      setStatus("Ingresa el nombre del producto.");
      return;
    }

    const exists = items.some((item) => normalizeProductName(item.nombre) === normalizeProductName(nombre));
    if (exists) {
      setStatus("Ese producto ya existe en el catalogo.");
      return;
    }

    try {
      await productsAdminService.create({ nombre, categoria: productCategory, hay: productHay });
      await onAfterChange();
      resetProductForm();
      setStatus(`Producto agregado: ${nombre}.`);
    } catch (error) {
      setStatus(`No se pudo agregar el producto: ${String(error)}`);
    }
  };

  const handleUpdateProduct = async () => {
    if (!editingItem) {
      setStatus("Selecciona un producto para modificar.");
      return;
    }

    const nombre = productName.trim();
    if (!nombre) {
      setStatus("Ingresa el nombre del producto.");
      return;
    }

    const exists = items.some(
      (item) => item.id !== editingItem.id && normalizeProductName(item.nombre) === normalizeProductName(nombre)
    );
    if (exists) {
      setStatus("Ya existe otro producto con ese nombre.");
      return;
    }

    try {
      await productsAdminService.update({
        itemId: editingItem.id,
        nombre,
        categoria: productCategory,
        hay: productHay
      });
      await onAfterChange();
      setStatus(`Producto actualizado: ${nombre}.`);
    } catch (error) {
      setStatus(`No se pudo actualizar el producto: ${String(error)}`);
    }
  };

  const handleDeleteProduct = async () => {
    if (!editingItem) {
      setStatus("Selecciona un producto para eliminar.");
      return;
    }

    const confirmed = window.confirm(`Eliminar ${editingItem.nombre}?`);
    if (!confirmed) return;

    try {
      await productsAdminService.remove({ itemId: editingItem.id });
      onAfterDelete();
      await onAfterChange();
      resetProductForm();
      setStatus("Producto eliminado.");
    } catch (error) {
      setStatus(`No se pudo eliminar el producto: ${String(error)}`);
    }
  };

  const toggleProductMenu = () => {
    setProductMenuOpen((prev) => !prev);
    if (!productMenuOpen) resetProductForm();
  };

  return {
    productMenuOpen,
    editingItemId,
    productName,
    productCategory,
    productHay,
    setProductName,
    setProductCategory,
    setProductHay,
    resetProductForm,
    handleSelectExistingProduct,
    toggleProductMenu,
    handleCreateProduct,
    handleUpdateProduct,
    handleDeleteProduct
  };
}
