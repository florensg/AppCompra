import React from "react";
import { Entry, Item, Ronda, StoreName } from "../../../types";
import { ShoppingItemCard } from "./ShoppingItemCard";
import { SupermarketManagerMenu } from "../../supermarkets/admin/components/SupermarketManagerMenu";
import { ProductAdminPanel } from "../../products/admin/components/ProductAdminPanel";

interface ShoppingViewProps {
  items: Item[];
  activeStores: StoreName[];
  selectedStore: StoreName;
  currentStoreTotal: number;
  currentRonda: Ronda;
  filteredItems: Item[];
  entryMap: Record<string, Entry>;
  entryKey: (store: StoreName, itemId: string) => string;

  storeMenuOpen: boolean;
  showAddStoreInput: boolean;
  newStoreName: string;
  inactiveStores: StoreName[];
  optionalActiveStores: StoreName[];
  hasDisableOptions: boolean;
  hasStoreMenuOptions: boolean;
  addStoreInputRef: React.RefObject<HTMLInputElement>;

  productMenuOpen: boolean;
  editingItemId: string;
  productName: string;
  productCategory: number;
  productHay: number;

  onSelectedStoreChange: (store: StoreName) => void;
  onToggleStoreMenu: () => void;
  onShowAddStoreInput: () => void;
  onNewStoreNameChange: (value: string) => void;
  onAddStore: () => void;
  onActivateStore: (store: StoreName) => void;
  onDisableStore: (store: StoreName) => void;

  onDateChange: (value: string | null) => void;
  onToggleProductMenu: () => void;
  onLoadHistoryFromSheets: () => void;
  historyLoading: boolean;
  onSaveRound: () => void;

  onSelectExistingProduct: (itemId: string) => void;
  onProductNameChange: (value: string) => void;
  onProductCategoryChange: (value: number) => void;
  onProductHayChange: (value: number) => void;
  onCreateProduct: () => void;
  onUpdateProduct: () => void;
  onDeleteProduct: () => void;

  onUpdateEntry: (item: Item, patch: Partial<Pick<Entry, "precioUnitario" | "cantidad">>) => void;
  onToggleCart: (item: Item) => void;
  onBumpQuantity: (item: Item, delta: number) => void;
}

export function ShoppingView({
  items,
  activeStores,
  selectedStore,
  currentStoreTotal,
  currentRonda,
  filteredItems,
  entryMap,
  entryKey,
  storeMenuOpen,
  showAddStoreInput,
  newStoreName,
  inactiveStores,
  optionalActiveStores,
  hasDisableOptions,
  hasStoreMenuOptions,
  addStoreInputRef,
  productMenuOpen,
  editingItemId,
  productName,
  productCategory,
  productHay,
  onSelectedStoreChange,
  onToggleStoreMenu,
  onShowAddStoreInput,
  onNewStoreNameChange,
  onAddStore,
  onActivateStore,
  onDisableStore,
  onDateChange,
  onToggleProductMenu,
  onLoadHistoryFromSheets,
  historyLoading,
  onSaveRound,
  onSelectExistingProduct,
  onProductNameChange,
  onProductCategoryChange,
  onProductHayChange,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onUpdateEntry,
  onToggleCart,
  onBumpQuantity
}: ShoppingViewProps) {
  return (
    <section className="panel carga-panel">
      <div className="carga-sticky-header">
        <div className="store-switcher">
          {activeStores.map((store) => (
            <button
              key={store}
              type="button"
              className={selectedStore === store ? "store active" : "store"}
              onClick={() => onSelectedStoreChange(store)}
            >
              {store}
            </button>
          ))}

          <SupermarketManagerMenu
            storeMenuOpen={storeMenuOpen}
            showAddStoreInput={showAddStoreInput}
            newStoreName={newStoreName}
            inactiveStores={inactiveStores}
            optionalActiveStores={optionalActiveStores}
            hasDisableOptions={hasDisableOptions}
            hasStoreMenuOptions={hasStoreMenuOptions}
            addStoreInputRef={addStoreInputRef}
            onToggleMenu={onToggleStoreMenu}
            onShowAddInput={onShowAddStoreInput}
            onNewStoreNameChange={onNewStoreNameChange}
            onAddStore={onAddStore}
            onActivateStore={onActivateStore}
            onDisableStore={onDisableStore}
          />

          <div className="store-total">
            Carrito: <strong>${currentStoreTotal.toFixed(2)}</strong>
          </div>
        </div>

        <div className="actions-row">
          <label className="fecha-label">
            Fecha
            <input
              type="date"
              value={currentRonda.fecha ?? ""}
              onChange={(e) => onDateChange(e.target.value || null)}
            />
          </label>
          <button
            type="button"
            className="secondary"
            onClick={onToggleProductMenu}
          >
            Productos {productMenuOpen ? "v" : ">"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={onLoadHistoryFromSheets}
            disabled={historyLoading}
          >
            {historyLoading ? "Cargando..." : "Cargar historial"}
          </button>
          <button className="primary" id="btn-save" type="button" onClick={onSaveRound}>
            Guardar ronda
          </button>
        </div>

        <ProductAdminPanel
          isOpen={productMenuOpen}
          items={items}
          editingItemId={editingItemId}
          productName={productName}
          productCategory={productCategory}
          productHay={productHay}
          onSelectExisting={onSelectExistingProduct}
          onProductNameChange={onProductNameChange}
          onProductCategoryChange={onProductCategoryChange}
          onProductHayChange={onProductHayChange}
          onCreate={onCreateProduct}
          onUpdate={onUpdateProduct}
          onDelete={onDeleteProduct}
        />
      </div>

      <div className="carga-items-list">
        {filteredItems.map((item) => (
          <ShoppingItemCard
            key={item.id}
            item={item}
            entry={entryMap[entryKey(selectedStore, item.id)]}
            onUpdate={onUpdateEntry}
            onToggleCart={onToggleCart}
            onBumpQuantity={onBumpQuantity}
          />
        ))}
        {filteredItems.length === 0 && (
          <p className="empty-msg">No hay articulos que coincidan con los filtros.</p>
        )}
      </div>
    </section>
  );
}
