import React from "react";
import { ShoppingItemCard } from "./ShoppingItemCard";
import { SupermarketManagerMenu } from "../../supermarkets/admin/components/SupermarketManagerMenu";
import { ProductAdminPanel } from "../../products/admin/components/ProductAdminPanel";
import { useShoppingModule } from "../hooks/useShoppingModule";
import { useGlobalUI } from "../../ui";
import { useProductFilters } from "../../products";

export function ShoppingView() {
  const shopping = useShoppingModule();
  const ui = useGlobalUI();

  const filteredItems = useProductFilters({
    items: shopping.items,
    search: ui.search,
    categoryFilter: ui.categoryFilter,
    priorityFilter: ui.priorityFilter,
    priorityMode: ui.priorityMode
  });

  return (
    <section className="panel carga-panel">
      <div className="carga-sticky-header">
        <div className="store-switcher">
          {shopping.activeStores.map((store) => (
            <button
              key={store}
              type="button"
              className={shopping.selectedStore === store ? "store active" : "store"}
              onClick={() => shopping.setSelectedStore(store)}
            >
              {store}
            </button>
          ))}

          <SupermarketManagerMenu
            storeMenuOpen={shopping.storeMenuOpen}
            showAddStoreInput={shopping.showAddStoreInput}
            newStoreName={shopping.newStoreName}
            inactiveStores={shopping.inactiveStores}
            optionalActiveStores={shopping.optionalActiveStores}
            hasDisableOptions={shopping.hasDisableOptions}
            hasStoreMenuOptions={shopping.hasStoreMenuOptions}
            addStoreInputRef={shopping.addStoreInputRef}
            onToggleMenu={() => {
              shopping.setStoreMenuOpen((prev) => !prev);
              shopping.setShowAddStoreInput(false);
              shopping.setNewStoreName("");
            }}
            onShowAddInput={() => shopping.setShowAddStoreInput(true)}
            onNewStoreNameChange={shopping.setNewStoreName}
            onAddStore={shopping.addStore}
            onActivateStore={shopping.activateStore}
            onDisableStore={shopping.disableStore}
          />

          <div className="store-total">
            Carrito: <strong>${shopping.currentStoreTotal.toFixed(2)}</strong>
          </div>
        </div>

        <div className="actions-row">
          <label className="fecha-label">
            Fecha
            <input
              type="date"
              value={shopping.currentRonda.fecha ?? ""}
              onChange={(e) => shopping.setCurrentRonda((prev) => ({ ...prev, fecha: e.target.value || null }))}
            />
          </label>
          <button type="button" className="secondary" onClick={shopping.toggleProductMenu}>
            Productos {shopping.productMenuOpen ? "v" : ">"}
          </button>
          <button type="button" className="secondary" onClick={() => void shopping.handleLoadHistoryFromSheets()} disabled={shopping.historyLoading}>
            {shopping.historyLoading ? "Cargando..." : "Cargar historial"}
          </button>
          <button className="primary" id="btn-save" type="button" onClick={() => void shopping.saveCurrentRound()}>
            Guardar ronda
          </button>
        </div>

        <ProductAdminPanel
          isOpen={shopping.productMenuOpen}
          items={shopping.items}
          editingItemId={shopping.editingItemId}
          productName={shopping.productName}
          productCategory={shopping.productCategory}
          productHay={shopping.productHay}
          onSelectExisting={shopping.handleSelectExistingProduct}
          onProductNameChange={shopping.setProductName}
          onProductCategoryChange={shopping.setProductCategory}
          onProductHayChange={shopping.setProductHay}
          onCreate={() => void shopping.handleCreateProduct()}
          onUpdate={() => void shopping.handleUpdateProduct()}
          onDelete={() => void shopping.handleDeleteProduct()}
        />
      </div>

      <div className="carga-items-list">
        {filteredItems.map((item) => (
          <ShoppingItemCard
            key={item.id}
            item={item}
            entry={shopping.entryMap[shopping.entryKey(shopping.selectedStore, item.id)]}
            onUpdate={shopping.updateEntry}
            onToggleCart={shopping.toggleCart}
            onBumpQuantity={shopping.bumpQuantity}
          />
        ))}
        {filteredItems.length === 0 && <p className="empty-msg">No hay articulos que coincidan con los filtros.</p>}
      </div>
    </section>
  );
}
